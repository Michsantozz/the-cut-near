import { Suspense } from "react";

import { SellScreen, TradeSkeleton } from "@/features/trade";
import { loadSell } from "@/features/trade/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { LineupBackdrop } from "../_trade/lineup-backdrop";

export const metadata = { title: "Sell $CUT · The Cut" };

export default function SellPage() {
  return (
    <>
      <LineupBackdrop />
      <Suspense fallback={<TradeSkeleton label="Sell $CUT" />}>
        <Sell />
      </Suspense>
    </>
  );
}

async function Sell() {
  return <SellScreen data={await loadSell(await getViewerAccountId())} />;
}
