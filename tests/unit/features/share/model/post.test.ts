import { describe, expect, it } from "vitest";

import { cutHeadline, cutPost, cutSubline, POST_LIMIT, postLength, quoteOf, telegramShareUrl, xIntentUrl } from "@/features/share/model/post";

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
