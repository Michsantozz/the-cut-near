import { describe, expect, it } from "vitest";

import { directorState, linesForFeed, proofBadge } from "@/features/director/model/screen";
import type { DirectorLineView } from "@/features/director/model/view";

const line = (id: string, kind: DirectorLineView["kind"], cutIndex: number): DirectorLineView => ({
  id,
  kind,
  subjectId: "kiko",
  cutIndex,
  text: id,
  createdAt: "2026-11-13T13:48:00.000Z",
  model: null,
  proof: { status: "unsigned", summary: null, chatId: null, proofUrl: `/api/director/lines/${id}/proof`, verifierUrl: null },
});

describe("directorState", () => {
  const cutAt = new Date("2026-11-13T18:00:00Z");

  it("counts down before the cut", () => {
    expect(directorState({ now: new Date("2026-11-13T13:48:00Z"), cutAt, lastCutAt: null })).toBe("scheduled");
  });

  it("opens the button once the cut time passed and nobody ran it", () => {
    expect(directorState({ now: new Date("2026-11-13T18:00:00Z"), cutAt, lastCutAt: null })).toBe("ready");
  });

  it("shows the receipt for the rest of the UTC day a cut ran", () => {
    const next = new Date("2026-11-14T18:00:00Z");
    const ran = new Date("2026-11-13T18:00:05Z");
    expect(directorState({ now: new Date("2026-11-13T18:01:00Z"), cutAt: next, lastCutAt: ran })).toBe("done");
    expect(directorState({ now: new Date("2026-11-14T00:00:01Z"), cutAt: next, lastCutAt: ran })).toBe("scheduled");
  });
});

describe("linesForFeed", () => {
  it("drops roasts and receipts of a cut that has not run yet", () => {
    const lines = [line("roast-1", "after-cut-roast", 1), line("receipt-0", "after-cut-receipt", 0), line("scheduled-1", "scheduled", 1)];
    expect(linesForFeed(lines, 1).map((l) => l.id)).toEqual(["receipt-0", "scheduled-1"]);
  });
});

describe("proofBadge", () => {
  it("never calls a sample line signed", () => {
    expect(proofBadge("unsigned").label).toBe("Sample line · not signed");
    expect(proofBadge("verified").label).toBe("Verified · NEAR AI");
    expect(proofBadge("failed").tone).toBe("failed");
  });
});
