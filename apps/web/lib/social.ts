import type { SupabaseClient } from "@supabase/supabase-js";

export type SocialPostRow = {
  id: string;
  author_profile_id: string;
  organization_id: string | null;
  body: string;
  visibility: "campus_only" | "network" | "friends";
  reaction_count: number;
  comment_count: number;
  created_at: string;
  edited_at: string | null;
  [key: string]: unknown;
};

export type SocialPostView = SocialPostRow & {
  author: Record<string, unknown> | null;
  organization: Record<string, unknown> | null;
  media: Array<{ id: string; alt_text: string; position: number }>;
  viewerReaction: string | null;
  canManage: boolean;
};

export async function hydrateSocialPosts(
  db: SupabaseClient,
  viewerId: string,
  rows: SocialPostRow[],
): Promise<SocialPostView[]> {
  if (!rows.length) return [];
  const postIds = rows.map((post) => post.id);
  const authorIds = [...new Set(rows.map((post) => post.author_profile_id))];
  const organizationIds = [...new Set(rows.flatMap((post) => post.organization_id ? [post.organization_id] : []))];
  const [{ data: authors }, { data: organizations }, { data: mediaLinks }, { data: viewerReactions }] = await Promise.all([
    db.rpc("safe_profile_cards", { target_ids: authorIds }),
    organizationIds.length
      ? db.from("organizations").select("id,slug,name,avatar_media_id,campus_id").in("id", organizationIds)
      : Promise.resolve({ data: [] }),
    db.from("social_post_media").select("post_id,media_id,position").in("post_id", postIds).order("position"),
    db.from("social_reactions").select("post_id,reaction").eq("profile_id", viewerId).in("post_id", postIds),
  ]);
  const mediaIds = (mediaLinks ?? []).map((item) => item.media_id);
  const { data: mediaRows } = mediaIds.length
    ? await db.from("media_uploads").select("id,alt_text,status").in("id", mediaIds).eq("status", "ready")
    : { data: [] };
  const authorMap = new Map<string, Record<string, unknown>>((authors ?? []).map((author: Record<string, unknown>) => [String(author.id), author]));
  const organizationMap = new Map<string, Record<string, unknown>>((organizations ?? []).map((organization) => [organization.id, organization as Record<string, unknown>]));
  const mediaMap = new Map((mediaRows ?? []).map((media) => [media.id, media]));
  const reactionMap = new Map((viewerReactions ?? []).map((reaction) => [reaction.post_id, reaction.reaction]));

  return rows.map((post) => ({
    ...post,
    author: authorMap.get(post.author_profile_id) ?? null,
    organization: post.organization_id ? organizationMap.get(post.organization_id) ?? null : null,
    media: (mediaLinks ?? [])
      .filter((item) => item.post_id === post.id && mediaMap.has(item.media_id))
      .map((item) => {
        const media = mediaMap.get(item.media_id)!;
        return { id: media.id, alt_text: media.alt_text ?? "", position: item.position };
      }),
    viewerReaction: reactionMap.get(post.id) ?? null,
    canManage: post.author_profile_id === viewerId && post.organization_id === null,
  }));
}
