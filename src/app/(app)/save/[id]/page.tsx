import { Suspense } from "react";

import { SaveScreen, TradeSkeleton } from "@/features/trade";
import { loadSave } from "@/features/trade/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { LineupBackdrop } from "../../_trade/lineup-backdrop";

export const metadata = { title: "Save an agent · The Cut" };

export default function SavePage({ params }: PageProps<"/save/[id]">) {
  return (
    <>
      <LineupBackdrop />
      <Suspense fallback={<TradeSkeleton label="Save an agent" />}>
        <Save params={params} />
      </Suspense>
    </>
  );
}

async function Save({ params }: Pick<PageProps<"/save/[id]">, "params">) {
  const { id } = await params;
  return <SaveScreen data={await loadSave(await getViewerAccountId(), id)} />;
}
