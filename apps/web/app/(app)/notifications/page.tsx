import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Bell, CalendarDays, Heart, MessageCircle } from "lucide-react";
import { MarkNotificationsRead } from "./read-button";
import { NotificationLink } from "./notification-link";
import { PageHeader } from "@/components/ui";
export const metadata={title:"Notifications"};
const iconMap={message:MessageCircle,event:CalendarDays,favorite:Heart};
export default async function Notifications(){const db=await createSupabaseServerClient();const {data}=await db.from("notifications").select("id,kind,title,body,href,read_at,created_at").order("created_at",{ascending:false}).limit(50);return <main className="dashboard narrow"><PageHeader eyebrow="STAY IN THE LOOP" title="Notifications" description="Messages, listing activity, and campus updates in one feed." actions={<MarkNotificationsRead disabled={!data?.some(n=>!n.read_at)}/>}/><div className="notification-list">{!data?.length&&<div className="empty-state"><Bell/><h2>You’re all caught up</h2><p>Messages, listing activity, and event reminders will appear here.</p></div>}{data?.map(item=>{const Icon=iconMap[item.kind as keyof typeof iconMap]??Bell;return <NotificationLink id={item.id} href={item.href??"/notifications"} key={item.id}><article className={item.read_at?"":"unread"}><span className="notification-icon mint"><Icon/></span><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></article></NotificationLink>})}</div></main>}
