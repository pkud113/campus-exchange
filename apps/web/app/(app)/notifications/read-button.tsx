"use client";
import { useRouter } from "next/navigation";
export function MarkNotificationsRead({disabled}:{disabled:boolean}){const router=useRouter();async function mark(){await fetch("/api/v1/notifications",{method:"PATCH",headers:{"content-type":"application/json"},body:"{}"});router.refresh()}return <button className="button button-ghost" disabled={disabled} onClick={mark}>Mark all read</button>}
