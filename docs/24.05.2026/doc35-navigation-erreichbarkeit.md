# Doc 35 — Navigation/Erreichbarkeit der Doc-31/32-Ergebnisse

**Datum:** 2026-05-24 · **Branch:** `kitta/doc35-navigation` (off staging) · **PR:** gegen `staging`
**Quelle:** Doc 35 (Navigations-Audit). Aaron-Entscheid: **flache Links, keine Dropdowns** (kein 'use client', kein Mobile-Menü-Umbau) — `/ratgeber` + `/kfz-gutachter` werden Cluster-Gateways.

## Problem (Doc 35)
Die Doc-31/32-Ergebnisse (Pillar-C `/sachverstaendige`, 9 Sprint-2-Konversions-Seiten) sind live + crawlbar, aber von der Hauptseite **nicht erreichbar**: alles im Footer oder verwaist. `/sachverstaendige` hatte 0 eingehende interne Links.

## Umgesetzte Fixes

### Fix 1 — Header (`LandingTopbar.tsx`)
- `NAV_LINKS`: „Ratgeber" (→ /ratgeber) ergänzt; „Vorteile" + „FAQ" raus (in den Footer gewandert, s. Fix 3). Neu: Wie es funktioniert · Ratgeber · Gutachter · Über uns.
- Sichtbarer **Primär-CTA „Gutachter finden"** (filled-navy, `sm:inline-flex`) im rechten Cluster — vorher nur im Footer. Mobile (<sm) behält den Status quo (Hero + StickyCallBar liefern dort die CTAs).
- **Abweichung von Doc 36:** Doc 36 Fix 1/2 prescribed Dropdowns (`Ratgeber ▾`, `Gutachter ▾`). Aaron hat in dieser Session explizit **flache Links** gewählt (kein Dropdown/JS/Mobile-Umbau) → so umgesetzt. Reachability wird über die ausgebauten Gateways erreicht.

### Fix 3 — `/sachverstaendige` entwaisen
- **Footer** (`LandingFooter.tsx`): „Sachverständige & Verbände" (→ /sachverstaendige) in Produkt-Spalte; zusätzlich „Vorteile" + „Häufige Fragen" (aus Header gewandert, nicht verwaisen lassen).
- **`/ratgeber`-Gateway** (`cornerstones/ratgeber.md`): neuer Abschnitt „Wegweiser: Sachverständige, Verbände & passende Themen" mit allen 8 Verbands-Links + Situations-Ratgeber. (Eingefügt vor dem `## Schema (JSON-LD)`-Block, da `stripSchemaSection` ab dort bis Ende entfernt; ohne trailing `---`.)
- **Cross-Links** (`decoder/unser-sachverstaendiger.md`, `haftpflicht/sv-kosten.md`): je 1 Link auf `/sachverstaendige` in „Verwandte Begriffe".

### Fix 4 — Konversions-Blueprint anbinden
- **`/kfz-gutachter`-Hub** (`page.tsx`): neue Sektion „Gutachter nach Fahrzeugtyp & Kosten" (4 Karten: /motorrad-gutachter, /lkw-gutachter, /e-auto-gutachter, /kosten-kfz-gutachten). Platziert zwischen Stadt-Auswahl und Top-FAQ (bg-Alternation).
- **Misstrauens-Trio + /unfall-was-tun + /unfallskizze** über das /ratgeber-Gateway (s. Fix 3).

### Fix 5 — Coup-Teaser (`SchadensreportTeaserSection.tsx` neu, in `LandingPage.tsx`)
- Navy-Teaser-Band „Wie stark Versicherer wirklich kürzen" → /schadensreport-2026, thematisch hinter den Versicherer-Taktiken. Reuse der bestehenden Section-Patterns (Spotlight, Stat-Cards).

### Fix 6 — 1-Klick-Cluster
- Folge aus Fix 1: „Ratgeber" im Header → /ratgeber-Gateway (Hub) in 1 Klick, Spoke in 2.

