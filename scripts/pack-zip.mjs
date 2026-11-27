#!/usr/bin/env node
// Pack dist/ (already containing data/) into bible_scroller-<version>.zip and a
// deterministic bible_scroller-<version>.tar.gz, both with top-level folder
// scroll-<version>/. Same files and bytes in both. The download names stay
// bible_scroller-<version>.*. Dependency-free zip via node:zlib. Refuses
// forbidden files. The .tar.gz uses a fixed mtime/uid/gid.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { offlineHtml } from "./offline-html.mjs";
import { writeTarGz } from "./pack-tar.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const FORBIDDEN = /(^|\/)(node_modules|\.git)(\/|$)|\.db$|(^|\/)\.env(\.|$)|\.pem$|\.key$/i;

/** Packed root folder, e.g. scroll-0.2.2/. */
export function topFolder(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`pack: bad version ${version}`);
  return `scroll-${version}/`;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isSymbolicLink()) throw new Error(`pack: symlink not allowed in dist: ${p}`);
    if (d.isDirectory()) return walk(p);
    if (d.isFile()) return [p];
    throw new Error(`pack: unexpected file type in dist: ${p}`);
  });
}

/** `(globalThis.__SCROLL_DATA__ ||= {})["geneva/meta.json"] = {...};` — key matches src/loader.ts DATA_REGISTRY. */
export function dataWrapper(key, json) {
  const body = JSON.stringify(JSON.parse(json)); // validates + minifies; JSON is a JS expression
  return Buffer.from(`(globalThis.__SCROLL_DATA__=globalThis.__SCROLL_DATA__||{})[${JSON.stringify(key)}]=${body};\n`, "utf8");
}

/** Packed members: `{ name, raw, mtime }`, name includes the scroll-<version>/ prefix. */
export function collectEntries(dist, version) {
  if (!existsSync(join(dist, "index.html")) || !existsSync(join(dist, "data/geneva/meta.json"))) {
    throw new Error("pack: dist/index.html or dist/data/geneva/meta.json missing; run npm run build first");
  }
  const top = topFolder(version);
  // Offline copies never phone home: drop the GA loader (offline-html.mjs strips its <script> tag).
  const files = walk(dist).filter((f) => relative(dist, f) !== "ga-ap.js").sort();
  const entries = [];
  for (const f of files) {
    const rel = relative(dist, f).split(sep).join("/");
    // data/**/*.json ships as a classic-script wrapper (data/x.json.js) so the unzipped copy works
    // from file:// in Chrome/Edge too (they block fetch() of local files). Only the wrapper is packed.
    const isData = /^data\/.+\.json$/.test(rel);
    const name = top + rel + (isData ? ".js" : "");
    if (FORBIDDEN.test(name)) throw new Error(`pack: forbidden file in dist: ${name}`);
    const raw = name === top + "index.html" ? Buffer.from(offlineHtml(readFileSync(f, "utf8"), version), "utf8")
      : isData ? dataWrapper(rel.slice("data/".length), readFileSync(f, "utf8"))
      : name === top + "README.txt" ? Buffer.from(
          readFileSync(f, "utf8").replace(/^Scroll \(bible_scroller\) \d+\.\d+\.\d+/, `Scroll (bible_scroller) ${version}`),
          "utf8",
        )
      : readFileSync(f);
    entries.push({ name, raw, mtime: statSync(f).mtime });
  }
  return entries;
}

export function writeZip(outPath, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

  for (const { name, raw, mtime } of entries) {
    const def = deflateRawSync(raw, { level: 9 });
    const useDeflate = def.length < raw.length;
    const data = useDeflate ? def : raw;
    const crc = crc32(raw) >>> 0;
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8); local.writeUInt16LE(dosTime(mtime), 10); local.writeUInt16LE(dosDate(mtime), 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(0x031e, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(useDeflate ? 8 : 0, 10); cen.writeUInt16LE(dosTime(mtime), 12); cen.writeUInt16LE(dosDate(mtime), 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE((0o100644 << 16) >>> 0, 38); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cdir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(outPath, Buffer.concat([...chunks, cdir, end]));
}

export function packDist(root = ROOT) {
  const dist = join(root, "dist");
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const entries = collectEntries(dist, version);
  const zipOut = join(root, `bible_scroller-${version}.zip`);
  const tarOut = join(root, `bible_scroller-${version}.tar.gz`);
  writeZip(zipOut, entries);
  writeTarGz(tarOut, entries);
  const dataSrc = existsSync(join(root, "data/geneva/meta.json")) ? "full data/" : "fixtures/john1 (run npm run build-data for full canon)";
  const mb = (p) => (statSync(p).size / 1048576).toFixed(1);
  console.log(`pack: ${relative(root, zipOut)} — ${entries.length} files, ${mb(zipOut)} MB, data from ${dataSrc}`);
  console.log(`pack: ${relative(root, tarOut)} — ${entries.length} files, ${mb(tarOut)} MB (deterministic tar.gz)`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  try {
    packDist();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
