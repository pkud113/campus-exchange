import { describe, expect, it } from "vitest";
import { cssThemeVariables, darkTheme, lightTheme, primitives } from "./index";

describe("design tokens", () => {
  it("keeps light and dark semantic themes structurally aligned", () => {
    expect(Object.keys(darkTheme)).toEqual(Object.keys(lightTheme));
  });

  it("exports platform-neutral numeric spacing and CSS adapters", () => {
    expect(primitives.space[6]).toBe(24);
    expect(cssThemeVariables(lightTheme)["--ce-surface-raised"]).toBe("#ffffff");
  });
});
