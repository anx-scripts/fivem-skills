#!/usr/bin/env node

// src/cli.ts
var import_node_util = require("node:util");

// src/constants.ts
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var VERSION = "0.6.0";
var ROOT_DIR = import_node_path.join(import_node_os.homedir(), ".fivem-skills");
var DATA_DIR = import_node_path.join(ROOT_DIR, "data");

// src/sources.ts
var SOURCES = [
  {
    name: "docs",
    repo: "citizenfx/fivem-docs",
    subpath: "content/docs",
    extensions: [".md"],
    description: "Official FiveM documentation"
  },
  {
    name: "natives",
    repo: "citizenfx/natives",
    extensions: [".md"],
    description: "FiveM / GTA V / RDR3 native functions"
  },
  {
    name: "ox",
    repo: "overextended/overextended.github.io",
    subpath: "content/docs",
    extensions: [".mdx", ".md"],
    description: "Overextended docs (ox_lib, ox_inventory, ...)"
  }
];
function findSource(name) {
  return SOURCES.find((s) => s.name === name);
}

// src/pull.ts
var import_node_child_process = require("node:child_process");
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");

// src/search.ts
var import_node_fs = require("node:fs");
var import_node_path2 = require("node:path");
function* walkFiles(dir, extensions) {
  let entries;
  try {
    entries = import_node_fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("."))
      continue;
    const full = import_node_path2.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, extensions);
    } else if (extensions.includes(import_node_path2.extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}
function normalizeName(s) {
  return s.toLowerCase().replace(/[_\s-]/g, "");
}
function splitTerms(query) {
  return query.split(/\s+/).flatMap((word) => word.split(/(?<=[a-z0-9])(?=[A-Z])/)).filter(Boolean);
}
function pickLines(lines, max) {
  if (lines.length <= max)
    return lines;
  const isHeading = (text) => /^#{1,6}\s/.test(text);
  const headings = lines.filter((l) => isHeading(l.text));
  const body = lines.filter((l) => !isHeading(l.text));
  return [...headings, ...body].slice(0, max).sort((a, b) => a.line - b.line);
}
function buildMatchers(query, opts) {
  if (opts.regex) {
    const re = new RegExp(query, opts.caseSensitive ? "" : "i");
    return [{ matchesLine: (line) => re.test(line), matchesName: (base) => re.test(base) }];
  }
  return splitTerms(query).map((term) => {
    const needle = opts.caseSensitive ? term : term.toLowerCase();
    const normNeedle = normalizeName(term);
    return {
      matchesLine: (line) => (opts.caseSensitive ? line : line.toLowerCase()).includes(needle),
      matchesName: (base) => (opts.caseSensitive ? base : base.toLowerCase()).includes(needle) || normNeedle.length > 0 && normalizeName(base).includes(normNeedle)
    };
  });
}
function searchSources(sources, query, opts) {
  const matchers = buildMatchers(query, opts);
  const queryNorm = normalizeName(query);
  const ranked = [];
  for (const src of sources) {
    const dir = import_node_path2.join(DATA_DIR, src.name);
    for (const file of walkFiles(dir, src.extensions)) {
      const base = import_node_path2.basename(file, import_node_path2.extname(file));
      const nameHits = matchers.map((m) => m.matchesName(base));
      const termSeen = [...nameHits];
      const lines = [];
      let totalHits = 0;
      const content = import_node_fs.readFileSync(file, "utf8").split(`
`);
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
      if (!termSeen.every(Boolean))
        continue;
      const nameMatch = nameHits.every(Boolean);
      const rank = normalizeName(base) === queryNorm ? 0 : nameMatch ? 1 : 2;
      ranked.push({
        path: file,
        nameMatch,
        totalHits,
        lines: pickLines(lines, opts.linesPerFile),
        rank
      });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || b.totalHits - a.totalHits || a.path.localeCompare(b.path));
  return ranked.slice(0, opts.limit).map(({ rank: _rank, ...match }) => match);
}

// src/pull.ts
function git(args, cwd) {
  const res = import_node_child_process.spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.error)
    throw new Error(`Failed to run git: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:
${res.stderr.trim()}`);
  }
  return res.stdout;
}
function sourceDir(src) {
  return import_node_path3.join(DATA_DIR, src.name);
}
function isPulled(src) {
  return import_node_fs2.existsSync(import_node_path3.join(sourceDir(src), ".git"));
}
function pullSource(src) {
  const dir = sourceDir(src);
  const url = `https://github.com/${src.repo}.git`;
  if (isPulled(src)) {
    const before = git(["rev-parse", "HEAD"], dir).trim();
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], dir).trim();
    git(["fetch", "--depth", "1", "origin", branch], dir);
    git(["reset", "--hard", "FETCH_HEAD"], dir);
    const after = git(["rev-parse", "HEAD"], dir).trim();
    return { updated: before !== after, rev: after.slice(0, 7) };
  }
  import_node_fs2.mkdirSync(DATA_DIR, { recursive: true });
  if (src.subpath) {
    git(["clone", "--depth", "1", "--filter=blob:none", "--sparse", url, dir]);
    git(["sparse-checkout", "set", src.subpath], dir);
  } else {
    git(["clone", "--depth", "1", url, dir]);
  }
  const rev = git(["rev-parse", "HEAD"], dir).trim();
  return { updated: true, rev: rev.slice(0, 7) };
}
function countFiles(src) {
  let n = 0;
  for (const _ of walkFiles(sourceDir(src), src.extensions))
    n++;
  return n;
}
function lastCommitDate(src) {
  try {
    return git(["log", "-1", "--format=%cs"], sourceDir(src)).trim();
  } catch {
    return "?";
  }
}

