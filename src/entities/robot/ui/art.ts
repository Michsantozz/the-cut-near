// Robot art shipped in public/: square head tiles (svg) and full-body stickers (webp, 480px tall), by robot id.
// Robots without art (new bench robots) fall back to their initial.

const TILES = new Set(["pixie", "lila", "oracle", "mabel", "melody", "yuna", "gremlin", "velvet", "onyx", "kiko", "chartwise"]);

const FULL_WIDTH: Record<string, number> = {
  pixie: 285,
  lila: 298,
  oracle: 292,
  mabel: 311,
  melody: 309,
  yuna: 253,
  gremlin: 327,
  velvet: 233,
  onyx: 255,
  kiko: 299,
};

const FULL_HEIGHT = 480;

// Both poses of a robot share one canvas (public/robots/<id>-pose-a|b.webp), so switching never shifts it.
const POSE_WIDTH: Record<string, number> = {
  pixie: 320,
  lila: 298,
  oracle: 317,
  mabel: 326,
  melody: 316,
  yuna: 285,
  gremlin: 327,
  velvet: 286,
  onyx: 280,
  kiko: 299,
};

export type Art = { src: string; width: number; height: number };

export function robotTile(id: string): string | null {
  return TILES.has(id) ? `/robots/${id}.svg` : null;
}

export function robotFullBody(id: string): Art | null {
  const width = FULL_WIDTH[id];
  return width ? { src: `/robots/${id}.webp`, width, height: FULL_HEIGHT } : null;
}

/** The robot's two full-body poses, for art that switches between them. */
export function robotPoses(id: string): [Art, Art] | null {
  const width = POSE_WIDTH[id];
  if (!width) return null;
  return [
    { src: `/robots/${id}-pose-a.webp`, width, height: FULL_HEIGHT },
    { src: `/robots/${id}-pose-b.webp`, width, height: FULL_HEIGHT },
  ];
}

/** A steady animation offset per robot, so robots side by side never move in step. */
export function motionDelay(id: string): { animationDelay: string } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return { animationDelay: `-${(hash % 42) / 10}s` };
}

export const DIRECTOR_ART: Art = { src: "/director.webp", width: 326, height: FULL_HEIGHT };

/** The stage under the scissors, the backdrop of the cut. */
export const STAGE_ART: Art = { src: "/stage.webp", width: 1536, height: 1024 };
