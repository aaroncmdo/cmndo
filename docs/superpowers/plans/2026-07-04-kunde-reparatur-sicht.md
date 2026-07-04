# SP4a+b Kunde-Reparatur-Sicht — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Der Kunde sieht in seiner Fallakte die vermittelte Werkstatt + den Reparaturtermin-Status und kann bei fehlendem/abgelehntem Termin einen Wunschtermin vorschlagen.

**Architecture:** WerkstattCard (`primitives.Card`, Sidebar der Kunde-Fallakte). Server-Component lädt Werkstatt-Stammdaten + aktiven `reparatur_termine`-Eintrag via Admin-Client (Ownership schon durch `getKundeFallDetailRecord` verifiziert). Wunschtermin-Vorschlag über eine Kunde-Session-Server-Action (RLS = Auth-Grenze) + neue Kunde-SELECT/INSERT-RLS auf `reparatur_termine`. Werkstatt wird bei Vorschlag benachrichtigt (spiegelt SP2).

**Tech Stack:** Next.js 15, Supabase RLS, TypeScript, vitest.

## Global Constraints

- **Regel 2 (DDL):** RLS-Policies NUR via `apply_migration` → `list_migrations` → File==getrackte Version. `execute_sql` nur READ. **Controller (nicht Subagent) macht Task 1.**
- **Umlaute:** alle nutzersichtbaren Strings (Card, Toasts, Notify) echte `ä/ö/ü/ß`.
- **Server-Actions:** Result-Object `{ ok, error? }`, kein throw. Keine Konstanten aus `'use server'` exportieren. Non-critical Notify in try/catch.
- **Komponenten-Set:** `primitives.Card/Button`, `shared/StatusBadge`, `shared/PhoneButton`, `@/components/ui/*` — KEIN handgerolltes Card/Button-Markup (Ratchet + laufende `kunde-primitives-migration`). Kein raw Status-Farb-Scale.
- **Koordination:** `src/app/kunde/faelle/[id]/page.tsx` ist heiß (Session cfefdf75 `kunde-primitives-migration`) — strikt additiv, atomar committen.
- **Owner-Prädikat (verifiziert):** `geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(claim_id)`. Reuse: `reparaturTerminPhase` (`@/lib/werkstatt/reparatur-termin-phase`, SP2), `WunschterminPicker` (`@/app/embed/gutachter-finder/_components/WunschterminPicker`), `resolveWunschterminIso` (`@/app/flow/[token]/wunschtermin`), `createNotification` (`@/lib/notifications`).
- **7-Punkte-Audit** je Commit.

---

### Task 1: DB — Kunde SELECT+INSERT RLS auf `reparatur_termine` (Controller/Plugin)

**Files:** Migration `supabase/migrations/<V>_reparatur_termine_kunde_rls.sql`

**Interfaces:** Produces zwei Policies auf `public.reparatur_termine` (SELECT + INSERT für `authenticated` Kunde-Owner).

- [ ] **Step 1: Policies anlegen** — `apply_migration({ name: 'reparatur_termine_kunde_rls', query: <DDL> })`:

```sql
CREATE POLICY reparatur_termine_kunde_select ON public.reparatur_termine
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );

CREATE POLICY reparatur_termine_kunde_insert ON public.reparatur_termine
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'angefragt'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );
```

- [ ] **Step 2: Version ablesen + File committen** — `list_migrations` → getrackte Version <V> → File `supabase/migrations/<V>_reparatur_termine_kunde_rls.sql` exakt so benennen + committen.
- [ ] **Step 3: Verifizieren (READ)** — `execute_sql`: `SELECT policyname FROM pg_policies WHERE tablename='reparatur_termine' ORDER BY 1;` → enthält `reparatur_termine_kunde_select` + `reparatur_termine_kunde_insert` (+ die 3 SP2-Policies).

---

### Task 2: Server-Action `schlageReparaturTerminVorPortal`

**Files:**
- Modify: `src/app/kunde/faelle/[id]/actions.ts` (additiv, ans Ende) — falls die Datei nicht existiert oder ungeeignet ist: Create `src/app/kunde/faelle/[id]/reparatur-termin-actions.ts` (`'use server'`).
- Test: `src/app/kunde/faelle/[id]/__tests__/reparatur-termin-vorschlag.test.ts`

**Interfaces:**
- Consumes: `createClient` (Kunde-Session) `@/lib/supabase/server`, `createServiceClient` (Werkstatt-Notify-Resolve), `createNotification` `@/lib/notifications`, `resolveWunschterminIso` `@/app/flow/[token]/wunschtermin`.
- Produces: `schlageReparaturTerminVorPortal(claimId: string, wunschterminLokal: string): Promise<{ ok: boolean; error?: string }>`.

**LIES ZUERST** `src/app/kunde/faelle/[id]/actions.ts` (existiert es? Welcher Client-/Auth-Stil? Wo additiv anhängen?), `@/lib/notifications.ts` (Signatur `createNotification`), `@/app/flow/[token]/wunschtermin.ts` (`resolveWunschterminIso`).

