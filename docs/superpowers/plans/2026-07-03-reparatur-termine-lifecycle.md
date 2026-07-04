# SP2 Reparaturtermin-Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Reparaturtermin bekommt einen eigenen DB-getriebenen Lifecycle (`reparatur_termine`): der Kunde schlägt im Flow einen Wunschtermin vor, die Werkstatt bestätigt / bittet um Rückruf / lehnt ab.

**Architecture:** Neue Tabelle `reparatur_termine` (RLS: Staff+Werkstatt). Der Wunschtermin wird im Flow auf `leads.reparatur_wunschtermin` gespeichert und bei Lead→Claim-Conversion zur `reparatur_termine`-Zeile (`angefragt`). Die Werkstatt agiert über RLS-gegatete Server-Actions in ihrem Portal. Die Claim-„Phase" wird per reinem Helper aus dem Status abgeleitet (kein `operative_status`-Eingriff). `v_werkstatt_auftrag` joint den aktiven Termin additiv an.

**Tech Stack:** Next.js 15, Supabase (Postgres RLS + SECURITY DEFINER Views), TypeScript, vitest, react-email nicht nötig (In-App-Notify via `benachrichtigungen`).

## Global Constraints

- **Regel 2 (DDL):** Alle Schema-Änderungen NUR via `mcp__plugin_supabase_supabase__apply_migration` → `list_migrations` → File `supabase/migrations/<getrackte-Version>_<name>.sql` exakt nach getrackter Version benennen. `execute_sql` nur READ. **Controller (nicht Subagent) führt die DB-Tasks aus.**
- **Umlaute:** Alle nutzersichtbaren Strings (Flow, Werkstatt-Portal, Notify-Titel/-Text) mit echten `ä/ö/ü/ß`.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }`, kein `throw`. Konstanten NIE aus `'use server'`-Files exportieren. Non-critical Sends (Notify) in `try/catch`.
- **Komponenten-Set:** `primitives.Button/Modal`, `shared/SectionCard`, `ui/textarea` — kein handgerolltes Button/Card-Markup. Claimondo-Tokens, keine raw Status-Scales (`bg-success`/`text-success-strong` etc.).
- **Koordination (additiv, heiße Zone):** `FlowWerkstattStep.tsx` + `convert-lead-to-claim.ts` (#3433/1069c2a2), `self-service-actions.ts` (aar-956) — strikt additiv, bestehende Logik NICHT ändern, atomar committen. `FlowWizardKfz`-STEPS-Array + `wunschtermin.ts` NICHT anfassen (read-only reuse).
- **Naming (verifiziert):** Timestamps `created_at`/`updated_at`. Gate-Fns `is_staff()`, `is_werkstatt_for_claim(p_claim_id uuid)`. Notify-Helper `createNotification(userId, typ, titel, beschreibung?, link?)` aus `@/lib/notifications.ts` → Tabelle `benachrichtigungen`. Claim-Kunde = `claims.geschaedigter_user_id`.
- **7-Punkte-Audit** je Commit (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression) im Commit-Body.

---

### Task 1: DB — Tabelle, Lead-Spalte, View (Controller/Plugin)

**Files:**
- Migration: `supabase/migrations/<V1>_reparatur_termine.sql`
- Migration: `supabase/migrations/<V2>_leads_reparatur_wunschtermin.sql`
- Migration: `supabase/migrations/<V3>_v_werkstatt_auftrag_reparatur_termin.sql`

**Interfaces:**
- Produces: Tabelle `public.reparatur_termine`, Spalte `public.leads.reparatur_wunschtermin timestamptz`, erweiterte View `v_werkstatt_auftrag` (+`reparatur_termin_id`, `reparatur_termin_status`, `reparatur_wunschtermin`, `reparatur_bestaetigter_termin`, `reparatur_absage_grund`).

- [ ] **Step 1: Tabelle + RLS anlegen** — `apply_migration({ name: 'reparatur_termine', query: <DDL> })`:

```sql
CREATE TABLE public.reparatur_termine (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id             uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  werkstatt_id         uuid NOT NULL REFERENCES public.werkstaetten(id),
  wunschtermin         timestamptz NOT NULL,
  bestaetigter_termin  timestamptz,
  status               text NOT NULL DEFAULT 'angefragt'
                         CHECK (status IN ('angefragt','bestaetigt','anruf_erbeten','abgelehnt','erledigt','storniert')),
  absage_grund         text,
  erstellt_von         uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reparatur_termine_claim_id_idx     ON public.reparatur_termine(claim_id);
CREATE INDEX reparatur_termine_werkstatt_id_idx ON public.reparatur_termine(werkstatt_id);

ALTER TABLE public.reparatur_termine ENABLE ROW LEVEL SECURITY;

CREATE POLICY reparatur_termine_select ON public.reparatur_termine
  FOR SELECT TO authenticated
  USING ( is_staff() OR is_werkstatt_for_claim(claim_id) );

CREATE POLICY reparatur_termine_insert ON public.reparatur_termine
  FOR INSERT TO authenticated
  WITH CHECK ( is_staff() );

CREATE POLICY reparatur_termine_update ON public.reparatur_termine
  FOR UPDATE TO authenticated
  USING ( is_staff() OR is_werkstatt_for_claim(claim_id) )
  WITH CHECK ( is_staff() OR is_werkstatt_for_claim(claim_id) );

COMMENT ON TABLE public.reparatur_termine IS
  'Reparaturtermin-Lifecycle (SP2). Kunde schlaegt Wunschtermin vor (angefragt), Werkstatt bestaetigt/ruft an/lehnt ab. Phase abgeleitet, kein operative_status-Eingriff.';
```

- [ ] **Step 2: Lead-Spalte** — `apply_migration({ name: 'leads_reparatur_wunschtermin', query: <DDL> })`:

```sql
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reparatur_wunschtermin timestamptz;
COMMENT ON COLUMN public.leads.reparatur_wunschtermin IS
  'Vom Kunden im Flow (nach Werkstatt-Wahl) vorgeschlagener Reparatur-Wunschtermin (UTC). Bei Lead->Claim-Conversion -> reparatur_termine (status=angefragt). Getrennt von leads.wunschtermin (SV-Besichtigung).';
```

- [ ] **Step 3: View erweitern** — ZUERST die aktuelle View-Definition lesen (`execute_sql`: `SELECT pg_get_viewdef('public.v_werkstatt_auftrag'::regclass, true);`). Dann `apply_migration({ name: 'v_werkstatt_auftrag_reparatur_termin', query: <CREATE OR REPLACE VIEW …> })` — die bestehende Definition **unverändert** übernehmen und additiv den LATERAL-Join + die 5 Spalten ergänzen. Die WHERE-Gate-Klausel (`is_staff() OR is_werkstatt_for_claim(...)`) und alle bestehenden Spalten bleiben. Der Join:

```sql
LEFT JOIN LATERAL (
  SELECT rt.id, rt.status, rt.wunschtermin, rt.bestaetigter_termin, rt.absage_grund
  FROM public.reparatur_termine rt
  WHERE rt.claim_id = <die-claim-alias-spalte>.id
    AND rt.status <> 'storniert'
  ORDER BY rt.created_at DESC
  LIMIT 1
) rt ON true
```
Neue SELECT-Spalten: `rt.id AS reparatur_termin_id`, `rt.status AS reparatur_termin_status`, `rt.wunschtermin AS reparatur_wunschtermin`, `rt.bestaetigter_termin AS reparatur_bestaetigter_termin`, `rt.absage_grund AS reparatur_absage_grund`. (Der Claim-Alias in der View-FROM-Klausel ist aus der gelesenen Definition zu übernehmen.)

- [ ] **Step 4: Versionen ablesen + Files committen** — `list_migrations` → die 3 getrackten Versionen ablesen → die 3 Migration-Files exakt nach getrackter Version benennen + committen (Twin-Drift vermeiden).

- [ ] **Step 5: Verifizieren (READ)** — `execute_sql`:
  - `SELECT column_name FROM information_schema.columns WHERE table_name='reparatur_termine' ORDER BY 1;` → 10 Spalten.
  - `SELECT reparatur_termin_status FROM v_werkstatt_auftrag LIMIT 0;` → Spalte existiert (kein Fehler).
  - `SELECT reparatur_wunschtermin FROM leads LIMIT 0;` → existiert.

---

### Task 2: Reiner Phasen-Helper `reparaturTerminPhase`

**Files:**
- Create: `src/lib/werkstatt/reparatur-termin-phase.ts`
- Test: `src/lib/werkstatt/__tests__/reparatur-termin-phase.test.ts`

**Interfaces:**
- Produces: `type ReparaturTerminStatus`, `interface ReparaturTerminPhase`, `function reparaturTerminPhase(status: ReparaturTerminStatus | null): ReparaturTerminPhase`. Konsumiert von Task 6 (Werkstatt-UI) und später SP4 (Kunde-Stepper). Client-safe (kein `'use server'`).

- [ ] **Step 1: Failing Test**

```ts
import { describe, it, expect } from 'vitest'
import { reparaturTerminPhase } from '../reparatur-termin-phase'

describe('reparaturTerminPhase', () => {
  it('null -> kein_termin/neutral', () => {
    expect(reparaturTerminPhase(null)).toEqual({ key: 'kein_termin', label: 'Kein Reparaturtermin', ton: 'neutral' })
  })
  it('angefragt -> info', () => {
    expect(reparaturTerminPhase('angefragt')).toEqual({ key: 'angefragt', label: 'Wunschtermin angefragt', ton: 'info' })
  })
  it('anruf_erbeten -> info', () => {
    expect(reparaturTerminPhase('anruf_erbeten')).toEqual({ key: 'anruf_erbeten', label: 'Werkstatt meldet sich', ton: 'info' })
  })
  it('bestaetigt -> success', () => {
    expect(reparaturTerminPhase('bestaetigt')).toEqual({ key: 'bestaetigt', label: 'Termin bestätigt', ton: 'success' })
  })
  it('erledigt -> success', () => {
    expect(reparaturTerminPhase('erledigt')).toEqual({ key: 'erledigt', label: 'Reparatur abgeschlossen', ton: 'success' })
  })
  it('abgelehnt -> warning', () => {
    expect(reparaturTerminPhase('abgelehnt')).toEqual({ key: 'abgelehnt', label: 'Termin abgelehnt', ton: 'warning' })
  })
  it('storniert -> neutral', () => {
    expect(reparaturTerminPhase('storniert')).toEqual({ key: 'storniert', label: 'Termin storniert', ton: 'neutral' })
  })
})
```

- [ ] **Step 2: Run test → FAIL** (`npx vitest run src/lib/werkstatt/__tests__/reparatur-termin-phase.test.ts`, „module not found").

- [ ] **Step 3: Implementierung**

```ts
export type ReparaturTerminStatus =
  | 'angefragt' | 'bestaetigt' | 'anruf_erbeten' | 'abgelehnt' | 'erledigt' | 'storniert'

export interface ReparaturTerminPhase {
  key: ReparaturTerminStatus | 'kein_termin'
  label: string
  ton: 'neutral' | 'info' | 'success' | 'warning'
}

const MAP: Record<ReparaturTerminStatus, ReparaturTerminPhase> = {
  angefragt:     { key: 'angefragt',     label: 'Wunschtermin angefragt',   ton: 'info' },
  anruf_erbeten: { key: 'anruf_erbeten', label: 'Werkstatt meldet sich',     ton: 'info' },
  bestaetigt:    { key: 'bestaetigt',    label: 'Termin bestätigt',          ton: 'success' },
  erledigt:      { key: 'erledigt',      label: 'Reparatur abgeschlossen',   ton: 'success' },
  abgelehnt:     { key: 'abgelehnt',     label: 'Termin abgelehnt',          ton: 'warning' },
  storniert:     { key: 'storniert',     label: 'Termin storniert',          ton: 'neutral' },
}

/** Leitet die Anzeige-Phase aus dem Reparaturtermin-Status ab. null = noch kein Termin. */
export function reparaturTerminPhase(status: ReparaturTerminStatus | null): ReparaturTerminPhase {
  if (status === null) return { key: 'kein_termin', label: 'Kein Reparaturtermin', ton: 'neutral' }
  return MAP[status]
}
```

- [ ] **Step 4: Run test → PASS.**
- [ ] **Step 5: Commit** (`feat(werkstatt): reparaturTerminPhase-Helper (SP2 Task 2)` + Audit-Body).

---

### Task 3: Flow-Eingabe — Wunschtermin nach Werkstatt-Wahl

**Files:**
- Modify: `src/app/flow/[token]/self-service-actions.ts` (neue Action, additiv)
- Modify: `src/app/flow/[token]/FlowWerkstattStep.tsx` (Picker + Werkstatt-Anzeige, additiv)
- Test: `src/app/flow/[token]/__tests__/reparatur-wunschtermin-flow.test.ts` (neu)

**Interfaces:**
- Consumes: `resolveWunschterminIso(lokal: string): string` aus `src/app/flow/[token]/wunschtermin.ts` (Berlin-Wandzeit `'YYYY-MM-DDTHH:mm'` → UTC-ISO; **read-only**). `WunschterminPicker` aus `src/app/embed/gutachter-finder/_components/WunschterminPicker.tsx`. `flow_links`-Token-Bindung (Muster: die anderen Actions in `self-service-actions.ts`).
- Produces: `speichereReparaturWunschterminFlow(token: string, wunschterminLokal: string): Promise<{ ok: boolean; error?: string }>` → setzt `leads.reparatur_wunschtermin`.

**WICHTIG — LIES ZUERST** `self-service-actions.ts` (Token→Lead-Bindungsmuster + Admin-Client-Nutzung), `FlowWerkstattStep.tsx` (wie die Werkstatt-Auswahl + `assignReparaturWerkstatt` aussieht, welcher State die gewählte/hinterlegte Werkstatt hält), `wunschtermin.ts` (Signatur von `resolveWunschterminIso`) und `WunschterminPicker.tsx` (Props: value/onChange, was der Picker als String liefert).

- [ ] **Step 1: Failing Test** (Token-Bindung + Speicherung). Muster: bestehende `self-service-actions`-Tests bzw. `wunschtermin.test.ts`. Mock Supabase-Admin so, dass `flow_links.select(token)` einen Lead liefert bzw. bei fremdem Token nicht.

```ts
// Kernaussagen:
//  - fremder/fehlender Token -> { ok: false }, kein Update
//  - gültiger Token -> leads.update({ reparatur_wunschtermin: <UTC aus resolveWunschterminIso> }) aufgerufen, { ok: true }
```
Run → FAIL.

- [ ] **Step 2: Action implementieren** (additiv, ans Ende von `self-service-actions.ts`):

```ts
export async function speichereReparaturWunschterminFlow(
  token: string,
  wunschterminLokal: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!token || !wunschterminLokal) return { ok: false, error: 'Token und Wunschtermin sind erforderlich.' }
  const admin = createAdminClient() // exakt wie die anderen Actions im File
  // Token -> Lead binden (NICHT caller-geliefertes leadId vertrauen):
  const { data: link } = await admin
    .from('flow_links')
    .select('lead_id')
    .eq('token', token)
    .maybeSingle()
  const leadId = (link as { lead_id: string | null } | null)?.lead_id ?? null
  if (!leadId) return { ok: false, error: 'Ungültiger Link.' }
  let utc: string
  try {
    utc = resolveWunschterminIso(wunschterminLokal)
  } catch {
    return { ok: false, error: 'Ungültiger Wunschtermin.' }
  }
  const { error } = await admin.from('leads').update({ reparatur_wunschtermin: utc }).eq('id', leadId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/flow/${token}`)
  return { ok: true }
}
```
(Import `resolveWunschterminIso` aus `./wunschtermin` ergänzen; `createAdminClient`/`revalidatePath` sind im File bereits importiert — sonst additiv ergänzen.)

- [ ] **Step 3: FlowWerkstattStep erweitern** (additiv) — sobald `reparatur_werkstatt_id` für den Lead **hinterlegt** ist (frisch gewählt ODER vorbelegt), unter der Werkstatt-Auswahl anzeigen:
  - Werkstatt-Name (+ Ort) aus der hinterlegten Werkstatt (die Komponente hat die Werkstatt-Liste bzw. die gewählte Werkstatt im State — Namen von dort; bei vorbelegter Werkstatt ggf. via Prop/Server-geladenem Objekt).
  - Text: „Dein Fahrzeug wird zu **{name}** gebracht. Wann möchtest du es hinbringen? (optional)"
  - `<WunschterminPicker>` (lokaler State) + `primitives.Button` „Wunschtermin vorschlagen" → ruft `speichereReparaturWunschterminFlow(token, lokalString)`; bei `{ ok:false }` `toast.error(result.error)`, bei Erfolg `toast.success('Wunschtermin gespeichert')`.
  - Link/Button „Überspringen" führt weiter wie bisher (kein Speichern).
  - **Nur additiv** — keine bestehende Auswahl-/Weiter-Logik ändern. Kein neuer `FlowWizardKfz`-Step.

- [ ] **Step 4: Test → PASS.** `npx tsc --noEmit` grün.
- [ ] **Step 5: `npm run build`** (`$env:NODE_OPTIONS='--max-old-space-size=8192'; npm run build`) — Flow-Route + Server-Action → voller Build Pflicht.
- [ ] **Step 6: Commit** (`feat(werkstatt): Flow-Wunschtermin nach Werkstatt-Wahl (SP2 Task 3)` + Audit; Koordinationshinweis: additiv zu #3433/aar-956).

---

### Task 4: Lead→Claim-Conversion legt Termin an

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (additiv)
- Test: `src/lib/leads/__tests__/convert-lead-reparatur-termin.test.ts` (neu, fokussiert)

**Interfaces:**
- Consumes: den in `convert-lead-to-claim.ts` bereits vorhandenen `admin`-Client, die ermittelte `geschaedigter_user_id`, die neue `claim.id`, und die (via #3433) auf den Claim übernommene `reparatur_werkstatt_id`. Liest `lead.reparatur_wunschtermin` (SELECT additiv ergänzen falls die Lead-Query es nicht schon lädt).
- Produces: eine `reparatur_termine`-Zeile (`status='angefragt'`) bei vorhandenem Wunschtermin + Werkstatt.

**WICHTIG — LIES ZUERST** `convert-lead-to-claim.ts`: wie der Claim eingefügt wird, wie `reparatur_werkstatt_id` auf den Claim kommt, wie `geschaedigter_user_id` heißt, und welche `lead`-Spalten selektiert werden (füge `reparatur_wunschtermin` additiv zur Lead-Select-Liste hinzu, falls nötig).

- [ ] **Step 1: Failing Test** — Branch-Verhalten: Lead **mit** `reparatur_wunschtermin` + Werkstatt → `reparatur_termine.insert` mit `{ claim_id, werkstatt_id, wunschtermin, status:'angefragt' }` aufgerufen; Lead **ohne** Wunschtermin → **kein** Insert. (Fokus-Mock wie bei bestehenden convert-Tests; nur den Insert-Aufruf assertion-prüfen.)
Run → FAIL.

- [ ] **Step 2: Insert additiv ergänzen** — nach dem Claim-Insert + dem bestehenden Werkstatt-Carry-over:

```ts
// SP2: Reparaturtermin-Anfrage anlegen, wenn der Kunde im Flow einen Wunschtermin gesetzt hat.
if (lead.reparatur_wunschtermin && claimReparaturWerkstattId) {
  const { error: rtErr } = await admin.from('reparatur_termine').insert({
    claim_id: claim.id,
    werkstatt_id: claimReparaturWerkstattId,
    wunschtermin: lead.reparatur_wunschtermin,
    status: 'angefragt',
    erstellt_von: geschaedigterUserId ?? null,
  })
  if (rtErr) console.error('[convert-lead] reparatur_termine insert failed (non-fatal):', rtErr)
}
```
(Variablennamen `claim`, `claimReparaturWerkstattId`, `geschaedigterUserId` an die tatsächlichen Namen im File anpassen — beim Lesen ermitteln. **Non-fatal**: Insert-Fehler bricht die Conversion nicht.)

- [ ] **Step 3: Test → PASS.** `tsc --noEmit` grün.
- [ ] **Step 4: Commit** (`feat(werkstatt): Conversion legt reparatur_termine an (SP2 Task 4)` + Audit; additiv zu #3433).

---

### Task 5: Werkstatt-Confirm Server-Actions + Query

**Files:**
- Create: `src/app/werkstatt/(shell)/auftraege/actions.ts`
- Modify: `src/lib/werkstatt/queries.ts` (neue View-Spalten in Typ + SELECT)
- Test: `src/app/werkstatt/(shell)/auftraege/__tests__/actions.test.ts` (neu)

**Interfaces:**
- Consumes: `createClient` (Werkstatt-Session, RLS) aus `@/lib/supabase/server`, `createServiceClient` (für Notify-Auflösung), `createNotification` aus `@/lib/notifications.ts`. RLS-Policy `reparatur_termine_update` (Task 1).
- Produces: `bestaetigeReparaturTermin(terminId)`, `erbitteReparaturAnruf(terminId)`, `lehneReparaturTerminAb(terminId, grund)` — je `Promise<{ ok: boolean; error?: string }>`. `queries.ts`-`WerkstattAuftrag`-Typ + Query um die 5 `reparatur_*`-View-Spalten erweitert.

**WICHTIG — LIES ZUERST** `src/lib/werkstatt/queries.ts` (den `WerkstattAuftrag`-Typ + `getWerkstattAuftraege`-SELECT auf `v_werkstatt_auftrag`) und `@/lib/notifications.ts`.

- [ ] **Step 1: Failing Test** — je Action: fremder/nicht existenter Termin (RLS liefert 0 Zeilen / update betrifft 0) → `{ ok:false }`; eigener Termin → Status gesetzt → `{ ok:true }`. `lehneReparaturTerminAb('', '')` bzw. leerer Grund → `{ ok:false }`. Mock `createClient` (update→eq→select-Kette) + `createServiceClient` + `createNotification` (vi.fn). Muster: `src/app/admin/werkstaetten/__tests__/actions.test.ts`.
Run → FAIL.

- [ ] **Step 2: Actions implementieren** (`'use server'`):

```ts
'use server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { revalidatePath } from 'next/cache'

// Gemeinsamer Statuswechsel über die Werkstatt-Session (RLS gatet auf die eigene Werkstatt).
async function setStatus(
  terminId: string,
  patch: Record<string, unknown>,
  notify: { titel: string; text: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!terminId) return { ok: false, error: 'Kein Termin.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reparatur_termine')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', terminId)
    .select('id, claim_id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Termin nicht gefunden oder keine Berechtigung.' }

  // Kunde benachrichtigen (non-critical): Claim-Owner via Service-Client auflösen.
  try {
    const svc = createServiceClient()
    const { data: claim } = await svc
      .from('claims').select('geschaedigter_user_id').eq('id', (data as { claim_id: string }).claim_id).maybeSingle()
    const kundeUserId = (claim as { geschaedigter_user_id: string | null } | null)?.geschaedigter_user_id
    if (kundeUserId) {
      await createNotification(
        kundeUserId, 'reparatur_termin', notify.titel, notify.text,
        `/kunde/faelle/${(data as { claim_id: string }).claim_id}`,
      )
    }
  } catch (err) {
    console.error('[reparatur-termin] Notify fehlgeschlagen (non-fatal):', err)
  }
  revalidatePath('/werkstatt/auftraege')
  return { ok: true }
}

export async function bestaetigeReparaturTermin(terminId: string): Promise<{ ok: boolean; error?: string }> {
  // bestaetigter_termin = wunschtermin: erst lesen, dann setzen.
  const supabase = await createClient()
  const { data: t } = await supabase.from('reparatur_termine').select('wunschtermin').eq('id', terminId).maybeSingle()
  const wunsch = (t as { wunschtermin: string | null } | null)?.wunschtermin ?? null
  return setStatus(
    terminId,
    { status: 'bestaetigt', bestaetigter_termin: wunsch },
    { titel: 'Reparaturtermin bestätigt', text: 'Deine Werkstatt hat den vorgeschlagenen Termin bestätigt.' },
  )
}

export async function erbitteReparaturAnruf(terminId: string): Promise<{ ok: boolean; error?: string }> {
  return setStatus(
    terminId,
    { status: 'anruf_erbeten' },
    { titel: 'Werkstatt meldet sich', text: 'Deine Werkstatt möchte den Termin telefonisch mit dir abstimmen.' },
  )
}

export async function lehneReparaturTerminAb(terminId: string, grund: string): Promise<{ ok: boolean; error?: string }> {
  const g = (grund ?? '').trim()
  if (!g) return { ok: false, error: 'Bitte einen Grund angeben.' }
  return setStatus(
    terminId,
    { status: 'abgelehnt', absage_grund: g },
    { titel: 'Reparaturtermin abgelehnt', text: 'Deine Werkstatt konnte den vorgeschlagenen Termin nicht annehmen.' },
  )
}
```
(Falls `createServiceClient` nicht aus `@/lib/supabase/server` exportiert wird — beim Lesen von `@/lib/notifications.ts` den korrekten Import-Pfad übernehmen.)

- [ ] **Step 3: queries.ts erweitern** (additiv) — den `WerkstattAuftrag`-Typ um `reparatur_termin_id: string | null`, `reparatur_termin_status: string | null`, `reparatur_wunschtermin: string | null`, `reparatur_bestaetigter_termin: string | null`, `reparatur_absage_grund: string | null` ergänzen und diese 5 Spalten additiv in den `.select('…')` auf `v_werkstatt_auftrag` aufnehmen.

- [ ] **Step 4: Test → PASS.** `tsc --noEmit` grün. `npm run build` (8 GB).
- [ ] **Step 5: Commit** (`feat(werkstatt): Reparaturtermin-Confirm-Actions + Query (SP2 Task 5)` + Audit).

---

### Task 6: Werkstatt-Fläche — Termin anzeigen + Aktionen

**Files:**
- Modify: `src/components/werkstatt/WerkstattAuftraege.tsx`
- (ggf.) Test: leichter Render-/Logic-Test optional; Kern ist visuell.

**Interfaces:**
- Consumes: den erweiterten `WerkstattAuftrag`-Typ (Task 5), `reparaturTerminPhase` (Task 2), die Actions `bestaetigeReparaturTermin`/`erbitteReparaturAnruf`/`lehneReparaturTerminAb` (Task 5), `formatBerlin` (bereits im Projekt genutzt — beim Lesen den Import ermitteln), `primitives.Button/Modal`, `shared/SectionCard`, `ui/textarea`.

**WICHTIG — LIES ZUERST** `WerkstattAuftraege.tsx` (wie ein Auftrag gerendert wird, welche Card-/Button-Komponenten schon genutzt werden, wie `formatBerlin`/Datums-Format importiert ist, ob die Komponente `'use client'` ist).

- [ ] **Step 1: Termin-Sektion je Auftrag** — wenn `auftrag.reparatur_termin_id` gesetzt: eine `SectionCard` „Reparaturtermin":
  - Badge mit `reparaturTerminPhase(auftrag.reparatur_termin_status as ReparaturTerminStatus).label` im passenden `ton` (Mapping `ton → bg-success-soft/text-success-strong` etc. — Token-basiert, keine raw Scales).
  - Terminzeit: `formatBerlin(auftrag.reparatur_bestaetigter_termin ?? auftrag.reparatur_wunschtermin)`.
  - Bei `status === 'abgelehnt'` + `reparatur_absage_grund`: den Grund anzeigen.

- [ ] **Step 2: Aktions-Buttons** — nur bei `status ∈ {'angefragt','anruf_erbeten'}`:
  - `primitives.Button` „Termin bestätigen" (`variant='primary'`, `loading`-State) → `bestaetigeReparaturTermin(id)`.
  - `primitives.Button` „Anrufen / telefonisch klären" (`variant='secondary'`) → `erbitteReparaturAnruf(id)`.
  - `primitives.Button` „Ablehnen" (`variant='ghost'`/destructive) → öffnet `Modal` mit `ui/textarea` (Grund) + „Ablehnen bestätigen" → `lehneReparaturTerminAb(id, grund)`.
  - Jeweils Result-Check: `if (!result.ok) toast.error(result.error ?? 'Fehler')` sonst `toast.success(...)` + `router.refresh()`.
  - Echte Umlaute in allen Labels/Toasts.

- [ ] **Step 3: `tsc --noEmit` grün + `npm run build`** (8 GB) — Route-Consumer.
- [ ] **Step 4: Commit** (`feat(werkstatt): Reparaturtermin-Aktionen in /werkstatt/auftraege (SP2 Task 6)` + Audit).

---

## Self-Review-Checkliste (nach Bau)

- **Spec-Coverage:** Tabelle+RLS (T1) · Lead-Spalte (T1) · View (T1) · Phase-Helper (T2) · Flow-Input mit Werkstatt-Anzeige (T3) · Conversion (T4) · Werkstatt-Actions+Notify (T5) · Werkstatt-UI (T6). Alle §-Punkte der Spec abgedeckt.
- **Typen konsistent:** `ReparaturTerminStatus` (T2) == CHECK-Werte (T1) == View-Status-String (T5) == UI-Cast (T6).
- **Koordination:** T3/T4 additiv zu #3433/aar-956; `FlowWizardKfz`/`wunschtermin.ts` unberührt.
- **Verifikation nach Deploy (READ, Prod):** Tabelle + Spalte + View-Spalten existieren; manuell gesetzter `leads.reparatur_wunschtermin` → Conversion erzeugt Zeile; View liefert Termin unter Werkstatt-JWT.
