# fivem-skills

CLI do lokalnego mirrorowania dokumentacji FiveM i szybkiego przeszukiwania jej offline — po to, żeby agenci AI mieli dokumentację pod ręką bez sieci i bez skrapowania.

Wbudowane źródła:

| Nazwa     | Repozytorium                                       | Zawartość                                  |
| --------- | -------------------------------------------------- | ------------------------------------------ |
| `docs`    | `citizenfx/fivem-docs` → `content/docs`             | Oficjalna dokumentacja FiveM               |
| `natives` | `citizenfx/natives`                                 | Natywne funkcje FiveM / GTA V / RDR3       |
| `ox`      | `overextended/overextended.github.io` → `content/docs` | Dokumentacja ox_lib, ox_inventory, oxmysql… |

Dane lądują w `~/.fivem-skills/data/<źródło>/` (płytkie sparse clone'y gita — łącznie ~8 MB).

## Instalacja

```bash
bun install
bun run build
bun link        # udostępnia komendę `fivem-skills` globalnie
```

## Użycie

```bash
fivem-skills pull                 # pobierz/zaktualizuj wszystkie źródła
fivem-skills pull natives         # tylko wybrane

fivem-skills search GetPlayerPed              # szukaj wszędzie
fivem-skills search callback -s ox            # tylko w źródle ox
fivem-skills search "SET_PED_.*" -e -l 50     # regex, limit 50 plików

fivem-skills list                 # status źródeł
```

Wyniki wyszukiwania to ścieżki względem `~/.fivem-skills/data/` plus dopasowane linie — trafienia w nazwę pliku (np. nazwa natywki) pokazywane są jako pierwsze.

### Własne źródła

```bash
fivem-skills sources add qbox Qbox-project/docs --subpath pages --ext .mdx --desc "Dokumentacja Qbox"
fivem-skills pull qbox
fivem-skills sources remove qbox
```

Definicje trafiają do `~/.fivem-skills/sources.json` i mogą nadpisywać źródła wbudowane o tej samej nazwie.

## Development

```bash
bun run dev -- search callback    # uruchomienie z src/ bez builda
bun run typecheck
bun run build                     # bunduje src/cli.ts do dist/cli.cjs (CJS, bez zależności)
```

Dlaczego tak, a nie inaczej:

- **Sparse clone zamiast tarballi** — pełny tarball `citizenfx/fivem-docs` waży 274 MB (assety strony); sparse clone samego `content/docs` to ~4 MB.
- **`dist/cli.cjs` w formacie CJS** — bundle działa pod czystym Node niezależnie od `"type": "module"` i od tego, czy obok leży `package.json`.
