# i18n Translation Pipeline

Single-Source-of-Truth-Übersetzung via Anthropic Claude.

## Architektur

```
src/i18n/messages/de.json  ← Single Source of Truth (manuell editiert)
        ↓
scripts/i18n/translate.mjs (diesen Ordner)
        ↓
src/i18n/messages/{en,tr,pl,ru,ar}.json  ← Auto-generiert
```

Das Skript:
1. Liest `de.json`
2. Vergleicht jeden String mit dem Pendant in den 5 Ziel-Sprachen
3. Sammelt fehlende Keys ODER Keys die noch DE-Fallback enthalten (= identisch zum DE-Original)
4. Schickt sie batched (30 Strings/Call) an `claude-sonnet-4-6` mit Glossar-System-Prompt
5. Schreibt nur die übersetzten Keys zurück (alle anderen unverändert)

Glossar in `glossary.md` — Fachbegriffe (§249 BGB, BVSK, DAT) bleiben deutsch in allen Sprachen, Tonalität ist überall vertrauensvoll-präzise.

## Setup

```bash
# Einmalig: ANTHROPIC_API_KEY in .env.local setzen
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local
```

## Use

```bash
# Alle 5 Sprachen, nur fehlende Keys
npm run i18n:translate

# Nur bestimmte Sprache(n)
npm run i18n:translate -- en tr

# Nur ein Section-Top-Level-Key
npm run i18n:translate -- --section=ueber_uns

# Komplett neu übersetzen (auch Keys die schon übersetzt sind)
npm run i18n:translate:force

# Kombiniert: nur EN, nur ueber_uns, force
npm run i18n:translate -- en --section=ueber_uns --force
```

## Workflow für neue Page-Migration

1. Page anpassen — deutsche Strings als next-intl-Keys in `de.json` hinzufügen, `getTranslations()` im Page-File
2. `npm run i18n:translate` — übersetzt automatisch in alle 5 Sprachen (~30s)
3. `git diff src/i18n/messages/` prüfen — sehen ob Übersetzungen vernünftig aussehen
4. Bei rechtlich-sensitiven Strings: manuelle Review/Korrektur in en.json (Pipeline überschreibt nicht weil dann ≠ DE-Original)
5. Commit + Push — alle 6 Sprachen in einem PR

## Kosten-Schätzung

Sonnet 4.6 Input ~3$/M Tokens, Output ~15$/M Tokens.

Marketing-Site ~ 1.500 Strings × 5 Sprachen × ~50 Tokens/String I/O = ~750k Tokens total. Mit Prompt-Caching (Glossar bleibt cached): unter 5$ für komplette Erst-Übersetzung. Inkrementelle Updates pro Page-PR: ~0,10€.

## Manuelle Übersetzungen behalten

Sobald ein String in einer Ziel-Sprache **nicht mehr gleich dem DE-Original** ist, betrachtet das Skript ihn als „bereits übersetzt" und überspringt ihn. So überschreibt die Pipeline keine Hand-Korrekturen.

Wenn du eine Hand-Übersetzung neu generieren willst: `--force` nutzen oder den Key kurzzeitig auf den DE-Wert setzen.

## Troubleshooting

- **`ANTHROPIC_API_KEY nicht in Env`** → in `.env.local` setzen
- **JSON-Parse-Fehler** → Claude hat trotzdem ```json fences ausgegeben; das Skript stripped sie, falls trotzdem Fehler: Output im Log inspect, evtl. `max_tokens` zu klein für Batch
- **Übersetzung wirkt zu „marketing-fluff"** → glossary.md anpassen + `--force` neu laufen lassen
- **Fachbegriff falsch übersetzt** → in glossary.md unter „IMMER deutsch beibehalten" aufnehmen
