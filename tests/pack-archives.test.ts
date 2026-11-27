import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-ignore plain .mjs build script, no types
import { assertSafeName, gzipDeterministic, tarBytes, writeTarGz } from "../scripts/pack-tar.mjs";
// @ts-ignore plain .mjs build script, no types
import { topFolder, writeZip } from "../scripts/pack-zip.mjs";

function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

const entries = [
  { name: "scroll-0.2.2/README.txt", raw: Buffer.from("hello from readme\n") },
  { name: "scroll-0.2.2/index.html", raw: Buffer.from("<!doctype html><title>Scroll 0.2.2</title>\n") },
  { name: "scroll-0.2.2/data/geneva/meta.json.js", raw: Buffer.from("globalThis.x=1;\n") },
].map((e) => ({ ...e, mtime: new Date("2020-01-02T03:04:05Z") }));

describe("deterministic tar.gz", () => {
  it("is byte-identical across two writes", () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-tar-"));
    const a = join(dir, "a.tar.gz");
    const b = join(dir, "b.tar.gz");
    try {
      writeTarGz(a, entries);
      writeTarGz(b, entries);
      const aa = readFileSync(a);
      const bb = readFileSync(b);
      expect(sha256(aa)).toBe(sha256(bb));
      expect(aa.equals(bb)).toBe(true);
      // gzip header: mtime 0, OS Unix, no filename flag
      expect(aa[3]).toBe(0);
      expect(aa.readUInt32LE(4)).toBe(0);
      expect(aa[9]).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses absolute, parent, and directory names", () => {
    expect(() => assertSafeName("/tmp/x")).toThrow();
    expect(() => assertSafeName("scroll-0.2.2/../secret")).toThrow();
    expect(() => assertSafeName("scroll-0.2.2/")).toThrow();
  });

  it("gzipDeterministic strips host-dependent header fields", () => {
    const once = gzipDeterministic(Buffer.from("abc"));
    const twice = gzipDeterministic(Buffer.from("abc"));
    expect(once.equals(twice)).toBe(true);
  });
});

describe("zip and tar.gz hold the same files", () => {
  it("extracts to identical relative paths and bytes", () => {
    const dir = mkdtempSync(join(tmpdir(), "scroll-pack-"));
    const zipPath = join(dir, "app.zip");
    const tarPath = join(dir, "app.tar.gz");
    const zipDir = join(dir, "from-zip");
    const tarDir = join(dir, "from-tar");
    try {
      writeZip(zipPath, entries);
      writeTarGz(tarPath, entries);
      mkdirSync(zipDir);
      mkdirSync(tarDir);
      execFileSync("python3", ["-c", `
import tarfile, zipfile
from pathlib import Path
z, t, zd, td = ${JSON.stringify([zipPath, tarPath, zipDir, tarDir])}
with zipfile.ZipFile(z) as zf:
    for i in zf.infolist():
        assert not i.is_dir()
        assert not i.filename.startswith("/")
        assert ".." not in i.filename.split("/")
        assert ((i.external_attr >> 16) & 0o170000) != 0o120000
    zf.extractall(zd)
with tarfile.open(t, "r:gz") as tf:
    for m in tf.getmembers():
        assert m.isfile()
        assert not m.issym() and not m.islnk()
        assert m.uid == 0 and m.gid == 0
        assert not m.name.startswith("/")
        assert ".." not in m.name.split("/")
    tf.extractall(td, filter="data")
def files(root):
    r = Path(root)
    return {p.relative_to(r).as_posix(): p.read_bytes() for p in r.rglob("*") if p.is_file()}
zf, tf = files(zd), files(td)
assert zf == tf, (sorted(zf), sorted(tf))
assert set(zf) == {"scroll-0.2.2/README.txt", "scroll-0.2.2/index.html", "scroll-0.2.2/data/geneva/meta.json.js"}
print("ok", len(zf))
`])
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tarBytes lists members in sorted order", () => {
    const raw = tarBytes([
      { name: "scroll-0.2.2/z.txt", raw: Buffer.from("z") },
      { name: "scroll-0.2.2/a.txt", raw: Buffer.from("a") },
    ]);
    const a = raw.indexOf(Buffer.from("scroll-0.2.2/a.txt"));
    const z = raw.indexOf(Buffer.from("scroll-0.2.2/z.txt"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(z).toBeGreaterThan(a);
  });
});

describe("topFolder", () => {
  it("is scroll-<version>/", () => {
    expect(topFolder("0.2.2")).toBe("scroll-0.2.2/");
    expect(() => topFolder("offline-20261125-1")).toThrow();
  });
});
