import {
  Bell,
  Building2,
  CalendarDays,
  Home,
  ListChecks,
  MessageCircle,
  MessageSquareText,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavEntry = { href: string; label: string; Icon: LucideIcon; count?: number };

export function buildNavigationModel({ handle, isStaff, discussionsEnabled, notificationCount, messageCount }: {
  handle: string; isStaff: boolean; discussionsEnabled: boolean; notificationCount: number; messageCount: number;
}) {
  const homeEntry: NavEntry = { href: "/home", label: "Home", Icon: Home };
  const marketplaceEntry: NavEntry = { href: "/marketplace", label: "Marketplace", Icon: Store };
  const socialEntry: NavEntry = { href: "/social", label: "Social", Icon: Newspaper };
  const organizationsEntry: NavEntry = { href: "/organizations", label: "Organizations", Icon: Building2 };
  const friendsEntry: NavEntry = { href: "/friends", label: "Friends", Icon: UserRoundCheck };
  const discussionsEntry: NavEntry = { href: "/discussions", label: "Discussions", Icon: MessageSquareText };
  const eventsEntry: NavEntry = { href: "/events", label: "Events", Icon: CalendarDays };
  const peopleEntry: NavEntry = { href: "/people", label: "People", Icon: UsersRound };
  const notificationsEntry: NavEntry = { href: "/notifications", label: "Notifications", Icon: Bell, count: notificationCount };
  const messagesEntry: NavEntry = { href: "/messages", label: "Messages", Icon: MessageCircle, count: messageCount };
  const main: NavEntry[] = [
    homeEntry,
    { href: "/search", label: "Search", Icon: Search },
    marketplaceEntry,
    socialEntry,
    organizationsEntry,
    eventsEntry,
    ...(discussionsEnabled ? [discussionsEntry] : []),
    messagesEntry,
  ];
  const mobile: NavEntry[] = [homeEntry, marketplaceEntry, socialEntry, eventsEntry, messagesEntry];
  const management: NavEntry[] = [
    peopleEntry,
    friendsEntry,
    notificationsEntry,
    { href: "/my/listings", label: "My listings", Icon: ShoppingBag },
    { href: "/my/events", label: "My events", Icon: ListChecks },
    ...(isStaff ? [{ href: "/admin", label: "Moderation", Icon: ShieldCheck }] : []),
  ];
  const account: NavEntry[] = [
    { href: `/u/${handle}`, label: "Profile", Icon: UserRound },
    { href: "/settings", label: "Settings", Icon: Settings },
  ];
  return { main, mobile, management, account, peopleEntry, organizationsEntry, friendsEntry, notificationsEntry };
}
