import "server-only";
import { cutContract } from "@/shared/near/contract";
import { keeperSigner } from "@/shared/near/keeper";
import { getRpc } from "@/shared/near/rpc";
import { runKeeper, type KeeperResult } from "./run-cut";

export { KeeperError, runKeeper, type KeeperDeps, type KeeperResult } from "./run-cut";

/** The daily keeper job: runs the cut when due, with the function-call key from the environment. */
export async function runCutJob(): Promise<KeeperResult> {
  const rpc = getRpc();
  const contract = cutContract(rpc);
  // Checked up front, so a misconfigured key fails every run, not only the one at cut time.
  const signer = await keeperSigner(rpc, contract.contractId, ["run_cut"]);
  return runKeeper({
    nextCut: () => contract.getNextCut(),
    chainNow: async () => (await rpc.block("final")).timestamp,
    runCut: () => signer.call("run_cut"),
  });
}
