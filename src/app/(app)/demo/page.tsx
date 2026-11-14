import { Suspense } from "react";

import { DemoScreen, cutSchedule, demoSteps, spanText } from "@/features/demo";
import { getParams } from "@/entities/market/server";
import { publicEnv } from "@/shared/config";
import { isLive } from "@/shared/config/data-source";
import { explorerAccountUrl } from "@/shared/near";
import { formatAmount, formatUtcTime } from "@/shared/ui/format";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Demo guide · The Cut" };

// The demo guide: the game on NEAR testnet, step by step, with the time, the cost and what you should see.
export default function DemoPage() {
  return (
    <>
      <AppHeader title="Demo guide" sub="Try The Cut on NEAR testnet, step by step" />
      <Suspense fallback={<DemoSkeleton />}>
        <Demo />
      </Suspense>
    </>
  );
}

async function Demo() {
  const params = await getParams();
  const facts = {
    ...cutSchedule(params.cutIntervalMs, formatUtcTime(params.firstCutAt)),
    movesClose: spanText(params.moveLeadMs),
    thinkFee: formatAmount(params.thinkFee),
    fee: `${params.feeBps / 100}%`,
  };
  const { network, contractId } = publicEnv;
  return (
    <DemoScreen
      steps={demoSteps(facts)}
      facts={facts}
      network={network}
      contractId={contractId}
      contractHref={explorerAccountUrl(network, contractId)}
      sample={!isLive()}
    />
  );
}

function DemoSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:px-8 lg:pt-1" aria-busy="true">
      <Skeleton className="h-40 rounded-3xl bg-paper" />
      <Skeleton className="h-[420px] rounded-3xl bg-paper" />
    </div>
  );
}
