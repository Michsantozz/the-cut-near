import { Suspense } from "react";

import { parseCursor, parseFilter, ReceiptsScreen, ReceiptsSkeleton } from "@/features/receipts";
import { refreshJournal } from "@/features/indexer/server";
import { loadReceipts } from "@/features/receipts/server";
import { isLive } from "@/shared/config/data-source";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Receipts · The Cut" };

// A journal catch-up started by this request may finish after the response (see refreshJournal).
export const maxDuration = 60;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The public log of every mint, burn, trade, save, boo, move, cut and prize, with the audit (Receipts.dc.html).
export default function ReceiptsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppHeader title="Receipts" sub={isLive() ? "Every entry of the contract’s public log, with a link to NEAR" : "The sample world’s log, the way the contract writes it"} />
      <Suspense fallback={<ReceiptsSkeleton />}>
        <Receipts searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Receipts({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Catch the journal up first (bounded, throttled), so a trade made a minute ago is listed.
  const [journal, viewer] = await Promise.all([refreshJournal(), getViewerAccountId()]);
  const data = await loadReceipts({ filter: parseFilter(params.filter), before: parseCursor(params.before), viewer });
  return <ReceiptsScreen data={data} updating={journal === "updating"} />;
}
