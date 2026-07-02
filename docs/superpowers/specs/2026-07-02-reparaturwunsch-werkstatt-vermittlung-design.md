# Reparaturwunsch + Werkstatt-Vermittlung (Phase 2: Kunde / Gutachter / KB)

**Datum:** 2026-07-02
**Branch:** `kitta/reparaturwunsch-werkstatt-vermittlung` (off `origin/staging`)
**Status:** Design freigegeben (Aaron, 2026-07-01/02) — bereit fuer Implementierungsplan

---

## 1. Kontext & Ausgangslage (verifiziert gegen Live-DB + `origin/staging`)

Es existiert bereits eine **Werkstatt-Vermittlung Phase 1 (Dispatcher-only)**, live in Prod und auf `staging`:

- **DB:** `leads` und `claims` tragen je `reparatur_werkstatt_id`, `_zugewiesen_am`, `_zugewiesen_von`, `_quelle`. Die Lead->Claim-Uebergabe kopiert diese 4 Felder bereits (`src/lib/leads/convert-lead-to-claim.ts:451-458`).
- **Geo-Kern:** `findWerkstaetten({lat,lng,plz,limit=10})` in `src/lib/werkstatt/finder.ts` — Haversine-Ranking der `status='aktiv'`-Werkstaetten, kein Radius, PLZ-Fallback (nur Name-Sort). Presentation-only Komponente `src/components/werkstatt/finder/WerkstattFinder.tsx` (Props: `werkstaetten`, `onSelect`, `selectedId`, `loading`).
- **Dispatcher-Pfad:** Action `vermittleWerkstatt({target:'lead'|'claim', id, werkstattId})` + Reader `getWerkstaettenNah({target,id})` in `src/app/dispatch/leads/[id]/_actions/werkstatt-vermittlung.ts`, beide `requireRole(['dispatch','admin'])`. Patch-Bau in `werkstatt-vermittlung-patch.ts` (quelle **hardcoded** `'dispatcher'`). UI: `WerkstattVermittlungPanel.tsx`, eingehaengt in Dispatch-Lead + `faelle/[id]/page.tsx` (target='claim').
- **quelle-CHECK:** `('dispatcher','kunde','embed')` auf beiden Tabellen (Migration `20260628215921_reparatur_werkstatt_zuweisung.sql`). **Kein** `'gutachter'`/`'kb'`.
- **Kunde-Notify:** `notifyKundeWerkstattVermittlung` (WhatsApp + Email) + In-App-`mitteilungen`-Row (nur wenn Kunde-Account existiert), ausgeloest in `vermittleWerkstatt`.
- **Werkstatt-Notify:** `notifyWerkstattNeuerAuftrag` — **heute EMAIL-ONLY**. Die In-App-Variante (`empfaenger_rolle:'werkstatt'`) ist blockiert bis der `mitteilungen`-Rollen-Typ erweitert wird.
- **Supply-Realitaet:** 7 Partner-Werkstaetten, **alle 7 geocodiert**. `repairs`-Tabelle leer (0 Zeilen — nicht relevant fuer dieses Feature).
- **Partner-Portal-Inbox** (`/werkstatt/auftraege` + RPC `get_werkstatt_reparatur_auftraege`): **fertig codiert, aber unmerged** auf `origin/kitta/werkstatt-freigabe-followups` (13 Commits; beruehrt **keine** Flow-/Wizard-Dateien; aendert die `vermittleWerkstatt`-Action **nicht**).

**Was NEU ist (dieses Feature):**
1. `reparaturwunsch` (Abrechnungs-Intent) — existiert nirgends.
2. `reparatur_vermittlung_status` + `reparatur_werkstatt_extern` (eigene-Werkstatt-Modellierung).
3. Kunde waehlt Werkstatt **im FlowLink** (war "Phase 2" der alten Spec, nie gebaut).
4. **Gutachter** + **KB/Admin** koennen im Auftrag des Kunden vermitteln (neue Trigger/quelle).
5. Hartes Gate: Picker nur wenn Reparatur gewuenscht **und** noch keine Werkstatt hinterlegt.
6. Partner bekommen den Auftrag "in ihr System" (Portal-Inbox + In-App + Email).

---

## 2. Kernentscheidung: Zwei getrennte Konzepte

Der fruehere Denkfehler war, "Reparaturwunsch" und "Werkstatt-Vermittlung" in **ein** Feld zu packen. Sie werden strikt getrennt:

