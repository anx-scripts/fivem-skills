import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./constants";
import type { Source } from "./sources";
import { walkFiles } from "./search";

function git(args: string[], cwd?: string): string {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.error) throw new Error(`Failed to run git: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${res.stderr.trim()}`);
  }
  return res.stdout;
}

export function sourceDir(src: Source): string {
  return join(DATA_DIR, src.name);
}

export function isPulled(src: Source): boolean {
  return existsSync(join(sourceDir(src), ".git"));
}

/**
 * Downloads or updates a source via a shallow git clone.
 * Sources with a subpath use sparse-checkout — full tarballs can weigh
 * hundreds of MB (fivem-docs: 274 MB), a sparse clone of the docs is ~4 MB.
 */
export function pullSource(src: Source): { updated: boolean; rev: string } {
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

  mkdirSync(DATA_DIR, { recursive: true });
  if (src.subpath) {
    git(["clone", "--depth", "1", "--filter=blob:none", "--sparse", url, dir]);
    git(["sparse-checkout", "set", src.subpath], dir);
  } else {
    git(["clone", "--depth", "1", url, dir]);
  }
  const rev = git(["rev-parse", "HEAD"], dir).trim();
  return { updated: true, rev: rev.slice(0, 7) };
}

export function countFiles(src: Source): number {
  let n = 0;
  for (const _ of walkFiles(sourceDir(src), src.extensions)) n++;
  return n;
}

export function lastCommitDate(src: Source): string {
  try {
    return git(["log", "-1", "--format=%cs"], sourceDir(src)).trim();
  } catch {
    return "?";
  }
}
