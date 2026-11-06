/** Shipped Bible editions. Dirs under data/; Apocrypha only where the Lex DB has text. */
export interface EditionInfo {
  id: string;
  dir: string;
  short: string;
  name: string;
}

export const EDITIONS: readonly EditionInfo[] = [
  { id: "geneva1599", dir: "geneva", short: "Geneva", name: "Geneva Bible (1599)" },
  { id: "kj16", dir: "kj16", short: "KJV 1611", name: "King James Version (1611 Original)" },
  { id: "kjv", dir: "kjv", short: "KJV", name: "King James Version (Oxford 1769)" },
];

export const DEFAULT_EDITION_ID = "geneva1599";

export function editionById(id: string): EditionInfo | undefined {
  return EDITIONS.find((e) => e.id === id);
}

export function editionDir(id: string): string {
  return editionById(id)?.dir ?? "geneva";
}