| | **Intent** (fuers Gutachten) | **Werkstatt-Herkunft** (operativ) |
|---|---|---|
| Feld | `reparaturwunsch` | `reparatur_vermittlung_status` + `reparatur_werkstatt_id` (+ `reparatur_werkstatt_extern`) |
| Werte | `reparatur` / `fiktiv` / `unentschieden` | `offen` / `eigene` / `vermittelt` / `abgelehnt` |
| Erfasst | **immer**, **immer** Lead->Claim | nur Folge, wenn `reparaturwunsch = reparatur` |
| Wer braucht es | Gutachter (fiktive Auszahlung nach § 249 BGB vs. echte Reparatur mit MwSt) | Dispatcher / Gutachter / KB / Kunde (Vermittlung) |

**Warum getrennt:** Der Kunde kann fiktiv abrechnen (nimmt das Netto-Geld, repariert privat/gar nicht) — das aendert das Gutachten real (keine MwSt-Erstattung, kein Werkstatt-Bedarf). Der Intent ist damit **gutachter-relevant und immer weiterzugeben**, unabhaengig davon, ob je eine Werkstatt vermittelt wird.

---

## 3. Datenmodell (DDL ausschliesslich via Supabase-Plugin — AGENTS.md Regel 2)

Neue Spalten auf **`leads` UND `claims`** (identisch, je 3):

```sql
-- Intent (immer)
reparaturwunsch text
  check (reparaturwunsch is null or reparaturwunsch in ('reparatur','fiktiv','unentschieden'))
-- Operativer Vermittlungs-Status
reparatur_vermittlung_status text not null default 'offen'
  check (reparatur_vermittlung_status in ('offen','eigene','vermittelt','abgelehnt'))
-- Freitext-Name der EIGENEN (nicht-Partner) Werkstatt
reparatur_werkstatt_extern text
```

Plus **CHECK-Erweiterung** von `reparatur_werkstatt_quelle` auf beiden Tabellen:
`('dispatcher','kunde','embed')` -> `('dispatcher','kunde','embed','gutachter','kb')`.

Ablauf strikt nach Regel 2: `apply_migration` -> `list_migrations` (getrackte Version ablesen) -> Migration-File exakt danach benannt committen -> `execute_sql` READ zum Verifizieren -> Types via `generate_typescript_types` regenerieren.

**Bestehende Felder unveraendert genutzt:** die 4 `reparatur_werkstatt_*` (Zuweisung), `werkstaetten.lat/lng/status/partner`, `claims.werkstatt_id` (Inbound-QR-Werkstatt, fuer Gate relevant).

---

## 4. Erfassung — reiner Config-Weg (null Formular-Code)

`reparaturwunsch` + Rueckfrage + Extern-Name werden als **3 `onboarding_felder`-Zeilen** (Daten, kein DDL) angelegt, `audience: 'beide'`. Damit erscheinen sie **automatisch im kanonischen FlowLink (Feststellungs-Microstep) UND im Dispatcher-Lead-Formular** und persistieren ueber die bestehenden Save-Actions (`speichereFeststellungFlow` bzw. `saveDispatchLeadFelder`), die serverseitig allowlist-gefiltert aus genau dieser Config schreiben.

Feld-Shape (verifiziert an Bestands-Feldern):

```jsonc
// 1) reparaturwunsch
{ "feld_key": "reparaturwunsch", "typ": "toggle-cards", "audience": "beide", "sektion": "schaden",
  "label": "Wie moechtest du den Schaden abrechnen?",
  "optionen": [
    {"label": "Reparatur (in der Werkstatt)", "value": "reparatur"},
    {"label": "Fiktiv (Auszahlung, keine Reparatur)", "value": "fiktiv"},
    {"label": "Noch unentschieden", "value": "unentschieden"}
  ],
  "db_target": {"tabelle": "leads", "spalte": "reparaturwunsch"} }

// 2) Rueckfrage — nur wenn Reparatur gewuenscht
{ "feld_key": "reparatur_vermittlung_status", "typ": "segmented", "audience": "beide", "sektion": "schaden",
  "label": "Hast du schon eine Werkstatt?",
  "optionen": [
    {"label": "Ja, ich habe eine Werkstatt", "value": "eigene"},
    {"label": "Nein, bitte vermittelt mir eine", "value": "offen"}
  ],
  "db_target": {"tabelle": "leads", "spalte": "reparatur_vermittlung_status"},
  "conditional_on": {"feld": "reparaturwunsch", "equals": "reparatur"} }

// 3) Name der eigenen Werkstatt — nur wenn "eigene"
{ "feld_key": "reparatur_werkstatt_extern", "typ": "text", "audience": "beide", "sektion": "schaden",
  "label": "Name deiner Werkstatt",
  "db_target": {"tabelle": "leads", "spalte": "reparatur_werkstatt_extern"},
  "conditional_on": {"feld": "reparatur_vermittlung_status", "equals": "eigene"} }
```

