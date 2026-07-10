#!/usr/bin/env node

// src/cli.ts
var import_node_util = require("node:util");

// src/constants.ts
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var VERSION = "0.1.0";
var ROOT_DIR = import_node_path.join(import_node_os.homedir(), ".fivem-skills");
var DATA_DIR = import_node_path.join(ROOT_DIR, "data");
var SOURCES_FILE = import_node_path.join(ROOT_DIR, "sources.json");

// src/sources.ts
var import_node_fs = require("node:fs");
var BUILTIN_SOURCES = [
  {
    name: "docs",
    repo: "citizenfx/fivem-docs",
    subpath: "content/docs",
    extensions: [".md"],
    description: "Oficjalna dokumentacja FiveM"
  },
  {
    name: "natives",
    repo: "citizenfx/natives",
    extensions: [".md"],
    description: "Natywne funkcje FiveM / GTA V / RDR3"
  },
  {
    name: "ox",
    repo: "overextended/overextended.github.io",
    subpath: "content/docs",
    extensions: [".mdx", ".md"],
    description: "Dokumentacja zasobów Overextended (ox_lib, ox_inventory, ...)"
  }
];
function loadUserSources() {
  if (!import_node_fs.existsSync(SOURCES_FILE))
    return [];
  try {
    const parsed = JSON.parse(import_node_fs.readFileSync(SOURCES_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`Uwaga: nie udało się sparsować ${SOURCES_FILE} — pomijam źródła użytkownika.`);
    return [];
  }
}
function saveUserSources(sources) {
  import_node_fs.mkdirSync(ROOT_DIR, { recursive: true });
  import_node_fs.writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2) + `
`);
}
function getUserSources() {
  return loadUserSources();
}
function getAllSources() {
  const byName = new Map;
  for (const s of BUILTIN_SOURCES)
    byName.set(s.name, s);
  for (const s of loadUserSources())
    byName.set(s.name, s);
  return [...byName.values()];
}
function findSource(name) {
  return getAllSources().find((s) => s.name === name);
}

// src/pull.ts
var import_node_child_process = require("node:child_process");
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");

