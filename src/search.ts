import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { DATA_DIR } from "./constants";
import type { Source } from "./sources";

export interface SearchOptions {
  regex: boolean;
  caseSensitive: boolean;
  /** Maksymalna liczba plików w wynikach */
  limit: number;
  /** Maksymalna liczba pokazanych linii na plik */
  linesPerFile: number;
}

export interface FileMatch {
  /** Ścieżka względem DATA_DIR, np. "natives/PLAYER/GetPlayerPed.md" */
  path: string;
  nameMatch: boolean;
  lines: { line: number; text: string }[];
}

/** Rekurencyjnie wylicza pliki o podanych rozszerzeniach, pomijając .git. */
export function* walkFiles(dir: string, extensions: string[]): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, extensions);
    } else if (extensions.includes(extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

function buildMatcher(query: string, opts: SearchOptions): (text: string) => boolean {
  if (opts.regex) {
    const re = new RegExp(query, opts.caseSensitive ? "" : "i");
    return (text) => re.test(text);
  }
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  return (text) => (opts.caseSensitive ? text : text.toLowerCase()).includes(needle);
}

export function searchSources(sources: Source[], query: string, opts: SearchOptions): FileMatch[] {
  const matches = buildMatcher(query, opts);
  const nameHits: FileMatch[] = [];
  const contentHits: FileMatch[] = [];

  for (const src of sources) {
    const dir = join(DATA_DIR, src.name);
    for (const file of walkFiles(dir, src.extensions)) {
      const relPath = relative(DATA_DIR, file).replaceAll("\\", "/");
      const nameMatch = matches(basename(file, extname(file)));

      const lines: FileMatch["lines"] = [];
      const content = readFileSync(file, "utf8");
      let lineNo = 0;
      for (const line of content.split("\n")) {
        lineNo++;
        if (lines.length >= opts.linesPerFile) break;
        if (matches(line)) {
          lines.push({ line: lineNo, text: line.trim().slice(0, 200) });
        }
      }

      if (nameMatch) nameHits.push({ path: relPath, nameMatch, lines });
      else if (lines.length > 0) contentHits.push({ path: relPath, nameMatch, lines });
    }
  }

  // Trafienia w nazwę pliku są zwykle najcelniejsze — idą pierwsze.
  return [...nameHits, ...contentHits].slice(0, opts.limit);
}
