"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { profileTabs, type ProfileTabId } from "./profile-tabs";

export function ProfileTabNav({ active }: { active: ProfileTabId }) {
  const router = useRouter();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => { setInteractive(true); root.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [active]);
  function select(id: ProfileTabId) { router.push(`${pathname}?tab=${id}`, { scroll: false }); }
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? profileTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + profileTabs.length) % profileTabs.length;
    const tab = profileTabs[next]; if (tab) { select(tab.id); root.current?.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`)?.focus(); }
  }
  return <div className="profile-tab-scroller" data-interactive={interactive} ref={root}><div className="profile-tab-list" role="tablist" aria-label="Profile sections">{profileTabs.map(({ id, label, Icon }, index) => <button id={`profile-tab-${id}`} data-tab={id} type="button" role="tab" aria-selected={active === id} aria-controls={`profile-panel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => select(id)} onKeyDown={(event) => onKeyDown(event, index)} key={id}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div></div>;
}
