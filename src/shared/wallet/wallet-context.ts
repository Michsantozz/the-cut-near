"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

import type { ContractCall } from "./contract-call";
import type { NearNetwork } from "./network";

export type WalletStatus = "loading" | "signed-out" | "signed-in";

/** A wallet the user can pick, from NEAR Connect's manifest for the current network. */
export type WalletOption = { id: string; name: string };

export type WalletContextValue = {
  network: NearNetwork;
  status: WalletStatus;
  accountId: string | null;
  /** Null until NEAR Connect has loaded its wallet list. */
  wallets: WalletOption[] | null;
  /** Connects one wallet by id, or opens NEAR Connect's own picker without one. Connecting never moves money. */
  connect: (walletId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Opens the "Connect a NEAR wallet" sheet. */
  openConnect: () => void;
  /**
   * Signs and sends one transaction to the cut contract with these calls, in order, from the connected wallet.
   * Resolves with the transaction hash once it is executed; rejects when the user cancels or any call fails.
   */
  callContract: (calls: readonly ContractCall[]) => Promise<{ txHash: string }>;
};

export const WalletContext = createContext<WalletContextValue | null>(null);

const subscribeNothing = () => () => {};

/**
 * The wallet, as this component may render it. While a component hydrates it sees `loading`, the state the
 * server rendered: a page streamed in after the wallet loaded would otherwise hydrate with `signed-out` over
 * server HTML made with `loading` (a hydration mismatch). It re-renders with the real state right after.
 */
export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  // React reads the server snapshot while hydrating, the client one otherwise (and after hydration).
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const shown = useMemo(() => (value && !hydrated ? { ...value, status: "loading" as const, accountId: null } : value), [value, hydrated]);
  if (!shown) throw new Error("useWallet must be used inside <WalletProvider>");
  return shown;
}
