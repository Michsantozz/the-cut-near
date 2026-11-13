import "server-only";
import { ConfigError } from "@/shared/config/errors";
import { publicEnv } from "@/shared/config/public";
import { requireKeeperCredentials } from "@/shared/config/server";
import { cutContract } from "@/shared/near/contract";
import { getRpc } from "@/shared/near/rpc";
import { createFunctionCallSigner } from "@/shared/near/signer";
import { runKeeper, type KeeperResult } from "./run-cut";

export { KeeperError, runKeeper, type KeeperDeps, type KeeperResult } from "./run-cut";

/** The only method the keeper's key may call. */
export const KEEPER_METHODS = ["run_cut"] as const;

/** The daily keeper job: runs the cut when due, with the function-call key from the environment. */
export async function runCutJob(): Promise<KeeperResult> {
  const credentials = requireKeeperCredentials();
  if (publicEnv.network === "mainnet" && !credentials.allowMainnet) {
    throw new ConfigError("The keeper does not sign on mainnet unless KEEPER_ALLOW_MAINNET=true is set by a human.");
  }
  const rpc = getRpc();
  const contract = cutContract(rpc);
  // Checked up front, so a misconfigured key fails every run, not only the one at cut time.
  const signer = await createFunctionCallSigner({ rpc, ...credentials, receiverId: contract.contractId, methods: KEEPER_METHODS });
  return runKeeper({
    nextCut: () => contract.getNextCut(),
    chainNow: async () => (await rpc.block("final")).timestamp,
    runCut: () => signer.call("run_cut"),
  });
}
