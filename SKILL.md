---
name: fivem-skills
description: Offline lookup of FiveM documentation via the fivem-skills CLI - GTA V / RDR3 native functions, official FiveM docs (scripting manual/reference, server manual, events, state bags, OneSync) and Overextended resources (ox_lib, ox_inventory, ox_target, oxmysql, ox_core). Use whenever developing FiveM resources or scripts and you need a native signature, a scripting/server topic, or an ox API - instead of web search or guessing from memory.
---

# FiveM documentation lookup

The `fivem-skills` CLI searches local mirrors of FiveM documentation. Prefer it over
web search and over recalling native signatures from memory — natives have exact
parameter lists, flags and enums that are easy to get subtly wrong.

## Setup — check before first use

The CLI is meant to be installed globally. If `fivem-skills` is not on PATH, tell
the user and offer to install it:

```
bun add -g @anx-scripts/fivem-skills   # or: npm install -g @anx-scripts/fivem-skills
fivem-skills pull                           # download the doc mirrors (~8 MB, needs git)
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
2. **Read the file**: `fivem-skills show <path-from-results>`

Skip step 1 when you already know the native's name — `show` resolves bare names:

```
fivem-skills show SetPedConfigFlag        # SET_PED_CONFIG_FLAG works too
```

Native files are short; always `show` the whole file instead of relying on search
snippets. If `show` reports multiple matches, rerun it with one of the listed paths.

## Query rules

- Multiple words are ANDed per file (against its name or content) — more words narrow the result.
- Words are split on camelCase: `SafePed` ≡ `safe ped`.
- Native names are normalized in both `search` and `show`: `SET_PED_CONFIG_FLAG` ≡ `SetPedConfigFlag` ≡ `setpedconfigflag`.
- `-e` treats the whole query as one regex — the only way to match an exact phrase: `-e "register callback"`.
- Ranking: exact file name > partial file name > content-only (by hit count).

## Examples

```
fivem-skills show GetSafeCoordForPed                # full native doc by name
fivem-skills search safe coord -s natives           # find natives by topic
fivem-skills search "state bags" -s docs            # FiveM concept docs
fivem-skills search registerCallback -s ox          # ox_lib / ox API lookup
fivem-skills search "SET_PED_.*_FLAG" -e -s natives # regex over native names
```

## Troubleshooting

- **Command not found / "No data downloaded yet"** → see Setup above.
- **Stale data** → `fivem-skills list` shows each source's last-commit date; `fivem-skills pull` updates.
- **No results** → drop words from the query (they are ANDed), or search without `-s` to cover all sources.
