# GEO — Nutzungsausfall-Rechner (claimondo.de) — Design

**Datum:** 2026-08-11
**Status:** Design approved (Aaron 11.08.) → Bau
**Branch:** `kitta/geo-nutzungsausfall-rechner` (off origin/staging)

---

## Warum

Companion zum Wertminderungs-Rechner (PR #4963). **Empirisch validiert, nicht vermutet:** `/nutzungsausfall` ist mit **1.084 HTTP-200 in 11 Tagen** (01.–11.08., nginx-Log VPS) der **stärkste Content-Pfad auf autounfall.io** — die Nachfrage nach genau diesem Thema ist belegt. Auf claimondo.de ist `/kfz-gutachter/nutzungsausfall` aktuell **404**.

**GEO-Hebel:** ein interaktiver Rechner ist `webApplicationSchema`-fähig (bisher genau 1 Consumer: Wertminderung), beantwortet eine High-Intent-Query („Nutzungsausfall berechnen") answer-first und liefert zitierbare Zahlen.

## Route + Kannibalisierung

Neue Route **`/kfz-gutachter/nutzungsausfall`** (frei, symmetrisch zu `…/wertminderung`). Der bestehende Glossar-Spoke **`/haftpflicht/nutzungsausfall`** (H3.6, live, MD-basiert) bleibt der **rechtlich-tiefe Zwilling** — gegenseitige Cross-Links. Exakt das Entkannibalisierungs-Muster, das die WM-Seite schon fährt (`page.tsx:236-240`).

## Datenbasis — die zentrale Entscheidung (Aaron 11.08.)

Das Repo trägt **drei inkompatible Kalibrierungen**: App-Punktwerte (`src/lib/anspruch/nutzungsausfall-klasse.ts`, 23–175 €), autounfall-io-**Spannen** (`autounfall-io/lib/tools/rechner-data.ts`, 23–219 €), Marketing-MD-Aggregat (5 Klassen, 27–175 €).

**Gewählt: die autounfall-io-Spannen.** Zwei Gründe:
1. **Konsistenz nach außen** — claimondo.de und autounfall.io dürfen für dieselbe Frage keine widersprüchlichen Zahlen zeigen; widersprüchliche Signale untergraben die Zitierfähigkeit bei KI-Systemen.
2. **Rechtlich sauberer** — der autounfall-io-Header sagt explizit „Orientierungs-Spannen aus research/, **keine geschützten Tabellen**". Die echte Sanden/Danner-Liste ist ein kostenpflichtiges, urheberrechtlich geschütztes Werk; Punktwerte lesen sich wie eine 1:1-Reproduktion, Spannen sind eigene Orientierungswerte.

```
A [23,27] · B [29,35] · C [38,43] · D [50,59] · E [59,65] · F [65,79]
G [79,99] · H [99,119] · J [119,139] · K [139,175] · L [175,219]     (€/Tag, ohne "I")
```

**Klassen-Bezeichnungen + Beispielfahrzeuge** kommen aus der App-Migration `20260707225412` (unabhängig von den €-Werten, dieselben Buchstaben) — sie machen den Rechner erst benutzbar: niemand weiß, ob sein Auto „Klasse E" ist, aber „VW Passat, BMW 3er" erkennt jeder.

⚠ **Dokumentierte Konsequenz:** Der Marketing-Rechner zeigt damit andere Zahlen als die App-Anspruchsrechnung (`STANDARD_KLASSE_SAETZE`). Vertretbar — das Marketing-Tool ist ein Schätz-Tool mit Disclaimer, die App macht die verbindliche Rechnung. Die Drift-Bereinigung über alle drei Quellen ist ein **eigener Follow-up** (zieht `src/` + autounfall-io mit rein).

## Der Differenzierer: Alters-Rückstufung

Die App kennt `altersRueckstufung` (`>10 J → 2 Klassen runter`, `>5 J → 1 Klasse`, geclamped bei A). **Die meisten Online-Rechner ignorieren das.** Bei uns fließt es ein und wird erklärt — die inhaltliche Kante, analog zur Vorschaden-Dimension beim WM-Rechner.

## Architektur (Vorlage = WM-Rechner, 1:1)

1. **`claimondo-marketing/lib/tools/nutzungsausfall.ts`** — pure Calc, zero deps, diskriminiertes `kind`-Union (`unvollstaendig | schaetzung`), `hinweise: string[]` als i18n-Key-Fragmente. Enthält `NA_KLASSEN` (Spanne + Bezeichnung + Beispiele) als kommentierte SSoT-Kopie.
2. **`NutzungsausfallRechnerClient.tsx`** — `'use client'`, `useState` + `useMemo`, Live-Compute ohne Server-Roundtrip, Ergebnis in `<AnswerCapsule>`.
3. **`page.tsx`** — Prosa + Rechner + Klassen-Tabelle; JSON-LD (`serviceSchema` + **`webApplicationSchema`** = Consumer #2 + `faqPageSchema` + `breadcrumbsSchema`); Sitemap-Eintrag; Hub-Verlinkung in `kfz-gutachter/page.tsx`.
4. **i18n** — `kfz_gutachter_nutzungsausfall` + `nutzungsausfall_rechner` + `page_meta`-Eintrag, **alle 6 Locales** (Paritäts-Gate `check:i18n`).

**Eingaben:** Fahrzeugklasse (Select, Label = „E · Mittelklasse — VW Passat, BMW 3er") · Ausfalltage (Zahl) · Fahrzeugalter (optional → Rückstufung).
**Ausgabe:** `Spanne × Tage` als Summen-Spanne + Hinweise (Rückstufung angewandt · lange Dauer = im Reparaturfall meist auf ~12–14 Tage begrenzt · exakte Klasse legt der Gutachter fest).

## Testing / Verifikation

- **vitest (pure):** Spannen-Multiplikation, Rückstufungs-Grenzfälle (5/6/10/11 Jahre), Clamping bei A, ungültige Eingaben, Klassen-Vollständigkeit (11 Klassen, kein „I").
- **Turbopack-Compile + Projekt-tsc** grün. ⚠ Voller Static-Prerender lokal blockiert (Marketing-Supabase-Env, unrelated `/feed.json`) → Gate = `deploy-vps-marketing` + Regel-4-Prod-Smoke.
- **Regel 4:** nach Deploy `claimondo.de/kfz-gutachter/nutzungsausfall` → 200, Rechner sichtbar, Klasse E + 14 Tage → `826–910 €`, Alter 12 → Rückstufung auf C sichtbar.

## Nicht in Scope

Drift-Bereinigung der drei Tabellen (eigener Follow-up) · Modell-/Typklassen-Suche („welche Klasse hat mein Auto?" per Fahrzeug-DB) · Mietwagen-Vergleichsrechner · Änderungen an autounfall.io.
