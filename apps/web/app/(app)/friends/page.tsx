import { PageHeader } from "@/components/ui";
import { FriendsClient } from "./friends-client";

export const metadata = { title: "Friends" };
export default function FriendsPage() { return <main className="dashboard feature-page"><PageHeader eyebrow="Your network" title="Friends" description="Manage incoming requests, sent requests, and connections across Campus Exchange."/><FriendsClient/></main>; }
