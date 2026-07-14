"use client";

import {
  Bell,
  CalendarDays,
  ChevronRight,
  CirclePlus,
  Home,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isNavigationActive } from "@/lib/navigation";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { UserAvatar } from "./user-avatar";

type Props = {
  profile: {
    id: string;
    handle: string;
    displayName: string;
    avatarId: string | null;
    campusName: string;
    verified: boolean;
  };
  isStaff: boolean;
  notificationCount: number;
  messageCount: number;
};

type NavEntry = {
  href: string;
  label: string;
  Icon: LucideIcon;
  count?: number;
};

function formatCount(count?: number) {
  if (!count) return null;
  return count > 99 ? "99+" : String(count);
}

function NavItem({ entry, path, onNavigate }: { entry: NavEntry; path: string; onNavigate?: () => void }) {
  const active = isNavigationActive(path, entry.href);
  const count = formatCount(entry.count);
  return (
    <Link
      className={`nav-item${active ? " active" : ""}`}
      href={entry.href}
      aria-current={active ? "page" : undefined}
      title={entry.label}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <span className="nav-icon"><entry.Icon aria-hidden="true" /></span>
      <span className="nav-label">{entry.label}</span>
      {count && <span className="nav-badge">{count}</span>}
    </Link>
  );
}

function NavSection({ label, entries, path, onNavigate }: { label: string; entries: NavEntry[]; path: string; onNavigate?: () => void }) {
  return (
    <section className="nav-section">
      <h2>{label}</h2>
      <div>
        {entries.map((entry) => <NavItem entry={entry} path={path} {...(onNavigate ? { onNavigate } : {})} key={entry.href} />)}
      </div>
    </section>
  );
}

export function AppNavigation({
  profile,
  isStaff,
  notificationCount: initialNotificationCount,
  messageCount,
}: Props) {
  const path = usePathname();
  const [notificationCount, setNotificationCount] = useState(initialNotificationCount);
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => setNotificationCount(initialNotificationCount), [initialNotificationCount]);

  useEffect(() => {
    const client = createSupabaseBrowserClient();
    const refresh = async () => {
      const { count } = await client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      setNotificationCount(count ?? 0);
    };
    const readAll = () => setNotificationCount(0);
    const readOne = () => setNotificationCount((value) => Math.max(0, value - 1));
    window.addEventListener("campus:notifications-read", readAll);
    window.addEventListener("campus:notification-read", readOne);
    const channel = client
      .channel(`notification:${profile.id}`, { config: { private: true } })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `profile_id=eq.${profile.id}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      window.removeEventListener("campus:notifications-read", readAll);
      window.removeEventListener("campus:notification-read", readOne);
      void client.removeChannel(channel);
    };
  }, [profile.id]);

  useEffect(() => {
    if (!menuOpen) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    const focusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items.at(0);
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [menuOpen]);

  async function logout() {
    setMenuOpen(false);
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if ("caches" in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
    window.location.assign("/sign-in");
  }

  const main: NavEntry[] = [
    { href: "/home", label: "Home", Icon: Home },
    { href: "/marketplace", label: "Marketplace", Icon: Store },
    { href: "/events", label: "Events", Icon: CalendarDays },
    { href: "/messages", label: "Messages", Icon: MessageCircle, count: messageCount },
    { href: "/notifications", label: "Notifications", Icon: Bell, count: notificationCount },
  ];
  const management: NavEntry[] = [
    { href: "/my/listings", label: "My listings", Icon: ShoppingBag },
    { href: "/my/events", label: "My events", Icon: ListChecks },
    { href: "/sell", label: "Create listing", Icon: CirclePlus },
    { href: "/events/new", label: "Create event", Icon: CalendarDays },
    ...(isStaff ? [{ href: "/admin", label: "Moderation", Icon: ShieldCheck }] : []),
  ];
  const account: NavEntry[] = [
    { href: `/u/${profile.handle}`, label: "Profile", Icon: UserRound },
    { href: "/settings", label: "Settings", Icon: Settings },
  ];
  const closeMenu = () => setMenuOpen(false);
  const moreActive = [...main.slice(2, 3), main[4]!, ...management, ...account].some((entry) =>
    isNavigationActive(path, entry.href),
  );

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /></div>
        <nav aria-label="Campus Exchange navigation" className="sidebar-nav">
          <NavSection label="Main" entries={main} path={path} />
          <NavSection label="Management" entries={management} path={path} />
        </nav>
        <div className="sidebar-footer">
          <NavSection label="Account" entries={account} path={path} />
          <ThemeToggle />
          <button className="nav-item nav-button" type="button" onClick={logout}>
            <span className="nav-icon"><LogOut aria-hidden="true" /></span>
            <span className="nav-label">Log out</span>
          </button>
          <Link className="profile-card" href={`/u/${profile.handle}`} title="View your profile">
            <UserAvatar name={profile.displayName} mediaId={profile.avatarId} size="large" />
            <span className="profile-card-copy">
              <strong>{profile.displayName}</strong>
              <small>@{profile.handle}</small>
              <span className="profile-card-badges">
                <span>{profile.campusName}</span>
                {profile.verified && <span><ShieldCheck /> Verified</span>}
              </span>
            </span>
            <ChevronRight className="profile-card-arrow" aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <header className="mobile-header">
        <Brand />
        <div className="mobile-header-actions">
          <Link href="/marketplace" aria-label="Search marketplace"><Search /></Link>
          <Link className="mobile-alert-link" href="/notifications" aria-label="Notifications">
            <Bell />
            {notificationCount > 0 && <span className="nav-badge">{formatCount(notificationCount)}</span>}
          </Link>
        </div>
      </header>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        <NavItem entry={main[0]!} path={path} />
        <NavItem entry={main[1]!} path={path} />
        <NavItem entry={{ href: "/sell", label: "Sell", Icon: CirclePlus }} path={path} />
        <NavItem entry={main[3]!} path={path} />
        <button
          className={`nav-item nav-button${menuOpen || moreActive ? " active" : ""}`}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation-drawer"
          onClick={() => setMenuOpen(true)}
        >
          <span className="nav-icon"><Menu aria-hidden="true" /></span>
          <span className="nav-label">More</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="mobile-drawer-layer" role="presentation">
          <button className="mobile-drawer-backdrop" aria-label="Close navigation" onClick={closeMenu} />
          <div
            className="mobile-drawer"
            id="mobile-navigation-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
          >
            <header>
              <div>
                <span className="overline">CAMPUS EXCHANGE</span>
                <h2>Menu</h2>
              </div>
              <button type="button" aria-label="Close navigation" onClick={closeMenu}><X /></button>
            </header>
            <Link className="profile-card mobile" href={`/u/${profile.handle}`} onClick={closeMenu}>
              <UserAvatar name={profile.displayName} mediaId={profile.avatarId} size="large" />
              <span className="profile-card-copy">
                <strong>{profile.displayName}</strong>
                <small>@{profile.handle} · {profile.campusName}</small>
              </span>
              <ChevronRight aria-hidden="true" />
            </Link>
            <nav aria-label="More destinations">
              <NavSection label="Discover" entries={[main[2]!, main[4]!]} path={path} onNavigate={closeMenu} />
              <NavSection label="Management" entries={management} path={path} onNavigate={closeMenu} />
              <NavSection label="Account" entries={account} path={path} onNavigate={closeMenu} />
            </nav>
            <ThemeToggle />
            <button className="nav-item nav-button logout-action" type="button" onClick={logout}>
              <span className="nav-icon"><LogOut /></span>
              <span className="nav-label">Log out</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
