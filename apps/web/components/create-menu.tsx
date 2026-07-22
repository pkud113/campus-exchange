"use client";

import * as React from "react";
import { Building2, CalendarDays, ChevronDown, CirclePlus, MessageSquareText, Newspaper, Store } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export const createDestinations = [
  { href: "/sell", label: "Marketplace listing", description: "Sell or give away an item", Icon: Store },
  { href: "/events/new", label: "Event", description: "Invite your campus or the network", Icon: CalendarDays },
  { href: "/profile?tab=posts&compose=1#composer", label: "Social post", description: "Share from your profile", Icon: Newspaper },
  { href: "/organizations?create=1", label: "Organization", description: "Start a student group", Icon: Building2 },
  { href: "/discussions/create", label: "Discussion", description: "Ask or share with a community", Icon: MessageSquareText },
] as const;

export function CreateMenu({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className={`create-menu${compact ? " create-menu-compact" : ""}`} ref={root}>
    <button className="create-menu-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <CirclePlus aria-hidden="true" /><span>Create</span><ChevronDown aria-hidden="true" />
    </button>
    {open && <div className="create-menu-panel" role="menu">
      <header><strong>Create new</strong><small>Choose what you want to share</small></header>
      {createDestinations.map(({ href, label, description, Icon }) => <Link href={href} role="menuitem" key={href} onClick={() => { setOpen(false); onNavigate?.(); }}><Icon aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span></Link>)}
    </div>}
  </div>;
}
