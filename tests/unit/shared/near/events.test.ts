import { describe, expect, it } from "vitest";
import { eventItems, eventRefs, isTrackedEvent, parseEventLog } from "@/shared/near/events";

const log = (body: object) => `EVENT_JSON:${JSON.stringify(body)}`;

describe("parseEventLog", () => {
  it("parses a NEP-297 event", () => {
    expect(parseEventLog(log({ standard: "thecut", version: "1.0.0", event: "save", data: [{ robot_id: "melody" }] }))).toEqual({
      standard: "thecut",
      version: "1.0.0",
      event: "save",
      data: [{ robot_id: "melody" }],
    });
  });

  it.each([
    ["a plain log", "Transfer 10 from a to b"],
    ["broken JSON", "EVENT_JSON:{nope"],
    ["a missing standard", log({ version: "1.0.0", event: "save" })],
    ["a prefix with a space", ` ${log({ standard: "thecut", version: "1.0.0", event: "save" })}`],
  ])("ignores %s", (_, line) => {
    expect(parseEventLog(line)).toBeNull();
  });

  it("tracks the contract's standard and NEP-141, nothing else", () => {
    expect(isTrackedEvent({ standard: "thecut", version: "1.0.0", event: "cut" })).toBe(true);
    expect(isTrackedEvent({ standard: "nep141", version: "1.0.0", event: "ft_burn" })).toBe(true);
    expect(isTrackedEvent({ standard: "nep171", version: "1.0.0", event: "nft_mint" })).toBe(false);
  });
});

describe("event items and refs", () => {
  it("splits data arrays into items and wraps single values", () => {
    expect(eventItems({ standard: "s", version: "1", event: "e", data: [{ a: 1 }, { b: 2 }] })).toEqual([{ a: 1 }, { b: 2 }]);
    expect(eventItems({ standard: "s", version: "1", event: "e", data: { a: 1 } })).toEqual([{ a: 1 }]);
    expect(eventItems({ standard: "s", version: "1", event: "e" })).toEqual([{}]);
    expect(eventItems({ standard: "s", version: "1", event: "e", data: [7] })).toEqual([{ value: 7 }]);
  });

  it("reads account, robot, cut index and amount", () => {
    expect(eventRefs({ account_id: "mika.near", robot_id: "melody", amount: "400000000000000000000", cut_index: 1 })).toEqual({
      accountId: "mika.near",
      robotId: "melody",
      cutIndex: 1,
      amount: 400n * 10n ** 18n,
    });
    expect(eventRefs({ owner_id: "thecut.near", amount: "5" })).toMatchObject({ accountId: "thecut.near", amount: 5n });
    expect(eventRefs({ amount: 5, cut_index: "x" })).toEqual({ accountId: null, robotId: null, cutIndex: null, amount: null });
  });

  it("reads each event's own fields, as the contract emits them", () => {
    expect(eventRefs({ account_id: "mika.near", near_in: "1", cut_out: "120", fee: "1", cut_index: 1 }, "buy")).toEqual({ accountId: "mika.near", robotId: null, cutIndex: 1, amount: 120n });
    expect(eventRefs({ account_id: "mika.near", cut_in: "50", near_out: "9", fee: "1", cut_index: 1 }, "sell")).toMatchObject({ amount: 50n });
    expect(eventRefs({ cut_index: 2, robot_id: "kiko", robot_account_id: "kiko.thecut.near", pile: "236", burned: "118", runner: "bob.near" }, "cut")).toEqual({
      accountId: "bob.near",
      robotId: "kiko",
      cutIndex: 2,
      amount: 118n,
    });
    expect(eventRefs({ robot_id: "chartwise", account_id: "chartwise.thecut.near", creator: "studio.near", deposit: "5" }, "register")).toMatchObject({ accountId: "studio.near", amount: null });
    expect(eventRefs({ cut_index: 2, robot_id: "kiko", account_id: "kiko.thecut.near", beneficiary: "bob.near" }, "delete")).toMatchObject({ accountId: "bob.near" });
    expect(eventRefs({ old_owner_id: "a.near", new_owner_id: "b.near", amount: "3" }, "ft_transfer")).toMatchObject({ accountId: "a.near", amount: 3n });
  });
});
