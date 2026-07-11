---
name: fivem-skills
description: Offline lookup of FiveM documentation via the fivem-skills CLI - GTA V / RDR3 native functions, official FiveM docs (scripting manual/reference, server manual, events, state bags, OneSync) and Overextended resources (ox_lib, ox_inventory, ox_target, oxmysql, ox_core). Use whenever developing FiveM resources or scripts and you need a native signature, a scripting/server topic, or an ox API - instead of web search or guessing from memory.
---

# FiveM documentation lookup

The `fivem-skills` CLI is a **local search index** over mirrors of FiveM documentation.
Prefer it over web search and over recalling native signatures from memory — natives
have exact parameter lists, flags and enums that are easy to get subtly wrong.

The CLI only *finds* files and prints snippets. To read a file, open the **absolute
path** it prints with whatever file-access tool your agent has — never a
dump-everything command. That keeps context small: you read the lines you need, not
a 300 KB table.

## Setup — check before first use

The CLI is meant to be installed globally. If `fivem-skills` is not on PATH, tell
the user and offer to install it:

```
bun add -g @anx-scripts/fivem-skills   # or: npm install -g @anx-scripts/fivem-skills
fivem-skills pull                       # download the doc mirrors (~8 MB, needs git)
```

If the command exists but reports missing data ("No data downloaded yet" or a
"not pulled" source), run `fivem-skills pull`.

## Sources

| Source    | Contents                                                                  | Use for                                                        |
| --------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `natives` | One file per native function, grouped by namespace (PED, VEHICLE, TASK…)  | Exact signatures, parameters, return values, flag/enum values  |
| `docs`    | Official FiveM docs: scripting manual/reference, server manual, cookbook  | Events, state bags, OneSync, resource manifest, convars, NUI   |
| `ox`      | Overextended documentation                                                | ox_lib, ox_inventory, ox_target, oxmysql, ox_core, ox_doorlock |

## Workflow

1. **Search**: `fivem-skills search <query> [-s natives|docs|ox] [-l N]`
   Each hit prints the file's **absolute path** plus up to 5 matching lines,
   preferring markdown headings — so a native surfaces its `## NATIVE_NAME`
   signature right in the results.
2. **Read the file at the printed path** — *only if the snippet wasn't enough* —
   with whatever tools your agent has. Match the read to the file:
   - **natives** are tiny (~250 B) → read the whole file.
   - **docs / ox** vary; the `docs/.../game-references/*` files are **huge lookup
     tables** (vehicle-models is 330 KB, weapon-models 200 KB, blips, ped-models…).
     **Never read those whole.** Pull only the row you need:
     - if you have a content-search / grep-style tool → search the path for the term
       (e.g. the pattern `\badder\b`);
     - otherwise → read the file in ranges (offset + limit / line range), never in
       one shot.

> Reading a whole game-reference file can cost ~90k tokens (~45% of the window) in
> one shot. That is the single biggest context sink here — search the file or read it
> in ranges instead.

## Query rules

- Multiple words are ANDed per file (against its name or content) — more words narrow the result.
- Words are split on camelCase: `SafePed` ≡ `safe ped`.
- Native names are normalized: `SET_PED_CONFIG_FLAG` ≡ `SetPedConfigFlag` ≡ `setpedconfigflag` all find the same file.
- `-e` treats the whole query as one regex — the only way to match an exact phrase: `-e "register callback"`.
- Ranking: exact file name > partial file name > content-only (by hit count).

## Examples

```
fivem-skills search GetSafeCoordForPed              # native by name — signature shows in the snippet
fivem-skills search safe coord -s natives           # find natives by topic
fivem-skills search "state bags" -s docs            # FiveM concept docs
fivem-skills search registerCallback -s ox          # ox_lib / ox API lookup
fivem-skills search "SET_PED_.*_FLAG" -e -s natives # regex over native names
fivem-skills search adder -s docs                   # then: search the printed vehicle-models path for the row
```

## Troubleshooting

- **Command not found / "No data downloaded yet"** → see Setup above.
- **Stale data** → `fivem-skills list` shows each source's last-commit date; `fivem-skills pull` updates.
- **No results** → drop words from the query (they are ANDed), or search without `-s` to cover all sources.
