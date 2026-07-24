import { PageHeader } from "@/components/ui";
import { MessageRequestsClient } from "./message-requests-client";

export const metadata = { title: "Message requests" };

export default async function MessageRequestsPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const initialView = params.view === "sent" ? "sent" : "incoming";
  return <main className="dashboard feature-page">
    <PageHeader
      eyebrow="Private and verified"
      title="Message requests"
      description="Review incoming requests, sent requests, their context, and status history."
    />
    <MessageRequestsClient initialView={initialView} />
  </main>;
}
