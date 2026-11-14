"use client";

import { createContext, useContext } from "react";

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
};

export const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside <WalletProvider>");
  return value;
}