// src/search.ts
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
function* walkFiles(dir, extensions) {
  let entries;
  try {
    entries = import_node_fs2.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === ".git")
      continue;
    const full = import_node_path2.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full, extensions);
    } else if (extensions.includes(import_node_path2.extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}
function buildMatcher(query, opts) {
  if (opts.regex) {
    const re = new RegExp(query, opts.caseSensitive ? "" : "i");
    return (text) => re.test(text);
  }
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  return (text) => (opts.caseSensitive ? text : text.toLowerCase()).includes(needle);
}
function searchSources(sources, query, opts) {
  const matches = buildMatcher(query, opts);
  const nameHits = [];
  const contentHits = [];
  for (const src of sources) {
    const dir = import_node_path2.join(DATA_DIR, src.name);
    for (const file of walkFiles(dir, src.extensions)) {
      const relPath = import_node_path2.relative(DATA_DIR, file).replaceAll("\\", "/");
      const nameMatch = matches(import_node_path2.basename(file, import_node_path2.extname(file)));
      const lines = [];
      const content = import_node_fs2.readFileSync(file, "utf8");
      let lineNo = 0;
      for (const line of content.split(`
`)) {
        lineNo++;
        if (lines.length >= opts.linesPerFile)
          break;
        if (matches(line)) {
          lines.push({ line: lineNo, text: line.trim().slice(0, 200) });
        }
      }
      if (nameMatch)
        nameHits.push({ path: relPath, nameMatch, lines });
      else if (lines.length > 0)
        contentHits.push({ path: relPath, nameMatch, lines });
    }
  }
  return [...nameHits, ...contentHits].slice(0, opts.limit);
}

// src/pull.ts
function git(args, cwd) {
  const res = import_node_child_process.spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.error)
    throw new Error(`Nie udało się uruchomić git: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} zakończył się błędem:
${res.stderr.trim()}`);
  }
  return res.stdout;
}
function sourceDir(src) {
  return import_node_path3.join(DATA_DIR, src.name);
}
function isPulled(src) {
  return import_node_fs3.existsSync(import_node_path3.join(sourceDir(src), ".git"));
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
  import_node_fs3.mkdirSync(DATA_DIR, { recursive: true });
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

// src/cli.ts
var HELP = `fivem-skills v${VERSION} — lokalne mirrory dokumentacji FiveM + wyszukiwarka

Użycie:
  fivem-skills pull [źródło...]         Pobierz/zaktualizuj źródła (domyślnie wszystkie)
  fivem-skills search <fraza> [opcje]   Przeszukaj pobrane dokumenty
  fivem-skills list                     Pokaż źródła i ich status
  fivem-skills sources add <nazwa> <owner/repo> [--subpath <ścieżka>] [--ext .md,.mdx] [--desc <opis>]
  fivem-skills sources remove <nazwa>   Usuń źródło użytkownika

Opcje search:
  -s, --source <nazwa>   Ogranicz do jednego źródła (docs | natives | ox | ...)
  -e, --regex            Traktuj frazę jako wyrażenie regularne
  -c, --case-sensitive   Rozróżniaj wielkość liter
  -l, --limit <n>        Maks. liczba plików w wynikach (domyślnie 20)

Dane trafiają do: ${DATA_DIR}`;
function fail(message) {
  console.error(message);
  process.exit(1);
}
function cmdPull(args) {
  const all = getAllSources();
  const targets = args.length === 0 ? all : args.map((name) => findSource(name) ?? fail(`Nieznane źródło: ${name}. Dostępne: ${all.map((s) => s.name).join(", ")}`));
  for (const src of targets) {
    const verb = isPulled(src) ? "Aktualizuję" : "Pobieram";
    console.log(`${verb} ${src.name} (${src.repo}${src.subpath ? `/${src.subpath}` : ""})...`);
    const { updated, rev } = pullSource(src);
    const files = countFiles(src);
    console.log(`  ${updated ? "OK" : "Bez zmian"} @ ${rev}, plików: ${files}`);
  }
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
    fail("Podaj frazę do wyszukania, np.: fivem-skills search GetPlayerPed");
  let sources = getAllSources();
  if (values.source) {
    const src = findSource(values.source);
    if (!src)
      fail(`Nieznane źródło: ${values.source}. Dostępne: ${sources.map((s) => s.name).join(", ")}`);
    sources = [src];
  }
  const notPulled = sources.filter((s) => !isPulled(s));
  if (notPulled.length === sources.length) {
    fail(`Brak pobranych danych. Najpierw uruchom: fivem-skills pull`);
  }
  for (const s of notPulled) {
    console.error(`Uwaga: źródło "${s.name}" nie jest pobrane (fivem-skills pull ${s.name}) — pomijam.`);
  }
  const limit = Number.parseInt(values.limit, 10);
  if (Number.isNaN(limit) || limit < 1)
    fail(`Nieprawidłowy limit: ${values.limit}`);
  const results = searchSources(sources.filter(isPulled), query, {
    regex: values.regex,
    caseSensitive: values["case-sensitive"],
    limit,
    linesPerFile: 5
  });
  if (results.length === 0) {
    console.log(`Brak wyników dla: ${query}`);
    return;
  }
  console.log(`Katalog danych: ${DATA_DIR}
`);
  for (const match of results) {
    console.log(`${match.path}${match.nameMatch ? "  (nazwa pliku)" : ""}`);
    for (const { line, text } of match.lines) {
      console.log(`  ${line}: ${text}`);
    }
  }
  console.log(`
Plików z trafieniami: ${results.length}${results.length === limit ? ` (limit ${limit} — zawęź frazę lub zwiększ -l)` : ""}`);
}
function cmdList() {
  console.log(`Katalog danych: ${DATA_DIR}
`);
  const userNames = new Set(getUserSources().map((s) => s.name));
  for (const src of getAllSources()) {
    const origin = userNames.has(src.name) ? "użytkownika" : "wbudowane";
    const status = isPulled(src) ? `pobrane, plików: ${countFiles(src)}, ostatni commit: ${lastCommitDate(src)}` : "nie pobrane";
    console.log(`${src.name}  [${origin}]  ${src.repo}${src.subpath ? `/${src.subpath}` : ""}`);
    console.log(`  ${src.description}`);
    console.log(`  ${status}
`);
  }
}
function cmdSources(args) {
  const action = args[0];
  if (action === "add") {
    const { values, positionals } = import_node_util.parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      options: {
        subpath: { type: "string" },
        ext: { type: "string", default: ".md,.mdx" },
        desc: { type: "string", default: "" }
      }
    });
    const [name, repo] = positionals;
    if (!name || !repo)
      fail("Użycie: fivem-skills sources add <nazwa> <owner/repo> [--subpath ...] [--ext .md,.mdx] [--desc ...]");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
      fail(`Nieprawidłowy format repo (oczekiwano owner/repo): ${repo}`);
    if (BUILTIN_SOURCES.some((s) => s.name === name))
      fail(`Nazwa "${name}" jest zajęta przez źródło wbudowane.`);
    const source = {
      name,
      repo,
      subpath: values.subpath,
      extensions: values.ext.split(",").map((e) => e.startsWith(".") ? e : `.${e}`),
      description: values.desc
    };
    const user = getUserSources().filter((s) => s.name !== name);
    user.push(source);
    saveUserSources(user);
    console.log(`Dodano źródło "${name}" (${SOURCES_FILE}). Pobierz je: fivem-skills pull ${name}`);
  } else if (action === "remove") {
    const name = args[1];
    if (!name)
      fail("Użycie: fivem-skills sources remove <nazwa>");
    const user = getUserSources();
    if (!user.some((s) => s.name === name))
      fail(`Brak źródła użytkownika o nazwie "${name}".`);
    saveUserSources(user.filter((s) => s.name !== name));
    console.log(`Usunięto źródło "${name}". Dane w ${DATA_DIR} pozostały — usuń je ręcznie, jeśli chcesz.`);
  } else {
    fail("Użycie: fivem-skills sources <add|remove> ...");
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
    case "sources":
      return cmdSources(rest);
    case "--version":
    case "-v":
      return void console.log(VERSION);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      return void console.log(HELP);
    default:
      fail(`Nieznana komenda: ${command}

${HELP}`);
  }
}
try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
