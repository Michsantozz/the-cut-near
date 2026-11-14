import { describe, expect, it } from "vitest";

import { resolveNetwork } from "@/shared/wallet/network";
import { isNearAccountId, readViewer, viewerCookie, VIEWER_COOKIE } from "@/shared/wallet/viewer";

describe("isNearAccountId", () => {
  it.each(["mika.near", "judge-7f3a.testnet", "kiko.thecut.near", "a_b.near", "ab", "f".repeat(64)])("accepts %s", (id) => {
    expect(isNearAccountId(id)).toBe(true);
  });

  it.each(["", "a", "Mika.near", "mika..near", ".near", "mika.", "-mika.near", "mika-.near", "mika near", "a".repeat(65), "<script>"])(
    "rejects %j",
    (id) => {
      expect(isNearAccountId(id)).toBe(false);
    },
  );

  it("rejects non-strings", () => {
    expect(isNearAccountId(undefined)).toBe(false);
    expect(isNearAccountId(42)).toBe(false);
  });
});

describe("viewer cookie", () => {
  it("reads the viewer among other cookies", () => {
    expect(readViewer(`theme=light; ${VIEWER_COOKIE}=mika.near; other=1`)).toBe("mika.near");
  });

  it("returns null when absent or malformed", () => {
    expect(readViewer("theme=light")).toBeNull();
    expect(readViewer(`${VIEWER_COOKIE}=NOT%20AN%20ACCOUNT`)).toBeNull();
    expect(readViewer("")).toBeNull();
  });

  it("round-trips through the cookie it writes", () => {
    const [pair] = viewerCookie("judge-7f3a.testnet").split(";");
    expect(readViewer(pair)).toBe("judge-7f3a.testnet");
    expect(viewerCookie("judge-7f3a.testnet")).toContain("SameSite=Lax");
  });

  it("clears the cookie for null or a bad id", () => {
    expect(viewerCookie(null)).toContain("Max-Age=0");
    expect(viewerCookie("Bad Id")).toContain("Max-Age=0");
  });
});

describe("resolveNetwork", () => {
  it("is testnet unless mainnet is named", () => {
    expect(resolveNetwork(undefined)).toBe("testnet");
    expect(resolveNetwork("testnet")).toBe("testnet");
    expect(resolveNetwork("MAINNET")).toBe("testnet");
    expect(resolveNetwork("mainnet")).toBe("mainnet");
  });
});
