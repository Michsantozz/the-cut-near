"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { useWallet } from "@/shared/wallet";

// `run_cut` needs at least 60 TGas; the cut deletes an account and pays out, so it gets the most a call can carry.
const RUN_CUT_GAS = "300000000000000";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; txHash: string } | { kind: "error"; message: string };

/** Runs the cut from the connected wallet. The contract refuses it before the cut time, and nothing moves. */
export function RunCutButton({ label }: { label: string }) {
  const { status, openConnect, callContract } = useWallet();
  const router = useRouter();
  const [state, setState] = useState<Status>({ kind: "idle" });

  async function run() {
    if (status !== "signed-in") return openConnect();
    setState({ kind: "sending" });
    try {
      const { txHash } = await callContract([{ method: "run_cut", gas: RUN_CUT_GAS }]);
      setState({ kind: "sent", txHash });
      router.refresh();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "The cut was not run." });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="primary"
        size="xl"
        className="h-[58px] rounded-2xl px-[26px] text-[17px] shadow-[3px_3px_0_var(--color-lime)] active:translate-y-px"
        disabled={state.kind === "sending"}
        onClick={() => void run()}
      >
        <Play aria-hidden="true" className="size-[19px]" strokeWidth={2.6} />
        {state.kind === "sending" ? "Confirm in your wallet…" : label}
      </Button>
      <p role="status" className="text-[13px] font-semibold text-line-3">
        {state.kind === "sent" && "Sent. The receipt shows up here once the block is final."}
        {state.kind === "error" && state.message}
      </p>
    </div>
  );
}
