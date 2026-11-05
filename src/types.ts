export interface GenevaMetaBook {
  book_id: string;
  book: string;
  order: number;
  chapters: number;
  verse_counts: number[];
}
export interface GenevaMeta {
  edition_id: string;
  edition_name: string;
  language: string;
  schema_version: number;
  license: string;
  books: GenevaMetaBook[];
}
export interface GenevaVerse { verse: number; text: string }
export interface GenevaChapter { chapter: number; verses: GenevaVerse[] }
export interface GenevaBook {
  book_id: string;
  book: string;
  source: string;
  schema_version: number;
  chapters: GenevaChapter[];
}
export interface HenryMeta {
  source_id: string;
  source: string;
  schema_version: number;
  license: string;
  books: { book_id: string; book: string }[];
}
export interface HenrySection {
  id: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  section_title?: string;
  text: string;
  markdown?: string | null;
}
export interface HenryBook {
  book_id: string;
  book: string;
  source: string;
  schema_version: number;
  sections: HenrySection[];
}

export interface VersePoint { chapter: number; verse: number }
export interface Range {
  book_id: string;
  start?: VersePoint | null;
  end?: VersePoint | null;
}
export interface VerseRef {
  book: string;
  book_id: string;
  chapter: number;
  verse: number;
  text: string;
}

export type LoopItem =
  | { kind: "verse"; book: string; chapter: number; verse: number; text: string }
  | {
      kind: "henry";
      book: string;
      chapter: number;
      verse_start: number;
      verse_end: number;
      text: string;
      for_verse: number;
      section_title?: string;
    };

export type Speed = "slow" | "medium" | "fast";
export type Theme = "light" | "dark";
export type ScrollMode = "vertical" | "horizontal";
export type Commentary = "none" | "henry" | "calvin";
export type FontSize = "s" | "m" | "l" | "xl";
/** Start-only. Legacy end/henry may still appear in old localStorage. */
export interface Prefs {
  range: { book_id: string; start: VersePoint; end?: VersePoint };
  commentary: Commentary;
  fontSize: FontSize;
  speed: Speed;
  theme: Theme;
  mode: ScrollMode;
}
