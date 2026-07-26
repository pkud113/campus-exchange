const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CompleteEnrollment = (
  grantId: string
) => PromiseLike<{ error: { message?: string } | null }>;

export function registrationGrantIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).registrationGrantId;
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

export async function completePendingRegistrationEnrollment(
  completeEnrollment: CompleteEnrollment,
  metadata: unknown,
  profileExists: boolean
): Promise<{ attempted: boolean; completed: boolean }> {
  if (profileExists) return { attempted: false, completed: true };
  const grantId = registrationGrantIdFromMetadata(metadata);
  if (!grantId) return { attempted: false, completed: false };
  const { error } = await completeEnrollment(grantId);
  return { attempted: true, completed: !error };
}
