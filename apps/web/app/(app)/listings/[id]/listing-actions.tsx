"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { MessageRequestComposer } from "@/components/message-request-composer";

export function ListingActions({ listingId, sellerId, sellerUsername, sellerCampus, isSeller, initialFavorite = false }: {
  listingId: string; sellerId: string; sellerUsername: string; sellerCampus: string; isSeller: boolean; initialFavorite?: boolean;
}) {
  const [busy,setBusy]=useState(false); const [favorite,setFavorite]=useState(initialFavorite); const [error,setError]=useState("");
  async function save(){setBusy(true);setError("");const next=!favorite;const init:RequestInit={method:next?"POST":"DELETE"};if(next){init.headers={"content-type":"application/json"};init.body="{}"}const response=await fetch(`/api/v1/listings/${listingId}/favorite`,init);if(response.ok)setFavorite(next);else{const result=await response.json().catch(()=>null);setError(result?.error?.message??"Unable to update this saved listing.")}setBusy(false)}
  return <>
    {!isSeller && <MessageRequestComposer profileId={sellerId} username={sellerUsername} campus={sellerCampus} context={{type:"listing",id:listingId}} label="Message seller" />}
    <button className="button button-ghost button-wide" onClick={save} disabled={busy} aria-pressed={favorite}><Heart fill={favorite?"currentColor":"none"}/>{favorite?"Saved":"Save listing"}</button>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </>;
}
