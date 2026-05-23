# Sweep — Gründer-Namen zentralisieren (Founder-Sweep)

**Datum:** 2026-05-23 · **Branch:** `kitta/sweep-founder-names` (off clean staging)
**Auftrag:** Aaron — Founder-Sweep nach WA+Phone. Letzter Teil der brand-constants-Zentralisierung.

## Was gemacht

- **`FOUNDER_NICOLAS_NAME` + `FOUNDER_AARON_NAME`** in `brand-constants.ts` (§6) — einzige Code-Quelle der Gründernamen.
- Consumer auf Import umgestellt (8 Files): `jsonld.ts` (FOUNDERS-Array), `FounderSection`, `ReviewerByline`, `ueber-uns` (FOUNDERS-Array + Prosa-`<strong>`), `impressum` + `datenschutz` (Geschäftsführer-Zeilen, gesetzlich verbatim — rendern identisch aus der Konstante), `WillkommenSv` (E-Mail-Signatur).

## Bewusst NICHT (dokumentiert)

- **SOT-Bios + D10** in `brand-constants.ts` bleiben verbatim — der Name ist dort in die Prosa eingebettet (G0-approved), keine Recompose.
- **Alt-Texte / Foto-Captions** (z.B. „Aaron Sprafke (COO, links) und Nicolas Kitta (CEO, rechts) …") — deskriptive, zusammengesetzte Strings, kein kanonischer Brand-Name-Verweis → gelassen (Interpolation wäre Noise ohne Wert).
- **llms.txt / llms-full.txt** — Founder-Namen in Prosa; **bewusst ausgelassen, um Konflikt mit offenem PR #1587 (WA+Phone-Sweep, der dieselben Files anfasst) zu vermeiden.** Niedrigwert (Prosa). Nach #1587-Merge optional nachziehbar.
- **PDF-Generierung** (`generate-pdf`, `abrechnung-pdf`) + i18n-JSON + `anrede.ts` (nur Kommentar-Beispiele, keine echte Founder-Logik) — kein sauberer Brand-String-Fall.

## Einordnung

Gründernamen ändern sich praktisch nie → der Wert ist **Konsistenz** (eine Quelle), nicht Drift-Schutz (anders als Telefon/WA). Bewusst schlank gehalten.

## Verifikation
- `tsc --noEmit` exit 0 · `check:token-audit` 0 Verstöße.
- `next build`: **303/303 static pages generiert**; Exit rot **nur** `/gutachter-partner` Export-Timeout (DB-Contention, nicht angefasst → CI isoliert grün, bestätigtes Muster).
