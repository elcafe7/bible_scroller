// Deterministic .tar.gz writer (ustar + gzip). Dependency-free.
// Fixed mtime 0, uid/gid 0, empty uname/gname, sorted file members only
// (no directories, no symlinks). Gzip header mtime and OS are normalized
// so the bytes do not depend on the clock or the host.
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const BLOCK = 512;
export const TAR_MTIME = 0;

function fail(msg) {
  throw new Error(`pack-tar: ${msg}`);
}

function octalField(value, width) {
  const s = Number(value).toString(8);
  if (s.length > width - 1) fail(`octal ${value} does not fit in ${width} bytes`);
  // POSIX: width-1 octal digits, then NUL.
  return Buffer.from(s.padStart(width - 1, "0") + "\0", "ascii");
}

export function assertSafeName(name) {
  if (!name || name.endsWith("/")) fail(`refusing directory member ${name}`);
  if (name.startsWith("/") || name.startsWith("\\") || name.includes("\\")) fail(`absolute or backslash path ${name}`);
  if (name.split("/").some((p) => p === "" || p === "." || p === "..")) fail(`unsafe path ${name}`);
  if (Buffer.byteLength(name, "utf8") > 100) fail(`name longer than 100 bytes (ustar limit): ${name}`);
}

function tarHeader(name, size, mtime = TAR_MTIME, mode = 0o644) {
  assertSafeName(name);
  const buf = Buffer.alloc(BLOCK);
  buf.write(name, 0, 100, "utf8");
  octalField(mode, 8).copy(buf, 100);
  octalField(0, 8).copy(buf, 108); // uid
  octalField(0, 8).copy(buf, 116); // gid
  octalField(size, 12).copy(buf, 124);
  octalField(mtime, 12).copy(buf, 136);
  buf.fill(0x20, 148, 156); // checksum field is spaces while summing
  buf.write("0", 156, 1, "ascii"); // regular file
  buf.write("ustar\0", 257, 6, "ascii");
  buf.write("00", 263, 2, "ascii");
  let sum = 0;
  for (const b of buf) sum += b;
  buf.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return buf;
}

/** Uncompressed ustar archive of `entries` (`{ name, raw }`). */
export function tarBytes(entries, mtime = TAR_MTIME) {
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const parts = [];
  for (const { name, raw } of sorted) {
    const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    parts.push(tarHeader(name, data.length, mtime), data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

/** Force a deterministic gzip header (mtime 0, no filename, OS Unix). */
export function gzipDeterministic(raw) {
  const gz = gzipSync(raw, { level: 9 });
  if (gz[0] !== 0x1f || gz[1] !== 0x8b) fail("gzip magic missing");
  if (gz[3] !== 0) fail(`gzip flags must be 0 (got ${gz[3]}); header is not a fixed size`);
  gz[3] = 0; // flags
  gz.writeUInt32LE(0, 4); // mtime
  gz[8] = 2; // max compression
  gz[9] = 3; // OS: Unix
  return gz;
}

export function writeTarGz(outPath, entries, mtime = TAR_MTIME) {
  const gz = gzipDeterministic(tarBytes(entries, mtime));
  writeFileSync(outPath, gz);
  return gz.length;
}
