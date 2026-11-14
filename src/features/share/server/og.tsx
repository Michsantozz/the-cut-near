import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { DIRECTOR_ART, agentFullBody, agentTile } from "@/entities/agent";
import { formatUtcDate } from "@/shared/ui/format";

import { cutSubline } from "../model/post";
import type { CutShare } from "./load-cut-share";

/**
 * The size of the link preview. ShareCard.dc.html is drawn at 1200×800, but X shows summary_large_image cards at 2:1
 * (and Telegram, Facebook and LinkedIn at 1.91:1): a 3:2 image loses its top and bottom to the crop. So the card keeps
 * the design's widths and type and packs its rows into 1200×630.
 */
export const OG_SIZE = { width: 1200, height: 630 };

// Design tokens (globals.css); the OG renderer cannot read CSS variables.
const INK = "#0a0b0d";
const INK_3 = "#4b5160";
const LIME = "#c6f432";
const BLUE = "#0052ff";
const DANGER = "#ff3b3b";
const PAPER = "#ffffff";
const LINE = "#e3e6ee";
const PINK = "#ff7ad9";

/**
 * A file in public/ as a data URL, or null when it is missing. Read from disk so the image needs no fetch. The
 * renderer cannot draw WebP, so stickers become PNG on the way, grey when `grey` is set.
 */
