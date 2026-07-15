"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { notificationHref } from "@/lib/notification-href";

export function NotificationLink({id,href,kind,children}:{id:string;href:string;kind:string;children:ReactNode}){
  const router=useRouter();
  async function open(){
    await fetch("/api/v1/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({notificationId:id})}).catch(()=>null);
    window.dispatchEvent(new CustomEvent("campus:notification-read",{detail:{id}}));
    router.push(notificationHref(href, kind));
    router.refresh();
  }
  return <button type="button" className="notification-link" onClick={open}>{children}</button>;
}
