import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscussionCommentComposer } from "./discussion-comment-composer";

const noop = () => undefined;

describe("DiscussionCommentComposer", () => {
  it("renders a compact accessible entry point by default", () => {
    const markup = renderToStaticMarkup(
      <DiscussionCommentComposer expanded={false} submitting={false} onExpand={noop} onCancel={noop} onSubmit={noop} />,
    );
    expect(markup).toContain("Join the conversation");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("discussion-root-composer comment-composer-collapsed");
    expect(markup).not.toContain("<textarea");
  });

  it("expands into the validated full comment editor", () => {
    const markup = renderToStaticMarkup(
      <DiscussionCommentComposer expanded submitting onExpand={noop} onCancel={noop} onSubmit={noop} />,
    );
    expect(markup).toContain('id="discussion-root-composer"');
    expect(markup).toContain("discussion-root-composer comment-composer expanded");
    expect(markup).toContain('maxLength="10000"');
    expect(markup).toContain("Posting…");
    expect(markup).toContain("required");
  });
});
