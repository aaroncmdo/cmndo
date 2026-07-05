# SV-Live-Ops-Karte — Chunk 1: Datenschicht + Pipeline-Fundament — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die vollständig DB-getriebene, role-scoped Datenschicht + das Tracking-Fundament der SV-Live-Ops-Karte bauen — ohne UI. Danach kann Chunk 2 (`<LiveOpsMap>`) allein aus diesen Loadern + Fixtures rendern.

**Architecture:** Reine Loader unter `src/lib/live-ops/*` (Server, `createClient()` → RLS), gespeist aus `sachverstaendige`, `sv_live_location`/`sv_live_position`, `gutachter_termine`, `sv_leads`. Die zeit-/statusabhängige Logik (`carState`) ist eine **pure Funktion** (unit-getestet), die Loader sind dünne DB-Adapter darum. Das Tracking-Fundament ist ein **DB-Trigger** `sv_live_position` → upsert `sv_live_location` (DB-driven, kein App-Code-Change nötig).

**Tech Stack:** Next.js 15 (Server Components/Actions), Supabase (Postgres, RLS, Trigger via `apply_migration`), TypeScript, Vitest.

## Global Constraints

- **DDL nur via Supabase-Plugin** `apply_migration` → `list_migrations` → Migration-File `supabase/migrations/<V>_<name>.sql` == getrackte Version (Regel 2). `execute_sql` nur READ.
- **Nie auf `main` pushen**; Branch `kitta/sv-live-ops-karte`, PR gegen `staging` (Regel 1).
- **Result-Object** `{ ok, error? }` in Server-Actions, kein `throw`; **keine** Konstanten/Types aus `'use server'`-Files exportieren.
- **DB-Spalten nie raten** — gegen Prod (`paizkjajbuxxksdoycev`) per `execute_sql` verifizieren.
- **Kein UI in Chunk 1.** Loader sind reine Server-Funktionen, testbar per Fixture.
- **Verifizierte Fakten (Prod):** `sv_live_location(sv_id,lat,lng,accuracy,eta_minuten,claim_id,fall_id,updated_at)` — 1 Zeile/SV, BEFORE-Trigger `trg_derive_claim_id`. `sv_live_position(sv_id,lat,lng,heading,speed_kmh,accuracy_m,captured_at,updated_at,route_polyline,distance_to_target_meters)` — Roh-Feed, KEIN Sync-Trigger. `gutachter_termine`: `assignee_id`/`assignee_typ='sachverstaendiger'`, `status`, `start_zeit`, `losgefahren_am`, `sv_unterwegs_seit`, `sv_eta_minuten`, `besichtigungsort_lat/lng/adresse`, `claim_id`, `fall_id`, `lead_id`. `sachverstaendige`: `standort_lat/lng`, `isochrone_polygon`, `gutachter_typ`, `verifiziert`, `paket`, `paket_faelle_genutzt/gesamt`, `portal_zugang_freigeschaltet`, `gesperrt_seit`, `urlaub_von/bis`, `live_tracking_enabled`, `geloescht_am`, `profile_id`. `sv_leads` (Dead-Pins).
- **Wiederverwenden:** `src/lib/dispatch/karte/resolve-termin-geo.ts` (Ziel-Koord-Fallback), `get-termine-today.ts` (Heute-Termine-Query-Muster). NICHT duplizieren.

---

## File Structure

- `supabase/migrations/<V>_sync_sv_live_location.sql` — Trigger `sv_live_position` AFTER INSERT → upsert `sv_live_location` (Task 1).
- `supabase/migrations/<V>_v_live_ops_sv.sql` — View `v_live_ops_sv` (SECURITY DEFINER, `is_staff()`-gated) (Task 4).
- `src/lib/live-ops/types.ts` — geteilte Types (`LiveOpsScope`, `SvLiveOps`, `CarState`, `TerminPin`, `DeadPin`, `UnterwegsRoute`, `TagesRoute`) (Task 2).
- `src/lib/live-ops/scope.ts` — `resolveLiveOpsScope(role, userId)` (Task 2).
- `src/lib/live-ops/car-state.ts` — **pure** `deriveCarState(input)` (Task 3).
- `src/lib/live-ops/car-state.test.ts` — Unit-Tests (Task 3).
- `src/lib/live-ops/get-live-svs.ts` — `getLiveOpsSvs(scope)` (Task 4).
- `src/lib/live-ops/get-offene-termine.ts` — `getOffeneTermine(scope)` (Task 5).
- `src/lib/live-ops/get-unterwegs-routen.ts` — `getUnterwegsRouten(scope)` (Task 6).
- `src/lib/live-ops/get-tagesrouten.ts` — `getTagesrouten(scope)` (Task 7).
- `src/lib/live-ops/get-dead-pins.ts` — `getDeadPins(scope)` (Task 8).
- `src/lib/live-ops/index.ts` — Barrel (Task 8).

