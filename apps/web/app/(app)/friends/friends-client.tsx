"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus, UsersRound } from "lucide-react";
import { EmptyState, SurfaceCard } from "@/components/ui";
import { UserAvatar } from "@/components/user-avatar";

type Relationship = { id: string; status: string; direction: "incoming" | "outgoing"; profile: { id: string; handle?: string; display_name?: string | null; avatar_media_id?: string | null; campus_short_name?: string } | null };
export function FriendsClient() {
  const [rows,setRows]=useState<Relationship[]>([]);const[loading,setLoading]=useState(true);const[notice,setNotice]=useState("");
  const load=useCallback(async()=>{setLoading(true);const response=await fetch("/api/v1/friends");const json=await response.json();setRows(response.ok?json.data:[]);if(!response.ok)setNotice(json.error?.message??"Unable to load friends.");setLoading(false)},[]);
  useEffect(()=>{void load()},[load]);
  async function act(row:Relationship,action:string){if(!row.profile)return;const response=await fetch(`/api/v1/friends/${row.profile.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action,idempotencyKey:crypto.randomUUID()})});const json=await response.json();setNotice(response.ok?"Friendship updated.":json.error?.message??"Unable to update friendship.");if(response.ok)await load()}
  return <section className="people-grid" aria-busy={loading}>{!loading&&!rows.length&&<EmptyState icon={<UsersRound/>} title="Your friend list is ready" description="Find verified students in People and send a friend request." action={<Link className="button button-primary" href="/people"><UserPlus/>Find people</Link>}/>}{rows.map((row)=><SurfaceCard className="friend-card" key={row.id}><UserAvatar name={row.profile?.display_name??row.profile?.handle??"Campus member"} mediaId={row.profile?.avatar_media_id??null} size="large"/><div><Link href={`/u/${row.profile?.handle}`}><strong>{row.profile?.display_name??row.profile?.handle}</strong></Link><small>@{row.profile?.handle} · {row.profile?.campus_short_name??"Campus Exchange"}</small><span className="ui-badge">{row.status==="pending"?`${row.direction} request`:row.status}</span></div><div className="friend-actions">{row.status==="pending"&&row.direction==="incoming"&&<><button className="button button-primary button-small" onClick={()=>act(row,"accept")}>Accept</button><button className="button button-ghost button-small" onClick={()=>act(row,"decline")}>Decline</button></>}{row.status==="pending"&&row.direction==="outgoing"&&<button className="button button-ghost button-small" onClick={()=>act(row,"cancel")}>Cancel</button>}{row.status==="accepted"&&<button className="button button-ghost button-small" onClick={()=>act(row,"remove")}>Remove</button>}</div></SurfaceCard>)}{notice&&<p className="form-notice" role="status">{notice}</p>}</section>;
}
