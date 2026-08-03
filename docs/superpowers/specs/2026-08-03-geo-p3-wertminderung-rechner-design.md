# GEO-P3 Sub-1 — Interaktiver Wertminderungs-Rechner (Design)

**Datum:** 2026-08-03
**Status:** Design (brainstorming) — Aaron-Review vor writing-plans
**Branch:** `kitta/geo-p3-wertminderung` (off origin/staging, inkl. P1)
**Autor:** Session 3f0a77b7 (Opus 4.8)

---

## Programm-Kontext

GEO-Programm Tranche **P3 (Flagship-Content)**, erstes von mehreren Sub-Stücken. Priorisiert **datengetrieben** durch die P1-AEO-Messung (`docs/geo/measurements/2026-08-03-aeo-run.md`): interaktive Rechner sind der Top-Code-adressierbare Gap (trifft t02/t08/t09, starker AEO-/Snippet-Magnet), fehlen auf der Flaggschiff-Domain claimondo.de (nur autounfall.io hat welche). **Fast-Follow** nach diesem: Kürzungs-Checker (t09) → SF-Rechner. Eigener Spec/Plan je Sub-Stück.

## Problem

Die Seite `claimondo-marketing/app/[locale]/kfz-gutachter/wertminderung/page.tsx` **existiert und rankt** (Keywords „Wertminderung berechnen", FAQPage-Schema, BGH-Zitate), zeigt aber nur eine **statische Faustregel-Tabelle** (Alter → %-Faktor, mit fixen 10.000-€-Beispielen). Kein interaktives Tool. Die P1-Messung zeigt: für „Wertminderung berechnen" (t08) taucht Claimondo in AI-Antworten nicht auf; ein interaktiver Rechner ist genau die „statische Tabelle → Tool"-Aufwertung, die AI-Engines/Featured-Snippets belohnen.

## Ziel

Ein **interaktiver merkantiler Wertminderungs-Rechner**, eingebettet in die bestehende (rankende) Seite, der **die seiten-eigene Faustregel personalisiert** (Reparaturkosten + Alter → €-Schätzung) — plus `WebApplication`-Schema für AEO. **Erfolgskriterium:** die Seite rendert auf Prod den Rechner, Eingabe → plausible €-Ausgabe, und der Rechner ist methodisch **kohärent** mit der bestehenden Tabelle + FAQ + BGH-Framing.

## Design-Entscheidung — Methode (Verfeinerung ggü. approbiertem Ansatz)

Aaron hatte „reparaturkosten-basiert, autounfall-5–15 %-Heuristik + Faustregel-Umrahmung" approbiert. **Beim Lesen der Seite** zeigte sich: die Faustregel der Seite ist **selbst** reparaturkosten-basiert und **konkreter** als die autounfall-Flach-Heuristik:

| Fahrzeugalter | Faktor (× Reparaturkosten) |
|---|---|
| 1. Jahr | 25 % |
| 2. Jahr | 20 % |
| 3. Jahr | 15 % |
| 4. Jahr | 10 % |
| ab 5. Jahr | Einzelfall |

→ **Der Rechner implementiert die SEITE-eigene Faustregel** (nicht autounfalls flache 5–15 %). Vorteile: (1) **Kohärenz** — Rechner = interaktive Verallgemeinerung der Tabellen-Beispiele (die Beispiele sind exakt `Faktor × 10.000 €`), kein widersprüchliches Reframing nötig; (2) **BGH-Genauigkeit** — die Seite betont „BGH lehnt starre Altersgrenze ab" (VI ZR 357/03, OLG Oldenburg 200.000 km), also **kein** hartes „nicht relevant", sondern „Einzelfall" für alte/hoch-gelaufene Fahrzeuge; (3) die %-Faktoren sind eine generische Faustregel, **keine geschützte Tabelle** (compliance-leicht). Der **Relevanz-Kontext** (Laufleistung, Schadenhöhe) aus der autounfall-Logik bleibt als **weicher Hinweis** erhalten (FAQ-#3-konsistent), nicht als Denial.

## Architektur

Pure Logik (getestet) getrennt von der React-Component (Render → per Prod-Smoke verifiziert). Muster analog P1.

### Komponente 1 — Pure Calc `claimondo-marketing/lib/tools/wertminderung.ts` (neu; `lib/tools/` existiert noch nicht)

```
WM_FAKTOREN: {maxJahr: 1..4, pct: 0.25|0.20|0.15|0.10}[]   // SSoT, MUSS die Tabelle spiegeln
computeWertminderung({ reparaturkosten, alterJahre, km?, wbw? }): {
  kind: 'schaetzung' | 'einzelfall' | 'unvollstaendig',
  betrag?,                  // €-Punkt-Schätzung (gerundet auf 50 €), bei kind='schaetzung'
  pct?,                     // angewendeter Faktor (für die UI-Anzeige "25 % der Reparaturkosten")
  hinweise: string[]        // weiche Kontext-Flags (hohe km / kleiner Schaden), Keys für i18n
}
```
Logik: fehlt `reparaturkosten`/`alterJahre` → `unvollstaendig`. `alterJahre ≥ 5` → `einzelfall`. Sonst `schaetzung` mit `pct = WM_FAKTOREN[alter].pct`, `betrag = round50(pct × reparaturkosten)` — **Punkt-Schätzung, die die Tabellen-Beispiele exakt reproduziert** (Alter 1, 10.000 € → 25 % → 2.500 €). Kontext-Hinweise (weich, kein Gate): `km > 100000` → „eher unterer Rand", `wbw && reparaturkosten < 0.1·wbw` → „kleiner Schaden, Minderwert evtl. gering". **Pure, deterministisch, kein I/O, kein localStorage.**

### Komponente 2 — Client-Component `.../wertminderung/WertminderungRechnerClient.tsx` (neu, co-located)

`'use client'`. Controlled Inputs (Reparaturkosten, Fahrzeugalter, optional km + WBW), ruft `computeWertminderung`, rendert Ergebnis. **Design gebunden:** `claimondo-*`-Tokens (nie raw Hex — CI-Token-Audit), `rounded-ios-*`, `components/shared/DataTable` + `components/landing/AnswerCapsule` fürs Ergebnis, `components/primitives/Button`. **i18n Pflicht:** alle Strings via `useTranslations('wertminderung_rechner')`, Zahlen via `Intl.NumberFormat('de-DE')`. Ergebnis enthält den **Disclaimer** („Faustregel-Orientierung; belastbaren Betrag liefert das Gutachten" — spiegelt `faustregel_note`) + CTA zu `/schaden-melden`.

### Komponente 3 — Schema-Builder `webApplicationSchema()` in `lib/seo/jsonld.ts` (neu)

Es gibt noch **keinen** `WebApplication`-Builder (Lücke). Neu ergänzen (Vorlage: `autounfall-io/lib/jsonld.ts::toolGraph`): `@type: WebApplication`, `applicationCategory: FinanceApplication`, `offers: 0 EUR`, `name`/`url`/`description`. In das bestehende `jsonLdScript([...])`-Array der Seite aufnehmen (neben `serviceSchema`/`faqPageSchema`/`breadcrumbsSchema`).

### Komponente 4 — Page-Edit `.../wertminderung/page.tsx`

Nach der bestehenden Faustregel-`DataTable` (Zeile ~154) + `faustregel_note` (Z. 155–157): eine **Brücken-Zeile** i18n („Rechne mit deinen eigenen Werten:") + `<WertminderungRechnerClient />` mounten. Tabelle **bleibt** (Referenz). `webApplicationSchema(...)` ins `jsonLdScript`-Array. Keine weitere Umstrukturierung.

## Datenfluss

```
Inputs (Reparaturkosten, Alter, km?, WBW?)
  → computeWertminderung  [pure]
  → { kind, lo?, hi?, hinweise[] }
  → Render (AnswerCapsule + Disclaimer + CTA)  [client]
Seite: page.tsx mountet Component nach der Faustregel-Tabelle + webApplicationSchema ins JSON-LD.
```

## Formel (exakt, SSoT)

- `WM_FAKTOREN = [{maxJahr:1,pct:0.25},{maxJahr:2,pct:0.20},{maxJahr:3,pct:0.15},{maxJahr:4,pct:0.10}]` — **muss** die de.json-Tabelle spiegeln (Parität; ein Test asserted die Übereinstimmung, s.u.).
- `alterJahre ≥ 5` → `einzelfall` (kein €, Text „abhängig von Laufleistung & Marktwert; auch ältere Fahrzeuge können Anspruch haben — BGH VI ZR 357/03").
- sonst `pct = WM_FAKTOREN.find(f => alterJahre ≤ f.maxJahr).pct`; `betrag = round50(pct·rep)` (Punkt-Schätzung, reproduziert die Tabellen-Beispiele exakt).
- Kontext-Hinweise weich (kein Denial): `km>100000` → unterer-Rand-Hinweis; `wbw && rep<0.1·wbw` → kleiner-Schaden-Hinweis.

## Fehlerbehandlung / Edge

- Fehlt Reparaturkosten oder Alter → `unvollstaendig` → UI zeigt „Bitte Reparaturkosten und Alter angeben" (kein Ergebnis, kein Crash).
- Nicht-numerische Eingabe → als 0/ignoriert behandeln (Number-Coerce, `NaN`-Guard).
- `alterJahre ≥ 5` → `einzelfall`-Text (nie hartes „nicht relevant" — BGH-konform).

## Testing

- **Vitest** (claimondo-marketing hat eigenes `vitest run` + `vitest.config.ts`): `lib/tools/wertminderung.test.ts` — Faktor-je-Alter (1→0.25 … 4→0.10), `einzelfall` ab Jahr 5, `unvollstaendig` bei fehlenden Inputs, Rundung auf 50 €, Kontext-Hinweise (hohe km / kleiner Schaden), **Paritäts-Test `WM_FAKTOREN` == de.json-`faustregel`-Faktoren** (verhindert Drift Rechner↔Tabelle).
- Pure Calc unit-getestet; Client-Render + i18n-Vollständigkeit → per **Regel-4-Prod-Smoke** verifiziert.
- ⚠ **Plan-Klärung:** ob claimondo-marketings vitest in CI läuft (der Haupt-CI-vitest-Job scannt `src/**`+`scripts/lib/**`, nicht das Marketing-Sub-Package) — falls nicht, ist der lokale Lauf das Gate + im PR vermerken.

## Regel 4 (scharf — nutzersichtbare Route/UI)

Nach Deploy: **Prod-Render-Smoke** von `https://claimondo.de/kfz-gutachter/wertminderung` (bzw. der Marketing-Prod-Domain): (1) Seite rendert 200 + Rechner sichtbar (kein leerer Shell — Redirect-Stub-Klasse); (2) Eingabe Reparaturkosten=10000, Alter=1 → Ausgabe enthält „2.500 €" (Faktor 25 % — matcht das Tabellen-Beispiel); (3) Alter=6 → „Einzelfall"-Text. ⚠ **Plan-Klärung:** Marketing-Deploy-Pfad (wie kommt claimondo-marketing auf Prod — eigener VPS-Build?) → bestimmt, ob der Smoke in dieser Session oder als Handoff läuft.

## Nicht in diesem Scope (YAGNI)

- Andere Rechner (Kürzungs-Checker/SF/Totalschaden) → Fast-Follow, eigene Sub-Scopes.
- localStorage/Persistenz, Backend, Multi-Step-Wizard.
- Präzise „ab 5. Jahr"-Sub-Berechnung (bewusst „Einzelfall" — matcht die Tabelle).
- Native-App-Port.

## Abhängigkeiten / offene Plan-Items

- Bestehende Marketing-Komponenten (`DataTable`, `AnswerCapsule`, `primitives/Button`), `lib/seo/jsonld.ts`, next-intl 6 Locales.
- **i18n:** neuer Namespace `wertminderung_rechner.*` in **allen 6** `i18n/messages/{de,en,tr,ar,ru,pl}.json` (Paritäts-Gate `check:i18n`). DE maßgeblich; 5 Übersetzungen = der einzige echte Mehraufwand.
- claimondo-marketing-Test-CI-Abdeckung + Marketing-Deploy-Pfad (s.o.) — im Plan klären.
