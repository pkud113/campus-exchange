import { describe, expect, it } from "vitest";
import { cssThemeVariables, darkTheme, lightTheme, primitives } from "./index";

describe("design tokens", () => {
  it("keeps light and dark semantic themes structurally aligned", () => {
    expect(Object.keys(darkTheme)).toEqual(Object.keys(lightTheme));
  });

  it("keeps the complete responsive and layering scale stable for web and mobile", () => {
    expect(primitives.breakpoint).toEqual({ sm: 480, md: 768, lg: 1024, xl: 1280, "2xl": 1536 });
    expect(primitives.zIndex.modal).toBeGreaterThan(primitives.zIndex.dropdown);
    expect(primitives.zIndex.tooltip).toBeGreaterThan(primitives.zIndex.toast);
    expect(primitives.duration.instant).toBe(0);
  });

  it("exports platform-neutral numeric spacing and CSS adapters", () => {
    expect(primitives.space[6]).toBe(24);
    expect(cssThemeVariables(lightTheme)["--ce-surface-raised"]).toBe("#ffffff");
  });
});
