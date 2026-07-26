export type StaffRoleContext = { platformRole: string | null; campusRole: string | null };
export function staffRoleLabel(context: StaffRoleContext) {
  if (context.platformRole === "admin") return "Platform administrator";
  if (context.platformRole === "moderator") return "Platform moderator";
  if (context.campusRole === "admin") return "Campus administrator";
  return "Campus moderator";
}