**Post-Conversion editierbar:** `reparaturwunsch` + Status in die Fallakte-Stammdaten-Allowlist (`src/app/faelle/[id]/_actions/stammdaten.ts`, `FALL_EDITABLE_FIELDS`) aufnehmen (Muster: `werkstatt_seit_datum`).

**Verifikations-Auflage im Plan:** bestaetigen, dass die Lead-Erfassungs-Allowlist (`src/lib/onboarding/lead-erfassung-allowlist.ts`) tatsaechlich **config-derived** ist (dann genuegt der Zeilen-Insert) und nicht zusaetzlich statisch.

---

## 5. Carry-over (Lead -> Claim)

3 Zeilen in das `claimsInsert`-Objekt in `src/lib/leads/convert-lead-to-claim.ts` — direkt neben die bereits existierenden `reparatur_werkstatt_*`-Copies (L451-458):

```ts
reparaturwunsch: (lead.reparaturwunsch as string | null) ?? null,
reparatur_vermittlung_status: (lead.reparatur_vermittlung_status as string | null) ?? 'offen',
reparatur_werkstatt_extern: (lead.reparatur_werkstatt_extern as string | null) ?? null,
```

Ungated (analog Bestand). `ClaimInsert`-Typ nach Types-Regen; bis dahin `Record<string,unknown>`-Cast wie die Datei es fuer noch-nicht-getypte Spalten bereits macht.

---

## 6. Gate-Logik (zentral, eine Quelle)

Der Picker (5 naechste Partner) erscheint auf **allen** Oberflaechen **genau dann**:

```
braucht_werkstatt_vermittlung :=
      reparaturwunsch = 'reparatur'
  AND reparatur_werkstatt_id IS NULL      -- noch keine Partner-Werkstatt vermittelt
  AND werkstatt_id IS NULL                -- kam NICHT ueber Werkstatt-QR (Inbound) -> hat faktisch schon eine
  AND reparatur_vermittlung_status = 'offen'  -- 'eigene'/'abgelehnt'/'vermittelt' -> nicht mehr anbieten
```

Als **pure Helper-Funktion** `braucht_werkstatt_vermittlung(row)` in `src/lib/werkstatt/vermittlung-core.ts` (einheitlich fuer alle 4 Surfaces + Flow-Step-Gate). Der `reparatur_werkstatt_id IS NULL`-Term dominiert: sobald eine Partner-Werkstatt vermittelt ist, bleibt der Picker ueberall verborgen — auch wenn der Status-Spalte via Flow-Re-Entry-Edge-Case ein 'offen' zurueckgeschrieben wuerde (dokumentiert als bewusst tolerierte, folgenlose Kosmetik).

"Gutachter im Auftrag ODER wir fuer ihn": Das Gate regelt die Koordination automatisch — **wer zuerst waehlt, setzt `reparatur_werkstatt_id`**, danach ist der Picker fuer alle anderen Rollen ausgeblendet. Keine Locks/Extra-Koordination noetig.

---

## 7. Geteilter Vermittlungs-Kern (DRY ueber alle Rollen)

Neue Datei `src/lib/werkstatt/vermittlung-core.ts` (**plain module**, NICHT `'use server'` — darf Typen/Konstanten exportieren):

```ts
export type VermittlungQuelle = 'dispatcher'|'kunde'|'embed'|'gutachter'|'kb'
export type VermittlungTarget = { target: 'lead'|'claim'; id: string }

// Write-Kern. Annahme: Caller hat Rollen-/Token-Guard bereits ausgefuehrt.
// Setzt die 4 reparatur_werkstatt_* + status='vermittelt', feuert Kunde- + Werkstatt-Notify.
export async function assignReparaturWerkstatt(
  admin: SupabaseClient,
  input: VermittlungTarget & { werkstattId: string; quelle: VermittlungQuelle; actorUserId: string|null },
): Promise<{ ok: boolean; error?: string }>

// Read-Kern: Anker aufloesen (besichtigungsort_lat/lng -> Fallback), findWerkstaetten(limit:5).
export async function findReparaturWerkstaettenForTarget(
  admin: SupabaseClient, input: VermittlungTarget,
): Promise<WerkstattFinderRow[]>

// Gate (pure) — siehe Abschnitt 6.
export function braucht_werkstatt_vermittlung(row: {...}): boolean
```