- [ ] **Step 1: Failing Test** — `reparatur-termin-vorschlag.test.ts`. Mock `@/lib/supabase/server` (createClient: auth.getUser + claims-Read + reparatur_termine-Read + insert; createServiceClient: werkstaetten-Read), `@/lib/notifications` (createNotification vi.fn), `next/cache`. Kernaussagen:
  - kein User → `{ ok:false }`.
  - Claim ohne `reparatur_werkstatt_id` → `{ ok:false }`.
  - aktiver Termin existiert (status angefragt/bestaetigt/anruf_erbeten) → `{ ok:false }`, kein Insert.
  - Erfolg → Insert `{ status:'angefragt' }` + `createNotification` (Werkstatt) aufgerufen, `{ ok:true }`.
  Run → FAIL.

- [ ] **Step 2: Action implementieren** (`'use server'`):

```ts
export async function schlageReparaturTerminVorPortal(
  claimId: string,
  wunschterminLokal: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!claimId || !wunschterminLokal) return { ok: false, error: 'Claim und Wunschtermin sind erforderlich.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Claim (Owner-RLS) -> Werkstatt.
  const { data: claim } = await supabase
    .from('claims').select('reparatur_werkstatt_id').eq('id', claimId).maybeSingle()
  const werkstattId = (claim as { reparatur_werkstatt_id: string | null } | null)?.reparatur_werkstatt_id ?? null
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt hinterlegt.' }

  // Kein aktiver Termin vorhanden (SELECT-RLS).
  const { data: aktiv } = await supabase
    .from('reparatur_termine').select('id')
    .eq('claim_id', claimId).in('status', ['angefragt', 'anruf_erbeten', 'bestaetigt']).limit(1)
  if (aktiv && aktiv.length > 0) return { ok: false, error: 'Es liegt bereits ein Terminwunsch vor.' }

  let utc: string
  try { utc = resolveWunschterminIso(wunschterminLokal) }
  catch { return { ok: false, error: 'Ungültiger Wunschtermin.' } }

  const { error } = await supabase.from('reparatur_termine').insert({
    claim_id: claimId, werkstatt_id: werkstattId, wunschtermin: utc,
    status: 'angefragt', erstellt_von: user.id,
  })
  if (error) return { ok: false, error: error.message }

  // Werkstatt benachrichtigen (non-critical).
  try {
    const svc = createServiceClient()
    const { data: w } = await svc.from('werkstaetten').select('user_id').eq('id', werkstattId).maybeSingle()
    const wUser = (w as { user_id: string | null } | null)?.user_id
    if (wUser) {
      await createNotification(wUser, 'reparatur_termin', 'Neuer Terminwunsch',
        'Ein Kunde hat einen Reparatur-Wunschtermin vorgeschlagen.', '/werkstatt/auftraege')
    }
  } catch (err) { console.error('[schlageReparaturTerminVorPortal] Werkstatt-Notify (non-fatal):', err) }

  revalidatePath(`/kunde/faelle/${claimId}`)
  return { ok: true }
}
```
(Imports additiv ergänzen. Falls `createServiceClient` woanders herkommt → beim Lesen von notifications.ts korrigieren.)

- [ ] **Step 3: Test → PASS.** `tsc --noEmit` grün.
- [ ] **Step 4: Commit** (`feat(werkstatt): Kunde-Wunschtermin-Vorschlag-Action (SP4b Task 2)` + Audit).

---

### Task 3: `WerkstattCard`

**Files:**
- Create: `src/components/kunde/WerkstattCard.tsx` (`'use client'`)

**Interfaces:**
- Consumes: `reparaturTerminPhase` + `type ReparaturTerminStatus` (`@/lib/werkstatt/reparatur-termin-phase`), `schlageReparaturTerminVorPortal` (Task 2), `WunschterminPicker`, `StatusBadge` (`@/components/shared/StatusBadge`), `PhoneButton` (`@/components/shared/PhoneButton`), `primitives.Card` + `primitives.Button`, `formatBerlin` (bestehenden Import ermitteln).
- Produces: `<WerkstattCard claimId werkstatt termin />` (Props-Shape s. Spec §4).

**LIES ZUERST** ein Card-Vorbild (`src/components/kunde/SaeuleMeinBetreuer.tsx`), `src/components/shared/StatusBadge.tsx` (Props: tone/size), `src/components/shared/PhoneButton.tsx`, `@/components/primitives/Card` (Prop-Namen), und wie `formatBerlin`/Datumsformat im Kunde-Portal importiert wird.