---

## Task 1: Tracking-Fundament — Sync-Trigger `sv_live_position` → `sv_live_location`

**Audit-Befund (verifiziert):** `position-batch/route.ts` + `trackPosition()` schreiben NUR in `sv_live_position`; `sv_live_location` (die „aktuelle Position", die die Karte/Realtime liest) wird **nie** befüllt → Realtime bleibt tot. `heading` wird an `sv_live_position` durchgereicht, aber die Mobile-App sendet es aktuell nicht (0 Zeilen mit heading; Mobile-App-Fix = eigener Scope). **Fix (DB-driven):** ein AFTER-INSERT-Trigger auf `sv_live_position` upsertet `sv_live_location` — so wird jede eingehende Position sofort zur „aktuellen Position", ohne App-Code-Änderung.

**Files:**
- Create: `supabase/migrations/<V>_sync_sv_live_location.sql`

**Interfaces:**
- Produces: Trigger `trg_sync_live_location`; nach jedem `INSERT INTO sv_live_position` existiert/aktualisiert sich genau eine `sv_live_location`-Zeile pro `sv_id`.

- [ ] **Step 1: Vorbedingungen gegen Prod verifizieren (READ)**

Run (via `execute_sql`):
```sql
SELECT conname FROM pg_constraint WHERE conrelid='public.sv_live_location'::regclass AND contype IN ('p','u');
SELECT column_name FROM information_schema.columns WHERE table_name='sv_live_location' AND table_schema='public';
```
Expected: eine UNIQUE/PK auf `sv_id` (für `ON CONFLICT`). Falls KEINE Unique auf `sv_id`: erst `ALTER TABLE ... ADD CONSTRAINT sv_live_location_sv_id_key UNIQUE (sv_id)` in dieselbe Migration aufnehmen (nur wenn 0 Duplikate — vorher `SELECT sv_id, count(*) FROM sv_live_location GROUP BY 1 HAVING count(*)>1`).

- [ ] **Step 2: DDL schreiben + `apply_migration` ausführen**

```sql
-- Function + Trigger: jede neue sv_live_position spiegelt in sv_live_location (aktuelle Position).
CREATE OR REPLACE FUNCTION public.sync_sv_live_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sv_live_location (sv_id, lat, lng, accuracy, updated_at)
  VALUES (NEW.sv_id, NEW.lat, NEW.lng, NEW.accuracy_m, now())
  ON CONFLICT (sv_id) DO UPDATE
    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
        accuracy = EXCLUDED.accuracy, updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_live_location ON public.sv_live_position;
CREATE TRIGGER trg_sync_live_location
  AFTER INSERT ON public.sv_live_position
  FOR EACH ROW EXECUTE FUNCTION public.sync_sv_live_location();
```
`apply_migration({ name: 'sync_sv_live_location', query: <oben> })`. (Der bestehende BEFORE-Trigger `trg_derive_claim_id` auf `sv_live_location` füllt claim_id/fall_id automatisch nach.)

- [ ] **Step 3: getrackte Version ablesen + Migration-File committen**

Run: `list_migrations` → Version `<V>` ablesen. Datei `supabase/migrations/<V>_sync_sv_live_location.sql` mit exakt der DDL anlegen (Regel 2, Schritt 3+4).

- [ ] **Step 4: Verifizieren (READ)**

Run (via `execute_sql`):
```sql
INSERT INTO sv_live_position (sv_id, lat, lng, accuracy_m, captured_at)
SELECT id, 52.52, 13.405, 10, now() FROM sachverstaendige WHERE geloescht_am IS NULL LIMIT 1
RETURNING sv_id;
-- dann:
SELECT sv_id, lat, lng, updated_at FROM sv_live_location WHERE updated_at > now() - interval '1 minute';
```
Expected: die eingefügte `sv_id` erscheint in `sv_live_location` mit lat=52.52. (Danach die Test-Zeile per `DELETE FROM sv_live_position WHERE lat=52.52 AND lng=13.405` aufräumen — READ-Verifikation, kein Schema-Change.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<V>_sync_sv_live_location.sql
git commit -m "feat(sv-live-ops): Sync-Trigger sv_live_position -> sv_live_location (Tracking-Fundament)"
```

---

## Task 2: Types + Scope-Auflösung

**Files:**
- Create: `src/lib/live-ops/types.ts`, `src/lib/live-ops/scope.ts`

**Interfaces:**
- Produces:
  - `type LiveOpsRole = 'admin' | 'dispatch' | 'kundenbetreuer'`
  - `type LiveOpsScope = { role: LiveOpsRole; userId: string; svIds: string[] | 'all'; fallIds: string[] | 'all' }`
  - `type CarState = { mode: 'live' | 'unterwegs_derived' | 'none'; lat: number | null; lng: number | null; heading: number | null; zielLat: number | null; zielLng: number | null; terminId: string | null; etaMinuten: number | null }`
  - `type SvLiveOps = { id: string; name: string; typ: string; verifiziert: boolean; paket: string; genutzt: number; gesamt: number; gesperrt: boolean; urlaub: boolean; standortLat: number | null; standortLng: number | null; isochrone: unknown | null; car: CarState }`
  - `resolveLiveOpsScope(role: LiveOpsRole, userId: string): Promise<LiveOpsScope>`

- [ ] **Step 1: `types.ts` schreiben** — genau die obigen Types (keine Logik, nur `export type`). Kein Test nötig (reine Typen).

- [ ] **Step 2: `scope.ts` schreiben**

```typescript
import { createClient } from '@/lib/supabase/server'
import type { LiveOpsRole, LiveOpsScope } from './types'

// Admin = alle; Dispatch = alle aktiven SVs (Pool); KB = SVs/Faelle die der KB betreut.
export async function resolveLiveOpsScope(role: LiveOpsRole, userId: string): Promise<LiveOpsScope> {
  if (role === 'admin' || role === 'dispatch') {
    return { role, userId, svIds: 'all', fallIds: 'all' }
  }
  // KB: nur betreute Faelle (v_faelle_mit_aktuellem_termin.kb_id) + deren SVs.
  const supabase = await createClient()
  const { data } = await supabase
    .from('v_faelle_mit_aktuellem_termin')
    .select('claim_id, aktueller_termin_sv_id')
    .eq('kb_id', userId)
  const fallIds = [...new Set((data ?? []).map((r) => r.claim_id).filter(Boolean) as string[])]
  const svIds = [...new Set((data ?? []).map((r) => r.aktueller_termin_sv_id).filter(Boolean) as string[])]
  return { role, userId, svIds, fallIds }
}
```
(VERIFIZIEREN: `v_faelle_mit_aktuellem_termin` hat `kb_id` + `aktueller_termin_sv_id` — per `execute_sql` gegen die View-Spalten prüfen; falls Namen abweichen, anpassen. KB-Scope-Details dürfen in Chunk 3 verfeinert werden — hier reicht ein korrekter, nicht-leerer Filter.)

- [ ] **Step 3: `npx tsc --noEmit` grün.** Commit: `git commit -am "feat(sv-live-ops): live-ops types + role-scope"`

---

## Task 3: `deriveCarState` — pure Logik (TDD)

**Files:**
- Create: `src/lib/live-ops/car-state.ts`, `src/lib/live-ops/car-state.test.ts`

**Interfaces:**
- Consumes: `CarState` (Task 2).
- Produces: `deriveCarState(input: DeriveCarStateInput): CarState` (pure, kein IO).
  ```typescript
  type DeriveCarStateInput = {
    nowMs: number
    live: { lat: number; lng: number; heading: number | null; updatedAtMs: number } | null
    aktiverTermin: { id: string; status: string; losgefahrenAtMs: number | null; svUnterwegsSeitMs: number | null; zielLat: number | null; zielLng: number | null; etaMinuten: number | null } | null
    freshCutoffMs?: number // default 5*60*1000
  }
  ```

- [ ] **Step 1: Failing test schreiben** (`car-state.test.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { deriveCarState } from './car-state'

const NOW = 1_000_000_000
describe('deriveCarState', () => {
  it('mode=live wenn GPS frisch (< cutoff)', () => {
    const r = deriveCarState({ nowMs: NOW, live: { lat: 52.5, lng: 13.4, heading: 90, updatedAtMs: NOW - 60_000 }, aktiverTermin: null })
    expect(r.mode).toBe('live'); expect(r.lat).toBe(52.5); expect(r.heading).toBe(90)
  })
  it('ignoriert stale GPS (> cutoff) -> faellt auf Termin zurueck', () => {
    const r = deriveCarState({ nowMs: NOW, live: { lat: 52.5, lng: 13.4, heading: 90, updatedAtMs: NOW - 20*60_000 }, aktiverTermin: { id: 't1', status: 'unterwegs', losgefahrenAtMs: NOW - 5*60_000, svUnterwegsSeitMs: null, zielLat: 50.9, zielLng: 6.9, etaMinuten: 12 } })
    expect(r.mode).toBe('unterwegs_derived'); expect(r.lat).toBe(50.9); expect(r.terminId).toBe('t1')
  })
  it('mode=unterwegs_derived wenn kein GPS aber losgefahren', () => {
    const r = deriveCarState({ nowMs: NOW, live: null, aktiverTermin: { id: 't2', status: 'losgefahren', losgefahrenAtMs: NOW - 3*60_000, svUnterwegsSeitMs: null, zielLat: 50.9, zielLng: 6.9, etaMinuten: 20 } })
    expect(r.mode).toBe('unterwegs_derived'); expect(r.etaMinuten).toBe(20)
  })
  it('mode=none wenn weder GPS noch aktiver Termin', () => {
    const r = deriveCarState({ nowMs: NOW, live: null, aktiverTermin: null })
    expect(r.mode).toBe('none'); expect(r.lat).toBeNull()
  })
  it('mode=none wenn Termin ohne Ziel-Koords und kein GPS', () => {
    const r = deriveCarState({ nowMs: NOW, live: null, aktiverTermin: { id: 't3', status: 'unterwegs', losgefahrenAtMs: NOW, svUnterwegsSeitMs: null, zielLat: null, zielLng: null, etaMinuten: null } })
    expect(r.mode).toBe('none')
  })
})
```

- [ ] **Step 2: Test laufen, muss FAILen** — Run: `npx vitest run src/lib/live-ops/car-state.test.ts` → FAIL („deriveCarState is not a function").

- [ ] **Step 3: Implementieren** (`car-state.ts`)

```typescript
import type { CarState } from './types'

type DeriveCarStateInput = {
  nowMs: number
  live: { lat: number; lng: number; heading: number | null; updatedAtMs: number } | null
  aktiverTermin: { id: string; status: string; losgefahrenAtMs: number | null; svUnterwegsSeitMs: number | null; zielLat: number | null; zielLng: number | null; etaMinuten: number | null } | null
  freshCutoffMs?: number
}
const NONE: CarState = { mode: 'none', lat: null, lng: null, heading: null, zielLat: null, zielLng: null, terminId: null, etaMinuten: null }

export function deriveCarState(i: DeriveCarStateInput): CarState {
  const cutoff = i.freshCutoffMs ?? 5 * 60 * 1000
  const t = i.aktiverTermin
  const hatZiel = !!t && t.zielLat != null && t.zielLng != null
  const istUnterwegs = !!t && (t.status === 'unterwegs' || t.status === 'losgefahren' || t.losgefahrenAtMs != null || t.svUnterwegsSeitMs != null)
  // 1) frisches GPS
  if (i.live && i.nowMs - i.live.updatedAtMs < cutoff) {
    return { mode: 'live', lat: i.live.lat, lng: i.live.lng, heading: i.live.heading,
      zielLat: hatZiel ? t!.zielLat : null, zielLng: hatZiel ? t!.zielLng : null,
      terminId: t?.id ?? null, etaMinuten: t?.etaMinuten ?? null }
  }
  // 2) termin-abgeleitet (nur wenn unterwegs UND Ziel bekannt)
  if (istUnterwegs && hatZiel) {
    return { mode: 'unterwegs_derived', lat: t!.zielLat, lng: t!.zielLng, heading: null,
      zielLat: t!.zielLat, zielLng: t!.zielLng, terminId: t!.id, etaMinuten: t!.etaMinuten }
  }
  return NONE
}
```

- [ ] **Step 4: Test laufen, muss PASSen** — Run: `npx vitest run src/lib/live-ops/car-state.test.ts` → 5 passed.

- [ ] **Step 5: Commit** — `git add src/lib/live-ops/car-state.* && git commit -m "feat(sv-live-ops): deriveCarState (pure, TDD)"`

---

## Task 4: View `v_live_ops_sv` + `getLiveOpsSvs`

**Files:**
- Create: `supabase/migrations/<V>_v_live_ops_sv.sql`, `src/lib/live-ops/get-live-svs.ts`

**Interfaces:**
- Consumes: `LiveOpsScope`, `SvLiveOps`, `deriveCarState`.
- Produces: `getLiveOpsSvs(scope: LiveOpsScope): Promise<SvLiveOps[]>`

- [ ] **Step 1: View-DDL (via `apply_migration`)** — `v_live_ops_sv` joint `sachverstaendige` (nicht-gelöscht, portal_zugang) LEFT JOIN jüngste `sv_live_location` + jüngste `sv_live_position.heading` + Profil-Name. `SECURITY INVOKER` (RLS der Basistabellen greift) ODER DEFINER + `is_staff()`-Filter — prüfen welches Muster die bestehenden `v_*`-Views nutzen (grep `CREATE VIEW` in `supabase/migrations`), konsistent bleiben.

```sql
CREATE OR REPLACE VIEW public.v_live_ops_sv AS
SELECT s.id, s.gutachter_typ, s.verifiziert, s.paket,
       s.paket_faelle_genutzt, s.paket_faelle_gesamt,
       s.standort_lat, s.standort_lng, s.isochrone_polygon,
       s.portal_zugang_freigeschaltet, s.gesperrt_seit, s.urlaub_von, s.urlaub_bis,
       s.live_tracking_enabled,
       p.vorname, p.nachname, p.avatar_url,
       loc.lat AS live_lat, loc.lng AS live_lng, loc.updated_at AS live_updated_at,
       pos.heading AS live_heading
FROM public.sachverstaendige s
JOIN public.profiles p ON p.id = s.profile_id
LEFT JOIN LATERAL (
  SELECT lat, lng, updated_at FROM public.sv_live_location l WHERE l.sv_id = s.id ORDER BY updated_at DESC LIMIT 1
) loc ON true
LEFT JOIN LATERAL (
  SELECT heading FROM public.sv_live_position pp WHERE pp.sv_id = s.id ORDER BY captured_at DESC LIMIT 1
) pos ON true
WHERE s.geloescht_am IS NULL;
```
(SPALTEN vorher gegen Prod verifizieren. `list_migrations` → File committen.)

- [ ] **Step 2: Failing test — Loader-Transform** (`get-live-svs.test.ts`): mocke einen View-Row + einen aktiven Termin, erwarte `SvLiveOps` mit korrekt gemapptem `car` (via deriveCarState). (Wenn DB-Mock zu schwer: den reinen Map-Teil als exportierte `mapSvRow(row, termin, nowMs)` extrahieren + testen — das ist die testbare Einheit.)

- [ ] **Step 3: `get-live-svs.ts` implementieren** — `createClient()`, `from('v_live_ops_sv').select('*')`, bei `scope.svIds !== 'all'` `.in('id', scope.svIds)`; für jede Zeile den aktiven Termin (aus einem gebündelten `gutachter_termine`-Query, assignee_id in svIds, status unterwegs/losgefahren/bestaetigt, start_zeit >= now-12h) laden → `mapSvRow` → `deriveCarState`. Name = `[vorname, nachname].join(' ')`.

- [ ] **Step 4: Test PASS.** **Step 5: Commit.**

---

## Task 5: `getOffeneTermine`

**Files:** Create `src/lib/live-ops/get-offene-termine.ts`
**Interfaces:** Produces `getOffeneTermine(scope): Promise<TerminPin[]>` (`TerminPin = { id, svId, svName, kundeName, status, startZeit, lat, lng, adresse, claimNummer }`).

- [ ] **Step 1:** Muster aus `src/lib/dispatch/karte/get-termine-today.ts` + `resolve-termin-geo.ts` WIEDERVERWENDEN (importieren, nicht kopieren). Query: `gutachter_termine` mit `status NOT IN ('abgeschlossen','storniert','cancelled')` + `assignee_typ='sachverstaendiger'`, heute/offen; Ziel-Koords via `resolveTerminGeo`; role-scope: `scope.svIds !== 'all'` → `.in('assignee_id', scope.svIds)`.
- [ ] **Step 2:** tsc grün, Loader gibt `TerminPin[]`. **Step 3: Commit.**

---

## Task 6: `getUnterwegsRouten`

**Files:** Create `src/lib/live-ops/get-unterwegs-routen.ts`
**Interfaces:** Produces `getUnterwegsRouten(scope): Promise<UnterwegsRoute[]>` (`UnterwegsRoute = { svId, coords: [number,number][] }`).

- [ ] **Step 1:** Für SVs mit `car.mode !== 'none'` (aus `getLiveOpsSvs`, wiederverwenden — NICHT neu abfragen): Route = `route_polyline` aus jüngster `sv_live_position` (falls vorhanden, decode) SONST `fetchDrivingRoute({lat:car.lat,lng:car.lng}, {lat:car.zielLat,lng:car.zielLng})` aus `@/lib/mapbox/directions` (Server, nutzt `MAPBOX_ACCESS_TOKEN`). Token-loser Fallback = Luftlinie (Directions-Helper macht das schon).
- [ ] **Step 2:** tsc grün. **Step 3: Commit.**

---

## Task 7: `getTagesrouten`

**Files:** Create `src/lib/live-ops/get-tagesrouten.ts`
**Interfaces:** Produces `getTagesrouten(scope): Promise<TagesRoute[]>` (`TagesRoute = { svId, svName, stops: { terminId, lat, lng, startZeit, reihenfolge }[] }`).

- [ ] **Step 1:** Pro SV die heutigen Termine (Berlin-Tagesgrenze via `berlinWallClockToUtc` wie `get-termine-today`) nach `start_zeit` sortiert → nummerierte Stops mit Ziel-Koords (`resolveTerminGeo`). Role-scope wie Task 5. (Layer default AUS — reine Datenlieferung hier.)
- [ ] **Step 2:** tsc grün. **Step 3: Commit.**

---

## Task 8: `getDeadPins` + Barrel

**Files:** Create `src/lib/live-ops/get-dead-pins.ts`, `src/lib/live-ops/index.ts`
**Interfaces:** Produces `getDeadPins(scope): Promise<DeadPin[]>` (`DeadPin = { id, name, firma, status, lat, lng, region, quelle }`); Barrel re-exportiert alle Loader + Types.

- [ ] **Step 1:** `sv_leads` laden (Muster aus `src/lib/sv-leads/*` / `SvLeadsClient`-Loader wiederverwenden — Spalten verifizieren) mit Koordinaten; Dead-Pins sind admin/dispatch-scoped (KB sieht keine → bei `role==='kundenbetreuer'` leeres Array). Status-Filter offen/beansprucht/konvertiert/abgelehnt bleibt Client-seitig (Chunk 2).
- [ ] **Step 2:** `index.ts` Barrel. tsc grün. **Step 3: Commit.**

---

## Task 9: Mobile-API-Audit-Notiz + Gesamt-Verifikation

**Files:** Modify: `docs/superpowers/specs/2026-07-04-sv-live-ops-karte-design.md` (kurzer Audit-Anhang)

- [ ] **Step 1:** Ergebnis des `/api/sv/*`-Audits als Anhang in die Spec (funktional/tot): `position-batch` (funktional, jetzt via Trigger→live_location), `trackPosition` (funktional), `heading` (Mobile-App sendet nicht → Follow-up Mobile), + Liste weiterer `/api/sv/*`-Endpoints (grep) mit Status.
- [ ] **Step 2:** `npx tsc --noEmit` + `npx vitest run src/lib/live-ops` + `npm run check:token-audit` + `check:knip -- --ratchet` + `check:component-set -- --ratchet` — alle grün.
- [ ] **Step 3:** Commit + PR gegen staging: `fix(sv-live-ops): Chunk 1 — Datenschicht + Tracking-Fundament`.

---

## Self-Review

- **Spec-Coverage:** Datenschicht (§3a) → Tasks 2-8; Pipeline-Fundament (§8) → Task 1; Mobile-API-Audit (§8) → Task 9; carState (§6) → Task 3; Rollen-Scope (§9) → Task 2. Kein UI (§ Nicht-Ziele) — korrekt keins. Leads-Layer-Loader ist Chunk-3/2-Scope (Dispatch-Vollersatz) — hier bewusst NICHT (Chunk 1 = SV-zentrierte Loader); als Follow-up notiert.
- **Placeholder-Scan:** `<V>` = vom Plugin vergebene Migrations-Version (kein Platzhalter, sondern Regel-2-Schritt). Alle Loader mit konkretem Query-Muster + Wiederverwendungs-Quelle.
- **Type-Consistency:** `CarState`/`SvLiveOps`/`TerminPin` in Task 2 definiert, in 3-8 konsumiert; `deriveCarState`-Signatur identisch in Task 3 def + Task 4 use.

**Follow-up für Chunk 2/3:** Leads-Layer-Loader (`getLeads(scope)`) für den Dispatch-Vollersatz; KB-Scope-Verfeinerung; optionaler Sim-Seed (klar markiert).
