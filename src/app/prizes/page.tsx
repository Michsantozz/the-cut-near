import { Suspense } from "react";

import { PrizesScreen, PrizesSkeleton, PrizesVisitor } from "@/features/prizes";
import { loadPrizes } from "@/features/prizes/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Prizes · The Cut" };

// The viewer's prizes: ready to collect, how each was made, past slices (Earnings.dc.html, DeskEarnings.dc.html).
export default function PrizesPage() {
  return (
    <>
      <AppHeader title="Prizes" sub="Your share of each day’s cut" />
      <Suspense fallback={<PrizesSkeleton />}>
        <PrizesBody />
      </Suspense>
    </>
  );
}

async function PrizesBody() {
  const accountId = await getViewerAccountId();
  if (!accountId) return <PrizesVisitor />;
  return <PrizesScreen data={await loadPrizes(accountId)} />;
}
