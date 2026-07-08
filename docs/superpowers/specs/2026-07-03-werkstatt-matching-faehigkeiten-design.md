# Werkstatt-Matching: Fähigkeiten + Schadenskategorie (SP1) — Design

**Datum:** 2026-07-03
**Sub-Projekt 1 von 4** der Kunde→Werkstatt-Vermittlung-Erweiterung (SP2 = reparatur_termine-Lifecycle, SP3 = Gutachten+OCR an Werkstatt, SP4 = Kunde-Einstiege — jeweils eigene Spec).

## Kontext

Der Kunde soll zur **richtigen** (fachlich passenden) **und nächsten** Werkstatt vermittelt werden. Heute ist das Matching rein geografisch (`findWerkstaetten`/`rankWerkstaetten` in `src/lib/werkstatt/finder.ts`: Haversine-Distanz + `status='aktiv'`). Es fehlen zwei Dinge:
1. **Werkstatt-Fähigkeiten** — `werkstaetten` hat KEINE Kapabilitäts-Spalte (kein Lack/Karosserie/Glas).
2. **Physische Schadenskategorie** — `claims.schadenart` ist die **Versicherungsart** (`haftpflicht|vollkasko|teilkasko|eigenverschulden|unbekannt`), NICHT die physische Schadensart. Es gibt heute kein Feld „was ist beschädigt".

Der einzige fachliche Hinweis (Lack-/Karosserie-/AK-Stunden im Gutachten) kommt erst NACH der Vermittlung → für das Vermittlungs-Matching muss die Kategorie vom **Kunden** kommen (Entscheidung Aaron).

## Ziel

Fachliches Matching: der Kunde gibt bei Reparaturwunsch die physische Schadenskategorie an, Werkstätten tragen ihre Fähigkeiten, und der Vermittlungs-Picker rankt fachlich passende Werkstätten zuerst — **ohne den Kunden je leer ausgehen zu lassen**.

## Vokabular (Schadenskategorie = Werkstatt-Fähigkeit, gleiche Tokens)

`karosserie` · `lackierung` · `mechanik` · `glas` · `smart_repair` — plus `unbekannt` (nur Schadenskategorie; = kein Filter).

**Semantik `werkstaetten.faehigkeiten`:** die Tätigkeiten, die die Werkstatt anbietet. **Leer/NULL = Vollservice** (deckt alle Kategorien ab) → Bestandspartner werden NICHT ausgeschlossen. Erst wer explizit narrowt (z.B. nur `['glas']`), wird für fremde Kategorien zurückgestuft.

## DB-Änderungen (additive Migrationen, Plugin/Regel 2)

1. **`werkstaetten.faehigkeiten text[]`** (nullable). COMMENT: „Werkstatt-Fähigkeiten (karosserie/lackierung/mechanik/glas/smart_repair); NULL/leer = Vollservice = alle Kategorien."
2. **`leads.schadenskategorie text`** + **`claims.schadenskategorie text`** (nullable), je mit CHECK `schadenskategorie IS NULL OR schadenskategorie = ANY(ARRAY['karosserie','lackierung','mechanik','glas','smart_repair','unbekannt'])`.
3. **Carry-over Lead→Claim:** in `src/lib/leads/convert-lead-to-claim.ts` eine additive Zeile (analog `reparaturwunsch`, ~Zeile 460): `claimsInsert.schadenskategorie = lead.schadenskategorie ?? null`.

## Kunde-Input (DB-driven via `onboarding_felder`)