Der bestehende Dispatcher-`vermittleWerkstatt` wird **darauf refactored** (Boy-Scout, Verhalten unveraendert; quelle bleibt 'dispatcher'). `findReparaturWerkstaettenForTarget` standardisiert **`limit: 5`**; `getWerkstaettenNah` wird ebenfalls auf 5 gezogen (Konsistenz — Aaron-Entscheid). Die presentation-only `WerkstattFinder`-Komponente wird 1:1 wiederverwendet.

---

## 8. Vier Picker-Oberflaechen (duenne, rollen-gescopte Actions ueber dem Kern)

| Rolle | Ort | Action (neu/refactor) | Guard | quelle | Kollision |
|---|---|---|---|---|---|
| Dispatcher | `WerkstattVermittlungPanel` (existiert) | `vermittleWerkstatt` -> Kern | `requireRole(['dispatch','admin'])` | `dispatcher` | — |
| **Gutachter** | neue `WerkstattVermittelnCard` in `src/app/gutachter/fall/[id]/_components/`, gerendert in `FallDetailClient.tsx`, gegatet | `vermittleWerkstattAlsGutachter` in `gutachter/fall/[id]/actions.ts` | SV-Rolle **+ SV ist diesem Fall zugewiesen** | `gutachter` | keine |
| **KB + Admin** | geteilte Fallakte `src/app/faelle/[id]/` (QuickAction / Uebersicht-Section) | `vermittleWerkstattFallakte` in `faelle/[id]/_actions/` | `requireRole(['kundenbetreuer','admin'])` | `kb` | keine |
| **Kunde** | neuer Flow-Step `FlowWerkstattStep.tsx` (conditional) | `ladeWerkstaettenFlow(token)` + `waehleWerkstattFlow(token, werkstattId)` | **Token->Lead-Ownership** (Magic-Link) | `kunde` | `FlowWizardKfz.tsx` |

Gutachter-Koordinaten: `fall.besichtigungsort_lat/lng` liegen bereits am geladenen Objekt (`getFallForSv` nutzt `select('*')` auf `v_faelle_mit_aktuellem_termin`, die die Coords exponiert) — die Card kann `findReparaturWerkstaettenForTarget` direkt aufrufen.

### Kunde-Flow-Step (Surface 4 — einziger kollisionsbehafteter Teil)

Neue Komponente `src/app/flow/[token]/FlowWerkstattStep.tsx` (Vorbild `FlowSlotStep.tsx`): laedt 5 Werkstaetten via `ladeWerkstaettenFlow` (Anker = Lead-`besichtigungsort_lat/lng` mit Fallback; `GooglePlaceAutocomplete`-Nachreichung wenn Coords fehlen), rendert `WerkstattFinder`, `onSelect` -> `waehleWerkstattFlow`.

Minimal-invasive Einbindung in `FlowWizardKfz.tsx`:
1. `StepId`-Union += `'werkstatt'`.
2. In **beide** STEPS-Zweige: conditional Eintrag **vor `'sa'`** (besichtigungsort ist dann in beiden Pfaden gesetzt — incomplete: durch `termin`; dispatcher/embed: vorbelegt). Sichtbarkeit ueber `initialBraucht` (server-berechnetes `braucht_werkstatt_vermittlung`, beim Mount fixiert wie `initialNeedsBooking`, gegen Stale-Index).
3. Neuer Switch-Case `'werkstatt'` im Render.

**Sicherheit `waehleWerkstattFlow`:** token-authed (kein Login). MUSS Token->Lead aufloesen und **ausschliesslich** die zum Token gehoerende Lead-Zeile schreiben (kein `leadId` aus Client-Input) — spiegelt das Muster von `speichereBesichtigungsortFlow`. Verhindert Ownership-Hijack (vgl. Memory-Warnung zu token-losen Flow-Writes).

---

## 9. Partner-Zustellung "in ihr System" (Portal-Inbox + In-App + Email)

