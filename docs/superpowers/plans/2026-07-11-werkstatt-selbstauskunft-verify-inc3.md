# Werkstatt-Selbstauskunft + Verifizierung — Inc 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Werkstatt pflegt `faehigkeiten` selbst im Portal; Admin-`verifiziert`-Marker → Trust-Badge + Vorreihung im Finder.
**Architecture:** Owned self-service action (mirror `updateWerkstattProfil`), Admin-verify action (mirror `setWerkstattFaehigkeiten`), `verifiziert`-Sekundär-Sort in Inc-1 `qualifiziereWerkstaetten`, Badge in `WerkstattFinder`.
**Spec:** `docs/superpowers/specs/2026-07-11-werkstatt-selbstauskunft-verify-inc3-design.md`

## Global Constraints
- Vokabular = `GEWERKE` aus `@/lib/werkstatt/bedarf/types` (`karosserie|lackierung|mechanik|glas|smart_repair`) — DRY, kein Redefine.
- Self-Service-Action: `user_id`-scoped (`auth.getUser()` → `.eq('user_id', user.id)`), KEIN werkstattId-Param (kein IDOR).
- Admin-Action: `requireAdmin()`; Result-Object; `revalidatePath`.
- DDL nur via Supabase-Plugin (Regel 2); File-Name == getrackte Version.
- Vorreihung getrennt vom Tier-Rang; `verifiziert` optional auf Row-Typ → Bestands-Caller unverändert.
- Ratchets 0-neu; Umlaute in UI; `StatusBadge` fürs Badge (kein handgerolltes).
- **Kollisions-Guard** bei `WerkstattFinder.tsx` / `qualifiziere.ts` / `findWerkstaetten` prüfen (6c630247 werkstatt-Lane).

## File Structure
- `src/lib/actions/werkstatt-settings.ts` — +`setMeineFaehigkeiten`.
- `src/components/werkstatt/WerkstattSettings.tsx` + `src/app/werkstatt/(shell)/einstellungen/page.tsx` — „Meine Leistungen"-Card + fetch.
- `supabase/migrations/<V>_werkstatt_verifiziert.sql` (Task 3).
- `src/app/admin/werkstaetten/actions.ts` — +`setWerkstattVerifiziert`; `.../[id]/WerkstattDetailClient.tsx` — Verify-Toggle.
- `src/lib/werkstatt/bedarf/qualifiziere.ts` — +`verifiziert`-Sort.
- `src/lib/werkstatt/finder.ts` — `SELECT_COLS` +`verifiziert`, Row-Typ +`verifiziert`.
- `src/components/werkstatt/finder/WerkstattFinder.tsx` — Verifiziert-Chip.

---

### Task 1: `setMeineFaehigkeiten` (owned self-service action)

**Files:** Modify `src/lib/actions/werkstatt-settings.ts`; Test (neu) `src/lib/actions/__tests__/werkstatt-settings-faehigkeiten.test.ts`.

- [ ] **Step 1: Test** (mock supabase server + admin client): gültige Gewerke → update mit `.eq('user_id', user.id)`; ungültige Werte gefiltert; nicht angemeldet → `{ok:false}`; DB-Fehler → `{ok:false, error}`.
- [ ] **Step 2: RED**.
- [ ] **Step 3: Implement** (Muster `updateWerkstattProfil` im selben File lesen):
```ts
import { GEWERKE } from '@/lib/werkstatt/bedarf/types'
export async function setMeineFaehigkeiten(faehigkeiten: string[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const clean = (faehigkeiten ?? []).filter((f) => (GEWERKE as readonly string[]).includes(f))
  const admin = createAdminClient()
  const { error } = await admin.from('werkstaetten').update({ faehigkeiten: clean }).eq('user_id', user.id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/werkstatt/einstellungen')
  return { ok: true }
}
```
(Imports `createClient`/`createAdminClient`/`revalidatePath` sind im File vorhanden — prüfen.)
- [ ] **Step 4: GREEN**. **Step 5: Commit** `feat(werkstatt): setMeineFaehigkeiten (owned self-service)`.

