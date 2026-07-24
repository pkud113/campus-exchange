"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { profileTabs, type ProfileTabId } from "./profile-tabs";

export function ProfileTabNav({ active }: { active: ProfileTabId }) {
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => { setInteractive(true); root.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [active]);
  function onKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? profileTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + profileTabs.length) % profileTabs.length;
    const tab = profileTabs[next];
    const target = tab ? root.current?.querySelector<HTMLAnchorElement>(`[data-tab="${tab.id}"]`) : null;
    if (target) { target.focus(); window.location.assign(target.href); }
  }
  return <div className="profile-tab-scroller" data-interactive={interactive} ref={root}><div className="profile-tab-list" role="tablist" aria-label="Profile sections">{profileTabs.map(({ id, label, Icon }, index) => <a id={`profile-tab-${id}`} data-tab={id} href={`${pathname}?tab=${id}`} role="tab" aria-selected={active === id} aria-controls={`profile-panel-${id}`} tabIndex={active === id ? 0 : -1} onKeyDown={(event) => onKeyDown(event, index)} key={id}><Icon aria-hidden="true" /><span>{label}</span></a>)}</div></div>;
}
