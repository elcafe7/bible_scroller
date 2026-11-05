/**
 * Word-style passage picker: edition → book → chapter → verse (popup dialog).
 * Scroll editions today: Geneva only; UI still exposes edition in the same flow.
 */
import { canonBooks, groupBooks as groupCanon } from "./canon";
import type { GenevaMeta, GenevaMetaBook, VersePoint } from "./types";

export type PickerSelection = { book_id: string; start: VersePoint; edition_id: string };

export interface PickerEdition {
  id: string;
  short: string;
  name: string;
}

type Step = "books" | "chapters" | "verses";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Parse "John 3:16" / "1 john 3" style queries against meta books. */
function matchQuery(books: GenevaMetaBook[], q: string): { book: GenevaMetaBook; chapter?: number; verse?: number }[] {
  const raw = q.trim();
  if (!raw) return [];
  const m = raw.match(/^(.+?)(?:\s+(\d+)(?:\s*[:.]\s*(\d+))?)?$/);
  if (!m) return [];
  const needle = norm(m[1]);
  const chapter = m[2] ? +m[2] : undefined;
  const verse = m[3] ? +m[3] : undefined;
  const hits = books.filter((b) => {
    const id = norm(b.book_id);
    const name = norm(b.book);
    return name.startsWith(needle) || id.startsWith(needle) || name.includes(needle);
  });
  return hits.slice(0, 12).map((book) => ({ book, chapter, verse }));
}

