import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { DATA_DIR } from "./constants";
import type { Source } from "./sources";

export interface SearchOptions {
  regex: boolean;
  caseSensitive: boolean;
  /** Maximum number of files in the results */
  limit: number;
  /** Maximum number of lines shown per file */
  linesPerFile: number;
}

export interface FileMatch {
  /** Absolute on-disk path of the matched file — read it directly with an editor/grep tool. */
  path: string;
  /** Every query term matched the file name */
  nameMatch: boolean;
  /** Total matching lines (may exceed the number of lines shown) */
  totalHits: number;
  lines: { line: number; text: string }[];
}

/** Recursively yields files with the given extensions, skipping .git. */
export function* walkFiles(dir: string, extensions: string[]): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith(".")) continue; // .git, .github, .ci
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, extensions);
    } else if (extensions.includes(extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

/** Comparison form for native names: GetPlayerPed ≡ GET_PLAYER_PED ≡ getplayerped */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[_\s-]/g, "");
}

/**
 * Splits a literal query into AND terms: whitespace-separated words, each
 * further split on camelCase boundaries, so "SafePed" ≡ "safe ped".
 */
export function splitTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .flatMap((word) => word.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .filter(Boolean);
}

/**
 * Picks which matching lines to display. Markdown headings win over body lines:
 * in natives files the `## NATIVE_NAME` heading beats hundreds of enum entries,
 * and section headings locate the hit better than prose does.
 */
function pickLines(lines: FileMatch["lines"], max: number): FileMatch["lines"] {
  if (lines.length <= max) return lines;
  const isHeading = (text: string) => /^#{1,6}\s/.test(text);
  const headings = lines.filter((l) => isHeading(l.text));
  const body = lines.filter((l) => !isHeading(l.text));
  return [...headings, ...body].slice(0, max).sort((a, b) => a.line - b.line);
}

interface TermMatcher {
  matchesLine(line: string): boolean;
  matchesName(base: string): boolean;
}

function buildMatchers(query: string, opts: SearchOptions): TermMatcher[] {
  if (opts.regex) {
    const re = new RegExp(query, opts.caseSensitive ? "" : "i");
    return [{ matchesLine: (line) => re.test(line), matchesName: (base) => re.test(base) }];
  }
  return splitTerms(query).map((term): TermMatcher => {
    const needle = opts.caseSensitive ? term : term.toLowerCase();
    const normNeedle = normalizeName(term);
    return {
      matchesLine: (line) => (opts.caseSensitive ? line : line.toLowerCase()).includes(needle),
      matchesName: (base) =>
        (opts.caseSensitive ? base : base.toLowerCase()).includes(needle) ||
        (normNeedle.length > 0 && normalizeName(base).includes(normNeedle)),
    };
  });
}

export function searchSources(sources: Source[], query: string, opts: SearchOptions): FileMatch[] {
  const matchers = buildMatchers(query, opts);
  const queryNorm = normalizeName(query);
  const ranked: (FileMatch & { rank: number })[] = [];

  for (const src of sources) {
    const dir = join(DATA_DIR, src.name);
    for (const file of walkFiles(dir, src.extensions)) {
      const base = basename(file, extname(file));
      const nameHits = matchers.map((m) => m.matchesName(base));
      const termSeen = [...nameHits];
      const lines: FileMatch["lines"] = [];
      let totalHits = 0;

      const content = readFileSync(file, "utf8").split("\n");
      let lineNo = 0;
      for (const lineText of content) {
        lineNo++;
        let lineMatched = false;
        matchers.forEach((matcher, t) => {
          if (matcher.matchesLine(lineText)) {
            termSeen[t] = true;
            lineMatched = true;
          }
        });
        if (lineMatched) {
          totalHits++;
          lines.push({ line: lineNo, text: lineText.trim().slice(0, 200) });
        }
      }

      // AND: every term must hit somewhere — the file name or some line.
      if (!termSeen.every(Boolean)) continue;

      const nameMatch = nameHits.every(Boolean);
      const rank = normalizeName(base) === queryNorm ? 0 : nameMatch ? 1 : 2;
      ranked.push({
        path: file,
        nameMatch,
        totalHits,
        lines: pickLines(lines, opts.linesPerFile),
        rank,
      });
    }
  }

  // Exact file name > partial file name > content-only; more hits rank higher within a tier.
  ranked.sort((a, b) => a.rank - b.rank || b.totalHits - a.totalHits || a.path.localeCompare(b.path));
  return ranked.slice(0, opts.limit).map(({ rank: _rank, ...match }) => match);
}
