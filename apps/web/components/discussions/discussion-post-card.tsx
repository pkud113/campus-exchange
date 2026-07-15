import Link from "next/link";
import { ImageIcon, Link2, Lock, MessageCircle, Pin } from "lucide-react";
import { DiscussionVote } from "./discussion-vote";
import { DiscussionSave } from "./discussion-actions";

export type DiscussionPostRow = {
  id: string;
  title: string | null;
  body: string | null;
  post_type: "text" | "link" | "image";
  link_url: string | null;
  media_id: string | null;
  score: number;
  comment_count: number;
  is_pinned: boolean;
  locked_at: string | null;
  removed_at?: string | null;
  created_at: string;
  viewer_vote?: -1 | 0 | 1;
  viewer_saved?: boolean;
  discussion_communities?: { slug: string; display_name: string } | Array<{ slug: string; display_name: string }>;
  profiles?: { handle: string; display_name: string } | Array<{ handle: string; display_name: string }>;
};

const one = <T,>(value: T | T[] | undefined) => Array.isArray(value) ? value[0] : value;

export function DiscussionPostCard({ post, showCommunity = false }: { post: DiscussionPostRow; showCommunity?: boolean }) {
  const community = one(post.discussion_communities);
  const author = one(post.profiles);
  const href = community ? `/discussions/c/${community.slug}/posts/${post.id}` : `/discussions/posts/${post.id}`;
  return <article className="discussion-post-card">
    <DiscussionVote targetType="posts" targetId={post.id} initialScore={post.score} initialVote={post.viewer_vote ?? 0}/>
    <div className="discussion-post-copy">
      {showCommunity && community && <Link className="community-label" title={community.display_name} href={`/discussions/c/${community.slug}`}>c/{community.slug}</Link>}
      <div className="discussion-post-meta">
        <span>{author?.display_name ?? author?.handle ?? "Deleted member"}</span>
        <span>{new Date(post.created_at).toLocaleString()}</span>
        {post.is_pinned && <span><Pin/>Pinned</span>}
        {post.locked_at && <span><Lock/>Locked</span>}
      </div>
      <Link href={href}>
        <h2>{post.title ?? "[deleted]"}</h2>
        {post.post_type === "image" && post.media_id && <img className="discussion-card-image" src={`/api/v1/media/${post.media_id}?variant=card`} alt={post.title ?? "Discussion image"}/>}
        {post.body && <p className="discussion-card-body">{post.body.slice(0, 320)}</p>}
      </Link>
      <div className="discussion-post-footer">
        {post.post_type === "link" && post.link_url && <a href={post.link_url} target="_blank" rel="noreferrer"><Link2/>Open link</a>}
        {post.post_type === "image" && <span><ImageIcon/>Image</span>}
        <Link href={href}><MessageCircle/>{post.comment_count} comments</Link>
        <DiscussionSave postId={post.id} initialSaved={post.viewer_saved ?? false}/>
      </div>
    </div>
  </article>;
}
