import { describe, expect, it } from "vitest";
import { DEFAULT_EMAIL_SETTINGS, validateEmailSettings } from "./emailSettings.js";

describe("validateEmailSettings", () => {
  it("accepts the default Gmail settings", () => {
    expect(validateEmailSettings(DEFAULT_EMAIL_SETTINGS)).toEqual({});
  });

  it("flags each bad field", () => {
    const errors = validateEmailSettings({ senderEmail: "nope", senderName: " ", host: "smtp gmail", port: "0", username: "" });
    expect(Object.keys(errors).sort()).toEqual(["host", "port", "senderEmail", "senderName", "username"]);
  });

  it("rejects ports outside 1–65535", () => {
    expect(validateEmailSettings({ ...DEFAULT_EMAIL_SETTINGS, port: "70000" })).toHaveProperty("port");
  });
});
