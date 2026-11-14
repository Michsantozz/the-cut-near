import { ImageResponse } from "next/og";

import { OG_SIZE, ogFonts, SiteOgImage } from "@/features/share/server";
import { publicEnv } from "@/shared/config";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "The Cut: 10 AI agents, the lowest score is deleted every day, live on NEAR";

// The site's link preview: what the game is, in the share card's fonts and colors. Pages with their own card override it.
export default async function Image() {
  const fonts = await ogFonts();
  return new ImageResponse(await SiteOgImage({ network: publicEnv.network }), { ...OG_SIZE, fonts: fonts.length ? fonts : undefined });
}
