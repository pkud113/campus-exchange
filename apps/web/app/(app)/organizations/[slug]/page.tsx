import { OrganizationDetail } from "./organization-detail";
type Props={params:Promise<{slug:string}>};
export default async function OrganizationPage({params}:Props){const{slug}=await params;return <main className="workspace-page"><OrganizationDetail slug={slug}/></main>}
