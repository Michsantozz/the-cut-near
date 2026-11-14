import "server-only";

import daily from "../../../../deploy/testnet-daily.json";

import { publicEnv, type NearNetwork } from "@/shared/config/public";
import { isLive } from "@/shared/config/data-source";
import { PUBLIC_RPC_URLS, TX_API_URLS } from "@/shared/near";

import type { PublishedBuild } from "../model/live-checks";

export type JudgeDesk = {
  /** False in sample mode: then nothing is checked and nothing is shown green. */
  live: boolean;
  network: NearNetwork;
  contractId: string;
  /** Endpoints the browser reads, in failover order (the public ones: the server's NEAR_RPC_URL may hold a key). */
  rpcUrls: readonly string[];
  txApiUrl: string;
  /** The daily testnet build as recorded by scripts/testnet/launch.ts. */
  build: PublishedBuild | null;
};

/** The published build of deploy/testnet-daily.json, or null when the record is incomplete. */
function publishedBuild(): PublishedBuild | null {
  const { contract, wasm, txs } = daily as { contract?: string; wasm?: { sha256?: string; bs58?: string }; txs?: { deploy?: string; deleteKey?: string } };
  if (!contract || !wasm?.sha256 || !wasm.bs58) return null;
  return { contract, wasmSha256: wasm.sha256, wasmBs58: wasm.bs58, deployTx: txs?.deploy ?? null, deleteKeyTx: txs?.deleteKey ?? null };
}

/** What the judge desk needs to run its checks in the browser. */
export function loadJudgeDesk(): JudgeDesk {
  const { network, contractId } = publicEnv;
  return { live: isLive(), network, contractId, rpcUrls: PUBLIC_RPC_URLS[network], txApiUrl: TX_API_URLS[network], build: publishedBuild() };
}
