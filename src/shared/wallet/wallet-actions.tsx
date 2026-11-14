"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

import { Button } from "@/shared/ui/button";

import { useWallet } from "./wallet-context";

type ButtonProps = Omit<ComponentProps<typeof Button>, "onClick" | "asChild">;

/** Opens the "Connect a NEAR wallet" sheet. Connecting never moves money. */
export function ConnectButton({ children = "Connect", variant = "primary", ...props }: ButtonProps) {
  const { openConnect } = useWallet();
  return (
    <Button type="button" variant={variant} aria-haspopup="dialog" onClick={openConnect} {...props}>
      {children}
    </Button>
  );
}

/**
 * A link to a step that needs a wallet (buy, save, sell). Without a connected wallet it opens the connect
 * sheet instead of navigating. It stays a plain link before the wallet has loaded or without JavaScript.
 */
export function WalletGatedLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  const { status, openConnect } = useWallet();
  return (
    <Link
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || status !== "signed-out") return;
        event.preventDefault();
        openConnect();
      }}
    />
  );
}

/** Signs the wallet out of this app. Nothing on chain changes. */
export function DisconnectButton({ children = "Disconnect wallet", variant = "outline", ...props }: ButtonProps) {
  const { status, disconnect } = useWallet();
  return (
    <Button type="button" variant={variant} disabled={status !== "signed-in"} onClick={() => void disconnect()} {...props}>
      {children}
    </Button>
  );
}