export function createPassagePicker(opts: {
  root: HTMLElement;
  getMeta: () => GenevaMeta;
  getEditions: () => PickerEdition[];
  onSelect: (sel: PickerSelection) => void;
}) {
  const root = opts.root;
  const editionsBox = root.querySelector("#picker-editions") as HTMLElement;
  const nav = root.querySelector("#picker-nav") as HTMLElement;
  const backBtn = root.querySelector("#picker-back") as HTMLButtonElement;
  const crumb = root.querySelector("#picker-crumb") as HTMLElement;
  const stepBooks = root.querySelector("#picker-step-books") as HTMLElement;
  const booksBox = root.querySelector("#picker-books") as HTMLElement;
  const numbers = root.querySelector("#picker-numbers") as HTMLElement;
  const filter = root.querySelector("#picker-book-filter") as HTMLInputElement;
  const hint = root.querySelector("#picker-hint") as HTMLElement;
  const closeBtn = root.querySelector("#picker-close") as HTMLButtonElement;

  let st: {
    step: Step;
    edition_id: string;
    book: GenevaMetaBook | null;
    chapter: number;
    current: PickerSelection | null;
  } = { step: "books", edition_id: "", book: null, chapter: 0, current: null };

  function editions(): PickerEdition[] {
    return opts.getEditions();
  }

  function renderEditions() {
    editionsBox.replaceChildren();
    for (const e of editions()) {
      const b = el("button", "", e.short);
      b.type = "button";
      b.title = e.name;
      b.setAttribute("aria-pressed", String(e.id === st.edition_id));
      b.addEventListener("click", () => {
        st.edition_id = e.id;
        renderEditions();
      });
      editionsBox.append(b);
    }
  }

  function markSelected(btn: HTMLElement, on: boolean) {
    btn.classList.toggle("current", on);
    if (on) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  }

  function go(book_id: string, chapter: number, verse: number) {
    close();
    opts.onSelect({ book_id, start: { chapter, verse }, edition_id: st.edition_id });
  }

  function renderBooks() {
    booksBox.replaceChildren();
    hint.textContent = "";
    const meta = opts.getMeta();
    const books = canonBooks(meta);
    const q = filter.value.trim();
    if (!q) {
      const { ot, nt, apocrypha } = groupCanon(books);
      for (const [label, list] of [["Old Testament", ot], ["New Testament", nt], ["Apocrypha", apocrypha]] as const) {
        if (!list.length) continue;
        booksBox.append(el("h2", "picker-heading", label));
        const grid = el("div", "picker-grid books");
        for (const b of list) {
          const btn = el("button", "", b.book);
          btn.type = "button";
          markSelected(btn, (st.book?.book_id ?? st.current?.book_id) === b.book_id);
          btn.addEventListener("click", () => {
            if (st.book?.book_id !== b.book_id) st.chapter = 0;
            st.book = b;
            st.step = "chapters";
            render();
          });
          grid.append(btn);
        }
        booksBox.append(grid);
      }
      return;
    }
    const hits = matchQuery(books, q);
    if (!hits.length) {
      booksBox.append(el("p", "picker-empty", "No matching book."));
      return;
    }
    const list = el("div", "picker-suggest");
    list.setAttribute("role", "listbox");
    for (const h of hits) {
      const b = h.book;
      let ch = h.chapter ?? 0;
      let vs = h.verse ?? 0;
      if (ch && (ch < 1 || ch > b.chapters)) ch = 0;
      if (ch && vs) {
        const maxV = b.verse_counts[ch - 1] || 1;
        if (vs < 1 || vs > maxV) vs = 0;
      }
      const label = ch && vs ? `${b.book} ${ch}:${vs}` : ch ? `${b.book} ${ch}` : b.book;
      const btn = el("button", "", ch && vs ? `Go to ${label}` : b.book);
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.addEventListener("click", () => {
        if (ch && vs) go(b.book_id, ch, vs);
        else if (ch) {
          st.book = b;
          st.chapter = ch;
          st.step = "verses";
          filter.value = "";
          render();
        } else {
          st.book = b;
          st.chapter = 0;
          st.step = "chapters";
          filter.value = "";
          render();
        }
      });
      list.append(btn);
    }
    booksBox.append(list);
    if (hits.length === 1 && hits[0].chapter && hits[0].verse) {
      hint.textContent = `Enter: go to ${hits[0].book.book} ${hits[0].chapter}:${hits[0].verse}.`;
    }
  }

  function renderNumbers(count: number, _kind: "chapter" | "verse", isCurrent: (n: number) => boolean, onPick: (n: number) => void) {
    numbers.replaceChildren();
    for (let n = 1; n <= count; n++) {
      const b = el("button", "", String(n));
      b.type = "button";
      markSelected(b, isCurrent(n));
      b.addEventListener("click", () => onPick(n));
      numbers.append(b);
    }
  }

  function render() {
    renderEditions();
    stepBooks.hidden = st.step !== "books";
    numbers.hidden = st.step === "books";
    nav.hidden = st.step === "books";
    numbers.className = "picker-grid numbers";
    if (st.step === "books") {
      renderBooks();
      return;
    }
    if (!st.book) {
      st.step = "books";
      render();
      return;
    }
    if (st.step === "chapters") {
      backBtn.textContent = "‹ Books";
      crumb.textContent = st.book.book;
      const curCh =
        st.chapter ||
        (st.current?.book_id === st.book.book_id ? st.current.start.chapter : 0);
      renderNumbers(st.book.chapters, "chapter", (n) => n === curCh, (n) => {
        st.chapter = n;
        st.step = "verses";
        render();
      });
      return;
    }
    backBtn.textContent = "‹ Chapters";
    crumb.textContent = `${st.book.book} ${st.chapter}`;
    const maxV = st.book.verse_counts[st.chapter - 1] || 1;
    const curV =
      st.current?.book_id === st.book.book_id && st.current.start.chapter === st.chapter
        ? st.current.start.verse
        : 0;
    renderNumbers(maxV, "verse", (n) => n === curV, (n) => go(st.book!.book_id, st.chapter, n));
  }

  function open(current: PickerSelection) {
    st = {
      step: "books",
      edition_id: current.edition_id || editions()[0]?.id || "",
      book: null,
      chapter: 0,
      current,
    };
    filter.value = "";
    root.hidden = false;
    render();
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) filter.focus();
  }

  function close() {
    root.hidden = true;
  }

  filter.addEventListener("input", () => {
    if (st.step !== "books") {
      st.step = "books";
      st.book = null;
      st.chapter = 0;
    }
    renderBooks();
  });
  filter.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const hits = matchQuery(canonBooks(opts.getMeta()), filter.value);
    if (hits.length === 1 && hits[0].chapter && hits[0].verse) {
      e.preventDefault();
      go(hits[0].book.book_id, hits[0].chapter, hits[0].verse);
    }
  });
  backBtn.addEventListener("click", () => {
    st.step = st.step === "verses" ? "chapters" : "books";
    if (st.step === "books") st.book = null;
    render();
  });
  closeBtn.addEventListener("click", close);
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !root.hidden) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  return { open, close, isOpen: () => !root.hidden };
}
