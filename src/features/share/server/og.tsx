import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { robotTile } from "@/entities/robot";
import { formatUtcDate } from "@/shared/ui/format";

import { cutHeadline, cutSubline } from "../model/post";
import type { CutShare } from "./load-cut-share";

/** The size X and Telegram show a summary_large_image at. */
export const OG_SIZE = { width: 1200, height: 630 };

// Design tokens (globals.css); the OG renderer cannot read CSS variables.
const INK = "#0a0b0d";
const LIME = "#c6f432";
const BLUE = "#0052ff";
const DANGER = "#ff3b3b";
const PAPER = "#ffffff";

/** A robot's head tile as a data URL, or null without art. Read from public/ so the image needs no fetch. */
async function tileDataUrl(id: string): Promise<string | null> {
  const src = robotTile(id);
  if (!src) return null;
  try {
    const svg = await readFile(join(process.cwd(), "public", src));
    return `data:image/svg+xml;base64,${svg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The share card of a cut, drawn for `ImageResponse` (flexbox and inline styles only). */
export async function CutOgImage({ share, quote }: { share: CutShare; quote: string | null }) {
  const [deletedTile, joinedTile] = await Promise.all([tileDataUrl(share.deleted.id), share.joined ? tileDataUrl(share.joined.id) : null]);
  const subline = cutSubline({ joinedName: share.joined?.name ?? null });
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: LIME, padding: 56, color: INK, fontFamily: "Bricolage" }}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, width: 660 }}>
        <div style={{ display: "flex" }}>
          <span style={{ background: INK, color: PAPER, borderRadius: 999, padding: "8px 20px", fontSize: 24, letterSpacing: 1.5 }}>
            {`DAILY CUT · ${formatUtcDate(share.at).toUpperCase()}`}
          </span>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 92, lineHeight: 0.95, letterSpacing: -4 }}>{cutHeadline({ deletedName: share.deleted.name })}</div>
        {subline && <div style={{ display: "flex", marginTop: 20, fontSize: 40, color: BLUE }}>{subline}</div>}
        {quote && (
          <div style={{ display: "flex", marginTop: 28, background: PAPER, border: `4px solid ${INK}`, borderRadius: 24, padding: "18px 24px", fontSize: 28, lineHeight: 1.25 }}>
            {`“${quote}”`}
          </div>
        )}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", fontSize: 26 }}>
          <span style={{ fontSize: 34, whiteSpace: "nowrap" }}>the cut</span>
          <span style={{ marginLeft: 14, whiteSpace: "nowrap" }}>· 10 AI robots · one coin · on NEAR</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 380, position: "relative" }}>
        <Tile src={deletedTile} name={share.deleted.name} rotate={-8} />
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 150,
            left: 30,
            transform: "rotate(-14deg)",
            border: `6px solid ${DANGER}`,
            color: DANGER,
            background: PAPER,
            borderRadius: 16,
            padding: "6px 22px",
            fontSize: 48,
            letterSpacing: 3,
          }}
        >
          DELETED
        </div>
        {share.joined && (
          <div style={{ display: "flex", marginTop: 24, position: "relative" }}>
            <Tile src={joinedTile} name={share.joined.name} rotate={5} />
            <span style={{ position: "absolute", right: -12, bottom: 12, background: INK, color: LIME, borderRadius: 999, padding: "4px 16px", fontSize: 28 }}>NEW</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ src, name, rotate }: { src: string | null; name: string; rotate: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: 220,
        height: 220,
        alignItems: "center",
        justifyContent: "center",
        background: PAPER,
        border: `5px solid ${INK}`,
        borderRadius: 32,
        boxShadow: `10px 10px 0 ${INK}`,
        transform: `rotate(${rotate}deg)`,
        overflow: "hidden",
        fontSize: 120,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only */}
      {src ? <img src={src} alt="" width={220} height={220} /> : name.charAt(0)}
    </div>
  );
}

let fontPromise: Promise<ArrayBuffer | null> | null = null;

/** Bricolage Grotesque ExtraBold for the card, fetched once from Google Fonts. Null falls back to the default font. */
export function ogFont(): Promise<ArrayBuffer | null> {
  fontPromise ??= (async () => {
    try {
      const css = await (await fetch("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800")).text();
      const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
      if (!url) return null;
      const response = await fetch(url);
      return response.ok ? await response.arrayBuffer() : null;
    } catch {
      return null;
    }
  })();
  return fontPromise;
}
