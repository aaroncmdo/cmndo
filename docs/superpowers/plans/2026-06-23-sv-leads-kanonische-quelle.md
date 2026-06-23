# Kanonische SV-Lead-Quelle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eine kanonische, idempotente, pflegbare Quelle für `sv_leads` (Dead-Pin-Pool) — ein einziger `sv_lead_upsert`-Schreibweg (Dedup DAT **oder** Name+PLZ), Admin-Anlage (Einzel + Bulk-CSV) für DAT **und Nicht-DAT**, Isochrone-Refresh, Datenqualität + Claim-Einladung.

**Architecture:** DB-nativ — RPC `sv_lead_upsert(jsonb)` als einziger Insert/Update-Pfad in `sv_leads`; Dedup auf `dat_id` (UNIQUE existiert) oder `(normalized_name, plz)` (neuer Partial-Unique) für Nicht-DAT. Admin-Server-Actions + Cron rufen die RPC. Der `isochrone-backfill`-Cron wird auf `sv_leads` ausgeweitet.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase Postgres (DDL/RPC via Plugin `apply_migration`), TypeScript, Tailwind v4 + Claimondo-Tokens, Mapbox Isochrone/Geocode, vitest. project_id `paizkjajbuxxksdoycev`.

**Spec:** `docs/superpowers/specs/2026-06-23-sv-leads-kanonische-quelle-design.md`.

