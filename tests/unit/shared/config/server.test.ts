import { describe, expect, it } from "vitest";
import { ConfigError } from "@/shared/config/errors";
import { parseServerEnv } from "@/shared/config/server";

const LIVE = {
  DATA_SOURCE: "live",
  DATABASE_URL: "postgres://cut:cut@localhost:54330/cut_near",
  SESSION_SECRET: "x".repeat(32),
};

describe("parseServerEnv", () => {
  it("defaults to sample data and needs nothing else", () => {
    const env = parseServerEnv({});
    expect(env.DATA_SOURCE).toBe("sample");
    expect(env.KEEPER_ALLOW_MAINNET).toBe(false);
  });

  it("treats empty values copied from .env.example as unset", () => {
    expect(parseServerEnv({ DATABASE_URL: "", KEEPER_ACCOUNT_ID: "", KEEPER_PRIVATE_KEY: " " }).DATABASE_URL).toBeUndefined();
  });

  it("requires the database and the session secret with live data", () => {
    expect(() => parseServerEnv({ DATA_SOURCE: "live" })).toThrow(/DATABASE_URL: is required when DATA_SOURCE=live[\s\S]*SESSION_SECRET/);
    expect(parseServerEnv(LIVE).DATA_SOURCE).toBe("live");
  });

  it("rejects an unknown data source instead of falling back to sample", () => {
    expect(() => parseServerEnv({ DATA_SOURCE: "prod" })).toThrow(ConfigError);
  });

  it("names the variable but never echoes a secret", () => {
    const secret = "short-secret-value";
    try {
      parseServerEnv({ SESSION_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain("SESSION_SECRET");
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("validates URLs, account ids and key formats", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(() => parseServerEnv({ NEAR_RPC_URL: "ftp://rpc" })).toThrow(/NEAR_RPC_URL/);
    expect(() => parseServerEnv({ KEEPER_ACCOUNT_ID: "Bad..Id", KEEPER_PRIVATE_KEY: "ed25519:abc" })).toThrow(/KEEPER_ACCOUNT_ID/);
    expect(() => parseServerEnv({ KEEPER_ACCOUNT_ID: "keeper.testnet", KEEPER_PRIVATE_KEY: "0xdeadbeef" })).toThrow(/KEEPER_PRIVATE_KEY/);
  });

  it("requires keeper and faucet credentials in pairs", () => {
    expect(() => parseServerEnv({ KEEPER_ACCOUNT_ID: "keeper.testnet" })).toThrow(/KEEPER_PRIVATE_KEY: is required together with KEEPER_ACCOUNT_ID/);
    expect(() => parseServerEnv({ FAUCET_PRIVATE_KEY: `ed25519:${"1".repeat(88)}` })).toThrow(/FAUCET_ACCOUNT_ID/);
  });

  it("parses the mainnet guard flag", () => {
    expect(parseServerEnv({ KEEPER_ALLOW_MAINNET: "true" }).KEEPER_ALLOW_MAINNET).toBe(true);
    expect(parseServerEnv({ KEEPER_ALLOW_MAINNET: "0" }).KEEPER_ALLOW_MAINNET).toBe(false);
    expect(() => parseServerEnv({ KEEPER_ALLOW_MAINNET: "yes" })).toThrow(/KEEPER_ALLOW_MAINNET/);
  });
});
