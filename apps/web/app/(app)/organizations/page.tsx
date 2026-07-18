import { PageHeader } from "@/components/ui";
import { OrganizationsClient } from "./organizations-client";

export const metadata = { title: "Organizations" };
export default async function OrganizationsPage({searchParams}:{searchParams:Promise<{create?:string}>}) { const query=await searchParams; return <main className="dashboard feature-page"><PageHeader eyebrow="Get involved" title="Organizations" description="Discover student groups on your campus or across the verified network."/><OrganizationsClient initialCreating={query.create==="1"}/></main>; }