Aus `origin/kitta/werkstatt-freigabe-followups` werden **nur diese Slice-Artefakte** geerntet (nicht der gesamte 34-File-Reparaturfreigabe-Strang):

- `src/app/werkstatt/(shell)/auftraege/page.tsx`
- `src/components/werkstatt/WerkstattReparaturAuftraege.tsx`
- `src/lib/werkstatt/reparatur-auftraege.ts`
- Migration `get_werkstatt_reparatur_auftraege.sql` (SECURITY DEFINER, self-scoped: `WHERE c.reparatur_werkstatt_id = (SELECT w.id FROM werkstaetten w WHERE w.user_id = auth.uid())`, kuratierte leak-safe Projektion ohne Kunden-Kontaktdaten)
- die noetige `mitteilungen`-Rollen-Erweiterung `empfaenger_rolle += 'werkstatt'` (`src/lib/mitteilungen/types.ts`) + Werkstatt-Portal-Nav-Eintrag.

Ernte-Methode: **cherry-pick der relevanten Commits** oder manuelle Re-Kreation der genannten Dateien (nicht `git merge` des ganzen Branches — der ist 108 Commits hinter staging und zieht den ganzen Freigabe-Strang mit). Vorsicht bei geteilten Dateien, die der Branch ebenfalls anfasst (`database.types.ts`, `faelle/[id]/page.tsx`, `admin/werkstaetten/page.tsx`) — nur die Inbox-Teile uebernehmen.

Danach in `notifyWerkstattNeuerAuftrag` **zusaetzlich** die In-App-`mitteilung` (`empfaenger_rolle:'werkstatt'`) ausloesen (der Code-Kommentar dort beschreibt genau diesen Schritt). Email bleibt. WhatsApp bewusst NICHT (Aaron-Kanal-Entscheid: Werkstatt = In-App + Email).

**Externe DMS-Schnittstelle (Werbas/Audatex) ist explizit OUT OF SCOPE** (kein Fundament, pro Werkstatt individuell).

---

## 10. Benachrichtigungen (Zusammenfassung)

Beim Vermitteln (`assignReparaturWerkstatt`), alle als non-critical try/catch (Twilio-Fail darf Status-Update nicht brechen — AGENTS.md):

- **Kunde:** WhatsApp + Email (`notifyKundeWerkstattVermittlung`) + In-App (nur bei Account).
- **Werkstatt:** In-App-Inbox-Mitteilung (neu) + Email (`notifyWerkstattNeuerAuftrag`).

---

## 11. Kollisions- & Branch-Strategie

- Gearbeitet wird ausschliesslich im isolierten Worktree `.claude/worktrees/reparaturwunsch-werkstatt` auf `kitta/reparaturwunsch-werkstatt-vermittlung` (off frischem `origin/staging`). **Nie** auf der geteilten, veralteten `kitta/aar-956-*`-Branch committen.
- Einziger Datei-Ueberlapp mit den 3 aktiven aar-956-Sessions: `FlowWizardKfz.tsx` (+ evtl. `feststellung-steps.ts`) — betrifft **nur Phase 7** (Kunde-Flow-Step). Phasen 0-6 sind kollisionsfrei.
- **Vor Phase 7** auf aktuelles `origin/staging` rebasen und die STEPS-Einfuegung gegen die dann-aktuelle Struktur vornehmen (die aar-956-Arbeit ist bis dahin ggf. gemergt).
- Weitere Werkstatt-Session beobachten: `kitta/werkstatt-updates-popover` (Popover-UI — vermutlich andere Surface; bei Konflikt in `src/components/werkstatt/` abstimmen).
- DDL koordinieren: die quelle-CHECK + neuen Spalten sind additiv; keine andere Session aendert diese Tabellen-Constraints laut Lage.

---

## 12. Implementierungs-Phasen (isolierte, je fuer sich testbare Units)

Jede Phase = eigener Commit mit 7-Punkte-Audit (AGENTS.md). Reihenfolge nach Abhaengigkeit + Kollisionsrisiko (Kunde-Flow zuletzt):

