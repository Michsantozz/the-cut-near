import { describe, expect, it } from "vitest";
import { cutRecordViewSchema, nextCutViewSchema, paramsViewSchema, robotViewSchema, saveViewSchema } from "@/shared/near/views";

const CUT = 10n ** 18n;
const NEAR = 10n ** 24n;
const ns = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();

describe("view schemas", () => {
  it("parse RobotView into camelCase with bigint pile and Date", () => {
    const robot = robotViewSchema.parse({
      id: "kiko",
      account_id: "kiko.thecut.testnet",
      name: "Kiko Bun",
      kind: "VTuber",
      x_handle: "@KikoBunCut",
      creator: "kiko-studio.testnet",
      status: "stage",
      pile: (23_600n * CUT).toString(),
      savers: 96,
      joined_at: ns("2026-11-12T15:01:00Z"),
    });
    expect(robot).toEqual({
      id: "kiko",
      accountId: "kiko.thecut.testnet",
      name: "Kiko Bun",
      kind: "VTuber",
      xHandle: "@KikoBunCut",
      creator: "kiko-studio.testnet",
      status: "stage",
      pile: 23_600n * CUT,
      savers: 96,
      joinedAt: new Date("2026-11-12T15:01:00Z"),
    });
  });

  it("rejects a robot status outside the interface", () => {
    expect(robotViewSchema.safeParse({ id: "x", status: "zombie" }).success).toBe(false);
  });

  it("parse Params, with the cut interval in nanoseconds", () => {
    const params = paramsViewSchema.parse({
      total_supply: (10_000_000n * CUT).toString(),
      fee_bps: 100,
      burn_bps: 5000,
      savers_bps: 9500,
      stage_size: 10,
      first_cut_at: ns("2026-11-13T18:00:00Z"),
      cut_interval: "86400000000000",
      robot_funding: (NEAR / 2n).toString(),
      register_deposit: (5n * NEAR).toString(),
    });
    expect(params).toMatchObject({ feeBps: 100, cutIntervalMs: 86_400_000, robotFunding: NEAR / 2n, firstCutAt: new Date("2026-11-13T18:00:00Z"), poolCutReserve: null });
  });

  it("rejects basis points above 10,000", () => {
    expect(paramsViewSchema.safeParse({ fee_bps: 10_001 }).success).toBe(false);
  });

  it("parse saves, next cut and cut records", () => {
    expect(saveViewSchema.parse({ robot_id: "melody", amount: (400n * CUT).toString(), since_cut: 1 })).toEqual({ robotId: "melody", amount: 400n * CUT, lockedForCut: 1 });
    expect(nextCutViewSchema.parse({ index: 1, at: ns("2026-11-13T18:00:00Z"), lowest_id: "kiko", gap_to_next: "1", prize_so_far: "2" })).toEqual({
      index: 1,
      at: new Date("2026-11-13T18:00:00Z"),
      lowestId: "kiko",
      gapToNext: 1n,
      prizeSoFar: 2n,
    });
    const record = { index: 1, at: ns("2026-11-13T18:00:00Z"), deleted_id: "kiko", pile: "4", burned: "2", prize: "3", slice: "1", creator_slice: "0", runner: "bob.testnet" };
    expect(cutRecordViewSchema.parse({ ...record, joined_id: "chartwise" }).joinedId).toBe("chartwise");
    expect(cutRecordViewSchema.parse({ ...record, joined_id: null }).joinedId).toBeNull();
    expect(cutRecordViewSchema.parse(record).joinedId).toBeNull();
  });
});
