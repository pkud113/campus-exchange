import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileSettings } from "../profile/profile-settings";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { NotificationPreferences } from "./notification-preferences";
import Link from "next/link";
export const metadata = { title: "Settings" };
export default async function Settings() {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/sign-in?next=/settings");
  const [{ data: profile }, { data: roles }, { data: notificationPreferences }] = await Promise.all([
    db
      .from("profiles")
      .select(
        "handle,display_name,bio,academic_field,graduation_year,graduation_year_visible,academic_field_visible,interests,profile_visibility,friend_list_visibility,organization_membership_visibility,activity_visibility,verified_until,avatar_media_id,banner_media_id",
      )
      .eq("id", user.id)
      .single(),
    db.from("role_assignments").select("role").eq("profile_id", user.id),
    db.from("notification_preferences").select("email_messages,email_discussions,quiet_hours_start,quiet_hours_end").eq("profile_id", user.id).maybeSingle(),
  ]);
  return (
    <main className="dashboard narrow">
      <PageHeader eyebrow="YOUR ACCOUNT" title="Profile & security" description="Manage your public campus identity and account protection." />
      <ProfileSettings
        profile={{
          username: profile?.handle ?? "",
          displayName: profile?.display_name ?? profile?.handle ?? "",
          bio: profile?.bio ?? "",
          academicField: profile?.academic_field ?? "",
          graduationYear: profile?.graduation_year ?? null,
          graduationYearVisible: profile?.graduation_year_visible ?? false,
          academicFieldVisible: profile?.academic_field_visible ?? true,
          interests: profile?.interests ?? [],
          visibility: profile?.profile_visibility ?? "campus_only",
          friendListVisibility: profile?.friend_list_visibility ?? "friends",
          organizationMembershipVisibility: profile?.organization_membership_visibility ?? "campus_only",
          activityVisibility: profile?.activity_visibility ?? "campus_only",
          verifiedUntil: profile?.verified_until ?? "",
          avatarId: profile?.avatar_media_id ?? null,
          bannerId: profile?.banner_media_id ?? null,
        }}
        isStaff={Boolean(
          roles?.some(({ role }) => role === "moderator" || role === "admin"),
        )}
      />
      <NotificationPreferences initial={{ emailMessages: notificationPreferences?.email_messages ?? true, emailDiscussions: notificationPreferences?.email_discussions ?? true, quietHoursStart: notificationPreferences?.quiet_hours_start ?? null, quietHoursEnd: notificationPreferences?.quiet_hours_end ?? null }}/>
      <section className="settings-form"><h2>Safety outcomes</h2><p>Review moderation outcomes affecting your content or account and submit an appeal when one is available.</p><Link className="button button-ghost" href="/appeals">View safety outcomes &amp; appeals</Link></section>
    </main>
  );
}
