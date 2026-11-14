import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useWallet, WalletContext, type WalletContextValue } from "@/shared/wallet/wallet-context";

const signedIn: WalletContextValue = {
  network: "testnet",
  status: "signed-in",
  accountId: "fan.testnet",
  wallets: null,
  connect: async () => {},
  disconnect: async () => {},
  openConnect: () => {},
  callContract: async () => ({ txHash: "tx" }),
};

function Status() {
  const { status, accountId } = useWallet();
  return createElement("p", null, `${status}:${accountId ?? "none"}`);
}

describe("useWallet", () => {
  it("renders `loading` on the server and while hydrating, whatever the wallet already knows", () => {
    // The server snapshot is what hydration reads too, so a boundary streamed in after the wallet loaded
    // hydrates with the same text the server sent.
    const html = renderToString(createElement(WalletContext, { value: signedIn }, createElement(Status)));
    expect(html).toContain("loading:none");
  });

  it("throws outside the provider", () => {
    expect(() => renderToString(createElement(Status))).toThrow("useWallet must be used inside <WalletProvider>");
  });
});
