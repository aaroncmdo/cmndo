# Werkstatt-Finder/-Vermittlung Phase 1 (Dispatcher) — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans. Schritte nutzen Checkbox (`- [ ]`).

**Goal:** Der Dispatcher kann einem Lead **oder** Claim ohne Reparatur-Werkstatt per Geo-Finder eine Partner-Werkstatt zuweisen; die Zuweisung wird getrackt (Monetarisierungs-Hook) und Kunde + Werkstatt benachrichtigt.

**Architecture:** Geteilter Geo-Matching-Kern (`findWerkstaetten` + `WerkstattFinder`-Komponente), einmal gebaut → später auch von Kunde-im-/flow (Phase 2) + Embed (Phase 3) genutzt. Phase 1 = Dispatcher-Flächen (Lead-Detail primär, Claim-Detail sekundär). Neue Felder auf `leads` + `claims`, Propagation via `convertLeadToClaim`. **Record-Cast statt Types-Regen** (Codebase-Pattern, kein `database.types.ts`-Konflikt mit cfefdf75).

**Tech Stack:** Next.js (App Router), Supabase (Plugin-Migrationen, Regel 2), vitest, primitives/* + shared/* Komponenten (AGENTS §Komponenten-Set), Result-Object-Server-Actions (AGENTS §Server-Actions).

**Spec:** `docs/superpowers/specs/2026-06-28-werkstatt-finder-vermittlung-design.md`

---

## File Structure

- **Migration:** `supabase/migrations/<V>_reparatur_werkstatt_zuweisung.sql` — 8 additive Spalten (leads + claims).
- **Create:** `src/lib/werkstatt/finder.ts` — `findWerkstaetten()` Geo-Matching-Kern (nutzt `lib/geo/distance.ts`).
- **Create:** `src/lib/werkstatt/__tests__/finder.test.ts`.
- **Create:** `src/components/werkstatt/finder/WerkstattFinder.tsx` — Picker-Komponente (Distanz-Liste).
- **Create:** `src/app/dispatch/leads/[id]/_actions/werkstatt-vermittlung.ts` — `vermittleWerkstatt()` Action (lead|claim).
- **Create:** `src/app/dispatch/leads/[id]/_actions/__tests__/werkstatt-vermittlung.test.ts`.
- **Create:** `src/app/dispatch/leads/[id]/WerkstattVermittlungPanel.tsx` — Dispatcher-UI (Vorlage: `SvDispatchPanel.tsx`).
- **Modify:** `src/app/dispatch/leads/[id]/page.tsx` — Panel einhängen.
- **Modify:** `src/lib/leads/convert-lead-to-claim.ts:~442` — Propagation Lead→Claim (additiv).
- **Modify (Claim-Fläche, sekundär):** die Claim-Detail-Ansicht (`src/app/faelle/[id]/page.tsx` o. Dispatch-Claim-View) — denselben Panel/Action mit `target='claim'`.

Untouched (Koordination): `lib/werkstatt/queries.ts` (workshop-self), `database.types.ts` (Record-Cast), Werkstatt-Portal (Phase-1b-Follow-up).

---

### Task 1: Migration — Felder auf leads + claims

**Files:** Migration via Supabase-Plugin (Regel 2), File nach getrackter Version benannt.

- [ ] **Step 1: DDL formulieren** (8 Spalten, additiv, identisch auf beiden Tabellen):

```sql
alter table public.leads
  add column reparatur_werkstatt_id uuid references public.werkstaetten(id),
  add column reparatur_werkstatt_zugewiesen_am timestamptz,
  add column reparatur_werkstatt_zugewiesen_von uuid,
  add column reparatur_werkstatt_quelle text
    check (reparatur_werkstatt_quelle in ('dispatcher','kunde','embed'));
alter table public.claims
  add column reparatur_werkstatt_id uuid references public.werkstaetten(id),
  add column reparatur_werkstatt_zugewiesen_am timestamptz,
  add column reparatur_werkstatt_zugewiesen_von uuid,
  add column reparatur_werkstatt_quelle text
    check (reparatur_werkstatt_quelle in ('dispatcher','kunde','embed'));
```

- [ ] **Step 2: Anwenden** `apply_migration({ name: 'reparatur_werkstatt_zuweisung', query: <DDL> })`.
- [ ] **Step 3: `list_migrations`** → getrackte Version `<V>` ablesen.
- [ ] **Step 4: File committen** als `supabase/migrations/<V>_reparatur_werkstatt_zuweisung.sql` (Dateiname == `<V>`).
- [ ] **Step 5: Verifizieren (READ)** `execute_sql`: `select column_name from information_schema.columns where table_name in ('leads','claims') and column_name like 'reparatur_werkstatt%' order by table_name, column_name;` → erwartet 8 Zeilen.
- [ ] **Step 6: Commit** `git add supabase/migrations/<V>_*.sql && git commit` (Audit-Body, Build n/a = nur SQL).

---

### Task 2: Geo-Matching-Kern `findWerkstaetten`

**Files:** Create `src/lib/werkstatt/finder.ts`, Test `src/lib/werkstatt/__tests__/finder.test.ts`.

- [ ] **Step 1: Geo-Helper-Export prüfen** — `src/lib/geo/distance.ts` lesen, exakten Distanz-Export (Haversine, km) notieren (z.B. `distanceKm(a, b)` / `haversine(...)`).

- [ ] **Step 2: Failing test** (`finder.test.ts`): reine Ranking/Filter-Logik testen — eine pure Funktion `rankWerkstaetten(rows, origin)` die nach Distanz sortiert + `distanz_km` annotiert. Test: 3 Werkstaetten, origin → erwartet aufsteigende Distanz, gesperrte/inaktive raus.

```ts
import { describe, it, expect } from 'vitest'
import { rankWerkstaetten } from '../finder'

describe('rankWerkstaetten', () => {
  it('sortiert nach Distanz aufsteigend + filtert inaktive', () => {
    const origin = { lat: 52.52, lng: 13.405 }
    const rows = [
      { id: 'a', name: 'Fern', lat: 53.55, lng: 10.0, status: 'aktiv' },
      { id: 'b', name: 'Nah', lat: 52.50, lng: 13.40, status: 'aktiv' },
      { id: 'c', name: 'Gesperrt', lat: 52.51, lng: 13.41, status: 'gesperrt' },
    ]
    const out = rankWerkstaetten(rows as any, origin)
    expect(out.map((w) => w.id)).toEqual(['b', 'a'])
    expect(out[0].distanz_km).toBeLessThan(out[1].distanz_km)
  })
})
```

- [ ] **Step 3: Run → FAIL** `npx vitest run src/lib/werkstatt/__tests__/finder.test.ts`.

- [ ] **Step 4: Implementieren** `finder.ts`:
  - `type WerkstattFinderRow = { id; name; adresse_strasse; adresse_plz; adresse_ort; telefon; lat; lng; status; distanz_km }`.
  - `rankWerkstaetten(rows, origin)` — pure: filtert `status==='aktiv'` (gesperrt/inaktiv raus — Status-Werte in Step 1 von Task 1 verifiziert: aktiv via `status`/`aktiviert_am`/`gesperrt_am`), berechnet Distanz via `lib/geo/distance.ts`, sortiert, slice(limit).
  - `findWerkstaetten({ lat, lng, plz, limit = 10 }, opts?)` async — liest aktive `werkstaetten` (admin/dispatch-Kontext: service-role-Client `@/lib/supabase/admin` ODER auth-aware mit dispatch-RLS; verifizieren dass dispatch werkstaetten listen darf), ruft `rankWerkstaetten`. PLZ-Fallback: wenn keine lat/lng am Origin → PLZ→Geo (bestehender geocode/plz-Helper) ODER PLZ-String-Prefix-Sort (MVP-Fallback, im Step dokumentieren).
  - **Keine** Isochrone, **kein** Wizard.

- [ ] **Step 5: Run → PASS**.
- [ ] **Step 6: Commit** `feat(werkstatt): findWerkstaetten Geo-Matching-Kern (+vitest)`.

---

### Task 3: `WerkstattFinder`-Komponente

**Files:** Create `src/components/werkstatt/finder/WerkstattFinder.tsx`.

- [ ] **Step 1: Komponente** (Client). Props: `{ werkstaetten: WerkstattFinderRow[]; onSelect: (id: string) => void; selectedId?: string | null; loading?: boolean }`.
  - Distanz-Liste: pro Werkstatt eine `primitives.Card` (KEIN handgerolltes `<div className="bg-white rounded…">`, AGENTS §Komponenten-Set) mit Name · Adresse (`{strasse}, {plz} {ort}`) · `{distanz_km.toFixed(1)} km entfernt` · Telefon · `primitives.Button` „Auswählen" → `onSelect(id)`.
  - `EmptyState` (shared) wenn leer („Keine Partner-Werkstatt in der Nähe gefunden").
  - Umlaute korrekt (AGENTS §Sprache): „Auswählen", „entfernt", „in der Nähe".
  - Stateless/surface-agnostisch (Phase 2/3 wrappen es).
- [ ] **Step 2: Build-Gate** `npx tsc --noEmit` grün.
- [ ] **Step 3: Commit** `feat(werkstatt): WerkstattFinder Picker-Komponente`.

---

### Task 4: Server-Action `vermittleWerkstatt`

**Files:** Create `src/app/dispatch/leads/[id]/_actions/werkstatt-vermittlung.ts`, Test `__tests__/werkstatt-vermittlung.test.ts`.

- [ ] **Step 1: Pattern-Read** — eine bestehende Lead-Action (`_actions/sv-termin.ts` oder `rueckruf.ts`) lesen für: Auth-Guard, `createClient`/admin, `createMitteilung`-Signatur, WA/Email-Send-Helper, `revalidatePath`-Pfade.

- [ ] **Step 2: Failing test** — `vermittleWerkstatt` setzt auf einem Lead die 4 Felder + `quelle='dispatcher'` + idempotent (zweiter Call überschreibt, kein Doppel-Event). (DB-Mock oder fokussierter Insert/Read gegen Test-Lead — Pattern wie bestehende `_actions/*.test.ts`.)

- [ ] **Step 3: Run → FAIL**.

- [ ] **Step 4: Implementieren** (Result-Object, Regel §Server-Actions):

```ts
'use server'
export async function vermittleWerkstatt(input: {
  target: 'lead' | 'claim'
  id: string
  werkstattId: string
}): Promise<{ ok: boolean; error?: string }> {
  // Auth-Guard: nur dispatch/admin (bestehender Helper, z.B. requireDispatch()).
  // Update target-Tabelle (Record-Cast wg. Type-Lag, AGENTS §6 / convert-lead-to-claim-Pattern):
  //   reparatur_werkstatt_id=werkstattId, _zugewiesen_am=now(), _zugewiesen_von=auth.uid(), _quelle='dispatcher'
  // if (error) return { ok:false, error: error.message }
  // try { Timeline-Event + Kunde-Mitteilung(WA/Email) + Werkstatt-Benachrichtigung(WA/Email) }
  //   catch (e) { console.error(...) }   // non-critical, bricht Status nicht
  // revalidatePath(`/dispatch/leads/${id}`) bzw. claim-Pfad
  // return { ok:true }
}
```
  - Felder via `({ ... } as Record<string, unknown>)` setzen (Type-Lag, KEIN Types-Regen).
  - Benachrichtigung Kunde: „Deine Werkstatt: {name}, {adresse}, {telefon}". Werkstatt: „Neuer Reparaturauftrag: {claim_nummer/lead}". Beide non-critical try/catch.

- [ ] **Step 5: Run → PASS**.
- [ ] **Step 6: Commit** `feat(werkstatt): vermittleWerkstatt-Action (lead|claim, getrackt, +Benachrichtigung)`.

---

### Task 5: Dispatcher-Panel im Lead-Detail

**Files:** Create `src/app/dispatch/leads/[id]/WerkstattVermittlungPanel.tsx`; Modify `page.tsx`.

- [ ] **Step 1: Vorlage lesen** — `SvDispatchPanel.tsx` (das SV-Zuweisungs-Panel) für Struktur/Drawer/Action-Wiring.
- [ ] **Step 2: Panel** (Client): zeigt entweder die zugewiesene Werkstatt (Name/Adresse + „ändern") **oder** Button „Werkstatt vermitteln" → Drawer/Sheet (`primitives` / `ui/sheet`) mit `WerkstattFinder` (gefüttert via `findWerkstaetten` nahe Lead-Standort) → `onSelect` → `vermittleWerkstatt({ target:'lead', id: leadId, werkstattId })` → Result-Check + Toast.
  - Standort-Anker: Lead-Schadenort/PLZ (im Build das zuverlässig geo'te Feld nageln — `besichtigungsort_lat/lng` oder `kunde_plz/halter_plz`).
- [ ] **Step 3: Einhängen** in `page.tsx` (neben `SvDispatchPanel`), sichtbar für dispatch/admin.
- [ ] **Step 4: Build-Gate** `npm run build` (Route + Server-Action berührt → voller Build, AGENTS §Audit-1).
- [ ] **Step 5: Commit** `feat(werkstatt): Dispatcher-Panel 'Werkstatt vermitteln' im Lead-Detail`.

---

### Task 6: Propagation Lead → Claim

**Files:** Modify `src/lib/leads/convert-lead-to-claim.ts` (~Zeile 442, nach dem makler_id-Block).

- [ ] **Step 1: Additiver Block** (spiegelt das `werkstatt_id`-Pattern):

```ts
// Reparatur-Werkstatt: Dispatcher-Zuweisung am Lead -> Claim uebernehmen (Record-Cast wg. Type-Lag).
;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_id =
  (lead.reparatur_werkstatt_id as string | null) ?? null
;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_zugewiesen_am =
  (lead.reparatur_werkstatt_zugewiesen_am as string | null) ?? null
;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_zugewiesen_von =
  (lead.reparatur_werkstatt_zugewiesen_von as string | null) ?? null
;(claimsInsert as Record<string, unknown>).reparatur_werkstatt_quelle =
  (lead.reparatur_werkstatt_quelle as string | null) ?? null
```

- [ ] **Step 2: Test** — `convert-lead-to-claim`-Test (falls vorhanden) erweitern: Lead mit `reparatur_werkstatt_id` → Claim hat es. Sonst fokussierter Test.
- [ ] **Step 3: Run → PASS** + `npx tsc --noEmit`.
- [ ] **Step 4: Commit** `feat(werkstatt): reparatur_werkstatt_id Lead->Claim-Propagation in convertLeadToClaim`.

---

### Task 7: Claim-Detail-Fläche (sekundär)

**Files:** Modify die Claim-Detail-Ansicht (`src/app/faelle/[id]/page.tsx` ODER die Dispatch-Claim-View — im Build die richtige Stelle nageln).

- [ ] **Step 1:** Denselben `WerkstattVermittlungPanel` + `vermittleWerkstatt({ target:'claim', ... })` einhängen (Komponente wiederverwenden, KEIN Neubau — AGENTS §Redundanz).
- [ ] **Step 2: Build-Gate** `npm run build`.
- [ ] **Step 3: Commit** `feat(werkstatt): Werkstatt-Vermittlung auch im Claim-Detail`.

---

### Task 8: Verifikation + Abschluss

- [ ] **Step 1: Alle Gates** `npx tsc --noEmit` · `npm run build` · `npm run check:token-audit` · `check:component-set` · `check:knip` · `npx vitest run` (neue Tests).
- [ ] **Step 2: Live-Smoke (READ + DML, Makler-Capstone-Muster)** — Test-Lead/Claim anlegen, `vermittleWerkstatt` ausführen (oder per Action-Replay), Felder + Quelle live verifizieren, **restlos abräumen** (FK-Reihenfolge beachten — Lead-Kinder zuerst, s. Makler-Lehre). Optional Playwright-Render des Dispatcher-Panels.
- [ ] **Step 3: Marker updaten** `COORDINATION-werkstatt-finder-vermittlung.md` (Phase 1 gebaut, queries.ts unberührt, kein Types-Regen).
- [ ] **Step 4: PR** `gh pr create --base staging` mit 7-Punkte-Audit + Phasen-2/3-Hinweis.

---

## Self-Review (gegen Spec)
- **Spec-Coverage:** Datenmodell (Task 1) · Kern findWerkstaetten (2) · WerkstattFinder (3) · Action+Tracking (4) · Dispatcher-UI Lead (5) · Lead→Claim-Propagation (6) · Claim-Fläche (7) · Benachrichtigung (in 4) · Verifikation (8). ✓
- **Lead-Erweiterung** (Aaron „direkt im Lead"): Felder auf leads + Propagation + Panel primär im Lead-Detail. ✓
- **Koordination:** queries.ts unberührt, database.types.ts via Record-Cast vermieden, Portal-View deferred → praktisch disjunkt zu cfefdf75. ✓
- **Typ-Konsistenz:** `vermittleWerkstatt`/`findWerkstaetten`/`rankWerkstaetten`/`WerkstattVermittlungPanel` durchgängig. ✓
- **Offen→Build:** Geo-Export-Name (Task 2.1), Status-aktiv-Semantik (Task 1.5), Standort-Anker-Feld (Task 5.2), Notification-Helper-Signatur (Task 4.1) — alle als „im Build nageln" markiert, kein Platzhalter im Code.
