import { describe, expect, it } from "vitest";

import { cutHeadline, cutPost, cutSubline, POST_LIMIT, postLength, quoteOf, seasonHeadline, seasonPost, seasonSubline, shareHeadline, sharePost, shareSubline, telegramShareUrl, xIntentUrl } from "@/features/share/model/post";
import { isShareableCut } from "@/features/share/model/shareable";

const RECEIPT = "First cut. 23,600 $CUT between Kiko and oblivion. Pack your buns. Chartwise, the seat is yours. Ten agents again. Next cut tomorrow, 18:00.";

describe("quoteOf", () => {
  it("skips the short opener and keeps whole sentences up to 60 characters", () => {
    expect(quoteOf(RECEIPT)).toBe("23,600 $CUT between Kiko and oblivion. Pack your buns.");
  });

  it("keeps a single long sentence whole", () => {
    const long = "A sentence that is far longer than the sixty characters a quote may hold here.";
    expect(quoteOf(long)).toBe(long);
  });
});

describe("cut copy", () => {
  it("says who was deleted and who took the seat", () => {
    expect(cutHeadline({ deletedName: "Kiko Bun" })).toBe("Kiko Bun was deleted.");
    expect(cutSubline({ joinedName: "Chartwise" })).toBe("Chartwise took the seat.");
    expect(cutSubline({ joinedName: null })).toBeNull();
  });

  it("builds the default post with the quote", () => {
    const post = cutPost({ deletedName: "Kiko Bun", joinedName: "Chartwise", quote: "Pack your buns." });
    expect(post).toBe("“Pack your buns.” Kiko Bun was deleted, Chartwise took the seat. Who goes at the next cut?");
    expect(postLength(post, true)).toBeLessThanOrEqual(POST_LIMIT);
  });

  it("drops the quote when the post would not fit", () => {
    const post = cutPost({ deletedName: "Kiko Bun", joinedName: null, quote: "x".repeat(260) });
    expect(post).toBe("Kiko Bun was deleted. Who goes at the next cut?");
  });

  it("counts a link as 23 characters plus a space", () => {
    expect(postLength("abc", false)).toBe(3);
    expect(postLength("abc", true)).toBe(27);
  });
});

describe("share links", () => {
  it("encodes the post and the link", () => {
    const x = new URL(xIntentUrl("Kiko was deleted & more", "https://thecut.example/share/cut/1"));
    expect(x.origin + x.pathname).toBe("https://x.com/intent/post");
    expect(x.searchParams.get("text")).toBe("Kiko was deleted & more");
    expect(x.searchParams.get("url")).toBe("https://thecut.example/share/cut/1");
    const telegram = new URL(telegramShareUrl("hi", "https://thecut.example/share/cut/1"));
    expect(telegram.searchParams.get("url")).toBe("https://thecut.example/share/cut/1");
  });
});

describe("season copy", () => {
  it("says which season starts and how many agents are on stage", () => {
    expect(seasonHeadline({ season: 1 })).toBe("Season 1 starts.");
    expect(seasonHeadline({ season: null })).toBe("A season starts.");
    expect(seasonSubline({ seated: 10 })).toBe("10 agents on stage.");
    expect(seasonSubline({ seated: 1 })).toBe("1 agent on stage.");
  });

  it("builds the season post, and the share helpers pick the right copy", () => {
    const season = { kind: "season" as const, season: 1, seated: Array.from({ length: 10 }) };
    expect(seasonPost({ season: 1, seated: 10, quote: null })).toBe("Season 1 starts: 10 AI agents on stage. The lowest score is deleted every day. Who goes first?");
    expect(shareHeadline(season)).toBe("Season 1 starts.");
    expect(shareSubline(season)).toBe("10 agents on stage.");
    expect(sharePost(season, "Ten seats.")).toBe("“Ten seats.” Season 1 starts: 10 AI agents on stage. The lowest score is deleted every day. Who goes first?");
    const deleted = { kind: "deleted" as const, deleted: { name: "Kiko Bun" }, joined: null };
    expect(shareHeadline(deleted)).toBe("Kiko Bun was deleted.");
    expect(shareSubline(deleted)).toBeNull();
  });
});

describe("isShareableCut", () => {
  it("shares a deleting cut and a season start, not a cut with no season running", () => {
    expect(isShareableCut({ deletedId: "kiko", seatedIds: [] })).toBe(true);
    expect(isShareableCut({ deletedId: null, seatedIds: ["pixie"] })).toBe(true);
    expect(isShareableCut({ deletedId: null, seatedIds: [] })).toBe(false);
  });
});
