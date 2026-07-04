# Werkstatt-Finder-Anfrage SP-B — Flow-Weiche im Schaden-melden — Design

> Sub-Projekt B (Kern) des Werkstatt-Finder-Anfrage-Features. Baut auf SP-A (`abrechnungsweg`-Feld + reine `resolveAbrechnungsweg`-Logik). Verfeinert den **bestehenden** Quali-Gate des `/flow`-Schaden-melden-Flows zu einem **3-Wege-Abrechnungsweg-Router**. Aaron-Entscheidung (04.07.): die Weiche sitzt **im Schaden-melden-Flow**, nicht in einer neuen Strecke.

**Datum:** 2026-07-04 · **Branch:** `kitta/schaden-finder-abrechnungsweg` (off staging, stackt auf SP-A #3624) · **Vorgänger:** `2026-07-04-schaden-finder-abrechnungsweg-fundament-design.md`

---

## 1. Ziel & bestätigtes Modell

Der bestehende Flow-Quali-Gate kennt heute nur **binär**: `gegner → weiter`, `eigenverantwortung → Abbruch (KaskoEndansicht, Lead disqualifiziert)`. SP-B **verfeinert nur den Eigenverantwortung-Zweig** in eine 2. Frage → 3 Abrechnungswege:

| schuldfrage | eigene Versicherung? | abrechnungsweg | Flow-Verhalten |
|---|---|---|---|
| `gegner` | — | `haftpflicht` | **unverändert** — kanonischer Claim-Flow (SV/Gutachten/SA/Regulierung) |
| `eigenverantwortung` | **ja** | `kasko` | **≈ unverändert** — `KaskoEndansicht` (Hinweis „melde bei deiner Versicherung"); Lead wie heute disqualifiziert; zusätzlich `abrechnungsweg='kasko'` |
| `eigenverantwortung` | **nein** | `selbstzahler` | **NEU** — NICHT disqualifizieren; `reparaturwunsch='reparatur'` armiert das bestehende Werkstatt-Gate → Kunde in `FlowWerkstattStep` |
| `unklar` / leer | — | `null` | **unverändert** — `weiter_mit_flag` (Dispatcher-Review) |

Der Router nutzt die reine SP-A-Funktion `resolveAbrechnungsweg({ schuldfrage, ueberEigeneVersicherung })`. Deren Vokabular (`'gegner'`/`'eigenverantwortung'`) ist **exakt** das der `QualiOptionen` (`QUALI_VALUES = ['gegner','unklar','eigenverantwortung']`) → kein Mapping nötig.

## 2. Bestandsaufnahme (Code verifiziert, origin/staging)

- **`QualiOptionen`** (`src/components/self-service/QualiOptionen.tsx`, geteilt `/flow` + `/anfrage`): `QUALI_VALUES = ['gegner','unklar','eigenverantwortung']` (deutscher Server-/State-Vertrag). Präsentational, aktionsfrei.
- **`bewerteSchuldfrage`** (`src/lib/self-service/quali-gate.ts`, rein): `eigenverantwortung → 'abbruch'`, `gegner → 'weiter'`, sonst `'weiter_mit_flag'`. Geteilt `/flow` + `/anfrage`.
- **`FlowQualiStep`** (`src/app/flow/[token]/FlowQualiStep.tsx`): rendert `QualiOptionen` → `speichereQualiFlow`; bei `abbruch` → `KaskoEndansicht`.
- **`speichereQualiFlow`** (`src/app/flow/[token]/self-service-actions.ts`): `abbruch` → Lead `status='disqualifiziert'`, `disqualifiziert_grund_key='eigenverschulden'`; sonst `schuldfrage`-Update.
- **`FlowWizardKfz`** (`FlowWizardKfz.tsx`): `StepId` u.a. `'quali'|'werkstatt'|'sa'|'account'`; Werkstatt-Step server-gegated (`needsWerkstatt = brauchtWerkstattVermittlung`, beim Mount gecappt). `FlowWerkstattStep` existiert (Partner-Werkstatt-Picker).
- **`convertLeadToClaim`** (`src/lib/leads/convert-lead-to-claim.ts`): trägt `reparaturwunsch` + `reparatur_werkstatt_*` + `schadenskategorie` Lead→Claim (Record-Cast, Type-Lag). Claim-Erzeugung via `signSAandCreateFall` (SA-Step, `actions.ts:591` → `convertLeadToClaim`). `reparatur_termine`-Row wird bei `reparatur_werkstatt_id` + `reparatur_wunschtermin` automatisch angelegt (SP2 T4, schon vorhanden). `createKundeAccount` (Account-Step) existiert.

## 3. Dekomposition

### SP-B1 — Quali-Router (JETZT)
1. **`FlowQualiStep`**: nach Wahl `eigenverantwortung` eine **2. Ja/Nein-Frage** rendern („Kannst du den Schaden über eine **eigene (Voll-/Teil-)Kaskoversicherung** regulieren?"). Ja → Kasko-Zweig, Nein → Selbstzahler-Zweig. UI additiv; `QualiOptionen` (geteilt) **unberührt**.
2. **`speichereQualiFlow`**: optionaler Param `ueberEigeneVersicherung?: boolean`. Ableitung via `resolveAbrechnungsweg`:
   - `haftpflicht` → `abrechnungsweg='haftpflicht'`, sonst unverändert (weiter).
   - `kasko` → `abrechnungsweg='kasko'` + **heutiges Abbruch-Verhalten** (disqualifiziert, `KaskoEndansicht`).
   - `selbstzahler` → `abrechnungsweg='selbstzahler'` + `reparaturwunsch='reparatur'`; **NICHT** disqualifizieren; `ergebnis='weiter'`.
   - `null` (unklar/gegner-ohne-Versicherungsfrage) → unverändertes Bestandsverhalten.
3. **`convert-lead-to-claim.ts`**: `abrechnungsweg`-Carry Lead→Claim (1 additive Record-Cast-Zeile neben `reparaturwunsch`).
4. **Ergebnis:** Router live. Haftpflicht + Kasko **fertig**. Selbstzahler qualifiziert + im bestehenden Werkstatt-Step (weist Werkstatt am Lead zu). Der Claim-Abschluss folgt in SP-B2.

### SP-B2 — Selbstzahler-Abschluss (DANACH)
- Neuer schlanker Trigger `erzeugeSelbstzahlerClaim(token)`: reuse `convertLeadToClaim` **ohne** `svIdFromTermin` + **ohne** `signatureUrl` = partieller Claim (kein SV/Gutachten/SA). Verdrahtet nach Werkstatt- + Account-Step.
- Flow-Step-Routing selbstzahler: `quali → werkstatt → account → claim → portal`.
- `reparatur_termine` automatisch (SP2 T4). Portal-Eintritt (der reduzierte Stepper selbst = SP-D).

## 4. Reine Logik / Testbarkeit

- SP-A `resolveAbrechnungsweg` (schon 8/8 getestet) deckt das gesamte Mapping — SP-B1 verdrahtet sie nur.
- Falls die Routing-Entscheidung in `speichereQualiFlow` nicht trivial testbar ist (Server-Action mit Admin-Client): eine **reine** Helferfunktion extrahieren (z.B. `qualiFlowOutcome(schuldfrage, ueberEigeneVersicherung) → { abrechnungsweg, disqualifizieren, reparaturwunsch, ergebnis }`) und die testen (TDD). Die Server-Action wird ein dünner Wrapper.

## 5. Abgrenzung (SP-B NICHT)

- **SP-C** (Standalone-Werkstatt-Karte) + **SP-D** (reduzierter Portal-Reparatur-Stepper) → eigene Sub-Projekte.
- **Keine** `reparatur_termine`-Änderung, **keine** Lead-/Claim-RLS-Änderung.
- **`QualiOptionen` unverändert** (geteilt mit `/anfrage`) — die Versicherungs-Folgefrage ist `/flow`-lokal in `FlowQualiStep`.
- **`bewerteSchuldfrage` unverändert** (backward-compat `/anfrage`) — der `abrechnungsweg`-Router ist additiv daneben.

## 6. Koordination

- **Hot-aar-956-Files:** `FlowQualiStep.tsx`, `self-service-actions.ts`, `FlowWizardKfz.tsx` (SP-B2). Aktuell **3 Sessions** auf `aar-956` — aber alle im **Finder** (Map/Wizard/Embed/gutachter-finder-actions), NICHT im `/flow`-Quali. `git diff staging...origin/aar-956` für diese Files = **leer** (committed berührt sie nicht). Strategie: strikt additiv, atomar committen; der Edit-Collision-Guard schützt zur Edit-Zeit (warnt bei Fremd-Touch < 30 Min).
- `convert-lead-to-claim.ts`: additive 1-Zeile; `#3610 werkstatt-unified-view` berührt die Datei nicht.

## 7. Sprache & Build-Hinweise

- **Neue UI-Strings sind nutzersichtbar → echte Umlaute Pflicht** (`ä/ö/ü/ß`). Die Versicherungs-Folgefrage zunächst **hardcoded-DE mit Umlauten** (i18n als Follow-up, konsistent mit SP4c); `check:i18n-render` grün halten.
- **Voller Build erforderlich** (nicht nur tsc): SP-B1 fasst Route-Komponenten (`FlowQualiStep`, `FlowWizardKfz`) + eine Server-Action an — Next.js-Validator-Fehler zeigen sich erst im Build (AGENTS.md §Audit-1).

## 8. Definition of Done (SP-B1)

- [ ] `FlowQualiStep`: Versicherungs-Folgefrage nach `eigenverantwortung` (additiv, Umlaute).
- [ ] `speichereQualiFlow`: setzt `abrechnungsweg` je Weg korrekt; `selbstzahler` NICHT disqualifiziert + `reparaturwunsch='reparatur'` gesetzt; Kasko/gegner/unklar unverändert.
- [ ] `convert-lead-to-claim.ts`: `abrechnungsweg`-Carry.
- [ ] Reine Routing-Helfer TDD-getestet; **voller Build grün**, tsc 0, 3 Ratchets 0-neu, `check:i18n` grün, 7-Punkt-Audit.
- [ ] Regressions-Beweis: bestehende Pfade (gegner→haftpflicht, eigenverantwortung→kasko, unklar) verhalten sich unverändert.
- [ ] Post-Merge Prod-Smoke: `eigenverantwortung` + „nein" → Lead `abrechnungsweg='selbstzahler'`, `reparaturwunsch='reparatur'`, **nicht** disqualifiziert; Werkstatt-Step erscheint.
