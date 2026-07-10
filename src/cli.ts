#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DATA_DIR, SOURCES_FILE, VERSION } from "./constants";
import { BUILTIN_SOURCES, findSource, getAllSources, getUserSources, saveUserSources, type Source } from "./sources";
import { countFiles, isPulled, lastCommitDate, pullSource } from "./pull";
import { searchSources } from "./search";

const HELP = `fivem-skills v${VERSION} — lokalne mirrory dokumentacji FiveM + wyszukiwarka

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

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function cmdPull(args: string[]): void {
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
  if (!query) fail("Podaj frazę do wyszukania, np.: fivem-skills search GetPlayerPed");

  let sources = getAllSources();
  if (values.source) {
    const src = findSource(values.source);
    if (!src) fail(`Nieznane źródło: ${values.source}. Dostępne: ${sources.map((s) => s.name).join(", ")}`);
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
  if (Number.isNaN(limit) || limit < 1) fail(`Nieprawidłowy limit: ${values.limit}`);

  const results = searchSources(sources.filter(isPulled), query, {
    regex: values.regex,
    caseSensitive: values["case-sensitive"],
    limit,
    linesPerFile: 5,
  });

  if (results.length === 0) {
    console.log(`Brak wyników dla: ${query}`);
    return;
  }

  console.log(`Katalog danych: ${DATA_DIR}\n`);
  for (const match of results) {
    console.log(`${match.path}${match.nameMatch ? "  (nazwa pliku)" : ""}`);
    for (const { line, text } of match.lines) {
      console.log(`  ${line}: ${text}`);
    }
  }
  console.log(`\nPlików z trafieniami: ${results.length}${results.length === limit ? ` (limit ${limit} — zawęź frazę lub zwiększ -l)` : ""}`);
}

function cmdList(): void {
  console.log(`Katalog danych: ${DATA_DIR}\n`);
  const userNames = new Set(getUserSources().map((s) => s.name));
  for (const src of getAllSources()) {
    const origin = userNames.has(src.name) ? "użytkownika" : "wbudowane";
    const status = isPulled(src)
      ? `pobrane, plików: ${countFiles(src)}, ostatni commit: ${lastCommitDate(src)}`
      : "nie pobrane";
    console.log(`${src.name}  [${origin}]  ${src.repo}${src.subpath ? `/${src.subpath}` : ""}`);
    console.log(`  ${src.description}`);
    console.log(`  ${status}\n`);
  }
}

function cmdSources(args: string[]): void {
  const action = args[0];
  if (action === "add") {
    const { values, positionals } = parseArgs({
      args: args.slice(1),
      allowPositionals: true,
      options: {
        subpath: { type: "string" },
        ext: { type: "string", default: ".md,.mdx" },
        desc: { type: "string", default: "" },
      },
    });
    const [name, repo] = positionals;
    if (!name || !repo) fail("Użycie: fivem-skills sources add <nazwa> <owner/repo> [--subpath ...] [--ext .md,.mdx] [--desc ...]");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail(`Nieprawidłowy format repo (oczekiwano owner/repo): ${repo}`);
    if (BUILTIN_SOURCES.some((s) => s.name === name)) fail(`Nazwa "${name}" jest zajęta przez źródło wbudowane.`);

    const source: Source = {
      name,
      repo,
      subpath: values.subpath,
      extensions: values.ext.split(",").map((e) => (e.startsWith(".") ? e : `.${e}`)),
      description: values.desc,
    };
    const user = getUserSources().filter((s) => s.name !== name);
    user.push(source);
    saveUserSources(user);
    console.log(`Dodano źródło "${name}" (${SOURCES_FILE}). Pobierz je: fivem-skills pull ${name}`);
  } else if (action === "remove") {
    const name = args[1];
    if (!name) fail("Użycie: fivem-skills sources remove <nazwa>");
    const user = getUserSources();
    if (!user.some((s) => s.name === name)) fail(`Brak źródła użytkownika o nazwie "${name}".`);
    saveUserSources(user.filter((s) => s.name !== name));
    console.log(`Usunięto źródło "${name}". Dane w ${DATA_DIR} pozostały — usuń je ręcznie, jeśli chcesz.`);
  } else {
    fail("Użycie: fivem-skills sources <add|remove> ...");
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
      fail(`Nieznana komenda: ${command}\n\n${HELP}`);
  }
}

try {
  main();
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
