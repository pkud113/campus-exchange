import { describe, expect, it } from "vitest";
import {
  USERNAME_POLICY_VERSION,
  evaluateUsernameSafety,
  normalizeUsernameInput,
} from "./index";

describe(`deterministic username safety (${USERNAME_POLICY_VERSION})`, () => {
  it.each([
    ["Student_2026", "student_2026"],
    ["  friendlypeer  ", "friendlypeer"],
    ["Ｆｒｉｅｎｄ２０２６", "friend2026"],
  ])("normalizes safe username %s", (input, expected) => {
    expect(normalizeUsernameInput(input)).toBe(expected);
    expect(evaluateUsernameSafety(input)).toEqual({ ok: true, username: expected });
  });

  it.each([
    ["ab", "invalid_length"],
    ["student-name", "unicode_confusable"],
    ["student__name", "invalid_separators"],
    ["_student", "invalid_separators"],
    ["stud\u200Bent", "unicode_confusable"],
    ["аdmin", "unicode_confusable"],
  ] as const)("rejects invalid or confusable username %s", (input, reason) => {
    expect(evaluateUsernameSafety(input)).toEqual({ ok: false, reason });
  });

  it.each([
    ["admin", "reserved"],
    ["a_d_m_1_n", "reserved"],
    ["support_team", "reserved"],
    ["official_umich", "reserved"],
    ["f_u_c_k_you", "profanity"],
    ["sh1thead", "profanity"],
    ["k1ll_yourself", "hateful_or_abusive"],
  ] as const)("rejects policy username %s", (input, reason) => {
    expect(evaluateUsernameSafety(input)).toEqual({ ok: false, reason });
  });

  it("does not reject benign substrings", () => {
    expect(evaluateUsernameSafety("class_assistant")).toEqual({ ok: true, username: "class_assistant" });
    expect(evaluateUsernameSafety("supportive_peer")).toEqual({ ok: true, username: "supportive_peer" });
  });
});