- [ ] **Step 1: Komponente bauen**
  - `primitives.Card`-Wrapper, Header „Deine Werkstatt".
  - Werkstatt-Name + Adresse (`adresse_strasse`, `adresse_plz adresse_ort`). Telefon → `PhoneButton` falls vorhanden.
  - Termin-Zustand:
    - `termin` mit Status ∈ {`angefragt`,`anruf_erbeten`,`bestaetigt`}: `StatusBadge` mit `reparaturTerminPhase(termin.status as ReparaturTerminStatus).label` (tone aus `.ton` mappen — StatusBadge-Tone) + Zeit `formatBerlin(termin.bestaetigter_termin ?? termin.wunschtermin)` (Label „Bestätigt: …" bei bestaetigt, sonst „Wunschtermin: …").
    - `termin?.status === 'abgelehnt'`: Hinweistext (+ `absage_grund`) + Vorschlags-UI (neuer Versuch).
    - `termin === null`: Vorschlags-UI.
  - **Vorschlags-UI:** `WunschterminPicker` (lokaler State) + `primitives.Button` „Wunschtermin vorschlagen" → `schlageReparaturTerminVorPortal(claimId, lokal)`; `useTransition` loading; `if (!res.ok) toast.error(res.error ?? 'Fehler')` sonst `toast.success('Wunschtermin gesendet.')` + `router.refresh()`.
  - Echte Umlaute; Claimondo-Tokens; kein raw Status-Scale.

- [ ] **Step 2: `tsc --noEmit` grün.** (Der volle Build kommt in Task 4 mit dem page.tsx-Consumer.)
- [ ] **Step 3: Commit** (`feat(werkstatt): WerkstattCard fuer Kunde-Fallakte (SP4a Task 3)` + Audit).

---

### Task 4: page.tsx-Integration + Datenladung

**Files:**
- Modify: `src/app/kunde/faelle/[id]/page.tsx` (additiv — Queries + Render-Slot)
- (ggf.) Modify: `src/lib/claims/get-kunde-faelle.ts` (nur falls `reparatur_werkstatt_id` dort additiv leichter zu bekommen ist)

**Interfaces:** Consumes `WerkstattCard` (Task 3). Rendert es in die Sidebar.

**LIES ZUERST** `src/app/kunde/faelle/[id]/page.tsx` — wie der Admin-Client heißt, wie `claimId`/`fall` verfügbar ist, ob `reparatur_werkstatt_id` schon geladen wird (sonst additiv via bestehendem `admin.from('claims').select(...).eq('id', claimId)`-Nachlade-Query holen), und die exakte Sidebar-Stelle zwischen `KanzleiPfadCard` und `KundeAusfallEntschaedigungCard`.

- [ ] **Step 1: Daten laden** (additiv, Server-Component, Admin-Client — Ownership ist bereits verifiziert):
```ts
let werkstattData = null, reparaturTermin = null
if (reparaturWerkstattId) {
  const { data: w } = await admin.from('werkstaetten')
    .select('name, adresse_strasse, adresse_plz, adresse_ort, telefon').eq('id', reparaturWerkstattId).maybeSingle()
  werkstattData = w
  const { data: t } = await admin.from('reparatur_termine')
    .select('id, status, wunschtermin, bestaetigter_termin, absage_grund')
    .eq('claim_id', claimId).neq('status', 'storniert')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  reparaturTermin = t
}
```
(Variablennamen `admin`/`claimId`/`reparaturWerkstattId` an das File anpassen; `reparatur_werkstatt_id` beschaffen wie oben beschrieben.)

- [ ] **Step 2: Card rendern** — in den Sidebar-Slot, nur bei `werkstattData`:
```tsx
{werkstattData && (
  <WerkstattCard claimId={claimId} werkstatt={werkstattData} termin={reparaturTermin} />
)}
```

- [ ] **Step 3: Verifikation** — `npx tsc --noEmit` grün. `$env:NODE_OPTIONS='--max-old-space-size=8192'; npm run build` (voller Build, Route-Change). `npm run check:token-audit` + `check:component-set -- --ratchet` → 0 neue.
- [ ] **Step 4: Commit** (`feat(werkstatt): WerkstattCard in Kunde-Fallakte einbinden (SP4a Task 4)` + Audit; Koordinationshinweis cfefdf75).

---

## Self-Review-Checkliste (nach Bau)

- **Spec-Coverage:** RLS (T1) · Vorschlag-Action (T2) · Card (T3) · Integration (T4). Alle §-Punkte SP4a+b abgedeckt.
- **Typen konsistent:** `ReparaturTerminStatus` (SP2) im Card-Cast; Card-Props == page.tsx-Query-Shape (name/adresse_*/telefon; id/status/wunschtermin/bestaetigter_termin/absage_grund).
- **Sicherheit:** Read via Admin (Ownership pre-verified durch getKundeFallDetailRecord); Write via Kunde-Session + INSERT-RLS (`status='angefragt'` + Owner). Kein caller-getrustetes werkstattId (aus dem eigenen Claim gelesen).
- **Koordination:** page.tsx additiv; WerkstattCard = primitives.Card (kein Migrations-Cleanup nötig).
- **Verifikation nach Deploy (READ, Prod):** 2 Policies existieren; Kunde-JWT liest eigenen Termin, nicht fremde; Vorschlag → angefragt + Werkstatt sieht ihn.
