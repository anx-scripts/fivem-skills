import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { findSource, SOURCES } from "./sources";
import { isPulled, sourceDir } from "./pull";
import { displayPath, normalizeName, walkFiles } from "./search";

export type ShowResult =
  | { kind: "file"; path: string; content: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "not-found" };

/**
 * Resolves a `show` argument to a doc file.
 * With a slash it is a path as printed by search ("natives/PED/x.md" — the repo
 * subpath is re-inserted, the extension is optional). Without a slash it is an
 * exact file name, normalized like native names (SetPedConfigFlag ≡ SET_PED_CONFIG_FLAG).
 */
export function resolveShow(arg: string): ShowResult {
  const clean = arg.replaceAll("\\", "/").replace(/^\.?\//, "");

  if (clean.includes("/")) {
    const [srcName = "", ...restParts] = clean.split("/");
    const src = findSource(srcName);
    if (!src) return { kind: "not-found" };
    const rest = restParts.join("/");
    const bases = [
      join(sourceDir(src), ...(src.subpath ? [src.subpath] : []), rest),
      join(sourceDir(src), rest),
    ];
    for (const base of bases) {
      for (const file of [base, ...src.extensions.map((ext) => base + ext)]) {
        if (existsSync(file) && statSync(file).isFile()) {
          return { kind: "file", path: displayPath(src, file), content: readFileSync(file, "utf8") };
        }
      }
    }
    return { kind: "not-found" };
  }

  const target = normalizeName(clean);
  const hits: { path: string; file: string }[] = [];
  for (const src of SOURCES) {
    if (!isPulled(src)) continue;
    for (const file of walkFiles(sourceDir(src), src.extensions)) {
      if (normalizeName(basename(file, extname(file))) === target) {
        hits.push({ path: displayPath(src, file), file });
      }
    }
  }
  const first = hits[0];
  if (!first) return { kind: "not-found" };
  if (hits.length > 1) return { kind: "ambiguous", candidates: hits.map((h) => h.path) };
  return { kind: "file", path: first.path, content: readFileSync(first.file, "utf8") };
}
