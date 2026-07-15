import type { DiscussionComment } from "@campus-exchange/contracts";

export type DiscussionCommentNode = Omit<DiscussionComment, "children"> & {
  children?: DiscussionCommentNode[];
};

function replaceById(
  nodes: DiscussionCommentNode[],
  incoming: DiscussionCommentNode,
): { nodes: DiscussionCommentNode[]; replaced: boolean } {
  let replaced = false;
  const next = nodes.map((node) => {
    if (node.id === incoming.id) {
      replaced = true;
      const children = incoming.children ?? node.children;
      return { ...node, ...incoming, ...(children ? { children } : {}) };
    }
    if (!node.children?.length) return node;
    const childResult = replaceById(node.children, incoming);
    if (childResult.replaced) {
      replaced = true;
      return { ...node, children: childResult.nodes };
    }
    return node;
  });
  return { nodes: next, replaced };
}

export function dedupeCommentTree(nodes: DiscussionCommentNode[]): DiscussionCommentNode[] {
  const seen = new Set<string>();
  const visit = (items: DiscussionCommentNode[]): DiscussionCommentNode[] => items.flatMap((item) => {
    if (seen.has(item.id)) return [];
    seen.add(item.id);
    return [{ ...item, children: visit(item.children ?? []) }];
  });
  return visit(nodes);
}

export function insertSubmittedComment(
  roots: DiscussionCommentNode[],
  incoming: DiscussionCommentNode,
  parentReplyCount?: number,
): DiscussionCommentNode[] {
  const replaced = replaceById(roots, incoming);
  if (replaced.replaced) return dedupeCommentTree(replaced.nodes);
  if (!incoming.parentCommentId) return dedupeCommentTree([incoming, ...roots]);

  let inserted = false;
  const addToParent = (nodes: DiscussionCommentNode[]): DiscussionCommentNode[] => nodes.map((node) => {
    if (node.id === incoming.parentCommentId) {
      inserted = true;
      return {
        ...node,
        replyCount: parentReplyCount ?? node.replyCount + 1,
        children: [...(node.children ?? []), incoming],
      };
    }
    if (!node.children?.length) return node;
    return { ...node, children: addToParent(node.children) };
  });

  const next = addToParent(roots);
  return dedupeCommentTree(inserted ? next : roots);
}

export function countCommentTree(nodes: DiscussionCommentNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countCommentTree(node.children ?? []), 0);
}

export function discussionCommentRealtimeFilter(postId: string) {
  return `post_id=eq.${postId}`;
}
