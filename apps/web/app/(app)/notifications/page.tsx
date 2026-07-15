import { Bell, CalendarDays, Heart, MessageCircle } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notificationHref } from "@/lib/notification-href";
import { PageHeader } from "@/components/ui";
import { MarkNotificationsRead } from "./read-button";
import { NotificationLink } from "./notification-link";

export const metadata = { title: "Notifications" };
const iconMap = { message: MessageCircle, message_request: MessageCircle, event: CalendarDays, favorite: Heart };

export default async function Notifications({ searchParams }: { searchParams: Promise<{ unavailable?: string }> }) {
  const { unavailable } = await searchParams;
  const db = await createSupabaseServerClient();
  const { data } = await db.from("notifications").select("id,kind,title,body,href,read_at,created_at").order("created_at", { ascending: false }).limit(50);
  return <main className="dashboard narrow">
    <PageHeader eyebrow="STAY IN THE LOOP" title="Notifications" description="Messages, listing activity, and campus updates in one feed." actions={<MarkNotificationsRead disabled={!data?.some((item) => !item.read_at)}/>}/>
    {unavailable === "1" && <p className="discussion-notice" role="status">That notification target is no longer available. You can continue from your notifications.</p>}
    <div className="notification-list">
      {!data?.length && <div className="empty-state"><Bell/><h2>You&apos;re all caught up</h2><p>Messages, listing activity, and event reminders will appear here.</p></div>}
      {data?.map((item) => {
        const Icon = iconMap[item.kind as keyof typeof iconMap] ?? Bell;
        const href = notificationHref(item.href, item.kind);
        return <NotificationLink id={item.id} href={href} kind={item.kind} key={item.id}><article className={item.read_at ? "" : "unread"}><span className="notification-icon mint"><Icon/></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></article></NotificationLink>;
      })}
    </div>
  </main>;
}