async function publicDataUrl(src: string | null, { grey = false } = {}): Promise<string | null> {
  if (!src) return null;
  try {
    const data = await readFile(join(process.cwd(), "public", src));
    if (src.endsWith(".svg")) return `data:image/svg+xml;base64,${data.toString("base64")}`;
    const image = sharp(data);
    const png = await (grey ? image.grayscale() : image).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export type OgQuote = { text: string; badge: string };

/** The share card of a cut (ShareCard.dc.html), drawn for `ImageResponse` (flexbox and inline styles only). */
export async function CutOgImage({ share, quote }: { share: CutShare; quote: OgQuote | null }) {
  const body = agentFullBody(share.deleted.id);
  const [deletedBody, deletedTile, joinedTile, director] = await Promise.all([
    publicDataUrl(body?.src ?? null, { grey: true }),
    body ? null : publicDataUrl(agentTile(share.deleted.id)),
    share.joined ? publicDataUrl(agentTile(share.joined.id)) : null,
    quote ? publicDataUrl(DIRECTOR_ART.src) : null,
  ]);
  const subline = cutSubline({ joinedName: share.joined?.name ?? null });
  const tile = { position: "absolute", display: "flex", overflow: "hidden", border: `4px solid ${INK}`, borderRadius: 36, boxShadow: `8px 8px 0 ${INK}` } as const;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: LIME, color: INK, fontFamily: "Inter" }}>
      <div style={{ position: "absolute", left: 72, top: 48, display: "flex" }}>
        <span style={{ background: INK, color: PAPER, borderRadius: 999, padding: "8px 16px", fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
          {`DAILY CUT · ${formatUtcDate(share.at).toUpperCase()}`}
        </span>
      </div>

      <div style={{ position: "absolute", left: 72, top: 112, width: 600, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Bricolage", fontSize: 100, lineHeight: "96px", letterSpacing: -5 }}>
          <span>{share.deleted.name}</span>
          <span>was deleted.</span>
        </div>
        {subline && <div style={{ display: "flex", marginTop: 18, fontFamily: "Bricolage", fontSize: 46, lineHeight: "50px", letterSpacing: -1, color: BLUE }}>{subline}</div>}
        {quote && (
          <div style={{ display: "flex", gap: 14, marginTop: 24, padding: "16px 22px", borderRadius: 26, background: PAPER, border: `3px solid ${INK}`, boxShadow: `6px 6px 0 ${INK}` }}>
            <div style={{ display: "flex", justifyContent: "center", width: 64, height: 64, flexShrink: 0, borderRadius: 18, background: PINK, border: `3px solid ${INK}`, overflow: "hidden" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only */}
              {director && <img src={director} alt="" height={128} width={Math.round((128 * DIRECTOR_ART.width) / DIRECTOR_ART.height)} style={{ marginTop: 2 }} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", width: 476 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: INK_3 }}>{`The Director · ${quote.badge}`}</span>
              <span style={{ fontSize: 27, lineHeight: "34px", fontWeight: 700 }}>{`“${quote.text}”`}</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...tile, left: 730, top: 52, width: 250, height: 250, transform: "rotate(-7deg)", background: LINE, alignItems: "flex-end", justifyContent: "center" }}>
        {deletedBody && body ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only
          <img src={deletedBody} alt="" height={235} width={Math.round((235 * body.width) / body.height)} style={{ opacity: 0.75 }} />
        ) : deletedTile ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only
          <img src={deletedTile} alt="" width={242} height={242} style={{ filter: "grayscale(1)", opacity: 0.75 }} />
        ) : (
          <span style={{ margin: "auto", fontFamily: "Bricolage", fontSize: 120 }}>{share.deleted.name.charAt(0)}</span>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: 745,
          top: 140,
          padding: "10px 22px",
          border: `6px solid ${DANGER}`,
          borderRadius: 16,
          color: DANGER,
          background: "rgba(255, 255, 255, 0.85)",
          fontFamily: "Bricolage",
          fontSize: 52,
          letterSpacing: 2,
          transform: "rotate(-18deg)",
        }}
      >
        DELETED
      </div>
      {share.joined && (
        <div style={{ ...tile, left: 870, top: 296, width: 260, height: 260, transform: "rotate(5deg)", background: PAPER, alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only */}
          {joinedTile ? <img src={joinedTile} alt="" width={252} height={252} /> : <span style={{ fontFamily: "Bricolage", fontSize: 120 }}>{share.joined.name.charAt(0)}</span>}
        </div>
      )}
      {share.joined && (
        <div style={{ position: "absolute", display: "flex", left: 1040, top: 500, padding: "8px 18px", borderRadius: 999, background: INK, color: LIME, fontSize: 30, fontWeight: 800, transform: "rotate(6deg)" }}>
          NEW
        </div>
      )}

      <div style={{ position: "absolute", left: 72, bottom: 36, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 14, background: BLUE, border: `3px solid ${INK}` }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PAPER} strokeWidth="3" strokeLinecap="round">
            <path d="M18 7.5A7 7 0 1 0 18 16.5" />
          </svg>
        </div>
        <span style={{ fontFamily: "Bricolage", fontSize: 30, whiteSpace: "nowrap" }}>the cut</span>
        <span style={{ fontSize: 21, fontWeight: 600, whiteSpace: "nowrap" }}>· 10 AI agents · the lowest score is deleted every day · on NEAR</span>
      </div>
    </div>
  );
}

export type OgFont = { name: string; data: ArrayBuffer; weight: 600 | 700 | 800; style: "normal" };

/** One Google font file (`family` ends where the weight goes), or null when it cannot be fetched. */
async function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

// Bricolage at its 96 optical size: the narrow cut the design's big headings use.
const FACES = [
  { name: "Bricolage", family: "Bricolage+Grotesque:opsz,wght@96,", weight: 800 },
  { name: "Inter", family: "Inter:wght@", weight: 600 },
  { name: "Inter", family: "Inter:wght@", weight: 700 },
  { name: "Inter", family: "Inter:wght@", weight: 800 },
] as const;

let fontsPromise: Promise<OgFont[]> | null = null;

/** Bricolage Grotesque ExtraBold for the headings and Inter for the rest, fetched once from Google Fonts. Missing faces fall back to the default font. */
export function ogFonts(): Promise<OgFont[]> {
  fontsPromise ??= Promise.all(FACES.map((face) => googleFont(face.family, face.weight))).then((files) =>
    FACES.flatMap((face, i) => {
      const data = files[i];
      return data ? [{ name: face.name, data, weight: face.weight, style: "normal" as const }] : [];
    }),
  );
  return fontsPromise;
}
