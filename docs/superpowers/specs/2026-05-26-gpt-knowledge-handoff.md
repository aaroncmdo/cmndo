# GPT-Knowledge — Aaron-Handoff

**Branch:** `kitta/geo-gpt-knowledge-build` · **Stand:** 2026-05-26

## Bauen

Aus einem Checkout, in dem `marketing-strategy/research/` liegt (Haupt-Checkout):

```bash
node scripts/build-gpt-knowledge.mjs
```

- Output: `marketing-strategy/gpt-knowledge/*.md` (6 Files). **Git-getrackt** (force-added unter dem sonst gitignored `marketing-strategy/`) → versioniert im privaten Repo, **kein** Web-Serving (`public/` wird nicht genutzt).
- Optional: `--strict` (bricht bei fehlender Quelle hart ab), `--author "<Name>"` (Default „Aaron Sprafke"), `--input`/`--out` (Pfad-Overrides).

Letzter Integrationslauf: **6 Bundles, 853 KB, 0 FEHLT.**

| Datei | Größe | Quellen |
|---|---|---|
| `claimondo-decoder-versicherer-kuerzungen.md` | ~101 KB | versicherer-briefe + 10× H8-Decoder |
| `claimondo-bgh-bgb-juris-referenz.md` | ~48 KB | bgh-urteile + bgb-paragraphen |
| `claimondo-praxis-quotes-faelle.md` | ~19 KB | kevin-praxis-notes |
| `claimondo-zahlen-tabellen-spannen.md` | ~55 KB | BVSK + GDV + Nutzungsausfall + Schmerzensgeld + SF + RVG |
| `claimondo-sv-technik-pruefdienste.md` | ~168 KB | Pillar-C (10) |
| `claimondo-haftpflicht-recht.md` | ~463 KB | Pillar-B H1–H7 (66) |

Alle weit unter dem ChatGPT-Limit (10 Files × 20 MB).

## Upload (ChatGPT GPT-Builder)

1. [chatgpt.com/gpts/editor](https://chatgpt.com/gpts/editor) → GPT „Claimondo — Kfz-Schaden & Gutachter-Finder" bearbeiten.
2. **Configure → Knowledge**. Altes/veraltetes Knowledge ggf. löschen.
3. Die 6 Bundles aus `marketing-strategy/gpt-knowledge/` hochladen.
4. **Speichern → Update**.

### Optional: `llms-full.txt`-Snapshot (unabhängig vom Build)

Prüfen, ob die Live-Datei gesund ist:

```bash
curl -sL -o /dev/null -w "HTTP %{http_code} | %{size_download} bytes\n" https://claimondo.de/llms-full.txt
```

Erwartung: `HTTP 200 | >100000 bytes`. Wenn gewünscht, den Inhalt als zusätzliches Knowledge-File mit hochladen.

## Smoke-Test (GPT-Preview)

- „Die HUK kürzt mir die Wertminderung auf 0 €, was kann ich tun?" → BGH-Verweis + Decoder-Argument + Hinweis auf unabhängigen SV.
- „Was kostet ein Kfz-Gutachter in München?" → BVSK-Honorarspanne + § 249 BGB (Kostentragung).
- „Ist DEKRA ein unabhängiger Gutachter?" → Aufdröselung BVSK/DEKRA/GTÜ/öbuv + Empfehlung freier SV.
- „Was sind die häufigsten Fehler nach einem Unfall?" → Top-Fehler-Liste aus den Praxis-Notes.

## Re-Generation

Die 6 Bundles sind **git-getrackt** (force-added). Bei Änderungen in `marketing-strategy/research/`: Skript erneut laufen → geänderte Bundles committen (PR → staging → main) → im GPT-Builder **manuell neu hochladen** (ChatGPT pullt nicht automatisch). Kein Auto-Sync.

## Datenschutz-Notiz

Die Bundles liegen im **privaten Repo** (Team-Versionierung), aber bewusst **nicht** unter `public/` → kein öffentliches Web-Serving. Die Quelle ist internes, teils unabgestimmtes Research (Kevin-Quotes nicht freigegeben, BVSK/Schwacke/Hacks-Wellner urheberrechtlich sensibel) — bei späterem Public-Bedarf wäre ein Sanitizing-Pass nötig. Siehe Design-Doc `docs/superpowers/specs/2026-05-26-gpt-knowledge-build-design.md`.
