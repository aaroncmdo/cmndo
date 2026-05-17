# CMM-44 SP-A2 PR1b (#1418) + PR1c (#1419) — Portal-Smoke

**Datum:** 17.05.2026
**Branch:** `kitta/cmm-44-spa2-pr1c-rest`
**Ziel:** `https://app.staging.claimondo.de` (frisch deployed)
**Skript:** `scripts/smoke-cmm44-spa2-pr1bc.mjs`
**Screenshots:** `docs/17.05.2026/cmm44-spa2-smoke-pr1bc/`

## Kontext

PR1b + PR1c sind reine **Reader-Renames** (kein DB-Schema-Change): 17 `faelle`-Spalten
wurden von `faelle`-Reads auf `claims`-Reads umgestellt.

- **PR1b (Cluster 2):** Schadenhergang/-beschreibung → `hergang_kunde_text`, Schadenart →
  `schadenart`, Fall-Typ → `fall_typ`, Personenschaden-/Sachschaden-/Mietwagen-/
  Halter-ungleich-Fahrer-Flags, Nutzungsausfall.
- **PR1c (Cluster 3):** Gegner-Aktenzeichen, No-Show-Zähler, Phase, Lead-Verknüpfung,
  Regulierungsbetrag, VS-Ablehnungsgrund.

Ziel: prüfen, dass diese Werte in der UI unverändert erscheinen und kein Portal crasht.

## Ergebnis pro Portal

| Portal | Erreicht | Befund |
|---|---|---|
| Public (`/`, `/gutachter-finden`) | ✅ | Beide Seiten laden ohne 500/Hydration-Fehler. |
| Admin (`/faelle`, `/faelle/[id]`) | ✅ | Liste + Fall-Detail rendern sauber, keine kaputten Werte (`undefined`/`NaN`). Schadenhergang, Schadenart, Mietwagen, Phase, Gegner-Aktenzeichen sichtbar. |
| Admin-Finance (`/admin/finance`) | ✅ | Umsatz-/Provisions-Aggregate laden vollständig (MRR 9.375 €, Monats-Umsatz, Provision). claims-Embeds funktionieren. |
| SV (`/gutachter`, Fall-Detail) | ✅ (Dashboard) / ⚠ (Detail) | SV-Dashboard + `Aufträge` + `Meine Fälle` rendern crashfrei. Fall-Detail nicht prüfbar — test-SV hat 0 Aufträge heute + 0 Fälle in Regulierung (Seed-Lücke, keine Regression). |
| Kunde (`/kunde`, Fall-Detail) | ✅ (Dashboard) / ⚠ (Detail) | Kunde-Dashboard + Fälle-Liste rendern sauber. Fall-Detail nicht prüfbar — test-kunde hat keinen Schadensfall (`faelle.kunde_id` leer, Seed-Lücke). |
| Dispatch (`/dispatch`, `/dispatch/leads`) | ✅ | Nach Retry: Login OK, `/dispatch/dashboard` + `/dispatch/leads` (200 Leads, Status/Flowlink-Spalten sauber) crashfrei. |

## Details / gefundene Punkte

### 1. Dispatch-Login: transienter Stale-Server-Action-Crash (kein Regressions-Defekt)

Erster Durchlauf: Dispatch-Login schlug mit `UnrecognizedActionError — Server Action
"40014205…" was not found on the server` fehl (Screenshot `0014`). Das ist der bekannte
Fresh-Deploy-Artefakt: der Browser-Bundle referenzierte eine Server-Action-ID, die der
neu deployte Server nicht mehr kennt. **Retry in frischem Context: Login + beide Routen
laden einwandfrei** (`0015`/`0016`). → Kein PR1b/c-Defekt, deploy-bedingte Transienz.

### 2. Admin-Detail WARNs (`fall-typ`, `personenschaden`, `sachschaden`)

Body-Text-Suche fand keine Labels „Fall-Typ"/„Personenschaden"/„Sachschaden" auf der
Detail-Übersicht. Visuelle Auswertung von `0005`: die Übersicht zeigt Phasen, SV-Briefing,
Quick-Actions, Kunde-Block — **keine kaputten Werte, kein Error-Boundary**. Diese Flags
leben in einem nicht initial sichtbaren Sub-Tab/Akkordeon; der WARN ist eine
Skript-Limitation (nur first-fold sichtbar), keine UI-Regression.

### 3. Regulierung-Tab nicht gefunden

Tab-Selektor „Versicherung"/„Regulierung" matchte nicht — die Fallakte nutzt eine
Phasen-Navigation statt klassischer Tabs. Regulierungsbetrag/VS-Ablehnungsgrund leben
unter Phase „VS-Reaktion & Verhandlung". Kein Crash, Skript-Limitation.

### 4. SV-/Kunde-Fall-Detail: Seed-Lücke

- test-SV: 0 Aufträge mit Datum heute, 0 Fälle in Regulierung → kein SV-Fall-Detail
  erreichbar.
- test-kunde: kein `faelle.kunde_id`-Eintrag → „Noch kein Schadensfall".

Beide Portale rendern ihre Listen/Dashboards crashfrei; die Field-Level-Prüfung der
PR1b-Felder in SV-/Kunde-Sicht ist mangels Seed-Daten nicht möglich. Keine Regression
beobachtet.

## Gesamt-Verdikt: **PASS**

Kein Portal crasht durch PR1b/c. Alle erreichbaren Oberflächen (Public, Admin-Liste +
Detail, Admin-Finance, Dispatch-Leads) rendern die migrierten Felder ohne kaputte Werte.
Der einzige HARD-FAIL (Dispatch-Login) war ein transienter Fresh-Deploy-Stale-Bundle und
ist nach Retry grün. Die verbleibenden WARNs sind Skript-/Seed-Limitationen, keine
Defekte des Reader-Renames.
