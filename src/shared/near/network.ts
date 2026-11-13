import type { NearNetwork } from "@/shared/config/public";

/**
 * Public endpoints per network, in failover order. From https://docs.near.org/api/rpc/providers
 * (no API key, free tier); the NEAR Foundation archival endpoints are left out because the docs
 * call them severely rate limited.
 */
export const PUBLIC_RPC_URLS: Record<NearNetwork, readonly string[]> = {
  testnet: ["https://test.rpc.fastnear.com", "https://near-testnet.drpc.org", "https://testnet-rpc.intea.rs"],
  mainnet: ["https://free.rpc.fastnear.com", "https://rpc.intea.rs", "https://near.drpc.org"],
};

/** FastNEAR Transactions API (https://tx.main.fastnear.com), the indexer's event source. */
export const TX_API_URLS: Record<NearNetwork, string> = {
  testnet: "https://tx.test.fastnear.com",
  mainnet: "https://tx.main.fastnear.com",
};

const EXPLORER_URLS: Record<NearNetwork, string> = {
  testnet: "https://testnet.nearblocks.io",
  mainnet: "https://nearblocks.io",
};

/** `preferred` first, then the network's public endpoints, without duplicates. */
export function rpcUrls(network: NearNetwork, preferred?: string): string[] {
  const urls = preferred ? [preferred, ...PUBLIC_RPC_URLS[network]] : [...PUBLIC_RPC_URLS[network]];
  return [...new Set(urls.map((url) => url.replace(/\/+$/, "")))];
}

export function explorerTxUrl(network: NearNetwork, txHash: string): string {
  return `${EXPLORER_URLS[network]}/txns/${encodeURIComponent(txHash)}`;
}

export function explorerAccountUrl(network: NearNetwork, accountId: string): string {
  return `${EXPLORER_URLS[network]}/address/${encodeURIComponent(accountId)}`;
}
