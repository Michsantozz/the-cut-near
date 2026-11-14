import { Suspense } from "react";

import { BooScreen, TradeSkeleton } from "@/features/trade";
import { loadBoo } from "@/features/trade/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { LineupBackdrop } from "../../_trade/lineup-backdrop";

export const metadata = { title: "Boo an agent · The Cut" };

export default function BooPage({ params }: PageProps<"/boo/[id]">) {
  return (
    <>
      <LineupBackdrop />
      <Suspense fallback={<TradeSkeleton label="Boo an agent" />}>
        <Boo params={params} />
      </Suspense>
    </>
  );
}

async function Boo({ params }: Pick<PageProps<"/boo/[id]">, "params">) {
  const { id } = await params;
  return <BooScreen data={await loadBoo(await getViewerAccountId(), id)} />;
}