---

### Task 2: „Meine Leistungen"-Card (Werkstatt-Einstellungen)

**Files:** Modify `src/components/werkstatt/WerkstattSettings.tsx`, `src/app/werkstatt/(shell)/einstellungen/page.tsx`.

- [ ] **Step 1:** `einstellungen/page.tsx` — `faehigkeiten` in den werkstatt-Select aufnehmen, an `WerkstattSettings` als Prop.
- [ ] **Step 2:** In `WerkstattSettings.tsx` eine „Meine Leistungen"-Card (Toggle-Buttons je `GEWERKE`, Vorbild `FaehigkeitenStaffelEditor.tsx`; „nichts gewählt = Vollservice"-Hinweis) → `setMeineFaehigkeiten(sel)` on Save (Result-Check + Toast). Umlaute.
- [ ] **Step 3: VERIFY** `npm run build` (RSC/Route) oder tsc; Ratchets `check:component-set`/`check:token-audit` 0-neu (Toggle-Buttons = `primitives.Button`, kein handgerollt). **Step 4: Commit** `feat(werkstatt): Meine-Leistungen-Card in Einstellungen`.

---

### Task 3: DDL — `werkstaetten.verifiziert*` (Supabase-Plugin)

**Files:** Create `supabase/migrations/<V>_werkstatt_verifiziert.sql`.

- [ ] **Step 1: apply_migration** `{ name: 'werkstatt_verifiziert', query: <DDL> }`:
```sql
alter table public.werkstaetten
  add column if not exists verifiziert boolean not null default false,
  add column if not exists verifiziert_am timestamptz,
  add column if not exists verifiziert_von uuid,
  add column if not exists verifizierung_notiz text;
comment on column public.werkstaetten.verifiziert is 'Admin-verifizierte Werkstatt (Trust-Marker + Vorreihung im Finder)';
```
- [ ] **Step 2: list_migrations** → Version `<V>` ablesen. **Step 3:** File committen als `<V>_werkstatt_verifiziert.sql`. **Step 4: execute_sql** verify (4 Spalten). Commit `feat(db): werkstaetten.verifiziert* (Trust-Marker)`.

---

### Task 4: `setWerkstattVerifiziert` (Admin-Action)

**Files:** Modify `src/app/admin/werkstaetten/actions.ts`; Test erweitern.

- [ ] **Step 1: Test** (mock): `requireAdmin` erzwungen; setzt `verifiziert` + `verifiziert_am` + `verifiziert_von`; Result-Object.
- [ ] **Step 2: RED**. **Step 3:** (Muster `setWerkstattFaehigkeiten` im selben File):
```ts
export async function setWerkstattVerifiziert(
  werkstattId: string, verifiziert: boolean, notiz?: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin() // liefert admin-client + user; Muster im File pruefen
  const { error } = await admin.client.from('werkstaetten').update({
    verifiziert,
    verifiziert_am: verifiziert ? new Date().toISOString() : null,
    verifiziert_von: verifiziert ? admin.userId : null,
    verifizierung_notiz: notiz ?? null,
  }).eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
```
(Exakte `requireAdmin`-Rückgabe-Shape beim Lesen anpassen.)
- [ ] **Step 4: GREEN**. **Step 5: Commit** `feat(werkstatt): setWerkstattVerifiziert (Admin)`.

---

### Task 5: Admin-Verify-Toggle im Werkstatt-Detail

**Files:** Modify `src/app/admin/werkstaetten/[id]/WerkstattDetailClient.tsx` (+ ggf. `page.tsx` für `verifiziert`-Fetch).

- [ ] **Step 1:** `verifiziert`-Status laden + im Detail einen „Verifizieren"/„Verifizierung aufheben"-Toggle (+ optionales Notiz-Feld) → `setWerkstattVerifiziert(id, !verifiziert, notiz)` (Result-Check + Toast). Status-Chip „verifiziert am …". Umlaute.
- [ ] **Step 2: VERIFY** build/tsc + Ratchets 0-neu. **Step 3: Commit** `feat(werkstatt): Admin-Verify-Toggle im Werkstatt-Detail`.

