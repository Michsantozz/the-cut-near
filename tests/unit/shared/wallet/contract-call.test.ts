import { describe, expect, it } from "vitest";

import { DEFAULT_GAS, ONE_YOCTO, toActions } from "@/shared/wallet/contract-call";

describe("toActions", () => {
  it("turns calls into function-call actions in order, with default gas and no deposit", () => {
    expect(toActions([{ method: "storage_deposit", deposit: "1250000000000000000000" }, { method: "save", args: { robot_id: "kiko", amount: "1" }, deposit: ONE_YOCTO }])).toEqual([
      { type: "FunctionCall", params: { methodName: "storage_deposit", args: {}, gas: DEFAULT_GAS, deposit: "1250000000000000000000" } },
      { type: "FunctionCall", params: { methodName: "save", args: { robot_id: "kiko", amount: "1" }, gas: DEFAULT_GAS, deposit: "1" } },
    ]);
  });

  it("refuses an empty transaction", () => {
    expect(() => toActions([])).toThrow();
  });
});
