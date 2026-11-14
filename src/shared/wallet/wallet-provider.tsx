"use client";

import { NearProvider, useNearWallet, type NearContextValue } from "near-connect-hooks";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";

import { publicEnv } from "@/shared/config/public";

import { ConnectSheet } from "./connect-sheet";
import { ContractCallError, type ContractCall } from "./contract-call";
import { toActions } from "./to-actions";
import { NEAR_NETWORK } from "./network";
import { readViewer, viewerCookie } from "./viewer";
import { WalletContext, type WalletContextValue, type WalletOption, type WalletStatus } from "./wallet-context";

type Session = { status: WalletStatus; accountId: string | null };

// One stable config object, so NearProvider keeps a single connector for the page's lifetime.
const NEAR_CONFIG = { network: NEAR_NETWORK } as const;

const subscribeNothing = () => () => {};

/**
 * NEAR Connect for the whole app. NearProvider only exists in the browser: it is mounted next to the page,
 * not around it, once the page has hydrated, and its state is bridged into WalletContext. So the server never
 * builds a connector or fetches the wallet manifest, and the page tree never remounts when the wallet loads.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const inBrowser = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [session, setSession] = useState<Session>({ status: "loading", accountId: null });
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const nearRef = useRef<NearContextValue | null>(null);
  const router = useRouter();

  // Keep the viewer cookie in step with the wallet, and re-render the server components when it changes.
  useEffect(() => {
    if (session.status === "loading") return;
    if (readViewer(document.cookie) === session.accountId) return;
    document.cookie = viewerCookie(session.accountId);
    router.refresh();
  }, [session, router]);

  const connect = useCallback(async (walletId?: string) => {
    const connector = nearRef.current?.connector;
    if (!connector) throw new Error("Wallets are still loading");
    await connector.connect(walletId ? { walletId } : {});
  }, []);

  const disconnect = useCallback(async () => {
    await nearRef.current?.signOut();
  }, []);

  const callContract = useCallback(async (calls: readonly ContractCall[]) => {
    const near = nearRef.current;
    if (!near?.signedAccountId) throw new Error("Connect a wallet first");
    const outcome = await near.signAndSendTransaction({ receiverId: publicEnv.contractId, actions: toActions(calls) });
    const txHash = outcome.transaction_outcome.id;
    const failed = [outcome.status, ...[outcome.transaction_outcome, ...outcome.receipts_outcome].map(({ outcome: o }) => o.status)].find(
      (status) => typeof status === "object" && "Failure" in status,
    );
    // The failure is a nested ActionError; its JSON carries the contract's panic text (e.g. "Slippage: …").
    if (failed) throw new ContractCallError(`The contract refused the call: ${JSON.stringify((failed as { Failure: unknown }).Failure)}`, txHash);
    return { txHash };
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      network: NEAR_NETWORK,
      status: session.status,
      accountId: session.accountId,
      wallets,
      connect,
      disconnect,
      openConnect: () => setSheetOpen(true),
      callContract,
    }),
    [session, wallets, connect, disconnect, callContract],
  );

  return (
    <WalletContext value={value}>
      {children}
      {inBrowser && (
        <NearProvider config={NEAR_CONFIG}>
          <WalletBridge apiRef={nearRef} onSession={setSession} onWallets={setWallets} />
        </NearProvider>
      )}
      <ConnectSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </WalletContext>
  );
}

function WalletBridge({
  apiRef,
  onSession,
  onWallets,
}: {
  apiRef: RefObject<NearContextValue | null>;
  onSession: (session: Session) => void;
  onWallets: (wallets: WalletOption[]) => void;
}) {
  const wallet = useNearWallet();
  const { loading, signedAccountId, connector } = wallet;

  useEffect(() => {
    apiRef.current = wallet;
  });

  useEffect(() => {
    onSession({ status: loading ? "loading" : signedAccountId ? "signed-in" : "signed-out", accountId: signedAccountId || null });
  }, [loading, signedAccountId, onSession]);

  useEffect(() => {
    let active = true;
    const publish = () => {
      if (active) onWallets(connector.availableWallets.map(({ manifest }) => ({ id: manifest.id, name: manifest.name })));
    };
    connector.on("selector:walletsChanged", publish);
    void connector.whenManifestLoaded.then(publish, publish);
    return () => {
      active = false;
      connector.off("selector:walletsChanged", publish);
    };
  }, [connector, onWallets]);

  return null;
}
