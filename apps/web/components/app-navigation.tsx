"use client";

import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  isNavigationActive,
  sidebarPreferenceCookie,
  sidebarPreferenceValue,
  sidebarToggleLabel,
  SIDEBAR_PREFERENCE_KEY,
} from "@/lib/navigation";
import { buildNavigationModel, type NavEntry } from "@/lib/app-navigation-model";
import { Brand } from "./brand";
import { CreateMenu } from "./create-menu";
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
  discussionsEnabled: boolean;
  initialSidebarCollapsed: boolean;
};

function formatCount(count?: number) {
  if (!count) return null;
  return count > 99 ? "99+" : String(count);
}

function NavItem({ entry, path, onNavigate, iconOnly = false }: { entry: NavEntry; path: string; onNavigate?: () => void; iconOnly?: boolean }) {
  const active = isNavigationActive(path, entry.href);
  const count = formatCount(entry.count);
  return (
    <Link
      className={`nav-item${iconOnly ? " compact-nav-item" : ""}${active ? " active" : ""}`}
      href={entry.href}
      aria-current={active ? "page" : undefined}
      aria-label={iconOnly ? entry.label : undefined}
      title={entry.label}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <span className="nav-icon"><entry.Icon aria-hidden="true" /></span>
      {!iconOnly && <span className="nav-label">{entry.label}</span>}
      {count && <span className="nav-badge">{count}</span>}
      {iconOnly && <span className="compact-tooltip" aria-hidden="true">{entry.label}</span>}
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
  discussionsEnabled,
  initialSidebarCollapsed,
}: Props) {
  const path = usePathname();
  const [notificationCount, setNotificationCount] = useState(initialNotificationCount);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [compactMenuOpen, setCompactMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const compactMenuRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => setNotificationCount(initialNotificationCount), [initialNotificationCount]);

  useEffect(() => {
    setCompactMenuOpen(false);
  }, [path]);

  useEffect(() => {
    if (!compactMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!compactMenuRef.current?.contains(event.target as Node)) setCompactMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCompactMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [compactMenuOpen]);

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
    document.body.classList.add("app-menu-open");
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
      document.body.classList.remove("app-menu-open");
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [menuOpen]);

  async function logout() {
    setMenuOpen(false);
    setCompactMenuOpen(false);
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

  const { main, mobile, management, account, peopleEntry, organizationsEntry, friendsEntry, notificationsEntry } = buildNavigationModel({ handle: profile.handle, isStaff, discussionsEnabled, notificationCount, messageCount });
  const closeMenu = () => setMenuOpen(false);
  const edgeControlLabel = sidebarToggleLabel(sidebarCollapsed);

  function setCollapsed(next: boolean) {
    setSidebarCollapsed(next);
    setCompactMenuOpen(false);
    const value = sidebarPreferenceValue(next);
    try { localStorage.setItem(SIDEBAR_PREFERENCE_KEY, value); } catch {}
    try { document.cookie = sidebarPreferenceCookie(next, window.location.protocol === "https:"); } catch {}
  }

  return (
    <>
      <aside className="sidebar" id="desktop-sidebar" data-collapsed={sidebarCollapsed} inert={sidebarCollapsed} aria-hidden={sidebarCollapsed}>
        <div className="sidebar-brand">
          <Brand />
          <button className="sidebar-collapse-button" type="button" onClick={() => setCollapsed(true)} aria-controls="desktop-sidebar" aria-expanded="true" aria-label="Collapse sidebar" title="Collapse sidebar">
            <PanelLeftClose aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Campus Exchange navigation" className="sidebar-nav">
          <CreateMenu />
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

      <button
        className="sidebar-edge-control"
        type="button"
        data-collapsed={sidebarCollapsed}
        onClick={() => setCollapsed(!sidebarCollapsed)}
        aria-controls="desktop-sidebar"
        aria-expanded={!sidebarCollapsed}
        aria-label={edgeControlLabel}
        title={edgeControlLabel}
      >
        {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        <span className="compact-tooltip" aria-hidden="true">{edgeControlLabel}</span>
      </button>

      <header className="compact-app-bar" aria-label="Collapsed desktop navigation">
        <div className="compact-app-bar-start">
          <button className="compact-icon-button sidebar-compact-expand" type="button" onClick={() => setCollapsed(false)} aria-controls="desktop-sidebar" aria-expanded="false" aria-label="Expand sidebar" title="Expand sidebar">
            <PanelLeftOpen aria-hidden="true" />
            <span className="compact-tooltip" aria-hidden="true">Expand sidebar</span>
          </button>
          <span className="compact-brand-mark" aria-hidden="true"><span className="brand-mark"><i/><i/></span></span>
        </div>
        <nav className="compact-primary-nav" aria-label="Campus Exchange primary navigation">
          {main.map((entry) => <NavItem entry={entry} path={path} iconOnly key={entry.href} />)}
        </nav>
        <div className="compact-profile-menu" ref={compactMenuRef}>
          <button
            className="compact-profile-trigger"
            type="button"
            aria-label="Open management and account menu"
            aria-expanded={compactMenuOpen}
            aria-controls="compact-account-menu"
            title="Management and account"
            onClick={() => setCompactMenuOpen((value) => !value)}
          >
            <UserAvatar name={profile.displayName} mediaId={profile.avatarId} />
            <Menu aria-hidden="true" />
            <span className="compact-tooltip" aria-hidden="true">Management and account</span>
          </button>
          {compactMenuOpen && (
            <div className="compact-account-menu" id="compact-account-menu">
              <div className="compact-account-heading">
                <UserAvatar name={profile.displayName} mediaId={profile.avatarId} size="large" />
                <span><strong>{profile.displayName}</strong><small>@{profile.handle}</small></span>
              </div>
              <nav aria-label="Management and account destinations">
                <CreateMenu compact onNavigate={() => setCompactMenuOpen(false)} />
                <NavSection label="Management" entries={management} path={path} onNavigate={() => setCompactMenuOpen(false)} />
                <NavSection label="Account" entries={account} path={path} onNavigate={() => setCompactMenuOpen(false)} />
              </nav>
              <ThemeToggle />
              <button className="nav-item nav-button compact-logout" type="button" onClick={logout}>
                <span className="nav-icon"><LogOut aria-hidden="true" /></span>
                <span className="nav-label">Log out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <header className="mobile-header">
        <Brand />
        <div className="mobile-header-actions">
          <Link href="/search" aria-label="Search Campus Exchange"><Search /></Link>
          <Link className="mobile-alert-link" href="/notifications" aria-label="Notifications">
            <Bell />
            {notificationCount > 0 && <span className="nav-badge">{formatCount(notificationCount)}</span>}
          </Link>
          <button type="button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="mobile-navigation-drawer" onClick={() => setMenuOpen(true)}><Menu /></button>
        </div>
      </header>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {mobile.map((entry) => <NavItem entry={entry} path={path} key={entry.href} />)}
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
              <CreateMenu onNavigate={closeMenu} />
              <NavSection label="Discover" entries={[peopleEntry, organizationsEntry, friendsEntry, notificationsEntry]} path={path} onNavigate={closeMenu} />
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