0. **Datenmodell** — Migration (3 Spalten x 2 Tabellen + quelle-CHECK-Erweiterung) via Plugin, Regel-2-Flow, Types-Regen.
1. **Erfassung (Config)** — 3 `onboarding_felder`-Zeilen (idempotent, als Migration/Seed); Allowlist-Config-Derivation verifizieren; Fallakte-Stammdaten-Allowlist erweitern.
2. **Carry-over** — 3 Zeilen in `convert-lead-to-claim.ts` + Test in `convert-lead-to-claim.test.ts`.
3. **Geteilter Kern** — `vermittlung-core.ts` (`assignReparaturWerkstatt`, `findReparaturWerkstaettenForTarget`, `braucht_werkstatt_vermittlung`); Dispatcher-Action darauf refactoren (Boy-Scout); limit->5. Unit-Tests fuer Gate + Anker-Aufloesung.
4. **Gutachter-Surface** — `WerkstattVermittelnCard` + `vermittleWerkstattAlsGutachter` (Guard: SV diesem Fall zugewiesen), quelle='gutachter'.
5. **KB/Admin-Surface** — Picker in geteilter Fallakte `/faelle/[id]` + `vermittleWerkstattFallakte`, quelle='kb'.
6. **Partner-Zustellung** — Inbox-Slice ernten (Punkt 9) + In-App-Werkstatt-Mitteilung in `notifyWerkstattNeuerAuftrag` aktivieren.
7. **Kunde-Flow-Step (kollisionsbehaftet, ZULETZT)** — `FlowWerkstattStep.tsx` + `ladeWerkstaettenFlow`/`waehleWerkstattFlow` (token-scoped) + minimale `FlowWizardKfz.tsx`-STEPS-Einbindung. Vorher rebasen.

---

## 13. Tests

- **Unit (vitest):** `braucht_werkstatt_vermittlung` (alle Gate-Kombinationen inkl. Inbound-`werkstatt_id`-Unterdrueckung), Anker-Aufloesung in `findReparaturWerkstaettenForTarget` (besichtigungsort -> Fallback), Carry-over-Kopie der 3 neuen Felder.
- **Config:** Snapshot/Assertion, dass die 3 `onboarding_felder`-Zeilen mit korrektem `conditional_on` + `db_target` existieren.
- **RLS-Smoke:** Werkstatt-Inbox-RPC — als Werkstatt-User A nur eigene Auftraege, 0 fremde (mit `set local role authenticated` + JWT-claims, nicht nur GUC — Memory-Lehre).
- **Security-Test:** `waehleWerkstattFlow` schreibt nur die Token-Lead-Zeile; Fremd-`leadId`-Injection wirkungslos.
- **E2E (deferred/optional):** Kunde-Flow-Step Happy-Path (nach Phase 7, gegen `test-*`-Fixtures — nie Real-Accounts, Memory-Lehre).

---

## 14. Sicherheit / RLS

- Neue Spalten erben die bestehende `leads`/`claims`-Tabellen-RLS.
- Kunde-Flow-Actions: token-scoped (Magic-Link ist die Auth), kein Client-`leadId`.
- Gutachter/KB/Admin-Actions: `requireRole` + (Gutachter) Fall-Zuweisungs-Check.
- Werkstatt-Inbox: SECURITY-DEFINER-RPC self-scoped auf `auth.uid()`; leak-safe Projektion (keine Kunden-Kontaktdaten — Kunde initiiert Kontakt).

---

## 15. Audit-Hinweise (AGENTS.md 7-Punkte, je Commit)

- **Tokens/Branding:** neue UI (Cards, Flow-Step) nutzt `primitives/*` + `shared/*`, Claimondo-Tokens, echte Umlaute in allen nutzersichtbaren Strings.
- **Komponenten-Set:** `WerkstattFinder` + `Card`/`Button`-Primitives wiederverwenden, kein handgerolltes Markup.
- **Server-Actions:** Result-Object `{ ok, error? }`, `revalidatePath` fuer betroffene Routen, Non-Critical-Sends in try/catch.
- **Nested-FK:** Werkstatt-Joins mit `Array.isArray(x)?x[0]:x` normalisieren.

---

## 16. Out of Scope / Offene Punkte

- **Externe DMS-Schnittstelle** (Werbas/Audatex/Werkstatt-eigene Software) — separates Projekt.
- **Embed-Finder (Phase 3 der alten Spec)** — nicht Teil.
- **Reparaturfreigabe-Strang** (der Rest des followups-Branches: Freigabe-Action, Eskalations-Cron, Provisionen) — bewusst nicht mitgeerntet.
- **Terminierung Phase 7** haengt am Merge-Stand der aar-956-Sessions.
