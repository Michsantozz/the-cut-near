import { describe, expect, it } from "vitest";

import { buyCalls, minOut, saveCalls, sellCalls, storageTopUp, unsaveCalls } from "@/features/trade/model/calls";
import { classifyTxError } from "@/features/trade/model/errors";

describe("contract calls", () => {
  it("takes 1% off the quote for min_out, rounding down", () => {
    expect(minOut(10_000n)).toBe(9_900n);
    expect(minOut(199n)).toBe(197n);
    expect(minOut(0n)).toBe(0n);
  });

  it("registers an unregistered buyer in the same transaction", () => {
    expect(buyCalls({ nearIn: 5n, minOut: 3n, registration: 10n })).toEqual([
      { method: "storage_deposit", args: { registration_only: true }, deposit: "10" },
      { method: "buy", args: { min_out: "3" }, deposit: "5" },
    ]);
    expect(buyCalls({ nearIn: 5n, minOut: 3n, registration: null })).toEqual([{ method: "buy", args: { min_out: "3" }, deposit: "5" }]);
  });

  it("sells, saves and unsaves with the contract's argument names", () => {
    expect(sellCalls({ cutIn: 7n, minOut: 2n })).toEqual([{ method: "sell", args: { cut_in: "7", min_out: "2" } }]);
    expect(saveCalls({ robotId: "melody", amount: 400n, storageTopUp: 0n })).toEqual([{ method: "save", args: { robot_id: "melody", amount: "400" } }]);
    expect(saveCalls({ robotId: "kiko", amount: 1n, storageTopUp: 9n })[0].deposit).toBe("9");
    expect(unsaveCalls("melody")).toEqual([{ method: "unsave", args: { robot_id: "melody" } }]);
  });

  it("tops up storage only when it runs thin", () => {
    const rule = { enough: 3n, topUp: 5n };
    expect(storageTopUp(3n, rule)).toBe(0n);
    expect(storageTopUp(2n, rule)).toBe(5n);
    expect(storageTopUp(null, rule)).toBe(5n);
  });

  it("tells a cancel in the wallet from a refused call", () => {
    expect(classifyTxError(new Error("User rejected the request"))).toBe("cancelled");
    expect(classifyTxError(new Error("The contract refused the call (receipt abc)"))).toBe("refused");
    expect(classifyTxError(new Error("Smart contract panicked: Slippage: you would get 1"))).toBe("slippage");
  });
});
