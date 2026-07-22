"use client";
import { Button, ErrorState } from "@/components/ui";
export default function SocialError({ reset }: { reset: () => void }) { return <main className="dashboard narrow"><ErrorState title="Social could not load" description="Your feed was not cached. Retry the live request." action={<Button onClick={reset}>Try again</Button>} /></main>; }