Ein neues `onboarding_felder`-Feld `schadenskategorie` — **exakt gespiegelt nach `reparaturwunsch`** (verifizierte Vorlage):
- `typ = 'toggle-cards'`, `audience = 'beide'`, `sektion = 'schaden'`, `pflicht = false`
- **`phase_id` DYNAMISCH auflösen** im INSERT via `(select id from onboarding_phasen where flow_key='lead-erfassung' and phase_key='schaden')` — **NIE hardcoden!** (Lehre 1069c2a2 / Commit c4bfe730a: hardcodetes `phase_id` bricht Supabase-Preview + `db reset`, weil `onboarding_phasen`-ids per-Environment random via `gen_random_uuid` sind → FK-Verletzung auf frischer DB.) Verifiziert: die schaden-Phase = `(lead-erfassung, schaden)`. `reihenfolge = 145` (nach reparaturwunsch=140).
- `label = 'Was ist an deinem Fahrzeug beschädigt?'`
- `optionen = [{label:'Karosserie / Blech', value:'karosserie'}, {label:'Lackierung / Kratzer', value:'lackierung'}, {label:'Mechanik / Motor', value:'mechanik'}, {label:'Glas', value:'glas'}, {label:'Weiß ich nicht', value:'unbekannt'}]`
- `db_target = {tabelle:'leads', spalte:'schadenskategorie'}`
- `conditional_on` = nur zeigen wenn `reparaturwunsch='reparatur'` (Plan-Step: exakte jsonb-Form aus einem bestehenden conditional-Feld z.B. `reparatur_werkstatt_extern` ablesen).

**Insert via `apply_migration`** (getrackte Daten-Migration, reproduzierbar — NICHT execute_sql). Gerendert vom bestehenden `FieldRenderer` im Flow-Feststellungs-Step (kein Component-Code nötig). Erscheint vor dem bestehenden `FlowWerkstattStep`.

## Werkstatt-Input (Admin)

- **`createWerkstatt`** (`src/app/admin/werkstaetten/actions.ts` + `WerkstaettenClient.tsx`): Fähigkeiten-Multi-Select (Chips) im „Neue Werkstatt"-Formular → `faehigkeiten: string[]` in den Insert (analog `ansprechpartner_name`).
- **Fähigkeiten-Editor für Bestands-Werkstätten:** Button „Fähigkeiten" pro Zeile in der Admin-Liste (analog „Staffel"/„QR") → Modal mit Multi-Select-Chips → neue Action `setWerkstattFaehigkeiten(werkstattId, faehigkeiten: string[]): Promise<{ok, error?}>` (requireAdmin + Update + revalidatePath). **Nötig**, sonst lassen sich Bestandspartner nie einschränken.

## Matching (additiv — koordiniert mit Session 1069c2a2)

- **`rankWerkstaetten(rows, origin, kategorie?)`** (`finder.ts`) — erweitern: je Werkstatt `passt` berechnen:
  ```
  passt = kategorie == null || kategorie === 'unbekannt'
        || !w.faehigkeiten || w.faehigkeiten.length === 0
        || w.faehigkeiten.includes(kategorie)
  ```
  Sortierung: **(passt desc, distanz_km asc)**. `passt` im Row-Typ (`WerkstattFinderRow`) zurückgeben. **Rückwärtskompatibel**: `kategorie` optional → ohne Kategorie exakt altes Verhalten (nur Distanz).
- **`findWerkstaetten({ lat?, lng?, plz?, kategorie?, limit })`** reicht `kategorie` an `rankWerkstaetten` durch + selektiert `faehigkeiten` mit.
- **`findReparaturWerkstaettenForTarget({ target, id })`** (`vermittlung-server.ts`) — lädt zusätzlich `schadenskategorie` des Leads/Claims und übergibt sie an `findWerkstaetten`.
- **`WerkstattFinder`** (`src/components/werkstatt/finder/WerkstattFinder.tsx`): optionaler `passt`-Badge („Spezialisiert für Ihren Schaden") bzw. dezenter Hinweis, falls das Top-Ergebnis `passt=false` ist (z.B. „keine spezialisierte Werkstatt in der Nähe — nächstgelegene angezeigt").

## Testing (TDD)

