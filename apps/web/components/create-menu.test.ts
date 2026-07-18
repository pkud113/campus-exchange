import { describe, expect, it } from "vitest";
import { createDestinations } from "./create-menu";

describe("global create menu", () => {
  it("links every V1 creation action to a real route or working in-page composer", () => {
    expect(createDestinations.map(({ href }) => href)).toEqual([
      "/sell",
      "/events/new",
      "/social#composer",
      "/organizations?create=1",
      "/discussions/create",
    ]);
    expect(new Set(createDestinations.map(({ href }) => href)).size).toBe(createDestinations.length);
  });
});
