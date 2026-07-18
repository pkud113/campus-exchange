import { hmacSha256, sixDigitVerificationCode } from "@/lib/verification-crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export async function beginInstitutionDomainVerification(input: {
  institutionId: string;
  institutionName: string;
  email: string;
  domain: string;
  requesterAddress: string;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!resendKey || !from) throw new Error("domain_verification_unconfigured");

  const id = crypto.randomUUID();
  const code = sixDigitVerificationCode();
  const [emailHash, codeHash, requesterHash] = await Promise.all([
    hmacSha256(`email:${input.email}`),
    hmacSha256(`code:${id}:${code}`),
    hmacSha256(`requester:${input.requesterAddress}`)
  ]);
  const admin = createSupabaseAdminClient();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: insertError } = await admin.from("institution_domain_verification_challenges").insert({
    id,
    institution_id: input.institutionId,
    email_domain: input.domain,
    email_hash: emailHash,
    code_hash: codeHash,
    requester_hash: requesterHash,
    expires_at: expiresAt
  });
  if (insertError) throw insertError;

  const safeName = escapeHtml(input.institutionName);
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Verify your school email for Campus Exchange",
      text: `Your Campus Exchange school-domain verification code is ${code}. It expires in 10 minutes. This verifies email ownership only; registration remains unavailable until the domain mapping is reviewed.`,
      html: `<p>Your Campus Exchange school-domain verification code for <strong>${safeName}</strong> is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. This verifies email ownership only; registration remains unavailable until the domain mapping is reviewed.</p>`
    })
  });
  if (!delivery.ok) {
    await admin.from("institution_domain_verification_challenges").delete().eq("id", id);
    throw new Error(`domain_verification_delivery_${delivery.status}`);
  }
  return { challengeId: id, expiresAt };
}

export async function completeInstitutionDomainVerification(input: { challengeId: string; email: string; code: string }) {
  const [emailHash, codeHash] = await Promise.all([
    hmacSha256(`email:${input.email}`),
    hmacSha256(`code:${input.challengeId}:${input.code}`)
  ]);
  const { data, error } = await createSupabaseAdminClient().rpc("complete_institution_domain_verification", {
    challenge_id: input.challengeId,
    submitted_email_hash: emailHash,
    submitted_code_hash: codeHash
  });
  if (error) throw error;
  return data?.[0] as { outcome?: string; request_id?: string; request_status?: string } | undefined;
}
