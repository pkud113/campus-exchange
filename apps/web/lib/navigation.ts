export function isNavigationActive(path: string, href: string) {
  if (href === "/home") return path === "/home";
  return path === href || path.startsWith(`${href}/`);
}
