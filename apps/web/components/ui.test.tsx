import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Alert, Button, Checkbox, ErrorState, FormField, Input, Pagination, SearchControl, Switch } from "./ui";
import { Dialog, MediaUploader, Tabs, ToastProvider } from "./ui-interactive";

describe("V1 design system", () => {
  it("renders controls with accessible names and state", () => {
    const markup = renderToStaticMarkup(<><Button busy>Save</Button><Checkbox label="Email me" defaultChecked /><Switch label="Network visibility" defaultChecked /><FormField label="School" htmlFor="school" error="Choose a school" required><Input id="school" invalid /></FormField></>);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('role="alert"');
  });

  it("exposes errors and alerts to assistive technology", () => {
    const markup = renderToStaticMarkup(<><Alert tone="danger">Could not save</Alert><ErrorState description="Try again" /></>);
    expect(markup.match(/role="alert"/g)).toHaveLength(2);
    expect(markup).toContain("Could not save");
  });

  it("provides semantic pagination links", () => {
    const markup = renderToStaticMarkup(<><SearchControl action="/search" label="Search Campus Exchange" /><Pagination currentPage={2} totalPages={4} hrefForPage={(page) => `/items?page=${page}`} /></>);
    expect(markup).toContain('role="search"');
    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="Pagination"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('rel="prev"');
    expect(markup).toContain('rel="next"');
  });

  it("renders modal, tabs, uploader, and toast landmarks", () => {
    const markup = renderToStaticMarkup(<ToastProvider><Dialog open onClose={() => undefined} title="Confirm"><p>Content</p></Dialog><Tabs label="Sections" activeId="one" onChange={() => undefined} tabs={[{ id: "one", label: "One", panel: "Panel" }]} /><MediaUploader id="media" /></ToastProvider>);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('type="file"');
    expect(markup).toContain('aria-live="polite"');
  });
});
