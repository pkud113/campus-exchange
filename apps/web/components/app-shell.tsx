import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppNavigation } from "./app-navigation";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/sign-in");
  const [{ data: profile }, { data: roles }, { count: notificationCount }, { data: inbox }, { data: discussionsEnabled }] = await Promise.all([
    db.from("profiles").select("handle,display_name,avatar_media_id,account_kind,verified_until,campuses(name)").eq("id", user.id).single(),
    db.from("role_assignments").select("role").eq("profile_id", user.id),
    db.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    db.rpc("conversation_inbox"),
    db.rpc("discussions_enabled"),
  ]);
  const messageCount = (inbox ?? []).reduce((sum: number, row: { unread_count?: number | string }) => sum + Number(row.unread_count ?? 0), 0);
  const campus = Array.isArray(profile?.campuses) ? profile.campuses[0] : profile?.campuses;
  const isStaff = Boolean(roles?.some(({ role }) => role === "moderator" || role === "admin"));
  return (
    <div className="app-frame">
      <AppNavigation
        profile={{
          id: user.id,
          handle: profile?.handle ?? "member",
          displayName: profile?.display_name ?? profile?.handle ?? "Campus member",
          avatarId: profile?.avatar_media_id ?? null,
          campusName: campus?.name ?? "Your campus",
          verified: isStaff || Boolean(profile?.verified_until && new Date(profile.verified_until) > new Date()),
        }}
        isStaff={isStaff}
        notificationCount={notificationCount ?? 0}
        messageCount={messageCount}
        discussionsEnabled={discussionsEnabled === true}
      />
      <div className="app-main">{children}</div>
    </div>
  );
}
