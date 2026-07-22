import { Building2, CalendarDays, Info, LayoutGrid, ShoppingBag } from "lucide-react";

export const profileTabs = [
  { id: "posts", label: "Posts", Icon: LayoutGrid },
  { id: "listings", label: "Listings", Icon: ShoppingBag },
  { id: "events", label: "Events", Icon: CalendarDays },
  { id: "organizations", label: "Organizations", Icon: Building2 },
  { id: "about", label: "About", Icon: Info },
] as const;

export type ProfileTabId = typeof profileTabs[number]["id"];
