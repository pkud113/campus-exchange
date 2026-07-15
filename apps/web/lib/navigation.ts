export function isNavigationActive(path: string, href: string) {
  if (href === "/home") return path === "/home";
  return path === href || path.startsWith(`${href}/`);
}

export const SIDEBAR_PREFERENCE_KEY = "campus-sidebar";

export function isSidebarCollapsed(value: string | null | undefined) {
  return value === "collapsed";
}

export function sidebarPreferenceValue(collapsed: boolean) {
  return collapsed ? "collapsed" : "expanded";
}

export function sidebarPreferenceCookie(collapsed: boolean, secure: boolean) {
  return `${SIDEBAR_PREFERENCE_KEY}=${sidebarPreferenceValue(collapsed)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
