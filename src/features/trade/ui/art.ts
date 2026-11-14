// Robot art shipped in public/robots (the same files the lineup uses): square head tiles and 480px-tall stickers.

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

export function robotTile(id: string): string | null {
  return TILES.has(id) ? `/robots/${id}.svg` : null;
}

export function robotSticker(id: string): { src: string; width: number; height: number } | null {
  const width = FULL_WIDTH[id];
  return width ? { src: `/robots/${id}.webp`, width, height: 480 } : null;
}