// src/term.ts
var enabled = !process.env.NO_COLOR && (process.stdout.isTTY === true || process.env.FORCE_COLOR !== undefined);
function style(open, close) {
  return (s) => enabled ? `\x1B[${open}m${s}\x1B[${close}m` : s;
}
var bold = style(1, 22);
var dim = style(2, 22);
var cyan = style(36, 39);
var yellow = style(33, 39);
var green = style(32, 39);
var red = style(31, 39);

// src/cli.ts
var sourceLines = SOURCES.map((s) => `  ${s.name.padEnd(9)}${s.description.padEnd(52)}${s.repo}`).join(`
`);
var HELP = `fivem-skills v${VERSION} — local FiveM documentation mirrors with offline search

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
function fail(message) {
  console.error(message);
  process.exit(1);
}
function cmdPull(args) {
  const targets = args.length === 0 ? SOURCES : args.map((name) => findSource(name) ?? fail(`Unknown source: ${name}. Available: ${SOURCES.map((s) => s.name).join(", ")}`));
  for (const src of targets) {
    const wasPulled = isPulled(src);
    console.log(`${wasPulled ? "Updating" : "Cloning"} ${bold(src.name)} ${dim(`(${src.repo}${src.subpath ? `/${src.subpath}` : ""})`)}`);
    const { updated, rev } = pullSource(src);
    const status = !wasPulled ? green(`cloned @ ${rev}`) : updated ? green(`updated @ ${rev}`) : dim(`already up to date @ ${rev}`);
    console.log(`  ${status}${dim(`, ${countFiles(src)} files`)}`);
  }
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildHighlightRegex(query, regexMode, caseSensitive) {
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
function cmdSearch(args) {
  const { values, positionals } = import_node_util.parseArgs({
    args,
    allowPositionals: true,
    options: {
      source: { type: "string", short: "s" },
      regex: { type: "boolean", short: "e", default: false },
      "case-sensitive": { type: "boolean", short: "c", default: false },
      limit: { type: "string", short: "l", default: "20" }
    }
  });
  const query = positionals.join(" ").trim();
  if (!query)
    fail("Provide a search query, e.g.: fivem-skills search GetPlayerPed");
  let sources = SOURCES;
  if (values.source) {
    const src = findSource(values.source);
    if (!src)
      fail(`Unknown source: ${values.source}. Available: ${SOURCES.map((s) => s.name).join(", ")}`);
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
  if (Number.isNaN(limit) || limit < 1)
    fail(`Invalid limit: ${values.limit}`);
  const results = searchSources(sources.filter(isPulled), query, {
    regex: values.regex,
    caseSensitive: values["case-sensitive"],
    limit,
    linesPerFile: 5
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
function cmdList() {
  console.log(dim(`Data root: ${DATA_DIR}`));
  console.log();
  const nameWidth = Math.max(...SOURCES.map((s) => s.name.length)) + 2;
  const statusWidth = 24;
  for (const src of SOURCES) {
    const status = isPulled(src) ? `${String(countFiles(src)).padStart(5)} files   ${lastCommitDate(src)}` : red("not pulled".padEnd(statusWidth));
    const repoPath = `${src.repo}${src.subpath ? `/${src.subpath}` : ""}`;
    console.log(`${bold(src.name.padEnd(nameWidth))}${status.padEnd(statusWidth)}   ${dim(repoPath)}`);
  }
}
function main() {
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
      fail(`Unknown command: ${command}

${HELP}`);
  }
}
try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
