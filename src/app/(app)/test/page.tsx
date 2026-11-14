import { Suspense } from "react";

import { TestModeScreen } from "@/features/account";
import { getParams } from "@/entities/market/server";
import { publicEnv } from "@/shared/config";
import { Skeleton } from "@/shared/ui/skeleton";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Test mode · The Cut" };

// Test mode: the testnet account and the 5-minute tour. Nothing here is real money.
export default function TestModePage() {
  return (
    <>
      <AppHeader title="Test mode" sub="Testnet · nothing here is real money" />
      <Suspense fallback={<Skeleton className="mx-5 mt-3 h-[200px] rounded-3xl bg-paper lg:mx-8" />}>
        <TestModeContent />
      </Suspense>
    </>
  );
}

async function TestModeContent() {
  const [accountId, params] = await Promise.all([getViewerAccountId(), getParams()]);
  return <TestModeScreen accountId={accountId} network={publicEnv.network} cutIntervalMs={params.cutIntervalMs} />;
}
