import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SocialComments, type SocialCommentView } from "@/components/social/social-comments";
import { SocialPostCard } from "@/components/social/social-post-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hydrateSocialPosts, type SocialPostRow } from "@/lib/social";

export default async function SocialPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/social/posts/${postId}`)}`);
  const [{ data: postRow }, { data: comments }, { data: networkEnabled }] = await Promise.all([
    db.from("social_posts").select("*").eq("id", postId).maybeSingle(),
    db.from("social_comments").select("id,post_id,author_profile_id,parent_comment_id,body,edited_at,removed_at,deleted_at,created_at").eq("post_id", postId).order("created_at").limit(200),
    db.rpc("network_features_enabled"),
  ]);
  if (!postRow) notFound();
  const [post] = await hydrateSocialPosts(db, user.id, [postRow as SocialPostRow]);
  if (!post) notFound();
  const authorIds = [...new Set((comments ?? []).flatMap((comment) => comment.author_profile_id ? [comment.author_profile_id] : []))];
  const { data: authors } = authorIds.length ? await db.rpc("safe_profile_cards", { target_ids: authorIds }) : { data: [] };
  const authorMap = new Map((authors ?? []).map((author: Record<string, unknown>) => [author.id, author]));
  const commentViews = (comments ?? []).map((comment) => ({ ...comment, author: comment.author_profile_id ? authorMap.get(comment.author_profile_id) ?? null : null, canManage: comment.author_profile_id === user.id })) as SocialCommentView[];
  return <main className="dashboard narrow social-thread-page">
    <Link className="back-link" href="/social"><ArrowLeft /> Back to Social</Link>
    <SocialPostCard initialPost={post} networkEnabled={networkEnabled !== false} />
    <SocialComments postId={postId} initialComments={commentViews} />
  </main>;
}
