// Protestant 66 + edition-specific Apocrypha.
// Lex gen.db uses OSIS-style abbreviations; kj16.db / kjv.db use full English book names.

export const BOOKS = [
  ["Gen", "genesis", "Genesis"], ["Exod", "exodus", "Exodus"], ["Lev", "leviticus", "Leviticus"],
  ["Num", "numbers", "Numbers"], ["Deut", "deuteronomy", "Deuteronomy"], ["Josh", "joshua", "Joshua"],
  ["Judg", "judges", "Judges"], ["Ruth", "ruth", "Ruth"], ["1Sam", "1samuel", "1 Samuel"],
  ["2Sam", "2samuel", "2 Samuel"], ["1Kgs", "1kings", "1 Kings"], ["2Kgs", "2kings", "2 Kings"],
  ["1Chr", "1chronicles", "1 Chronicles"], ["2Chr", "2chronicles", "2 Chronicles"], ["Ezra", "ezra", "Ezra"],
  ["Neh", "nehemiah", "Nehemiah"], ["Esth", "esther", "Esther"], ["Job", "job", "Job"],
  ["Ps", "psalms", "Psalms"], ["Prov", "proverbs", "Proverbs"], ["Eccl", "ecclesiastes", "Ecclesiastes"],
  ["Song", "song", "Song of Solomon"], ["Isa", "isaiah", "Isaiah"], ["Jer", "jeremiah", "Jeremiah"],
  ["Lam", "lamentations", "Lamentations"], ["Ezek", "ezekiel", "Ezekiel"], ["Dan", "daniel", "Daniel"],
  ["Hos", "hosea", "Hosea"], ["Joel", "joel", "Joel"], ["Amos", "amos", "Amos"],
  ["Obad", "obadiah", "Obadiah"], ["Jonah", "jonah", "Jonah"], ["Mic", "micah", "Micah"],
  ["Nah", "nahum", "Nahum"], ["Hab", "habakkuk", "Habakkuk"], ["Zeph", "zephaniah", "Zephaniah"],
  ["Hag", "haggai", "Haggai"], ["Zech", "zechariah", "Zechariah"], ["Mal", "malachi", "Malachi"],
  ["Matt", "matthew", "Matthew"], ["Mark", "mark", "Mark"], ["Luke", "luke", "Luke"],
  ["John", "john", "John"], ["Acts", "acts", "Acts"], ["Rom", "romans", "Romans"],
  ["1Cor", "1corinthians", "1 Corinthians"], ["2Cor", "2corinthians", "2 Corinthians"], ["Gal", "galatians", "Galatians"],
  ["Eph", "ephesians", "Ephesians"], ["Phil", "philippians", "Philippians"], ["Col", "colossians", "Colossians"],
  ["1Thess", "1thessalonians", "1 Thessalonians"], ["2Thess", "2thessalonians", "2 Thessalonians"], ["1Tim", "1timothy", "1 Timothy"],
  ["2Tim", "2timothy", "2 Timothy"], ["Titus", "titus", "Titus"], ["Phlm", "philemon", "Philemon"],
  ["Heb", "hebrews", "Hebrews"], ["Jas", "james", "James"], ["1Pet", "1peter", "1 Peter"],
  ["2Pet", "2peter", "2 Peter"], ["1John", "1john", "1 John"], ["2John", "2john", "2 John"],
  ["3John", "3john", "3 John"], ["Jude", "jude", "Jude"], ["Rev", "revelation", "Revelation"],
].map(([abbr, book_id, book], i) => ({ abbr, book_id, book, order: i + 1, dbName: book }));

/** Geneva 1599 Apocrypha present in Lex gen.db (7 books). */
export const APOCRYPHA_GENEVA = [
  ["Tob", "tobit", "Tobit"],
  ["Jdt", "judith", "Judith"],
  ["Wis", "wisdom", "Wisdom of Solomon"],
  ["Sir", "sirach", "Ecclesiasticus"],
  ["Bar", "baruch", "Baruch"],
  ["1Macc", "1maccabees", "1 Maccabees"],
  ["2Macc", "2maccabees", "2 Maccabees"],
].map(([abbr, book_id, book], i) => ({ abbr, book_id, book, order: 67 + i, dbName: abbr }));

/**
 * KJV 1611 (kj16) Apocrypha in Lex kj16.db — keys are full English names.
 * Includes the seven Geneva books plus Esdras, Letter of Jeremiah, Azariah, Susanna, Bel, Manasseh.
 */
export const APOCRYPHA_KJ16 = [
  ["1 Esdras", "1esdras", "1 Esdras"],
  ["2 Esdras", "2esdras", "2 Esdras"],
  ["Tobit", "tobit", "Tobit"],
  ["Judith", "judith", "Judith"],
  ["Wisdom of Solomon", "wisdom", "Wisdom of Solomon"],
  ["Ecclesiasticus", "sirach", "Ecclesiasticus"],
  ["Baruch", "baruch", "Baruch"],
  ["Letter of Jeremiah", "letterofjeremiah", "Letter of Jeremiah"],
  ["Prayer of Azariah", "prayerofazariah", "Prayer of Azariah"],
  ["Susanna", "susanna", "Susanna"],
  ["Bel and the Dragon", "belandthedragon", "Bel and the Dragon"],
  ["Prayer of Manasseh", "prayerofmanasseh", "Prayer of Manasseh"],
  ["1 Maccabees", "1maccabees", "1 Maccabees"],
  ["2 Maccabees", "2maccabees", "2 Maccabees"],
].map(([dbName, book_id, book], i) => ({ abbr: dbName, book_id, book, order: 67 + i, dbName }));

/** Editions the scroller ships. KJV stays Protestant 66 (no Apocrypha in Lex kjv.db). */
export const EDITIONS = [
  {
    id: "geneva1599",
    dir: "geneva",
    name: "Geneva Bible (1599)",
    short: "Geneva",
    dbEnv: "BIBLE_SCROLLER_GENEVA_DB",
    dbRel: "bible_versions/gen.db",
    keyStyle: "abbr", // gen.db: gen:Tob:1:1
    books: [
      ...BOOKS.map((b) => ({ ...b, dbName: b.abbr })),
      ...APOCRYPHA_GENEVA,
    ],
  },
  {
    id: "kj16",
    dir: "kj16",
    name: "King James Version (1611 Original)",
    short: "KJV 1611",
    dbEnv: "BIBLE_SCROLLER_KJ16_DB",
    dbRel: "bible_versions/kj16.db",
    keyStyle: "name", // kj16:Tobit:1:1
    books: [
      ...BOOKS.map((b) => ({ ...b, abbr: b.dbName, dbName: b.dbName })),
      ...APOCRYPHA_KJ16,
    ],
  },
  {
    id: "kjv",
    dir: "kjv",
    name: "King James Version (Oxford 1769)",
    short: "KJV",
    dbEnv: "BIBLE_SCROLLER_KJV_DB",
    dbRel: "bible_versions/kjv.db",
    keyStyle: "name",
    books: BOOKS.map((b) => ({ ...b, abbr: b.dbName, dbName: b.dbName })),
  },
];
