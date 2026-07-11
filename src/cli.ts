#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DATA_DIR, VERSION } from "./constants";
import { findSource, SOURCES } from "./sources";
import { countFiles, isPulled, lastCommitDate, pullSource } from "./pull";
import { searchSources, splitTerms } from "./search";
import { bold, cyan, dim, green, red, yellow } from "./term";

const sourceLines = SOURCES.map(
  (s) => `  ${s.name.padEnd(9)}${s.description.padEnd(52)}${s.repo}`,
).join("\n");

const HELP = `fivem-skills v${VERSION} — local FiveM documentation mirrors with offline search

Usage:
  fivem-skills pull [source...]        Download or update sources (default: all)
  fivem-skills search <query> [opts]   Search the downloaded docs
  fivem-skills list                    Show sources and their status

Sources:
${sourceLines}

Search options:
  -s, --source <name>    Limit to one source: ${SOURCES.map((s) => s.name).join(" | ")}
  -e, --regex            Treat the whole query as a regular expression
  -c, --case-sensitive   Match case exactly
  -l, --limit <n>        Max files in results (default 20)

Matching rules:
  - multiple words = AND: every word must appear in the file (name or content)
  - words are also split on camelCase boundaries: SafePed ≡ safe ped
  - native names are normalized: GET_PLAYER_PED finds GetPlayerPed.md
  - ranking: exact file name > partial file name > content-only matches

Reading files:
  search prints each match's absolute path — read it directly with whatever tools you
  have. Native files are tiny (read whole); the docs game-references are huge lookup
  tables (e.g. vehicle-models) — search the path or read a line range for the row you
  need, never the whole file.

Data root: ${DATA_DIR}`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function cmdPull(args: string[]): void {
  const targets = args.length === 0 ? SOURCES : args.map((name) => findSource(name) ?? fail(`Unknown source: ${name}. Available: ${SOURCES.map((s) => s.name).join(", ")}`));

  for (const src of targets) {
    const wasPulled = isPulled(src);
    console.log(`${wasPulled ? "Updating" : "Cloning"} ${bold(src.name)} ${dim(`(${src.repo}${src.subpath ? `/${src.subpath}` : ""})`)}`);
    const { updated, rev } = pullSource(src);
    const status = !wasPulled
      ? green(`cloned @ ${rev}`)
      : updated
        ? green(`updated @ ${rev}`)
        : dim(`already up to date @ ${rev}`);
    console.log(`  ${status}${dim(`, ${countFiles(src)} files`)}`);
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex matching every query term, used to highlight hits in printed lines. */
function buildHighlightRegex(query: string, regexMode: boolean, caseSensitive: boolean): RegExp | null {
  const flags = caseSensitive ? "g" : "gi";
  if (regexMode) {
    try {
      return new RegExp(query, flags);
    } catch {
      return null;
    }
  }
  const terms = splitTerms(query).map(escapeRegExp);
  return terms.length > 0 ? new RegExp(terms.join("|"), flags) : null;
}

function cmdSearch(args: string[]): void {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      source: { type: "string", short: "s" },
      regex: { type: "boolean", short: "e", default: false },
      "case-sensitive": { type: "boolean", short: "c", default: false },
      limit: { type: "string", short: "l", default: "20" },
    },
  });

  const query = positionals.join(" ").trim();
  if (!query) fail("Provide a search query, e.g.: fivem-skills search GetPlayerPed");

  let sources = SOURCES;
  if (values.source) {
    const src = findSource(values.source);
    if (!src) fail(`Unknown source: ${values.source}. Available: ${SOURCES.map((s) => s.name).join(", ")}`);
    sources = [src];
  }

  const notPulled = sources.filter((s) => !isPulled(s));
  if (notPulled.length === sources.length) {
    fail("No data downloaded yet. Run: fivem-skills pull");
  }
  for (const s of notPulled) {
    console.error(red(`Warning: source "${s.name}" is not pulled (fivem-skills pull ${s.name}) — skipping.`));
  }

  const limit = Number.parseInt(values.limit, 10);
  if (Number.isNaN(limit) || limit < 1) fail(`Invalid limit: ${values.limit}`);

  const results = searchSources(sources.filter(isPulled), query, {
    regex: values.regex,
    caseSensitive: values["case-sensitive"],
    limit,
    linesPerFile: 5,
  });

  if (results.length === 0) {
    console.log(`No results for "${query}". Try fewer or shorter words, or -e for regex.`);
    return;
  }

  const highlightRe = buildHighlightRegex(query, values.regex, values["case-sensitive"]);
  for (const match of results) {
    const label = match.nameMatch ? `  ${green("(file name match)")}` : "";
    console.log(`${cyan(bold(match.path))}${label}`);

    const numWidth = Math.max(...match.lines.map((l) => String(l.line).length), 1);
    for (const { line, text } of match.lines) {
      const shown = highlightRe ? text.replace(highlightRe, (m) => yellow(bold(m))) : text;
      console.log(`  ${dim(String(line).padStart(numWidth))} ${dim("|")} ${shown}`);
    }
    if (match.totalHits > match.lines.length) {
      console.log(`  ${dim(`+ ${match.totalHits - match.lines.length} more matching lines`)}`);
    }
    console.log();
  }

  const limitNote = results.length === limit ? ` — limit reached, narrow the query or raise -l` : "";
  console.log(dim(`${results.length} file(s) matched${limitNote} · read a path above directly (grep huge files)`));
}

function cmdList(): void {
  console.log(dim(`Data root: ${DATA_DIR}`));
  console.log();

  const nameWidth = Math.max(...SOURCES.map((s) => s.name.length)) + 2;
  const statusWidth = 24;
  for (const src of SOURCES) {
    const status = isPulled(src)
      ? `${String(countFiles(src)).padStart(5)} files   ${lastCommitDate(src)}`
      : red("not pulled".padEnd(statusWidth));
    const repoPath = `${src.repo}${src.subpath ? `/${src.subpath}` : ""}`;
    console.log(`${bold(src.name.padEnd(nameWidth))}${status.padEnd(statusWidth)}   ${dim(repoPath)}`);
  }
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "pull":
      return cmdPull(rest);
    case "search":
      return cmdSearch(rest);
    case "list":
      return cmdList();
    case "--version":
    case "-v":
      return void console.log(VERSION);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      return void console.log(HELP);
    default:
      fail(`Unknown command: ${command}\n\n${HELP}`);
  }
}

try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
