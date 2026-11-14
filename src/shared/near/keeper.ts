import "server-only";
import { ConfigError } from "@/shared/config/errors";
import { publicEnv } from "@/shared/config/public";
import { requireKeeperCredentials } from "@/shared/config/server";
import type { NearRpc } from "./rpc";
import { createFunctionCallSigner, type FunctionCallSigner } from "./signer";

/** What the keeper's function-call key is created for on the main contract: the daily cut and relayed moves. */
export const KEEPER_KEY_METHODS = ["run_cut", "submit_move"] as const;
export type KeeperMethod = (typeof KEEPER_KEY_METHODS)[number];

/**
 * The keeper's signer from KEEPER_ACCOUNT_ID / KEEPER_PRIVATE_KEY, checked on chain for `methods` (each job asks
 * only for the call it makes). Refuses full-access keys, and mainnet unless KEEPER_ALLOW_MAINNET=true.
 */
export async function keeperSigner(rpc: NearRpc, receiverId: string, methods: readonly KeeperMethod[]): Promise<FunctionCallSigner> {
  const credentials = requireKeeperCredentials();
  if (publicEnv.network === "mainnet" && !credentials.allowMainnet) {
    throw new ConfigError("The keeper does not sign on mainnet unless KEEPER_ALLOW_MAINNET=true is set by a human.");
  }
  return createFunctionCallSigner({ rpc, accountId: credentials.accountId, privateKey: credentials.privateKey, receiverId, methods });
}
