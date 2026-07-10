# fivem-skills

CLI that mirrors FiveM documentation locally and searches it offline — so AI agents (and humans) have the docs at hand without network access or scraping.

Sources:

| Name      | Repository                                          | Content                                     |
| --------- | ---------------------------------------------------- | ------------------------------------------- |
| `docs`    | `citizenfx/fivem-docs` → `content/docs`               | Official FiveM documentation                |
| `natives` | `citizenfx/natives`                                   | FiveM / GTA V / RDR3 native functions       |
| `ox`      | `overextended/overextended.github.io` → `content/docs` | ox_lib, ox_inventory, oxmysql… docs         |

Data lands in `~/.fivem-skills/data/<source>/` (shallow git sparse clones — ~8 MB total).

## Install

```bash
bun add -g @anx-scripts/fivem-skills   # or: npm install -g @anx-scripts/fivem-skills
fivem-skills pull
```

From a local clone: `bun install && bun run build && bun link`.

## Using with AI agents

The repo ships [`SKILL.md`](SKILL.md) — an agent skill teaching the search → show workflow. Install it into a project with [skills](https://github.com/vercel-labs/skills):

```bash
bunx skills add anx-scripts/fivem-skills     # or: npx skills add anx-scripts/fivem-skills
```

The skill tells the agent to prompt for a global CLI install when `fivem-skills` is missing, so installing the skill alone is enough to bootstrap.

## Usage

```bash
fivem-skills pull                 # download/update all sources
fivem-skills pull natives         # selected sources only

fivem-skills search GetPlayerPed              # search everywhere
fivem-skills search "ox_lib callback" -s ox   # AND within the ox source
fivem-skills search "SET_PED_.*" -e -l 50     # regex, limit 50 files

fivem-skills show GetSafeCoordForPed          # print a full doc by native/file name
fivem-skills show docs/scripting-manual/networking/state-bags.md   # or by search-result path

fivem-skills list                 # source status
```

## How search works

- **Multiple words = AND** — a file matches when every word appears somewhere in it (file name or content). Force an exact phrase with regex: `-e "register callback"`.
- **camelCase splitting** — query words are split on camelCase boundaries, so `SafePed` finds `GetSafeCoordForPed` just like `safe ped` would.
- **Native name normalization** — `GET_PLAYER_PED`, `GetPlayerPed` and `getplayerped` are the same query; underscores and case don't matter when matching file names.
- **Ranking** — exact file name match > partial file name match > content-only matches (sorted by number of matching lines).
- Results show up to 5 matching lines per file, **preferring markdown headings** — for a native that surfaces its `## NATIVE_NAME` signature heading instead of enum entries.
- Result paths are `<source>/<path-inside-docs>` (the repo's `content/docs` prefix is stripped). Feed any of them to `fivem-skills show <path>` to print the whole file; `show` also accepts a bare native/file name (`show GetSafeCoordForPed`, `show SET_PED_CONFIG_FLAG`).
- Output is colorized on interactive terminals only (respects `NO_COLOR`); piped output stays plain.

## Development

```bash
bun run dev -- search callback    # run from src/ without building
bun run typecheck
bun run build                     # bundles src/cli.ts into dist/cli.cjs (CJS, zero dependencies)
```

Design notes:

- **Sparse clones instead of tarballs** — the full `citizenfx/fivem-docs` tarball weighs 274 MB (site assets); a sparse clone of `content/docs` alone is ~4 MB.
- **`dist/cli.cjs` in CJS format** — the bundle runs under plain Node regardless of `"type": "module"` or whether a `package.json` sits next to it.
- **Built-in sources only** — this repo will eventually ship a SKILL.md instructing agents; a fixed, known set of sources keeps their behavior predictable. New sources are added deliberately in code (`src/sources.ts`), not via configuration.
