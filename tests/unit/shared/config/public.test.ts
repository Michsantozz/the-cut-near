import { describe, expect, it } from "vitest";
import { ConfigError } from "@/shared/config/errors";
import { parsePublicEnv } from "@/shared/config/public";

describe("parsePublicEnv", () => {
  it("defaults to testnet and its contract", () => {
    expect(parsePublicEnv({})).toEqual({ network: "testnet", contractId: "thecut-daily.testnet" });
    expect(parsePublicEnv({ NEXT_PUBLIC_NEAR_NETWORK: "mainnet" })).toEqual({ network: "mainnet", contractId: "thecut.near" });
  });

  it("takes the configured contract", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_CUT_CONTRACT: "cut-v2.testnet" }).contractId).toBe("cut-v2.testnet");
  });

  it("fails fast on a contract from the other network or a bad network", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_CUT_CONTRACT: "thecut.near" })).toThrow(/NEXT_PUBLIC_CUT_CONTRACT: is not a testnet account/);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_NEAR_NETWORK: "mainnet", NEXT_PUBLIC_CUT_CONTRACT: "thecut.testnet" })).toThrow(ConfigError);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_NEAR_NETWORK: "devnet" })).toThrow(/NEXT_PUBLIC_NEAR_NETWORK/);
  });
});
