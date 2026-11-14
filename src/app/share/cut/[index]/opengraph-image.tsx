import { ImageResponse } from "next/og";

import { CutOgImage, loadCutShare, OG_SIZE, ogFont } from "@/features/share/server";

import { cutQuote } from "./quote";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "The Cut: the daily cut";

// The share card as the link preview on X, Telegram and anywhere else that reads Open Graph.
export default async function Image({ params }: { params: Promise<{ index: string }> }) {
  const share = await loadCutShare(Number((await params).index));
  if (!share) return new Response("Not found", { status: 404 });
  const [quote, font] = await Promise.all([cutQuote(share.index), ogFont()]);
  return new ImageResponse(await CutOgImage({ share, quote: quote?.text ?? null }), {
    ...OG_SIZE,
    fonts: font ? [{ name: "Bricolage", data: font, weight: 800, style: "normal" }] : undefined,
  });
}
