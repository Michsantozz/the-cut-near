export type NearNetwork = "mainnet" | "testnet";

/** Testnet unless mainnet is asked for by name: the app never lands on mainnet by accident. */
export function resolveNetwork(value: string | undefined): NearNetwork {
  return value === "mainnet" ? "mainnet" : "testnet";
}

export const NEAR_NETWORK: NearNetwork = resolveNetwork(process.env.NEXT_PUBLIC_NEAR_NETWORK);
