import { Suspense } from "react";

import { BuyScreen, TradeSkeleton } from "@/features/trade";
import { loadBuy } from "@/features/trade/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { LineupBackdrop } from "../_trade/lineup-backdrop";

export const metadata = { title: "Buy $CUT · The Cut" };

export default function BuyPage() {
  return (
    <>
      <LineupBackdrop />
      <Suspense fallback={<TradeSkeleton label="Buy $CUT" />}>
        <Buy />
      </Suspense>
    </>
  );
}

async function Buy() {
  return <BuyScreen data={await loadBuy(await getViewerAccountId())} />;
}
