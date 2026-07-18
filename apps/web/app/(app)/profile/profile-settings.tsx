"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { maxImageBytes, normalizedImageType } from "@/lib/images";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  profile: {
    username: string;
    displayName: string;
    bio: string;
    academicField: string;
    graduationYear: number | null;
    graduationYearVisible: boolean;
    interests: string[];
    visibility: "campus_only" | "network" | "friends" | "private";
    verifiedUntil: string;
    avatarId: string | null;
    bannerId: string | null;
  };
  isStaff: boolean;
};

export function ProfileSettings({ profile, isStaff }: Props) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mediaNotice, setMediaNotice] = useState("");
  const [avatarId, setAvatarId] = useState(profile.avatarId);
  const [bannerId, setBannerId] = useState(profile.bannerId);
  const [factors, setFactors] = useState<
    Array<{ id: string; status: string; friendly_name?: string }>
  >([]);
  const [enrollment, setEnrollment] = useState<{
    id: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [mfaNotice, setMfaNotice] = useState("");

  useEffect(() => {
    createSupabaseBrowserClient()
      .auth.mfa.listFactors()
      .then(({ data }) => setFactors(data?.totp ?? []));
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: form.get("displayName"),
        biography: form.get("bio"),
        academicField: form.get("academicField") || null,
        graduationYear: form.get("graduationYear") ? Number(form.get("graduationYear")) : null,
        graduationYearVisible: form.get("graduationYearVisible") === "on",
        interests: String(form.get("interests") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
        visibility: form.get("visibility"),
      }),
    });
    const body = await response.json();
    setNotice(response.ok ? "Profile saved." : body.error?.message ?? "Unable to save profile.");
    setSaving(false);
  }

  async function upload(file: File | undefined, purpose: "avatar" | "banner") {
    if (!file) return;
    const contentType = normalizedImageType(file.type, file.name);
    if (!contentType || file.size <= 0 || file.size > maxImageBytes) {
      setMediaNotice(
        "Choose a JPEG, PNG, WebP, HEIC, or HEIF image no larger than 20 MB.",
      );
      return;
    }
    setMediaNotice(`Uploading ${purpose}…`);
    const grant = await fetch("/api/v1/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purpose,
        contentType,
        byteSize: file.size,
        altText: `${profile.username} ${purpose}`,
      }),
    });
    const grantBody = await grant.json();
    if (!grant.ok) {
      setMediaNotice(grantBody.error?.message ?? `Unable to prepare ${purpose}.`);
      return;
    }
    const response = await fetch(grantBody.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: file,
    });
    const body = await response.json();
    if (!response.ok) {
      setMediaNotice(
        `${body.error?.message ?? `Unable to upload ${purpose}.`}${
          body.error?.requestId ? ` Support code: ${body.error.requestId}` : ""
        }`,
      );
      return;
    }
    if (purpose === "avatar") setAvatarId(body.data.id);
    else setBannerId(body.data.id);
    setMediaNotice(`${purpose.charAt(0).toUpperCase() + purpose.slice(1)} updated.`);
  }

  async function enroll() {
    setMfaNotice("");
    const { data, error } = await createSupabaseBrowserClient().auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Campus Exchange staff",
    });
    if (error) {
      setMfaNotice(error.message);
      return;
    }
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enrollment) return;
    const client = createSupabaseBrowserClient();
    const challenge = await client.auth.mfa.challenge({ factorId: enrollment.id });
    if (challenge.error) {
      setMfaNotice(challenge.error.message);
      return;
    }
    const result = await client.auth.mfa.verify({
      factorId: enrollment.id,
      challengeId: challenge.data.id,
      code,
    });
    if (result.error) {
      setMfaNotice(result.error.message);
      return;
    }
    setFactors([
      { id: enrollment.id, status: "verified", friendly_name: "Campus Exchange staff" },
    ]);
    setEnrollment(null);
    setMfaNotice("Authenticator enabled.");
  }

  const verified = factors.some((factor) => factor.status === "verified");
  const mediaAccept = "image/webp,image/png,image/jpeg,image/heic,image/heif,.heic,.heif";
  return (
    <div className="profile-settings-grid">
      <div>
        <section className="profile-media-editor">
          <div className="profile-banner">
            {bannerId && <img src={`/api/v1/media/${bannerId}?variant=full`} alt="" />}
            <label>
              <ImagePlus /> Change banner
              <input
                type="file"
                accept={mediaAccept}
                onChange={(event) => upload(event.target.files?.[0], "banner")}
              />
            </label>
          </div>
          <div className="profile-avatar-editor">
            <UserAvatar name={profile.displayName} mediaId={avatarId} size="large" />
            <label>
              Change avatar
              <input
                type="file"
                accept={mediaAccept}
                onChange={(event) => upload(event.target.files?.[0], "avatar")}
              />
            </label>
          </div>
          {mediaNotice && (
            <p className="form-notice" role="status">
              {mediaNotice}
            </p>
          )}
        </section>
        <form className="settings-form" onSubmit={save}>
          <div className="profile-identity">
            <div>
              <strong>@{profile.username}</strong>
              <span>
                <ShieldCheck /> Username is permanent
              </span>
            </div>
          </div>
          <label>
            Display name
            <input
              name="displayName"
              defaultValue={profile.displayName}
              required
              minLength={1}
              maxLength={80}
            />
          </label>
          <label>
            Bio
            <textarea name="bio" rows={4} defaultValue={profile.bio} maxLength={1000} />
          </label>
          <div className="form-grid">
            <label>
              Academic field
              <input name="academicField" defaultValue={profile.academicField} minLength={2} maxLength={120} placeholder="Computer Science" />
            </label>
            <label>
              Graduation year
              <input name="graduationYear" type="number" min={1900} max={2200} defaultValue={profile.graduationYear ?? ""} />
            </label>
            <label className="full">
              Interests <small>Separate up to 20 interests with commas.</small>
              <input name="interests" defaultValue={profile.interests.join(", ")} maxLength={800} placeholder="robotics, accessibility, hiking" />
            </label>
            <label>
              Profile audience
              <select name="visibility" defaultValue={profile.visibility}><option value="campus_only">My campus</option><option value="network">Campus Exchange network</option><option value="friends">Friends</option><option value="private">Only me</option></select>
            </label>
            <label className="checkbox-label"><input name="graduationYearVisible" type="checkbox" defaultChecked={profile.graduationYearVisible}/> Show graduation year</label>
          </div>
          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}
          <button className="button button-primary" disabled={saving}>
            {saving ? (
              <>
                <LoaderCircle className="spin" /> Saving…
              </>
            ) : (
              "Save profile"
            )}
          </button>
        </form>
      </div>
      <section className="settings-form security-panel">
        <KeyRound />
        <h2>Authenticator security</h2>
        {verified ? (
          <div className="success-box">
            <CheckCircle2 />
            <div>
              <strong>Authenticator enabled</strong>
              <p>Staff actions require a fresh second factor.</p>
            </div>
          </div>
        ) : (
          <>
            <p>
              {isStaff
                ? "Required before you can use moderation tools."
                : "Add an authenticator for stronger account protection."}
            </p>
            {!enrollment ? (
              <button className="button button-dark" onClick={enroll}>
                Set up authenticator
              </button>
            ) : (
              <div className="mfa-enrollment">
                <img src={enrollment.qr} alt="Authenticator QR code" />
                <p>
                  Scan with your authenticator app, or enter: <code>{enrollment.secret}</code>
                </p>
                <label>
                  Six-digit code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </label>
                <button
                  className="button button-primary"
                  onClick={verify}
                  disabled={code.length !== 6}
                >
                  Verify authenticator
                </button>
              </div>
            )}
          </>
        )}
        {mfaNotice && (
          <p className="form-error" role="alert">
            {mfaNotice}
          </p>
        )}
      </section>
    </div>
  );
}