### Fix 7 — LLM-Surface (`llms.txt` + `llms-full.txt`)
- Neuer Abschnitt „Konversions- & Ratgeber-Seiten" mit den **9 Sprint-2-Seiten** (1-Zeilen-Beschreibung in llms.txt, 2-Satz-Summaries in llms-full.txt, da bespoke page.tsx ohne MD-Body).
- **Abweichung von Doc 36/37:** Doc verlangt `totalAssets` 77→86. Beibehalten: computed 77 (= echte MD-Glossar-Assets) + **separat ausgewiesene** Konversions-Sektion. „86 Wissens-Assets" wäre faktisch falsch (die 9 sind keine Glossar-Assets). Falls Aaron die Zahl 86 dennoch will → 1-Zeilen-Änderung.

## Verifikation
- `tsc --noEmit`: **0**. `npm run check:token-audit`: **1697 Files, 0 Verstöße** (inline-rgba im Teaser = etabliertes Pattern, kein Skip-Header nötig).
- `next build`: **`✓ Compiled` + `✓ Finished TypeScript`**, alle geänderten Routen-Artefakte gebaut (kfz-gutachter, ratgeber, llms.txt, llms-full.txt, homepage). Einziger Export-Fail: `/gutachter-partner` (bekannter Timeout-Flake unter Parallel-Session-DB-Last, 7 Sessions; **kein** Doc-35-File). CI = finaler Gate.
- **Funktionaler Smoke** (Dev-Server): Header Ratgeber-Link + „Gutachter finden"-CTA ✓; Vorteile/FAQ exakt 1× (= nur Footer) ✓; Footer /sachverstaendige+/vorteile+/faq ✓; Teaser-Headline+Link ✓; /ratgeber-Gateway SV+Blueprint-Links ✓; Hub 4 Fahrzeugtyp/Kosten-Links ✓; llms.txt-Sektion + **9/9** Blueprint-Treffer ✓; llms-full.txt-Sektion ✓; /sachverstaendige 200 ✓; beide Cross-Links ✓.
- **Screenshot-Caveat:** Playwright ließ sich aus dem nested Worktree nicht laden (3× `ERR_MODULE_NOT_FOUND`/Error; node_modules-Walk-up unzuverlässig). Visuelle Smoke daher nicht erfasst — Risiko minimal, da alle neuen UI-Elemente verbatim aus bestehenden on-brand-Komponenten (CTA-Pill = Portal-Button-Pattern; Teaser = Section-Spotlight-Pattern; Hub-Cards = Themen-Pillar-Pattern).

## 7-Punkte-Audit
- **Build:** Compiled+TypeScript grün; Export-Fail unrelated (/gutachter-partner).
- **UI-Erreichbarkeit:** Header-CTA + Ratgeber-Link + Footer + 2 Gateways — die zuvor verwaisten Seiten jetzt ab Hauptseite erreichbar.
- **Redundanz:** Teaser als eigene Section (Pattern-Reuse); keine dupliziert.
- **Dead-Code:** keiner; Smoke-Temp entfernt.
- **Spec-Treue:** Doc-35-Fixes 1/3/4/5/6/7 umgesetzt; bewusste Abweichungen (flat-links statt Dropdown = Aaron; 77+Sektion statt 86 = Korrektheit) dokumentiert. Fix 2 (Dropdown) entfällt per Aaron-Entscheid.
- **Inkonsistenz:** Claimondo-Tokens durchgängig, token-audit 0; Umlaute in allen UI-/llms-Texten korrekt.
- **Regression:** additive Links/Sektionen; LandingTopbar/Footer-Eingriffe minimal; Vorteile/FAQ nicht verwaist (Footer); Mobile-Header unverändert.

## Offen / Folge (Doc 37 — „pre release", separat)
Doc 37 identifiziert 6 weitere Verlinkungs-Cluster über Doc 35 hinaus (Kosten-/Wertminderungs-Kanibalisierung P0, Cornerstone-Bridge P0, SV-Sibling-Web P1, Misstrauens-Trio-Sibling-Web P1, Hreflang P1). Nicht Teil dieses PRs — Scope-Entscheidung mit Aaron offen.
