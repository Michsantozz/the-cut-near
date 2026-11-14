import { Suspense } from "react";

import { parseCursor, parseFilter, ReceiptsScreen, ReceiptsSkeleton } from "@/features/receipts";
import { loadReceipts } from "@/features/receipts/server";
import { isLive } from "@/shared/config/data-source";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Receipts · The Cut" };

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
  const data = await loadReceipts({ filter: parseFilter(params.filter), before: parseCursor(params.before), viewer: await getViewerAccountId() });
  return <ReceiptsScreen data={data} />;
}
