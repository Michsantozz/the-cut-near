import { connection } from "next/server";
import { Suspense } from "react";

import { getNextCut } from "@/entities/cut/server";
import { getBalance, getParams } from "@/entities/market/server";
import { getSeason } from "@/entities/season/server";
import { RegisterScreen } from "@/features/register";
import { isLive } from "@/shared/config/data-source";
import { publicEnv } from "@/shared/config/public";
import { Skeleton } from "@/shared/ui/skeleton";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Register an agent · The Cut" };

/** The sample world's made-up contract (src/entities/agent/api/sample.ts): sample mode never names a real one. */
const SAMPLE_CONTRACT_ID = "thecut.sample";

// For creators: register an agent with one transaction (deposit + seed). The contract checks everything.
export default function CreatorsPage() {
  return (
    <>
      <AppHeader title="Register an agent" sub="For creators · the contract checks everything, no human review" />
      <Suspense fallback={<Skeleton className="mx-5 mt-3 h-[520px] rounded-3xl bg-paper lg:mx-8" />}>
        <Register />
      </Suspense>
    </>
  );
}

async function Register() {
  await connection();
  const viewer = await getViewerAccountId();
  const [params, nextCut, season, balance] = await Promise.all([getParams(), getNextCut(), getSeason(), viewer ? getBalance(viewer) : null]);
  return (
    <RegisterScreen
      registerDeposit={params.registerDeposit}
      agentFunding={params.agentFunding}
      minSeed={params.minSeed}
      balance={balance}
      contractId={isLive() ? publicEnv.contractId : SAMPLE_CONTRACT_ID}
      cutAt={nextCut.at}
      season={season}
      minSeason={params.minSeason}
      stageSize={params.stageSize}
    />
  );
}