- **`rankWerkstaetten` pure-Tests** (`src/lib/werkstatt/__tests__/finder.test.ts` erweitern): (a) `kategorie` weggelassen → reine Distanz-Sortierung (Regression alt); (b) kategorie gesetzt + `faehigkeiten` leer → `passt=true` (Vollservice); (c) kategorie ∉ faehigkeiten → `passt=false`, hinter passenden einsortiert; (d) zwei passende → näher zuerst; (e) alle unpassend → Liste trotzdem nicht leer (nie leer).
- **Action-Test:** `setWerkstattFaehigkeiten` (non-admin → ok:false; admin → Update-Payload enthält faehigkeiten).
- **tsc + `npm run build`** (Route/Action/Server-Änderung → voller Build).
- **Prod-Smoke** (echte Rolle, nie service-role): Test-Werkstatt `faehigkeiten=['glas']` setzen + eine zweite Vollservice-Werkstatt + ein Claim `schadenskategorie='karosserie'` → `findWerkstaetten` prüfen: Vollservice rankt vor der Glas-only, Glas-only `passt=false`.

## Koordination

⚠️ **`finder.ts`, `vermittlung-server.ts`, `convert-lead-to-claim.ts` gehören Session 1069c2a2** (#3433, **bereits auf main/prod deployed** inkl. Fix-PR #3498). Alle meine Änderungen dort sind **strikt additiv** (optionaler `kategorie`-Param mit Default-alt-Verhalten; eine neue Carry-over-Zeile; `faehigkeiten` mitselektieren) — kein bestehendes Verhalten geändert. Gegen die echten aktuellen Files verifiziert (rankWerkstaetten pur/status-Filter/Distanz-Sort; SELECT_COLS ohne faehigkeiten; findReparaturWerkstaettenForTarget → findWerkstaetten limit 5).

**Direkte Koordinationsnotiz von 1069c2a2 (aus ihrem Marker):**
- Der Branch ist off staging → **enthält deren #3498-Fix**: `buildZuweisungPatch(userId: string | null)` schreibt `userId || null` in die uuid-Spalte. **NIEMALS `?? ''` wieder einbauen** (das war ihr launch-brechender uuid-Crash für accountlose Kunden).
- Die Gate-Erweiterung `brauchtWerkstattVermittlung` um `'fiktiv'` (für die fiktive-Abrechnung-Vermittlung) = **SP4**, NICHT SP1. Dabei die `vermittlung-core`-Tests (9/9) um den fiktiv-Case ergänzen.

## Out of Scope (spätere Sub-Projekte)

- **Marken-Matching** (`werkstaetten.marken text[]`) = SP1.1/v2 (erst Schadenskategorie sauber).
- **Reparaturtermin-Lifecycle** (`reparatur_termine`-Tabelle, Kunde-Wunschtermin, Werkstatt bestätigt/ruft an) = **SP2**.
- **Gutachten + OCR an die Werkstatt** (v_werkstatt_auftrag um gutachten-Join, PDF-Download) = **SP3**.
- **Kunde-Einstiege** (Fallakte-WerkstattCard, fiktive-Abrechnung-Kundenansicht gated auf `reparaturwunsch='fiktiv'`, Flow-Auszahlungs-Toggle) = **SP4**.

## Self-Review

- **Platzhalter:** Nur EIN Plan-Verify offen (exakte `conditional_on`-jsonb-Form) — mit konkretem Ableitungsweg (bestehendes conditional-Feld). Alles andere gegroundet (onboarding_felder-Struktur + reparaturwunsch-Vorlage per DB verifiziert; repairs/gutachten/schadenart-CHECK per DB verifiziert).
- **Konsistenz:** Vokabular-Tokens identisch über `werkstaetten.faehigkeiten`, `schadenskategorie`-CHECK, `optionen`-values und die `rankWerkstaetten`-`passt`-Logik.
- **Scope:** SP1 fokussiert (Fähigkeiten + Kategorie + Matching + Erfassungs-Surfaces). Termin/Kunde-Surfaces/Gutachten sauber abgetrennt.
- **Non-breaking:** `kategorie` optional (Matching rückwärtskompatibel); `faehigkeiten` leer=Vollservice (Bestand nicht ausgeschlossen); `schadenskategorie` nullable best-effort.
