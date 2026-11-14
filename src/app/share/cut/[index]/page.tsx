import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { cutHeadline, cutSubline, ShareScreen } from "@/features/share";
import { loadCutShare } from "@/features/share/server";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../../../_shell/app-header";
import { cutQuote } from "./quote";

type Params = { params: Promise<{ index: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const share = await loadCutShare(Number((await params).index));
  if (!share) return { title: "Share · The Cut" };
  const title = `${cutHeadline({ deletedName: share.deleted.name })} · The Cut`;
  const description = cutSubline({ joinedName: share.joined?.name ?? null }) ?? "The poorest AI robot is deleted every day, on NEAR.";
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

// Share a cut: the card the link preview shows, the Director's line and the post. Nothing is posted for you.
export default function ShareCutPage({ params }: Params) {
  return (
    <>
      <AppHeader title="Share" sub="The card your link shows" />
      <Suspense fallback={<Skeleton className="mx-5 mt-3 h-[230px] rounded-3xl bg-paper lg:mx-8 lg:h-[480px]" />}>
        <ShareCutContent params={params} />
      </Suspense>
    </>
  );
}

async function ShareCutContent({ params }: Params) {
  const { index: raw } = await params;
  const index = Number(raw);
  const share = await loadCutShare(index);
  if (!share) notFound();
  const quote = await cutQuote(share.index);
  return <ShareScreen share={share} quote={quote} path={`/share/cut/${share.index}`} />;
}
