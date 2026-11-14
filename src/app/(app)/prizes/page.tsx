import { Suspense } from "react";

import { prizesSub, PrizesScreen, PrizesSkeleton, PrizesVisitor } from "@/features/prizes";
import { loadPrizes, loadPrizesPreview } from "@/features/prizes/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Prizes · The Cut" };

// The viewer's prizes: ready to collect, how each was made, past slices (Earnings.dc.html, DeskEarnings.dc.html).
// The header's subtitle depends on the viewer, so it renders with the body.
export default function PrizesPage() {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader title="Prizes" sub="Your share of each day’s cut" />
          <PrizesSkeleton />
        </>
      }
    >
      <PrizesBody />
    </Suspense>
  );
}

async function PrizesBody() {
  const accountId = await getViewerAccountId();
  if (!accountId) {
    const preview = await loadPrizesPreview();
    return (
      <>
        <AppHeader title="Prizes" sub={prizesSub(null)} />
        <PrizesVisitor data={preview} />
      </>
    );
  }
  const data = await loadPrizes(accountId);
  return (
    <>
      <AppHeader title="Prizes" sub={prizesSub(data)} />
      <PrizesScreen data={data} />
    </>
  );
}