## Global Constraints
- **Regel 1:** Branch `kitta/sv-leads-kanonische-quelle` (existiert), PR gegen `staging`, nie direkt main.
- **Regel 2 (DDL/RPC):** Schema + Funktionen NUR via `mcp__plugin_supabase_supabase__apply_migration`. Ablauf: apply → `list_migrations` (recorded Version `<V>`) → File `supabase/migrations/<V>_<name>.sql` (Name == `<V>`) → `execute_sql` (READ) verifizieren. `execute_sql` nur READ.
- **Regel 3:** kein unbegleiteter Stash.
- **7-Punkte-Audit** in jeder Commit-Message über `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Server-Actions:** Result-Object `{ ok; error? }` (nicht throw); `revalidatePath`; non-critical Sends (Mail/WA) in try/catch.
- **Frontend-Umlaute:** echte ä/ö/ü/ß in allen UI-Strings.
- **Komponenten:** `primitives.*`/`shared/DataTable`/`shared/forms/TextField` — kein handgerolltes Tailwind. Net-New-Gates erst NACH `git add`.
- **Privacy:** der öffentliche Dead-Pin-Read (`ladeSvLeads` in `gutachter-finder-actions.ts`) bleibt **unverändert** leak-safe (nur id/lat/lng). Kontakt/Quals nur intern (Admin/Service-Role).
- **Build:** voller `npm run build` mit `NODE_OPTIONS=--max-old-space-size=8192` (Default-Heap OOMt im Worktree; CI hat genug) + die 3 Ratchets (token-audit/component-set/knip).
- **Worktree-Disziplin (Subagenten):** Arbeits-Dir IMMER `...\.claude\worktrees\aar-956-gf-2button`; vor jedem Commit `git -C <worktree> rev-parse --abbrev-ref HEAD` == `kitta/sv-leads-kanonische-quelle`, sonst BLOCKED.

## Reuse / Bestand (verifiziert)
- `sv_leads`-Spalten: id, name, firma, vorname, nachname, adresse, plz, ort, lat, lng, telefon, email, dat_id, dat_url, dat_expert_nr, bvsk_nr, ihk_zertifikat, oebuv_nr, qualifikationen[], fachschwerpunkte, jahre_erfahrung, auftraege_monat, radius_km, paket_umkreis_km, isochrone_polygon, quelle, ist_aktiv, warteliste_status, konvertiert_zu_sv_id, konvertiert_am, claim_status, erstellt_am, aktualisiert_am. **Indizes:** `sv_leads_dat_id_key` UNIQUE(dat_id), pkey, ist_aktiv_idx, lat_lng_idx.
- `calculateIsochrone(lat,lng,radiusKm)` → `IsoPoint[]` (`src/lib/isochrone/calculate-isochrone.ts`).
- `geocodeAdresse(adresse)` → `{lat,lng,formatted,placeId}|null` (`src/lib/mapbox/geocode.ts`).
- Refresh-Cron: `src/app/api/cron/isochrone-backfill/route.ts` (sachverstaendige-only; CRON_SECRET; MAX_PER_RUN=20; GeoJSON-Ring-Schließung).
- Consumer (NICHT brechen): `src/lib/sv-matching-modul/lade-deadpin-fallback.ts` (liest id/ort/lat/lng/isochrone_polygon/paket_umkreis_km WHERE ist_aktiv), `gutachter-finder-actions.ts:ladeSvLeads` (id/lat/lng public), `sv-basic/claim-actions.ts` (Claim).
- Admin-Anlage-Muster: `src/app/admin/sachverstaendige/anlegen` + `src/app/admin/werkstaetten` (createWerkstatt: requireAdmin + GooglePlaceAutocomplete + calculateIsochrone). Alt-Import: `scripts/sv-import-small.sql` (DELETE+INSERT — wird abgelöst).

---

## File Structure
- Create: `supabase/migrations/<V1>_sv_leads_dedup.sql` (normalized_name + nondat-unique)
- Create: `supabase/migrations/<V2>_sv_lead_upsert.sql` (RPC)
- Create: `src/lib/sv-leads/upsert.ts` (TS-Wrapper um die RPC + Payload-Typ)
- Create: `src/app/admin/sv-leads/page.tsx` + `SvLeadsClient.tsx` + `actions.ts` (Liste + Einzel-Anlage + Bulk-Import)
- Create: `src/lib/sv-leads/bulk-import.ts` (CSV-Parse → geocode → sv_lead_upsert)
- Create: `src/lib/sv-leads/sources/types.ts` (`SvLeadSource`-Interface) + `src/lib/sv-leads/sources/dat-stub.ts`
- Create: `src/lib/sv-leads/claim-einladung.ts` (Mail/WA an offene Leads)
- Modify: `src/app/api/cron/isochrone-backfill/route.ts` (sv_leads-Pass ergänzen)
- Modify: admin-nav (Link „SV-Leads")

---

## WP-A — Dedup + kanonischer Schreibweg

### Task 1: Migration — Nicht-DAT-Dedup
**Files:** Create `supabase/migrations/<V1>_sv_leads_dedup.sql`
**Interfaces:** Produces: `sv_leads.normalized_name` (generated) + `UNIQUE (normalized_name, plz) WHERE dat_id IS NULL`.

- [ ] **Step 1: Dubletten-Precheck (READ)** — sicherstellen, dass der Partial-Unique nicht an Bestand scheitert.
  Run (READ): `execute_sql("select lower(regexp_replace(name,'\\s+',' ','g')) nn, plz, count(*) from sv_leads where dat_id is null group by 1,2 having count(*)>1")` → muss **0 Zeilen** sein (sonst erst bereinigen).
- [ ] **Step 2: DDL via Plugin**
```
apply_migration({ name: "sv_leads_dedup", query: `
ALTER TABLE public.sv_leads ADD COLUMN IF NOT EXISTS normalized_name text
  GENERATED ALWAYS AS (lower(regexp_replace(coalesce(name,''), '\\s+', ' ', 'g'))) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS sv_leads_nondat_dedup
  ON public.sv_leads (normalized_name, plz) WHERE dat_id IS NULL;
` })
```
- [ ] **Step 3: Recorded Version + verifizieren** — `list_migrations` → `<V1>`; READ `select count(*) from information_schema.columns where table_name='sv_leads' and column_name='normalized_name'` = 1.
- [ ] **Step 4: File committen** als `supabase/migrations/<V1>_sv_leads_dedup.sql` (exakt das applizierte DDL).

### Task 2: RPC `sv_lead_upsert` (einziger Schreibweg)
**Files:** Create `supabase/migrations/<V2>_sv_lead_upsert.sql` · Create `src/lib/sv-leads/upsert.ts`
**Interfaces:** Produces: `sv_lead_upsert(p jsonb) RETURNS uuid`; TS `upsertSvLead(payload: SvLeadPayload): Promise<{ok:true;id:string}|{ok:false;error:string}>`.

- [ ] **Step 1: RPC via Plugin** — conditional ON CONFLICT (dat_id vs nondat).
```
apply_migration({ name: "sv_lead_upsert", query: `
CREATE OR REPLACE FUNCTION public.sv_lead_upsert(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid; v_dat text := nullif(p->>'dat_id','');
BEGIN
  IF v_dat IS NOT NULL THEN
    INSERT INTO public.sv_leads (name, firma, vorname, nachname, adresse, plz, ort, lat, lng,
      telefon, email, dat_id, dat_expert_nr, qualifikationen, paket_umkreis_km, quelle, ist_aktiv, claim_status, aktualisiert_am)
    VALUES (p->>'name', p->>'firma', p->>'vorname', p->>'nachname', p->>'adresse', p->>'plz', p->>'ort',
      (p->>'lat')::float8, (p->>'lng')::float8, p->>'telefon', p->>'email', v_dat, p->>'dat_expert_nr',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'qualifikationen','[]'::jsonb))), coalesce((p->>'paket_umkreis_km')::int,15),
      coalesce(p->>'quelle','admin'), coalesce((p->>'ist_aktiv')::bool,true), 'offen', now())
    ON CONFLICT (dat_id) DO UPDATE SET name=excluded.name, firma=excluded.firma, vorname=excluded.vorname,
      nachname=excluded.nachname, adresse=excluded.adresse, plz=excluded.plz, ort=excluded.ort,
      lat=excluded.lat, lng=excluded.lng, telefon=excluded.telefon, email=excluded.email,
      dat_expert_nr=excluded.dat_expert_nr, qualifikationen=excluded.qualifikationen,
      paket_umkreis_km=excluded.paket_umkreis_km, aktualisiert_am=now()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.sv_leads (name, firma, vorname, nachname, adresse, plz, ort, lat, lng,
      telefon, email, qualifikationen, paket_umkreis_km, quelle, ist_aktiv, claim_status, aktualisiert_am)
    VALUES (p->>'name', p->>'firma', p->>'vorname', p->>'nachname', p->>'adresse', p->>'plz', p->>'ort',
      (p->>'lat')::float8, (p->>'lng')::float8, p->>'telefon', p->>'email',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'qualifikationen','[]'::jsonb))), coalesce((p->>'paket_umkreis_km')::int,15),
      coalesce(p->>'quelle','admin'), coalesce((p->>'ist_aktiv')::bool,true), 'offen', now())
    ON CONFLICT (normalized_name, plz) WHERE dat_id IS NULL DO UPDATE SET firma=excluded.firma,
      vorname=excluded.vorname, nachname=excluded.nachname, adresse=excluded.adresse, ort=excluded.ort,
      lat=excluded.lat, lng=excluded.lng, telefon=excluded.telefon, email=excluded.email,
      qualifikationen=excluded.qualifikationen, paket_umkreis_km=excluded.paket_umkreis_km, aktualisiert_am=now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
` })
```
- [ ] **Step 2: Recorded Version + Smoke (READ)** — `list_migrations` → `<V2>`; verifizieren via `execute_sql("select proname from pg_proc where proname='sv_lead_upsert'")` = 1 Zeile. (Funktionaler RPC-Test = vitest mit Mock + der Integration-Smoke in Task 7.)
- [ ] **Step 3: File committen** als `<V2>_sv_lead_upsert.sql`.
- [ ] **Step 4: TS-Wrapper** `src/lib/sv-leads/upsert.ts`:
```ts
import { createAdminClient } from '@/lib/supabase/admin'
export type SvLeadPayload = {
  name: string; firma?: string|null; vorname?: string|null; nachname?: string|null
  adresse?: string|null; plz?: string|null; ort?: string|null; lat?: number|null; lng?: number|null
  telefon?: string|null; email?: string|null; dat_id?: string|null; dat_expert_nr?: string|null
  qualifikationen?: string[]|null; paket_umkreis_km?: number|null; quelle?: string|null; ist_aktiv?: boolean|null
}
export async function upsertSvLead(payload: SvLeadPayload): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('sv_lead_upsert', { p: payload as unknown as Record<string, unknown> })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data as string }
}
```
- [ ] **Step 5: tsc + Commit.**

---

## WP-B — Admin-Anlage

### Task 3: Admin `/admin/sv-leads` — Liste + Einzel-Anlage
**Files:** Create `src/app/admin/sv-leads/page.tsx`, `SvLeadsClient.tsx`, `actions.ts` · Modify admin-nav
**Interfaces:** Consumes `upsertSvLead` (Task 2), `requireAdmin`-Muster, `geocodeAdresse`/GooglePlaceAutocomplete. Produces `createSvLead(formData)` + `getSvLeads()`.

- [ ] **Step 1: Failing test** `src/app/admin/sv-leads/__tests__/actions.test.ts` — non-admin → `{ok:false}`; fehlt name → `{ok:false}`; happy → `upsertSvLead` aufgerufen mit den Form-Feldern. (Mock-Muster wie `admin/werkstaetten/__tests__/actions.test.ts`.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: `actions.ts`** — `requireAdmin`-Gate; `createSvLead(formData)`: liest name (Pflicht), firma, adresse/plz/ort + lat/lng (aus GooglePlaceAutocomplete), telefon, email, optional dat_expert_nr/dat_id, qualifikationen, paket_umkreis_km (default 15) → `upsertSvLead({...quelle:'admin'})` → `revalidatePath('/admin/sv-leads')`. `getSvLeads()`: Liste (id,name,firma,ort,plz,ist_aktiv,claim_status,konvertiert_zu_sv_id,quelle,aktualisiert_am). **dat_id ist NICHT Pflicht** (Nicht-DAT-Anlage).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: UI** `page.tsx` (admin-gate, lädt getSvLeads) + `SvLeadsClient.tsx` (`shared/DataTable`-Liste + „Neuer Dead-Pin"-Dialog via `primitives` + `shared/forms/TextField` + GooglePlaceAutocomplete; Status-Badges semantische Tokens; Umlaute) + Admin-Nav-Eintrag „SV-Leads".
- [ ] **Step 6: git add → Build + 3 Ratchets → Commit.**

### Task 4: Bulk-CSV-Import (löst das SQL-Script ab)
**Files:** Create `src/lib/sv-leads/bulk-import.ts` · Modify `SvLeadsClient.tsx`/`actions.ts` (Upload-Action)
**Interfaces:** Consumes `upsertSvLead`, `geocodeAdresse`. Produces `importSvLeadsCsv(rows): Promise<{ok:true;importiert:number;fehler:string[]}|{ok:false;error:string}>`.

- [ ] **Step 1: Failing test** — eine CSV-Zeile ohne Coords → `geocodeAdresse` aufgerufen → `upsertSvLead` mit den geocodeten Coords; idempotent (zweimal dieselbe Zeile = ein Lead). Pure Parse-/Map-Logik in einen testbaren Helper auslagern.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementieren** — `bulk-import.ts`: CSV-Parse (Spalten name/firma/adresse/plz/ort/telefon/email/dat_expert_nr/qualifikationen/paket_umkreis_km), je Zeile: wenn keine lat/lng + Adresse → `geocodeAdresse` (best-effort), dann `upsertSvLead({...quelle:'admin_bulk'})`. Fehler je Zeile sammeln (nicht abbrechen). admin-gated Server-Action `importSvLeads(csvText)`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: UI** — Upload-Feld im SvLeadsClient (CSV → importSvLeads → Ergebnis-Toast). + `scripts/sv-import-small.sql` mit Deprecation-Header markieren (Verweis auf den Bulk-Import; KEIN DELETE+INSERT mehr als kanonisch).
- [ ] **Step 6: git add → Build + Ratchets → Commit.**

---

## WP-D — Refresh

### Task 5: `isochrone-backfill`-Cron auf `sv_leads` ausweiten
**Files:** Modify `src/app/api/cron/isochrone-backfill/route.ts`
**Interfaces:** Consumes `calculateIsochrone`, `geocodeAdresse`. Erweitert den bestehenden Cron um einen sv_leads-Pass.

- [ ] **Step 1: sv_leads-Pass ergänzen** — nach dem sachverstaendige-Pass: lade bis `MAX_PER_RUN` `sv_leads` mit `isochrone_polygon IS NULL` (oder lat/lng NULL + adresse vorhanden) und `ist_aktiv`; je Zeile: wenn keine Coords + adresse → `geocodeAdresse` → lat/lng updaten; dann `calculateIsochrone(lat,lng, paket_umkreis_km||15)` → GeoJSON-Ring (gleiche Schließungs-Logik wie Bestand) → `update sv_leads set isochrone_polygon=...`. In den Response-JSON `sv_leads_backfilled` aufnehmen. Best-effort (Fehler je Zeile sammeln, Cron bricht nicht).
- [ ] **Step 2: Build** (`npm run build`) grün — Route-Validator. **Commit.** (Test: die Geo-Ring-Logik ist schon erprobt; der sv_leads-Pass spiegelt den sachverstaendige-Pass — Verifikation via Post-Deploy-Smoke + READ.)

---

## WP-E — Datenqualität / Aktivierung

### Task 6: Claim-Einladung (aktiviert den 0-Conversion-Pool)
**Files:** Create `src/lib/sv-leads/claim-einladung.ts` · Modify `SvLeadsClient.tsx`/`actions.ts`
**Interfaces:** Consumes `sv_leads` (Leads mit Kontakt), die Mail/WA-Sender (`sendWhatsAppText`/Resend), `claim_status`. Produces `ladeSvLeadEinladung(leadId)` (Einzel) + Bulk.

- [ ] **Step 1: Implementieren** — `ladeSvLeadEinladung(leadId)`: lädt den Lead (admin), wenn `claim_status='offen'` + Kontakt vorhanden → schickt Mail/WA „Beanspruchen Sie Ihr Profil" mit Link `/sv/registrieren?lead=<id>` (best-effort try/catch). Admin-Action im SvLeadsClient (Button je Zeile + Bulk „Alle offenen einladen"). Result-Object.
- [ ] **Step 2: Build + Commit.** (Kein Auto-Send ohne Admin-Klick — DSGVO/Spam-Schutz.)

---

## WP-C — Verzeichnis-Sync-Adapter (Interface + Stub, DAT-Wiring gegated)

### Task 7: `SvLeadSource`-Interface + DAT-Stub + Integration-Smoke
**Files:** Create `src/lib/sv-leads/sources/types.ts`, `src/lib/sv-leads/sources/dat-stub.ts`
**Interfaces:** Produces `SvLeadSource` (`fetchCandidates(): Promise<SvLeadPayload[]>`) + ein `datStubSource` (liefert `[]` + TODO-Doku bis DAT-Zugang).

- [ ] **Step 1: Interface + Stub** — `types.ts`: `export interface SvLeadSource { name: string; fetchCandidates(): Promise<SvLeadPayload[]> }`. `dat-stub.ts`: `datStubSource` mit `fetchCandidates()=>[]` + JSDoc „DAT-API-Wiring gegated auf DAT-Zugang (Aaron); bis dahin Bulk-CSV (Task 4)". (Kein Cron-Verdrahten — der Sync-Run ist erst sinnvoll, wenn eine echte Source existiert.)
- [ ] **Step 2: End-to-End-Integration-Smoke (manuell/post-deploy, READ + ein Admin-Anlage-Flow):**
  - Admin legt einen **Nicht-DAT**-Lead an (Name+Adresse, kein dat_id) → erscheint in `sv_leads` (quelle='admin', claim_status='offen').
  - Zweite Anlage mit gleichem Name+PLZ → **Update statt Dublette** (Dedup).
  - Ein **DAT**-Lead (dat_id gesetzt) → onConflict(dat_id)-Idempotenz.
  - Refresh-Cron-Run → `sv_leads`-Isochrone gefüllt.
  - Bulk-CSV mit 2 Zeilen → 2 Leads, Re-Run → unverändert (idempotent).
- [ ] **Step 3: tsc + Commit.**

---

## Reihenfolge & Abhängigkeiten
```
A1 (Dedup-DDL) → A2 (RPC sv_lead_upsert) → B3 (Admin Einzel) → B4 (Bulk-CSV) → D5 (Refresh-Cron) → E6 (Claim-Einladung) → C7 (Sync-Stub + Smoke)
```
Jede Task = eigener Commit + grüner Build/Gate; PR gegen `staging` (klein, reviewbar).

## Test-Strategie
- **vitest:** createSvLead-Validierung (Task 3), Bulk-Parse/geocode/idempotenz-Helper (Task 4).
- **DB-Integration (Task 7 Smoke):** Dedup (DAT + Nicht-DAT), Idempotenz, Refresh — gegen die echte DB post-deploy (RPC ist DB-nativ; nicht per execute_sql-Write testen, Regel 2).
- **Build:** voller `npm run build` (Heap erhöht) bei jedem Routen-/Action-Touch.

## Offene Aaron-Entscheidungen (im PR-Body markieren)
1. **DAT-API-Zugang** → bestimmt, ob Task 7 über den Stub hinaus konkret wird.
2. **Claim-Einladungs-Text** (Mail/WA-Wording) — Default-Vorschlag in Task 6, anpassbar.
