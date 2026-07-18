import { PageHeader } from "@/components/ui";
import { SearchClient } from "./search-client";
export const metadata={title:"Search"};
export default function SearchPage(){return <main className="dashboard feature-page"><PageHeader eyebrow="Across Campus Exchange" title="Search" description="Find verified people, listings, organizations, events, discussions, and social posts without exposing private content."/><SearchClient/></main>}
