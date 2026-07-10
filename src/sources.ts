import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ROOT_DIR, SOURCES_FILE } from "./constants";

export interface Source {
  name: string;
  /** owner/repo na GitHubie */
  repo: string;
  /** Ścieżka do sparse-checkout; brak = cały repozytorium */
  subpath?: string;
  /** Rozszerzenia plików brane pod uwagę przy wyszukiwaniu */
  extensions: string[];
  description: string;
}

export const BUILTIN_SOURCES: Source[] = [
  {
    name: "docs",
    repo: "citizenfx/fivem-docs",
    subpath: "content/docs",
    extensions: [".md"],
    description: "Oficjalna dokumentacja FiveM",
  },
  {
    name: "natives",
    repo: "citizenfx/natives",
    extensions: [".md"],
    description: "Natywne funkcje FiveM / GTA V / RDR3",
  },
  {
    name: "ox",
    repo: "overextended/overextended.github.io",
    subpath: "content/docs",
    extensions: [".mdx", ".md"],
    description: "Dokumentacja zasobów Overextended (ox_lib, ox_inventory, ...)",
  },
];

function loadUserSources(): Source[] {
  if (!existsSync(SOURCES_FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(SOURCES_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`Uwaga: nie udało się sparsować ${SOURCES_FILE} — pomijam źródła użytkownika.`);
    return [];
  }
}

export function saveUserSources(sources: Source[]): void {
  mkdirSync(ROOT_DIR, { recursive: true });
  writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2) + "\n");
}

export function getUserSources(): Source[] {
  return loadUserSources();
}

/** Wbudowane + użytkownika; źródło użytkownika o tej samej nazwie nadpisuje wbudowane. */
export function getAllSources(): Source[] {
  const byName = new Map<string, Source>();
  for (const s of BUILTIN_SOURCES) byName.set(s.name, s);
  for (const s of loadUserSources()) byName.set(s.name, s);
  return [...byName.values()];
}

export function findSource(name: string): Source | undefined {
  return getAllSources().find((s) => s.name === name);
}
