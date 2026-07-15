import Link from "next/link";
import { MessageSquareOff } from "lucide-react";

export default function DiscussionUnavailable() {
  return <main className="dashboard narrow"><div className="empty-state"><MessageSquareOff/><h1>Discussion unavailable</h1><p>This community or post may have been removed, deleted, or made unavailable.</p><Link className="button button-primary" href="/discussions">Browse discussions</Link></div></main>;
}
