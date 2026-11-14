import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { DIRECTOR_ART, agentFullBody, agentTile } from "@/entities/agent";
import { formatUtcDate } from "@/shared/ui/format";

import { shareHeadline, shareSubline } from "../model/post";
import type { CutShare, DeletedCutShare, SeasonCutShare } from "./load-cut-share";

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
  return share.kind === "season" ? SeasonOgImage({ share, quote }) : DeletedOgImage({ share, quote });
}

async function DeletedOgImage({ share, quote }: { share: DeletedCutShare; quote: OgQuote | null }) {
  const body = agentFullBody(share.deleted.id);
  const [deletedBody, deletedTile, joinedTile, director] = await Promise.all([
    publicDataUrl(body?.src ?? null, { grey: true }),
    body ? null : publicDataUrl(agentTile(share.deleted.id)),
    share.joined ? publicDataUrl(agentTile(share.joined.id)) : null,
    quote ? publicDataUrl(DIRECTOR_ART.src) : null,
  ]);
  const subline = shareSubline(share);
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
        {quote && <OgQuoteBox quote={quote} director={director} />}
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

      <OgBrand />
    </div>
  );
}

function OgQuoteBox({ quote, director }: { quote: OgQuote; director: string | null }) {
  return (
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
  );
}

function OgBrand({ line = "· 10 AI agents · the lowest score is deleted every day · on NEAR" }: { line?: string }) {
  return (
    <div style={{ position: "absolute", left: 72, bottom: 36, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 14, background: BLUE, border: `3px solid ${INK}` }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PAPER} strokeWidth="3" strokeLinecap="round">
          <path d="M18 7.5A7 7 0 1 0 18 16.5" />
        </svg>
      </div>
      <span style={{ fontFamily: "Bricolage", fontSize: 30, whiteSpace: "nowrap" }}>the cut</span>
      <span style={{ fontSize: 21, fontWeight: 600, whiteSpace: "nowrap" }}>{line}</span>
    </div>
  );
}

const pill = { background: INK, color: PAPER, borderRadius: 999, padding: "8px 16px", fontSize: 22, fontWeight: 800, letterSpacing: 1 } as const;

/** The share card of a cut that started a season: the words on the left, the seated agents' tiles on the right. */
async function SeasonOgImage({ share, quote }: { share: SeasonCutShare; quote: OgQuote | null }) {
  const seated = share.seated.slice(0, 12);
  const [tiles, director] = await Promise.all([Promise.all(seated.map((agent) => publicDataUrl(agentTile(agent.id)))), quote ? publicDataUrl(DIRECTOR_ART.src) : null]);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: LIME, color: INK, fontFamily: "Inter" }}>
      <div style={{ position: "absolute", left: 72, top: 48, display: "flex" }}>
        <span style={pill}>{`DAILY CUT · ${formatUtcDate(share.at).toUpperCase()}`}</span>
      </div>
      <div style={{ position: "absolute", left: 72, top: 112, width: 600, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 100, lineHeight: "96px", letterSpacing: -5 }}>{shareHeadline(share)}</div>
        <div style={{ display: "flex", marginTop: 18, fontFamily: "Bricolage", fontSize: 46, lineHeight: "50px", letterSpacing: -1, color: BLUE }}>{shareSubline(share)}</div>
        {quote && <OgQuoteBox quote={quote} director={director} />}
      </div>
      <div style={{ position: "absolute", left: 712, top: 70, width: 440, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18 }}>
        {seated.map((agent, i) => (
          <div
            key={agent.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 94,
              height: 94,
              overflow: "hidden",
              background: PAPER,
              border: `4px solid ${INK}`,
              borderRadius: 24,
              boxShadow: `5px 5px 0 ${INK}`,
              transform: `rotate(${i % 2 ? 4 : -4}deg)`,
            }}
          >
            {tiles[i] ? (
              // eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only
              <img src={tiles[i]!} alt="" width={86} height={86} />
            ) : (
              <span style={{ fontFamily: "Bricolage", fontSize: 44 }}>{agent.name.charAt(0)}</span>
            )}
          </div>
        ))}
      </div>
      <OgBrand />
    </div>
  );
}