---

### Task 6: `qualifiziereWerkstaetten` — verifiziert-Vorreihung (rein)

**Files:** Modify `src/lib/werkstatt/bedarf/qualifiziere.ts`; Test erweitern.

- [ ] **Step 1: Test:** hart-Modus, bedarf conf 100, rows: A[passt,unverifiziert], B[passt,verifiziert], C[unbekannt,verifiziert] → Reihenfolge `B (passt+verifiziert), A (passt), C (unbekannt)`; Distanz-Reihenfolge innerhalb (fit,verifiziert)-Gruppe erhalten (stabil); ohne `verifiziert`-Feld = unverändert (Inc-1-Bestandstest bleibt grün).
- [ ] **Step 2: RED**. **Step 3:** Row-Typ `Qualifiziert<T>` / Input `T extends { faehigkeiten...; verifiziert?: boolean }`. Im hart-Pfad Sort erweitern:
```ts
const rang = (f: Fit) => (f === 'passt' ? 0 : 1)
const vRang = (v?: boolean) => (v ? 0 : 1)
const sortiert = [...sichtbar].sort((a, b) => (rang(a.fit) - rang(b.fit)) || (vRang(a.verifiziert) - vRang(b.verifiziert)))
```
(Stabil → Distanz-Reihenfolge innerhalb gleicher (fit,verifiziert) erhalten. Weich-Pfad unverändert = MVP.)
- [ ] **Step 4: GREEN** (`node node_modules/vitest/vitest.mjs run src/lib/werkstatt/bedarf/`). **Step 5: Commit** `feat(werkstatt-bedarf): verifiziert-Vorreihung in qualifiziereWerkstaetten`.

---

### Task 7: `verifiziert` im Finder — Select + Badge

**Files:** Modify `src/lib/werkstatt/finder.ts` (`SELECT_COLS` + `WerkstattFinderRow`), `src/components/werkstatt/finder/WerkstattFinder.tsx`.

- [ ] **Step 1:** `finder.ts`: `WerkstattFinderRow` +`verifiziert: boolean` (default false); `SELECT_COLS` um `verifiziert` erweitern; `rankWerkstaetten`-map reicht `verifiziert` durch. (Claim-Finder/Embed nutzen `findWerkstaetten` → bekommen `verifiziert` automatisch; `qualifiziereWerkstaetten` nutzt es via T6.)
- [ ] **Step 2:** `WerkstattFinder.tsx`: bei `w.verifiziert` einen Chip `<StatusBadge tone="success" size="xs">✓ Verifizierter Partner</StatusBadge>` am Namen (neben dem Fit-Chip). Optional.
- [ ] **Step 3: VERIFY** — **Kollisions-Guard prüfen** (falls `WerkstattFinder.tsx` von 6c630247 berührt → STOP + melden). `node node_modules/vitest/vitest.mjs run src/lib/werkstatt/` grün; build/tsc; Ratchets 0-neu. **Step 4: Commit** `feat(werkstatt): Verifiziert-Chip + Select im Finder`.

---

## Self-Review (Autor)
**Spec-Abdeckung:** Self-Service (T1/T2), DDL (T3), Admin-Verify (T4/T5), Vorreihung (T6), Badge+Select (T7). ✅
**Typ-Konsistenz:** `GEWERKE` (Inc 1) als Vokabular; `verifiziert` optional auf Row → Bestands-Caller unverändert; `qualifiziereWerkstaetten` erweitert, nicht gebrochen. ✅
**Reihenfolge:** T1/T6 rein/sofort. T3 (DDL, MCP) → T4 (braucht Spalten). UI T2/T5/T7 danach. T7 Kollisions-sensibel. ✅
**Platzhalter:** `requireAdmin`-Shape + `WerkstattDetailClient`-Stelle via Ref-File beim Bau — kein Raten. ✅
