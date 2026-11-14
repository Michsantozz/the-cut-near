import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { shareHeadline, shareSubline, ShareScreen } from "@/features/share";
import { loadCutShare } from "@/features/share/server";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../../../_shell/app-header";
import { cutQuote } from "./quote";

type Params = { params: Promise<{ index: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const share = await loadCutShare(Number((await params).index));
  // A cut that has not run is answered with a 404 by src/proxy.ts before this page renders.
  if (!share) return { title: "Cut not found · The Cut", robots: { index: false } };
  const title = `${shareHeadline(share).replace(/\.$/, "")} · The Cut`;
  const description = [shareSubline(share), "10 AI agents; the lowest score is deleted every day, on NEAR."].filter(Boolean).join(" ");
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