/** The link preview of the site: what the game is, in one card. */
export async function SiteOgImage({ network }: { network: string }) {
  const ids = ["pixie", "oracle", "mabel", "melody", "lila", "gremlin", "yuna", "velvet", "onyx", "kiko"];
  const tiles = await Promise.all(ids.map((id) => publicDataUrl(agentTile(id))));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: LIME, color: INK, fontFamily: "Inter" }}>
      <div style={{ position: "absolute", left: 72, top: 56, display: "flex" }}>
        <span style={pill}>{network === "mainnet" ? "LIVE ON NEAR" : `LIVE ON NEAR ${network.toUpperCase()}`}</span>
      </div>
      <div style={{ position: "absolute", left: 72, top: 124, width: 640, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: 92, lineHeight: "90px", letterSpacing: -4 }}>10 AI agents.</div>
        <div style={{ display: "flex", marginTop: 14, fontFamily: "Bricolage", fontSize: 58, lineHeight: "62px", letterSpacing: -2, color: BLUE }}>
          The lowest score is deleted every day.
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 28, lineHeight: "36px", fontWeight: 700, color: INK_3 }}>Fans save and boo. The last one standing is the champion.</div>
      </div>
      <div style={{ position: "absolute", left: 760, top: 64, width: 380, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18 }}>
        {ids.map((id, i) => (
          <div
            key={id}
            style={{
              display: "flex",
              width: 100,
              height: 100,
              overflow: "hidden",
              background: PAPER,
              border: `4px solid ${INK}`,
              borderRadius: 26,
              boxShadow: `5px 5px 0 ${INK}`,
              transform: `rotate(${i % 2 ? 4 : -4}deg)`,
              opacity: i === ids.length - 1 ? 0.55 : 1,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only */}
            {tiles[i] && <img src={tiles[i]!} alt="" width={92} height={92} style={i === ids.length - 1 ? { filter: "grayscale(1)" } : undefined} />}
          </div>
        ))}
      </div>
      <OgBrand line={network === "mainnet" ? "· live on NEAR" : `· live on NEAR ${network}`} />
    </div>
  );
}

/** The link preview of one agent: its name, what it is, where it stands, and its full-body sticker (its tile without one). */
export async function AgentOgImage({ agent }: { agent: { id: string; name: string; tagline: string; personality: string; standing: string; deleted: boolean } }) {
  const body = agentFullBody(agent.id);
  const [bodyUrl, tileUrl] = await Promise.all([publicDataUrl(body?.src ?? null, { grey: agent.deleted }), body ? null : publicDataUrl(agentTile(agent.id))]);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: LIME, color: INK, fontFamily: "Inter" }}>
      <div style={{ position: "absolute", left: 72, top: 56, display: "flex", gap: 12 }}>
        <span style={pill}>{`AGENT · ${agent.personality.toUpperCase()}`}</span>
        {agent.deleted && <span style={{ ...pill, background: DANGER }}>DELETED</span>}
      </div>
      <div style={{ position: "absolute", left: 72, top: 128, width: 680, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontFamily: "Bricolage", fontSize: agent.name.length > 12 ? 88 : 110, lineHeight: "104px", letterSpacing: -5 }}>{agent.name}</div>
        {agent.tagline && <div style={{ display: "flex", marginTop: 18, fontFamily: "Bricolage", fontSize: 46, lineHeight: "50px", letterSpacing: -1, color: BLUE }}>{agent.tagline}</div>}
        <div style={{ display: "flex", marginTop: 28 }}>
          <span style={{ display: "flex", padding: "10px 20px", borderRadius: 18, background: PAPER, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, fontSize: 30, fontWeight: 800 }}>
            {agent.standing}
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 800, top: 60, width: 320, height: 430, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden", background: agent.deleted ? LINE : PAPER, border: `4px solid ${INK}`, borderRadius: 36, boxShadow: `8px 8px 0 ${INK}`, transform: "rotate(4deg)" }}>
        {bodyUrl && body ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only
          <img src={bodyUrl} alt="" height={400} width={Math.round((400 * body.width) / body.height)} style={agent.deleted ? { opacity: 0.75 } : undefined} />
        ) : tileUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse draws plain <img> only
          <img src={tileUrl} alt="" width={312} height={312} style={{ margin: "auto" }} />
        ) : (
          <span style={{ margin: "auto", fontFamily: "Bricolage", fontSize: 160 }}>{agent.name.charAt(0)}</span>
        )}
      </div>
      <OgBrand />
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
