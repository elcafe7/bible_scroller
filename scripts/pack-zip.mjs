#!/usr/bin/env node
// Zip dist/ (already containing data/) into bible_scroller-<version>.zip with top-level folder bible_scroller/.
// Dependency-free: stored/deflated entries via node:zlib. Refuses forbidden files.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const { version } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const OUT = join(ROOT, `bible_scroller-${version}.zip`);
const TOP = "bible_scroller/";
const FORBIDDEN = /(^|\/)(node_modules|\.git)(\/|$)|\.db$|(^|\/)\.env(\.|$)|\.pem$|\.key$/i;

if (!existsSync(join(DIST, "index.html")) || !existsSync(join(DIST, "data/geneva/meta.json"))) {
  console.error("pack: dist/index.html or dist/data/geneva/meta.json missing; run npm run build first");
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST).sort();
const chunks = [];
const central = [];
let offset = 0;
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

for (const f of files) {
  const name = TOP + relative(DIST, f).split(sep).join("/");
  if (FORBIDDEN.test(name)) { console.error(`pack: forbidden file in dist: ${name}`); process.exit(1); }
  const raw = readFileSync(f);
  const def = deflateRawSync(raw, { level: 9 });
  const useDeflate = def.length < raw.length;
  const data = useDeflate ? def : raw;
  const crc = crc32(raw) >>> 0;
  const mtime = statSync(f).mtime;
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
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdir.length, 12); end.writeUInt32LE(offset, 16);
writeFileSync(OUT, Buffer.concat([...chunks, cdir, end]));
const dataSrc = existsSync(join(ROOT, "data/geneva/meta.json")) ? "full data/" : "fixtures/john1 (run npm run build-data for full canon)";
console.log(`pack: ${relative(ROOT, OUT)} — ${files.length} files, ${(statSync(OUT).size / 1048576).toFixed(1)} MB, data from ${dataSrc}`);
