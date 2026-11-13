import { describe, expect, it } from "vitest";
import { explorerTxUrl, PUBLIC_RPC_URLS, rpcUrls } from "@/shared/near/network";

describe("rpcUrls", () => {
  it("puts the preferred endpoint first and drops duplicates", () => {
    expect(rpcUrls("testnet", "https://test.rpc.fastnear.com/")).toEqual([...PUBLIC_RPC_URLS.testnet]);
    expect(rpcUrls("testnet", "https://my.rpc.example")[0]).toBe("https://my.rpc.example");
    expect(rpcUrls("mainnet")).toEqual([...PUBLIC_RPC_URLS.mainnet]);
  });

  it("links transactions to the network's explorer", () => {
    expect(explorerTxUrl("testnet", "abc")).toBe("https://testnet.nearblocks.io/txns/abc");
  });
});
