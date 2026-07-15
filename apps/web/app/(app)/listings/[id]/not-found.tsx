import Link from "next/link";
import { ShoppingBag } from "lucide-react";

export default function ListingUnavailable() {
  return <main className="dashboard narrow"><div className="empty-state"><ShoppingBag/><h1>Listing unavailable</h1><p>This listing may have been sold, withdrawn, or removed.</p><Link className="button button-primary" href="/marketplace">Browse marketplace</Link></div></main>;
}
