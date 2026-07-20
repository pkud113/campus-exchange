import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostDetail } from "./post-detail";

export default async function SocialPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <main className="dashboard narrow social-post-detail-page"><Link className="back-link" href="/social"><ArrowLeft /> Social</Link><PostDetail postId={postId} /></main>;
}
