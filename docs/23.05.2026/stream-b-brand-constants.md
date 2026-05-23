# Stream B — brand-constants-Consumer-Refactor (HQ-Adresse)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamb-brand-constants` (off clean staging)
**Sprint:** LLM-Visibility (Doc 31) · **Quell-Spec:** Doc 30 §3 + Stream-Brief `_specs/llm-visibility-sprint/streams/stream-B-brand-constants.md`

## Ausgangslage (Inventur)

DoD-Greps des Briefs:
- `"bundesweit größte digitale Plattform"` außerhalb brand-constants → **bereits 0** (Stream C-Rest nutzte `BRAND_STATEMENT_D1`; einzige weitere Stelle ist `brand-fakten-library.ts` F51, ein SOT-File mit „(siehe D1)"-Querverweis).
- `"Hansaring 10"` → **17 Files** (das eigentliche Stream-B-Stück).

Verteilung der 17 Treffer:
- **Refactorbar (Code, kann importieren):** `jsonld.ts` (HQ_LOCATION.streetAddress), `ueber-uns`, `impressum`, `datenschutz` (Pages), `llms.txt`, `llms-full.txt`.
- **NICHT refactorbar (kein Import-Mechanismus / gesetzlich verbatim / SOT):** `src/content/legal/*.md` (AGB/Impressum/Datenschutz/Nutzungsbedingungen — Adresse gesetzlich Pflicht), `ratgeber.md`, `src/i18n/messages/*.json` (Übersetzungs-Daten + SA-Vollmacht-Volltext), `brand-fakten-library.ts` F53 (SOT).

→ Der literale Grep `→ 0` über **ganz** `src/` ist nicht erreichbar (Markdown/JSON können nicht importieren). Mess­bares, sinnvolles Ziel: **0 in `.ts`/`.tsx`-Code** (außer den SOT-Files brand-constants + brand-fakten-library).

## Was gebaut wurde

1. **Adress-Atome in `brand-constants.ts`** (Doc 30 §3 SOT): `HQ_STREET`, `HQ_POSTAL_CODE`, `HQ_CITY`, `HQ_COUNTRY`, `HQ_ADDRESS_INLINE` (= „Hansaring 10, 50670 Köln"). `BRAND_CONTACT_D2` wird jetzt aus `HQ_ADDRESS_INLINE` komponiert → Output **byte-identisch** zur G0-approved Phrase. `brand-constants` importiert weiterhin **nichts** (bleibt Leaf → kein Zirkel).
2. **Consumer auf Imports umgestellt:**
   - `jsonld.ts` → `HQ_LOCATION` nutzt `HQ_STREET/HQ_POSTAL_CODE/HQ_CITY` (Import aus brand-constants, einseitig).
   - `impressum/page.tsx` (2 Adress-Blöcke), `datenschutz/page.tsx` (1 Block) → `{HQ_STREET}` / `{HQ_POSTAL_CODE} {HQ_CITY}`.
   - `ueber-uns/page.tsx` → 4 Stellen (Trust-Karte titel/text, strukturierter itemProp-Block, Foto-Caption) + 1 Code-Kommentar entschärft.
   - `llms.txt` (2×) + `llms-full.txt` (3×) → `${HQ_ADDRESS_INLINE}` bzw. Atome in den Template-Strings.

## Bewusst NICHT angefasst

- **Legal-Markdown + i18n-JSON + brand-fakten-SOT:** behalten die Adress-Literale (siehe oben).
- **Phone (`0221 25906530`, 23 Files), WhatsApp (`wa.me/…`, 17), Founder-Namen (18–21):** NICHT in den DoD-Greps. Ein 60-Files-Sweep über Legal/i18n/Marketing/Email ist genau der „breite Blast-Radius, vorsichtig"-Fall des Briefs → als **Folge-Stream** dokumentiert, nicht in dieser PR. (Phone/Email sind in `jsonld.ts` als `PHONE_DISPLAY`/`PHONE_E164`/`CONTACT_EMAIL` bereits zentral verfügbar — der Sweep wäre reine Consumer-Migration.)

## Verifikation (empirisch)

- `grep -rn "Hansaring 10" src/ --include=*.ts --include=*.tsx | grep -vE "brand-constants|brand-fakten"` → **0**
- `npx tsc --noEmit` exit 0 · `check:token-audit` 1680/0 · `next build` exit 0
- Static `llms.txt`/`llms-full.txt` (prerendered body): Adresse korrekt (2×/3×), komponierter Über-uns-Satz byte-korrekt.
- Dev-Smoke (`next dev`): `/impressum`, `/datenschutz`, `/ueber-uns` → HTTP 200, Adresse rendert; Home-JSON-LD `"streetAddress":"Hansaring 10"`. Screenshot Impressum (beide Blöcke korrekt).
- `BRAND_CONTACT_D2` hat **keine** Runtime-Consumer → die Neu-Komposition ist risikofrei.

## Offen / Folge

- Optionaler Folge-Stream: Phone/WhatsApp/Founder-Literale auf zentrale Konstanten migrieren (Consumer-Sweep, breiter Blast-Radius).
