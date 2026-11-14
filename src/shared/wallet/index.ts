// Client-safe wallet API. Server code reads the viewer with `@/shared/wallet/server`.
export { AccountChip, AccountDot } from "./account-chip";
export { NEAR_NETWORK, resolveNetwork, type NearNetwork } from "./network";
export { isNearAccountId } from "./viewer";
export { ConnectButton, DisconnectButton, WalletGatedLink } from "./wallet-actions";
export { useWallet, type WalletContextValue, type WalletOption, type WalletStatus } from "./wallet-context";
export { WalletProvider } from "./wallet-provider";
