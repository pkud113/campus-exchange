import { PageHeader } from "@/components/ui";
import { SearchClient } from "./search-client";
export const metadata={title:"Search"};
export default async function SearchPage({searchParams}:{searchParams:Promise<{institution?:string}>}){const query=await searchParams;return <main className="dashboard feature-page"><PageHeader eyebrow="Across Campus Exchange" title="Search" description="Find verified people, listings, organizations, events, discussions, and social posts without exposing private content."/><SearchClient initialInstitution={query.institution??"all"}/></main>}
