"use client";

import { Building2, CalendarDays, Info, LayoutGrid, ShoppingBag } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export const profileTabs = [
  { id: "posts", label: "Posts", Icon: LayoutGrid },
  { id: "listings", label: "Listings", Icon: ShoppingBag },
  { id: "events", label: "Events", Icon: CalendarDays },
  { id: "organizations", label: "Organizations", Icon: Building2 },
  { id: "about", label: "About", Icon: Info },
] as const;
export type ProfileTabId = typeof profileTabs[number]["id"];

export function ProfileTabNav({ active }: { active: ProfileTabId }) {
  const router = useRouter();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [active]);
  function select(id: ProfileTabId) { router.push(`${pathname}?tab=${id}`, { scroll: false }); }
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? profileTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + profileTabs.length) % profileTabs.length;
    const tab = profileTabs[next]; if (tab) { select(tab.id); root.current?.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`)?.focus(); }
  }
  return <div className="profile-tab-scroller" ref={root}><div className="profile-tab-list" role="tablist" aria-label="Profile sections">{profileTabs.map(({ id, label, Icon }, index) => <button id={`profile-tab-${id}`} data-tab={id} type="button" role="tab" aria-selected={active === id} aria-controls={`profile-panel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => select(id)} onKeyDown={(event) => onKeyDown(event, index)} key={id}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div></div>;
}
