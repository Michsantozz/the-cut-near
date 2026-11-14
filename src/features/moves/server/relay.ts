import "server-only";
import { nearAiClientFromEnv, readAiEnv, type NearAiClient } from "@/shared/ai";
import { keeperSigner } from "@/shared/near/keeper";
import { movesContract, type MovesContract } from "@/shared/near/moves";
import { getRpc, type NearRpc } from "@/shared/near/rpc";
import type { FunctionCallSigner } from "@/shared/near/signer";
import { MOVE_SIGNING_ALGO, relayMoves, type RelayOptions, type RelayPorts, type RelayReport } from "../model/relay";

export type RelayDeps = { rpc: NearRpc; contract: MovesContract; client: NearAiClient; signer: FunctionCallSigner };

/** The relay's ports on the app's clients: the RPC with failover, NEAR AI with its bounded signature wait, the keeper key. */
export function relayPorts({ rpc, contract, client, signer }: RelayDeps): RelayPorts {
  return {
    async window() {
      const [model, window, block] = await Promise.all([contract.getModel(), contract.getMoveWindow(), rpc.block("final")]);
      return { cutIndex: window.cutIndex, closesAt: window.closesAt, chainNow: block.timestamp, modelId: model.modelId, signers: model.signers };
    },
    waitingAgents: async () => (await contract.getStageMoves()).filter((agent) => !agent.moved).map((agent) => agent.id),
    moveRequest: (agentId) => contract.getMoveRequest(agentId),
    complete: async (requestBody) => (await client.postRawCompletion(requestBody)).responseBody,
    signature: (chatId, modelId) => client.chatSignature({ chatId, model: modelId, signingAlgo: MOVE_SIGNING_ALGO }),
    async submit(args) {
      const outcome = await signer.call("submit_move", args);
      return outcome.status === "failure" ? { status: "failure", txHash: outcome.txHash, detail: JSON.stringify(outcome.failure) } : { status: outcome.status, txHash: outcome.txHash };
    },
    hasMoved: (agentId) => contract.hasMoved(agentId),
  };
}

/**
 * The moves job: relays the move of every stage agent that has none for this cut, with the keeper's
 * function-call key. Safe to run any number of times; when NEAR AI is down, agents simply do not move.
 */
export async function relayMovesJob(options: RelayOptions = {}): Promise<RelayReport> {
  // Missing NEAR_AI_API_KEY fails the run loudly: that is a setup error, not an outage.
  const client = nearAiClientFromEnv(readAiEnv());
  const rpc = getRpc();
  const contract = movesContract(rpc);
  const signer = await keeperSigner(rpc, contract.contractId, ["submit_move"]);
  return relayMoves(relayPorts({ rpc, contract, client, signer }), options);
}
