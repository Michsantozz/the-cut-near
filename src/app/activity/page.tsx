import { Suspense } from "react";

import { ActivityScreen, ActivitySkeleton, ActivityVisitor, parseActivityFilter } from "@/features/activity";
import { loadActivity } from "@/features/activity/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Activity · The Cut" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The viewer's buys, sells, saves, prizes and the cuts they saw (Activity.dc.html, DeskActivity.dc.html).
export default function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppHeader title="Activity" sub="Your buys, sells, saves, prizes and daily cuts, each with a receipt on NEAR" />
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ActivityBody({ searchParams }: { searchParams: SearchParams }) {
  const accountId = await getViewerAccountId();
  if (!accountId) return <ActivityVisitor />;
  const data = await loadActivity(accountId, parseActivityFilter((await searchParams).filter));
  return <ActivityScreen data={data} />;
}
