# CMM-44 SP-A2 PR1a — Portal-Smoke (Schadenort + Datum Reader-Rename)

**Datum:** 2026-05-17
**Branch:** `kitta/cmm-44-sp-a2-semantik-duplikate`
**Ziel:** `https://app.staging.claimondo.de` (frisch deployed, PR #1417 = Commit `88103233` auf staging)
**Skript:** `scripts/smoke-cmm44-spa2-pr1a.mjs` (+ Hilfs-Proben `scripts/probe-spa2-pr1a-*.mjs`)
**Screenshots:** `docs/17.05.2026/cmm44-spa2-smoke-pr1a/`

## Gesamt-Verdikt: **PASS**

Kein Portal crasht. Die PR1a-relevanten Schadenort-Werte (`claims.schadenort_adresse/_plz/_ort`)
erscheinen im Admin-UI **korrekt und unverändert**, obwohl die alten `faelle.schadens_*`-Spalten
des Test-Falls leer sind — der claims-Fallback greift wie vorgesehen. Keine Hard-Fails.

## Kontext der PR1a-Änderung

PR1a hat 11 `faelle`-Reads (Schadenort + Datum) auf `claims` umgestellt — kein DB-Schema-Change.
Der zentrale Test-Fall (`65a7640b-…`, Claim `5b2757e1-…`) ist der **einzige** Fall in der
Staging-DB mit gefüllten Schadenort-Daten:

- `claims.schadenort_ort = "Berlin"`, `schadenort_adresse = "Kaiserdamm 88"`, `schadenort_plz = "14057"`, `schadentag = "2026-05-13"`
- `faelle.schadens_ort / schadens_adresse / schadens_plz / schadens_datum / unfallort / unfalldatum` = **alle NULL**

Damit ist dieser Fall der ideale Prüfstein: ohne funktionierenden claims-Fallback bliebe der
Schadenort im UI leer.

## Befunde je Portal

### Public — erreicht: ✅
- `/` und `/gutachter-finden` laden ohne 500, ohne Console-Errors, ohne Hydration-Overlay.
- Screenshots: `0001-public-home.png`, `0002-public-gutachter-finden.png`

### Admin — erreicht: ✅ (PR1a-Kern bestätigt)
- `/faelle` (Liste) lädt sauber. Screenshot: `0004-admin-faelle-liste.png`
- `/faelle/65a7640b-…` (Detail) lädt sauber. Screenshots: `0005-admin-fall-detail.png`,
  `0006-admin-fall-schaden-tab.png`, `probe-admin-unfall-card.png`
- **Schadenort-Werte sichtbar (claims-Fallback verifiziert):** in der "Unfall"-SectionCard
  der Übersicht erscheinen `Schadens-Adresse = Kaiserdamm 88`, `PLZ = 14057`, `Ort = Berlin`.
  Die Werte stehen in `<input value="…">`-Feldern (Edit-Mode-Card) und stammen aus
  `claims.schadenort_*` via `schema.ts`-Fallback `f.schadens_* ?? c?.schadenort_*`.
  `claimStammdatenFallback` in `faelle/[id]/page.tsx` lädt die claims-Werte korrekt.
- Schadenort-Sektion + Schadendatum-Label vorhanden.
- **Anmerkung (NICHT PR1a):** Das Feld "Schadensdatum" zeigt leer (`dd.mm.yyyy`).
  Ursache: `claimStammdatenFallback` selektiert `schadenort_adresse/_plz/_ort`, aber **kein**
  `schadentag`; `schema.ts:170` (`schadens_datum`) hat keinen claims-Fallback. Dieser Code
  stammt aus Commit `269f73d8` ("Stammdaten-Claim-Fallback für 5 CMM-Brücken-Felder") —
  **vor PR1a**. PR1a hat `page.tsx` und `schema.ts` nicht angefasst (Diff: nur
  `_actions/stammdaten.ts` betroffen). → Vorzustand außerhalb PR1a-Scope; Kandidat für einen
  späteren SP-A2-PR (`schadentag` in `claimStammdatenFallback` + `schema.ts`-Fallback ergänzen).
- **Schadenort-Suche:** Auf `/faelle` wurde kein Such-Input gefunden (Filter-UI nutzt evtl.
  ein anderes Pattern als `input[type=search]`). Der separate claims-Such-Query aus PR1a
  (`api/search/route.ts`, 51 Zeilen geändert) konnte per Smoke nicht via UI-Input getriggert
  werden — WARN, kein Fail. Empfehlung: manueller Such-Check oder gezielter Suchfeld-Selektor.
- Console: 1× `Minified React error #418` (Hydration HTML-Mismatch). Bekanntes, PR1a-fremdes
  Issue (vgl. JSONB-Shape-Drift / RSC-Stub-Memory) — kein Seiten-Crash.

### SV (Gutachter) — erreicht: ✅
- `/gutachter` (= `/gutachter/heute`) lädt sauber. Screenshot: `0008-sv-dashboard.png`
- SV-Fall-Detail `/gutachter/fall/65a7640b-…` lädt **ohne Crash** — vollständige Fallakte
  ("Smoke Szenario", Termin/Beschriftung/Gutachten, "VOR ORT EINSCHÄTZUNG"-Block).
  Screenshot: `0009-sv-fall-detail.png`
- Die Schadenort-Werte des Berlin-Falls erscheinen hier **nicht** — erwartetes Verhalten:
  test-sv hat für den Berlin-Fall keinen `auftraege`-Eintrag (`claims.sv_id` zeigt zwar auf
  test-sv, aber die SV-Detailseite rendert den dem SV via Auftrag zugeordneten Fall). Saubere
  RLS-/Zuordnungs-Filterung, kein Defekt.

### Kunde — erreicht: ✅ (Detail mit Test-Daten-Limit)
- `/kunde` (Dashboard) + `/kunde/faelle` (Liste) laden sauber.
  Screenshots: `0011-kunde-dashboard.png`, `0012-kunde-faelle-liste.png`
- `/kunde/faelle/65a7640b-…` zeigt eine saubere Error-Boundary
  "Fehler beim Laden — Bitte versuchen Sie es erneut." (kein React-Crash, kein weißer Screen).
  Screenshot: `0013-kunde-fall-detail.png`
- Ursache: **Test-Daten-Limit.** Der Berlin-Fall gehört einem anonymen Smoke-Kunden
  (`faelle.kunde_id = 80ff9fe2-…`), nicht test-kunde. test-kunde besitzt **keinen** Fall
  (`faelle?kunde_id=eq.<test-kunde>` liefert `[]`). Die Kundensicht filtert zu Recht einen
  Fremdfall weg. → Kunde-Detail mit echten Schadenort-Daten ist mit dem aktuellen Seed nicht
  prüfbar; **kein PR1a-Regression**. Der PR1a-Lesepfad für Kunde (`lib/claims/get-kunde-faelle.ts`,
  40 Zeilen geändert) ist per Code-Review verifiziert: mappt `claims.schadenort_*` → die
  `schadens_*`-Property-Namen, die `StammdatenReadSection` (`fall.schadens_ort` etc.) konsumiert.

### Dispatch — erreicht: ✅
- `/dispatch` (= `/dispatch/dashboard`) und `/dispatch/leads` laden ohne Crash, ohne 5xx.
  Screenshots: `0015-dispatch-root.png`, `0016-dispatch-leads-liste.png`

## Zusammenfassung der Findings

| Ergebnis | Anzahl |
|---|---|
| OK | 13 |
| WARN | 6 |
| HARD-FAIL | 0 |

Die 6 WARN sind allesamt **keine PR1a-Defekte**:
1. Admin Schadenort-Suche — kein Such-Input-Selektor gefunden (UI-Pattern-Mismatch, manuell nachprüfen)
2. Admin `schadentag`-Anzeige leer — Vorzustand vor PR1a (Commit `269f73d8`), out of scope
3.+4. SV Schadenort-Sektion/-Werte — SV rendert seinen Auftrag-Fall, nicht den Berlin-Fall (RLS)
5.+6. Kunde Schadenort-Sektion/-Werte — Berlin-Fall gehört nicht test-kunde (Test-Daten-Limit)

## Empfehlungen für Folge-PRs (nicht blockierend für PR1a)

- **SP-A2 Folge:** `schadentag` in `claimStammdatenFallback` (`faelle/[id]/page.tsx`) +
  claims-Fallback für `schadens_datum` in `lib/stammdaten/schema.ts:170` ergänzen, damit das
  Admin-Schadensdatum bei claims-only-Daten nicht leer bleibt.
- **Seed:** Einen Test-Fall anlegen, der test-kunde gehört (`faelle.kunde_id = test-kunde`)
  UND `claims.schadenort_*` gefüllt hat — dann ist die Kunde-Detail-Schadenort-Anzeige
  per Smoke prüfbar.
