import { describe, expect, it } from "vite-plus/test";
import { splitTitle } from "./PrTitle";

describe("splitTitle", () => {
  it("separates the conventional-commit scope", () => {
    expect(splitTitle("feat(referrals): invite page")).toEqual({
      scope: "referrals",
      subject: "invite page",
    });
  });

  it("drops a bare type and keeps plain titles whole", () => {
    expect(splitTitle("fix: usage stops at 100%")).toEqual({
      scope: null,
      subject: "usage stops at 100%",
    });
    expect(splitTitle("Bump react to 19")).toEqual({ scope: null, subject: "Bump react to 19" });
  });
});
