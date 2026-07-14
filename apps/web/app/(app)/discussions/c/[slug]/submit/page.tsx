import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DiscussionPostForm } from "@/components/discussions/post-form";
export const metadata = { title: "Submit a discussion post" };
export default async function SubmitDiscussionPost({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <main className="dashboard narrow"><Link className="back-link" href={`/discussions/c/${slug}`}><ArrowLeft/>Back to community</Link><div className="form-header"><span className="overline">NEW DISCUSSION</span><h1>Create a post.</h1><p>Choose text, link, or a private campus image. Community permissions are enforced when you publish.</p></div><DiscussionPostForm slug={slug}/></main>; }
