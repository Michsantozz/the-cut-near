import { connection } from "next/server";
import { Suspense } from "react";

import { finalHourStart, SettingsScreen } from "@/features/account";
import { getViewerPrefs } from "@/features/account/server";
import { getNextCut } from "@/entities/cut/server";
import { publicEnv } from "@/shared/config";
import { formatUtcTime } from "@/shared/ui/format";
import { Skeleton } from "@/shared/ui/skeleton";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Settings · The Cut" };

// Settings: the connected wallet, money and language, alerts, history and the fine print.
// Test mode is reached from the striped testnet band, as in the design.
export default function SettingsPage() {
  return (
    <>
      <AppHeader title="Settings" sub="Wallet, display, alerts and the fine print" />
      <Suspense fallback={<Skeleton className="mx-5 mt-3 h-[96px] rounded-3xl bg-paper lg:mx-8" />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  // Request time first: the sample cut time comes from the clock.
  await connection();
  const [accountId, nextCut, prefs] = await Promise.all([getViewerAccountId(), getNextCut(), getViewerPrefs()]);
  return (
    <SettingsScreen
      accountId={accountId}
      network={publicEnv.network}
      cutTime={formatUtcTime(nextCut.at)}
      finalHour={formatUtcTime(finalHourStart(nextCut.at))}
      prefs={prefs}
    />
  );
}
