"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function NotificationLink({id,href,children}:{id:string;href:string;children:ReactNode}){
  const router=useRouter();
  async function open(){
    await fetch("/api/v1/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({notificationId:id})}).catch(()=>null);
    window.dispatchEvent(new CustomEvent("campus:notification-read",{detail:{id}}));
    router.push(href);
    router.refresh();
  }
  return <button type="button" className="notification-link" onClick={open}>{children}</button>;
}
