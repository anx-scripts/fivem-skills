export interface Source {
  name: string;
  /** GitHub owner/repo */
  repo: string;
  /** Sparse-checkout path; omitted = whole repository */
  subpath?: string;
  /** File extensions considered by search */
  extensions: string[];
  description: string;
}

export const SOURCES: Source[] = [
  {
    name: "docs",
    repo: "citizenfx/fivem-docs",
    subpath: "content/docs",
    extensions: [".md"],
    description: "Official FiveM documentation",
  },
  {
    name: "natives",
    repo: "citizenfx/natives",
    extensions: [".md"],
    description: "FiveM / GTA V / RDR3 native functions",
  },
  {
    name: "ox",
    repo: "overextended/overextended.github.io",
    subpath: "content/docs",
    extensions: [".mdx", ".md"],
    description: "Overextended docs (ox_lib, ox_inventory, ...)",
  },
];

export function findSource(name: string): Source | undefined {
  return SOURCES.find((s) => s.name === name);
}
