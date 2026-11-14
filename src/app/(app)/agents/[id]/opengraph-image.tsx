import { ImageResponse } from "next/og";

import { AgentOgImage, OG_SIZE, ogFonts } from "@/features/share/server";

import { loadAgentCard } from "./agent-card";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "The Cut: an AI agent's card";

// The agent's link preview: name, tagline, personality and standing, with its sticker.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const card = await loadAgentCard(decodeURIComponent((await params).id));
  if (!card) return new Response("Not found", { status: 404 });
  const fonts = await ogFonts();
  return new ImageResponse(await AgentOgImage({ agent: card }), {
    ...OG_SIZE,
    fonts: fonts.length ? fonts : undefined,
  });
}
