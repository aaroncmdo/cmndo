# Netzwerk-Ökosystem P1 (Verbindungen-UI + Einladen) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf dem P0-Fundament (`netzwerk_verbindungen` + `v_netzwerk_freunde`) ein voll funktionsfähiges Profi-Netzwerk bauen — Tabs **Verbindungen/Anfragen** in den Portalen Gutachter/Werkstatt/Flotte, Freund-Anfrage senden/annehmen/ablehnen/entfernen/blockieren, ein leak-freies **Profi-Verzeichnis** und **Einladen** (Freund-Anfrage bei Bestand, Kalt-Einladung mit Auto-Kante bei Registrierung) — **noch ohne Ranking-Effekt** (der kommt in P2).

**Architecture:** Der Graph ist P0-fertig; P1 ist **Consumer + UI**. Domain-Kern = 5 Server-Actions auf `netzwerk_verbindungen` (RLS-Client, `.select()`-Row-Check, Result-Object) + reine Transition-Validierung. Das Verzeichnis liest **nicht** roh `profiles` (RLS=staff/self → 42P17-Rekursion-Falle) sondern eine **SECURITY-DEFINER-Such-RPC** (Muster `search_makler`), die nur sichere Felder projiziert. Benachrichtigungen laufen über **`createMitteilung()`** (die echte Glocke; das alte `benachrichtigungen` wird von nichts gelesen). Kalt-Einladung = net-new `netzwerk_einladungen` (Airdrop-Token-Muster) + Wiederverwendung von `anlegePartnerKern` / `/{rolle}/registrieren` / `invite-email.ts` / `sendEmail` → Auto-Kante bei Redemption. UI dockt an die bestehenden `…/netzwerk`-Feed-Seiten (Feed unberührt, nur Tabs daneben).

**Tech Stack:** Next.js 15 (App Router, Server Components + Server-Actions), Supabase Postgres (DDL via MCP-Plugin `apply_migration`, RLS, SECURITY-DEFINER-RPC), TypeScript + `@supabase/supabase-js`, vitest (pure Unit), Playwright (Prod-Smoke).

## Global Constraints

- **P1 baut auf P0.** Branch erst **nach dem P0-Merge** von staging (sonst existieren `netzwerk_verbindungen`/`v_netzwerk_freunde` nicht). Task 0 verifiziert das Substrat.
- **DDL NUR via Supabase-Plugin `apply_migration`** (AGENTS.md Regel 2). Ablauf je Migration: apply → `list_migrations` (getrackte Version `<V>` ablesen) → File `supabase/migrations/<V>_<name>.sql` committen (Dateiname == `<V>`, kein Twin-Drift) → `execute_sql` (READ) verifizieren → Typen regenerieren + committen (`src/lib/supabase/database.types.ts`). **`execute_sql` nur READ.**
- **Neue public-Tabelle grantet anon NICHTS** (Default-Privileges-Wurzel). Explizite Grants. PERMISSIVE `CREATE POLICY` **immer mit `TO authenticated`** (nie `TO public`, nie weglassen — RLS-Policy-Ratchet).
- **SECURITY-DEFINER-RPC:** `set search_path to 'public'` (Repo-Konvention 61/90), Selbst-Gate im Body (DEFINER umgeht RLS), nur sichere Spalten projizieren, `revoke all on function … from public;` dann `grant execute … to authenticated`. **Nie** einen breiten `profiles`-SELECT-Grant. `v_netzwerk_freunde` bleibt service-role-only (P0).
- **Nie auf `main` pushen.** Branch `kitta/aar-<nr>-netzwerk-p1-verbindungen-ui`, PR gegen `staging`, nicht selbst mergen.
- **Server-Actions-Pattern (AGENTS.md):** Result-Object `{ ok: boolean; error?: string }` (kein `throw`); **RLS-Writes brauchen `.select()`+Row-Check** (DSGVO-Storno-Lehre: ein RLS-geblockter Write liefert 0 Rows OHNE Fehler → still); non-kritische Sub-Ops (Mitteilung/Email) in `try/catch`; `revalidatePath` je Write; **keine const/type-Exports aus `'use server'`-Files** (AAR-664 → Typen in `types.ts`).
- **Umlaute Pflicht** in allen UI-Strings (`ä/ö/ü/ß`) — Buttons, Labels, Toasts, Empty-States, Email-Text. Backend/Comments frei.
- **Komponenten-Set:** neue Buttons = `@/components/primitives` `Button` (`onClick`/`variant`/`loading`), Cards = `SectionCard`/`primitives.Card`, kein handgerolltes `<button className="bg-claimondo-…">`. Kein neuer inline Status-Farb-Map/Ternary (Status-Registry-Ratchet) — v1 nutzt neutrale `Badge`-tones, keine `status==='x'?'bg-…'`-Logik.
- **Ratchets grün (0-neu):** `check:rls-policies`, `check:rls-grants`, `check:flag-drift` (neue CHECK-Enums MÜSSEN vor jedem Code-Write in den CHECK **und** den Snapshot), `check:token-audit`, `check:component-set`, `check:knip`, `check:status-registry`. **Kein neuer i18n-Key** — UI-Text inline deutsch (wie die bestehenden `netzwerk/*`-Komponenten) → kein `check:i18n`-Impact.
- **prod-Ref = `paizkjajbuxxksdoycev`** (teilt DB mit staging). Verifikation via `execute_sql` READ-only.
- **Regel 4 (Prod-Smoke):** P1 geht **live** (nutzersichtbare Tabs + Flows) → nach Deploy vollständiger Playwright-Journey-Smoke gegen `https://app.claimondo.de` (Task 7). Wegwerf-Partner seeden (`scripts/smoke/throwaway-account.mjs`), `telefon = NULL` (kein SMS-Kollateral). Kein Billing im Scope → prod+staging-shared-LIVE-Stripe unkritisch.
- Pflichtlektüre vor Start: `docs/superpowers/plans/2026-07-28-netzwerk-p0-fundament.md` (P0-Interfaces) + `docs/superpowers/specs/2026-07-21-netzwerk-verbindungen-freundschaft-design.md` §7/§8/§10 + `…/2026-07-27-netzwerk-oekosystem-epic-overview-design.md` §2b/§4 + `…/2026-07-27-hardening-und-koordination-vor-plaenen.md` + `docs/fundament/FUNDAMENT.md` §1+§2.

## Scope-Entscheidungen (aus den LOCKED Specs — im Self-Review geprüft)

- **Makler bekommt v1 KEINE Verbindungen/Anfragen-Tabs.** Design §2 (Nicht-Ziele) + §7.2 + Overview §4 sperren Makler als Graph-Knoten in v1 („UI-/Entry-Punkte beschränken v1 auf Gutachter/Werkstatt/Flotte"; „Makler-Feed bleibt, ohne Verbindungen-Tab"). Der Graph ist rollen-agnostisch (`profiles↔profiles`), Makler ist später ein reiner UI-Zuschalt-Schritt ohne DDL. → Tabs nur **gutachter/werkstatt/flotte**; `makler/(shell)/netzwerk/page.tsx` bleibt unverändert. (Das Task-Prompt zählte „gutachter/makler/werkstatt" als die *existierenden Feed-Seiten* auf — die v1-Entry-Points folgen der LOCKED-Spec.)
- **Kalt-Einladung v1 = Rollen mit Self-Registrierung** (`sachverstaendiger`→`/sv/registrieren`, `werkstatt`→`/werkstatt/registrieren`, `makler`→`/makler/registrieren`). **Flotte-als-Eingeladener ist deferred** (es gibt keine Flotte-Self-Registrierung — `firmen_flotten_konten` entsteht nur admin-seitig). Flotte-als-**Einlader** funktioniert. Vermerkt an der Einladen-UI.
- **Notifications = `createMitteilung()` (in-app, best-effort).** Das im Roadmap genannte `emitEvent`/`event-to-task-map` ist **claim-scoped** (`fan-out.ts` verwirft No-Claim-Events still an Zeile ~232) und erzeugt *Staff-Tasks*, nicht Peer-Benachrichtigungen — passt nicht. `benachrichtigungen` ist eine **tote** Tabelle (kein Reader). Die echte Glocke liest `mitteilungen` via `createMitteilung`. **⚠ C-Migration:** C3 stellt auf ein **user-scoped Event** um (Muster `gast.conversion_reminder`: `types.ts` + `channel-matrix.ts` + eine **Recipient-Branch in `fan-out.ts` vor dem Claim-Gate**) für Multi-Kanal (WhatsApp/Email/web_push) + Outbox-Retry.

## Koordinations-Gates (blockieren den MERGE, nicht das Schreiben von Tests/Code)

- **P0-Merge:** Tasks 1–4 konsumieren `netzwerk_verbindungen`/`v_netzwerk_freunde`. Branch nach P0-Merge; falls P0 noch offen → auf dem P0-Branch aufsetzen und mit-rebasen.
- **DELETE-Policy (Task 1):** P1 fügt additiv eine `DELETE`-Policy + Grant auf `netzwerk_verbindungen` hinzu (P0 grantet nur select/insert/update). Falls P0 zwischenzeitlich selbst eine DELETE-Policy ergänzt → Task-1-Migration überspringen, im Marker vermerken.
- **Keine der 4 Substrat-Lanes (#4789 claims-RLS, FlowLink, Finder-Engine, Schadenkarte) wird in P1 berührt** — P1 fasst weder `claims` noch `/flow/[token]` noch die Finder-Engine noch `schadenkarte.ts` an. Kein Lane-Merge-Gate außer P0.

---

## Task 0: Branch off P0 + Ist-Erhebung (kein Merge-Deliverable)

**Files:** keine (Verifikation).

- [ ] **Schritt 1:** Frischen Worktree/Branch **nach P0-Merge** off staging: `node scripts/new-session-worktree.mjs aar-<nr>-netzwerk-p1-verbindungen-ui staging`; `git log -1 origin/staging` == HEAD. (Falls P0 noch offen: off dem P0-Branch abzweigen.)
- [ ] **Schritt 2:** P0-Substrat bestätigen (Plugin `execute_sql`, prod-Ref):
```sql
select table_name from information_schema.tables where table_schema='public'
  and table_name in ('netzwerk_verbindungen');
select table_name from information_schema.views where table_schema='public'
  and table_name in ('v_netzwerk_freunde');
select grantee, privilege_type from information_schema.role_table_grants
  where table_name='netzwerk_verbindungen';   -- authenticated: select/insert/update (kein delete = Task 1 fuellt die Luecke)
```
Erwartet: Tabelle + View existieren; `v_netzwerk_freunde` **nicht** an authenticated. Fehlt etwas → STOP, P0 nicht gemergt.
- [ ] **Schritt 3:** Identitäts-/Enum-Namen gegen prod verifizieren (nicht raten):
```sql
-- user_role-Enum-Labels der 3 Knoten-Rollen:
select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
  where t.typname='user_role' and enumlabel in ('sachverstaendiger','werkstatt','flottenmanager','makler');
-- Knoten-Identitaets-Spalten:
select table_name, column_name from information_schema.columns where table_schema='public'
  and ((table_name='sachverstaendige' and column_name in ('profile_id','firmenname'))
    or (table_name='werkstaetten'    and column_name in ('user_id','name','adresse_ort'))
    or (table_name='firmen_flotten_konten' and column_name='user_id'));
-- Mitteilungs-Kategorie-CHECK (muss 'update' enthalten):
select pg_get_constraintdef(oid) from pg_constraint
  where conrelid='public.mitteilungen'::regclass and contype='c' and conname like '%kategorie%';
-- profiles SELECT-RLS ist staff/self (Directory braucht DEFINER-RPC):
select polname, pg_get_expr(polqual, polrelid) from pg_policy
  where polrelid='public.profiles'::regclass and polcmd='r';
```
Erwartet: alle 4 Rollen-Labels vorhanden; `sachverstaendige.profile_id`, `werkstaetten.user_id`/`name`/`adresse_ort`, `firmen_flotten_konten.user_id`; `kategorie`-CHECK enthält `'update'`; profiles-SELECT = `staff_read_all` (id=auth.uid() OR is_staff()). Abweichung → betroffene Task-DDL/-Query anpassen.

---

## Task 1: Verbindungs-Domain — Transition-Kern + Server-Actions + Mitteilung

**Ziel:** Der Freund-Anfrage-Lebenszyklus (senden/annehmen/ablehnen/entfernen/blockieren) als Server-Actions mit RLS-Row-Check + In-App-Mitteilung. Reiner Transition-Kern zuerst (TDD).

**Files:**
- Create (DDL via Plugin): `supabase/migrations/<V>_netzwerk_verbindungen_delete_policy.sql`
- Create: `src/lib/netzwerk/types.ts`
- Create: `src/lib/netzwerk/verbindungen-core.ts`
- Create: `src/lib/netzwerk/mitteilung.ts`
- Create: `src/lib/netzwerk/verbindungen-actions.ts` (`'use server'`)
- Test: `src/lib/netzwerk/__tests__/verbindungen-core.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (regen nach DDL)

**Interfaces:**
- Consumes: `netzwerk_verbindungen` (P0), `createMitteilung` (`@/lib/mitteilungen/create-mitteilung`), `createClient` (`@/lib/supabase/server`), `createAdminClient` (`@/lib/supabase/admin`).
- Produces:
  - `verbindungen-core.ts`: `type VerbindungStatus = 'offen'|'angenommen'|'abgelehnt'|'blockiert'`; `darfAnnehmenOderAblehnen(row, meineProfilId): boolean` (nur Empfänger, nur `status==='offen'`); `darfEntfernenOderBlockieren(row, meineProfilId): boolean` (beide Beteiligten). `row = { anfrager_id: string; empfaenger_id: string; status: VerbindungStatus }`.
  - `mitteilung.ts`: `notifiziereNetzwerk(empfaengerProfilId, absender, art): Promise<void>` (best-effort; `art ∈ {'anfrage','angenommen'}`).
  - `verbindungen-actions.ts`: `sendeFreundAnfrage(zielProfilId): Promise<{ok:true}|{ok:false;error:string}>`; `nimmAnfrageAn(verbindungId)`, `lehneAnfrageAb(verbindungId)`, `entferneVerbindung(verbindungId)`, `blockiereVerbindung(verbindungId)` (alle gleicher Result-Shape). Konsumiert von Task 5 (UI).

- [ ] **Schritt 1: DELETE-Policy-Migration anwenden** (`apply_migration`, name `netzwerk_verbindungen_delete_policy`):
```sql
-- P0 grantet nur select/insert/update. "Verbindung entfernen" (unfriend) = DELETE der Kante
-- (Paar-Row verschwindet -> spaetere Neu-Anfrage moeglich; "blockiert" bleibt dagegen als Row
-- bestehen und verhindert via paar_uniq eine Neu-Anfrage). Additiv, keine bestehende Policy veraendert.
create policy netzwerk_verbindungen_delete on public.netzwerk_verbindungen
  for delete to authenticated
  using (anfrager_id = auth.uid() or empfaenger_id = auth.uid());
grant delete on public.netzwerk_verbindungen to authenticated;
```
Dann `list_migrations` → `<V>` ablesen → File `supabase/migrations/<V>_netzwerk_verbindungen_delete_policy.sql` mit exakt diesem DDL committen. Verifizieren:
```sql
select polname, polcmd from pg_policy where polrelid='public.netzwerk_verbindungen'::regclass and polcmd='d';
select privilege_type from information_schema.role_table_grants
  where table_name='netzwerk_verbindungen' and grantee='authenticated' and privilege_type='DELETE';
```
Erwartet: DELETE-Policy da; authenticated hat DELETE. Typen regen (`database.types.ts`). **Kein neuer CHECK-Enum → kein flag-drift-Snapshot nötig.**

- [ ] **Schritt 2: Failing Test schreiben** (`verbindungen-core.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { darfAnnehmenOderAblehnen, darfEntfernenOderBlockieren } from '../verbindungen-core'

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const offen = { anfrager_id: A, empfaenger_id: B, status: 'offen' as const }

describe('darfAnnehmenOderAblehnen', () => {
  it('nur der Empfaenger einer offenen Anfrage darf', () => {
    expect(darfAnnehmenOderAblehnen(offen, B)).toBe(true)
    expect(darfAnnehmenOderAblehnen(offen, A)).toBe(false) // Anfrager nicht
  })
  it('nicht mehr, wenn bereits angenommen', () => {
    expect(darfAnnehmenOderAblehnen({ ...offen, status: 'angenommen' }, B)).toBe(false)
  })
  it('Unbeteiligter darf nie', () => {
    expect(darfAnnehmenOderAblehnen(offen, 'cccccccc-0000-0000-0000-000000000003')).toBe(false)
  })
})

describe('darfEntfernenOderBlockieren', () => {
  it('beide Beteiligten duerfen', () => {
    const ang = { ...offen, status: 'angenommen' as const }
    expect(darfEntfernenOderBlockieren(ang, A)).toBe(true)
    expect(darfEntfernenOderBlockieren(ang, B)).toBe(true)
  })
  it('Unbeteiligter darf nie', () => {
    expect(darfEntfernenOderBlockieren(offen, 'dddddddd-0000-0000-0000-000000000004')).toBe(false)
  })
})
```

- [ ] **Schritt 3: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/verbindungen-core.test.ts` → FAIL („is not a function").

- [ ] **Schritt 4: `types.ts` + `verbindungen-core.ts` implementieren**
```ts
// src/lib/netzwerk/types.ts  (KEIN 'use server' — Typen frei exportierbar)
export type VerbindungStatus = 'offen' | 'angenommen' | 'abgelehnt' | 'blockiert'
export type NetzwerkRolle = 'sachverstaendiger' | 'werkstatt' | 'flottenmanager' | 'makler'
export type VerbindungRow = { anfrager_id: string; empfaenger_id: string; status: VerbindungStatus }
```
```ts
// src/lib/netzwerk/verbindungen-core.ts  (pure, keine DB)
import type { VerbindungRow } from './types'

/** Nur der Empfaenger einer noch OFFENEN Anfrage darf annehmen/ablehnen. */
export function darfAnnehmenOderAblehnen(row: VerbindungRow, meineProfilId: string): boolean {
  return row.status === 'offen' && row.empfaenger_id === meineProfilId
}

/** Beide Beteiligten duerfen eine bestehende Verbindung entfernen/blockieren. */
export function darfEntfernenOderBlockieren(row: VerbindungRow, meineProfilId: string): boolean {
  return row.anfrager_id === meineProfilId || row.empfaenger_id === meineProfilId
}
```

- [ ] **Schritt 5: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/verbindungen-core.test.ts` → PASS.

- [ ] **Schritt 6: Mitteilung-Helper implementieren** (`mitteilung.ts`):
```ts
// src/lib/netzwerk/mitteilung.ts
// In-App-Benachrichtigung ueber die ECHTE Glocke (mitteilungen). NICHT benachrichtigungen
// (tote Tabelle, kein Reader). kategorie MUSS 'update' sein (DB-CHECK: update/task/nachricht/anruf).
// Best-effort: ein Fehler bricht den Verbindungs-Write nie (Caller wrappt zusaetzlich try/catch).
// ⚠ C-Migration: C3 ersetzt das durch ein user-scoped Event (fan-out-Branch) fuer Multi-Kanal.
import { createAdminClient } from '@/lib/supabase/admin'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'
import type { EmpfaengerRolle } from '@/lib/mitteilungen/types'
import type { NetzwerkRolle } from './types'

const ROLLE_TO_PORTAL: Record<NetzwerkRolle, string> = {
  sachverstaendiger: 'gutachter', werkstatt: 'werkstatt', flottenmanager: 'flotte', makler: 'makler',
}

export async function notifiziereNetzwerk(
  empfaengerProfilId: string,
  absender: { profilId: string; name: string },
  art: 'anfrage' | 'angenommen',
): Promise<void> {
  const admin = createAdminClient()
  const { data: prof } = await admin.from('profiles').select('rolle').eq('id', empfaengerProfilId).maybeSingle()
  const rolle = (prof?.rolle as NetzwerkRolle | undefined) ?? 'kunde' as NetzwerkRolle
  const portal = ROLLE_TO_PORTAL[rolle] ?? 'gutachter'
  const titel = art === 'anfrage' ? 'Neue Netzwerk-Anfrage' : 'Netzwerk-Anfrage angenommen'
  const inhalt = art === 'anfrage'
    ? `${absender.name} möchte sich mit dir vernetzen.`
    : `${absender.name} hat deine Netzwerk-Anfrage angenommen.`
  await createMitteilung({
    empfaenger_id: empfaengerProfilId,
    empfaenger_rolle: rolle as EmpfaengerRolle,
    kategorie: 'update',
    titel,
    inhalt,
    route_url: `/${portal}/netzwerk?tab=${art === 'anfrage' ? 'anfragen' : 'verbindungen'}`,
    absender_id: absender.profilId,
    absender_name: absender.name,
    prioritaet: 'normal',
  })
}
```

- [ ] **Schritt 7: Server-Actions implementieren** (`verbindungen-actions.ts`):
```ts
'use server'
// Freund-Anfrage-Lebenszyklus auf netzwerk_verbindungen. RLS-Client (DB erzwingt "nur eigene
// Kanten") + .select()-Row-Check (DSGVO-Storno-Lehre: RLS-Block liefert 0 Rows OHNE Fehler).
// Result-Object, kein throw. Mitteilung/Namens-Lookup best-effort (try/catch).
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { darfAnnehmenOderAblehnen, darfEntfernenOderBlockieren } from './verbindungen-core'
import { notifiziereNetzwerk } from './mitteilung'
import type { VerbindungRow } from './types'

type R = { ok: true } | { ok: false; error: string }

async function meineProfilId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function meinAnzeigeName(profilId: string): Promise<string> {
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('vorname, nachname, firma, anzeigename').eq('id', profilId).maybeSingle()
  return (
    (data?.anzeigename as string | null) ||
    [data?.vorname, data?.nachname].filter(Boolean).join(' ').trim() ||
    (data?.firma as string | null) || 'Ein Partner'
  )
}

export async function sendeFreundAnfrage(zielProfilId: string): Promise<R> {
  const me = await meineProfilId()
  if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  if (zielProfilId === me) return { ok: false, error: 'Du kannst dich nicht mit dir selbst verbinden.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('netzwerk_verbindungen')
    .insert({ anfrager_id: me, empfaenger_id: zielProfilId, status: 'offen' })
    .select('id')
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ihr seid bereits verbunden oder eine Anfrage läuft schon.' }
    return { ok: false, error: 'Anfrage konnte nicht gesendet werden.' }
  }
  if (!data || data.length === 0) return { ok: false, error: 'Anfrage konnte nicht gesendet werden.' } // RLS-Block
  try { await notifiziereNetzwerk(zielProfilId, { profilId: me, name: await meinAnzeigeName(me) }, 'anfrage') } catch (e) { console.error('[sendeFreundAnfrage] notify', e) }
  revalidatePath('/gutachter/netzwerk'); revalidatePath('/werkstatt/netzwerk'); revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

async function ladeRowFuerAktion(verbindungId: string): Promise<VerbindungRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('netzwerk_verbindungen')
    .select('anfrager_id, empfaenger_id, status').eq('id', verbindungId).maybeSingle()
  return (data as VerbindungRow | null) ?? null
}

export async function nimmAnfrageAn(verbindungId: string): Promise<R> {
  const me = await meineProfilId(); if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfAnnehmenOderAblehnen(row, me)) return { ok: false, error: 'Diese Anfrage kann nicht angenommen werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('netzwerk_verbindungen')
    .update({ status: 'angenommen', beantwortet_am: new Date().toISOString() })
    .eq('id', verbindungId).eq('empfaenger_id', me).eq('status', 'offen').select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Annehmen fehlgeschlagen.' }
  try { await notifiziereNetzwerk(row.anfrager_id, { profilId: me, name: await meinAnzeigeName(me) }, 'angenommen') } catch (e) { console.error('[nimmAnfrageAn] notify', e) }
  revalidatePath('/gutachter/netzwerk'); revalidatePath('/werkstatt/netzwerk'); revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

export async function lehneAnfrageAb(verbindungId: string): Promise<R> {
  const me = await meineProfilId(); if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfAnnehmenOderAblehnen(row, me)) return { ok: false, error: 'Diese Anfrage kann nicht abgelehnt werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('netzwerk_verbindungen')
    .update({ status: 'abgelehnt', beantwortet_am: new Date().toISOString() })
    .eq('id', verbindungId).eq('empfaenger_id', me).eq('status', 'offen').select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Ablehnen fehlgeschlagen.' }
  revalidatePath('/gutachter/netzwerk'); revalidatePath('/werkstatt/netzwerk'); revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

export async function entferneVerbindung(verbindungId: string): Promise<R> {
  const me = await meineProfilId(); if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfEntfernenOderBlockieren(row, me)) return { ok: false, error: 'Verbindung kann nicht entfernt werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('netzwerk_verbindungen').delete().eq('id', verbindungId).select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Entfernen fehlgeschlagen.' }
  revalidatePath('/gutachter/netzwerk'); revalidatePath('/werkstatt/netzwerk'); revalidatePath('/flotte/netzwerk')
  return { ok: true }
}

export async function blockiereVerbindung(verbindungId: string): Promise<R> {
  const me = await meineProfilId(); if (!me) return { ok: false, error: 'Nicht angemeldet.' }
  const row = await ladeRowFuerAktion(verbindungId)
  if (!row || !darfEntfernenOderBlockieren(row, me)) return { ok: false, error: 'Verbindung kann nicht blockiert werden.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('netzwerk_verbindungen')
    .update({ status: 'blockiert', beantwortet_am: new Date().toISOString() }).eq('id', verbindungId).select('id')
  if (error || !data || data.length === 0) return { ok: false, error: 'Blockieren fehlgeschlagen.' }
  revalidatePath('/gutachter/netzwerk'); revalidatePath('/werkstatt/netzwerk'); revalidatePath('/flotte/netzwerk')
  return { ok: true }
}
```

- [ ] **Schritt 8: tsc + Commit**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add supabase/migrations src/lib/supabase/database.types.ts src/lib/netzwerk
git commit -m "feat(netzwerk): verbindungen domain — transition-core + actions + mitteilung (P1 T1)"
```

---

## Task 2: Verbindungs-Queries + Anzeige-Auflösung

**Ziel:** Server-Queries, die die Kanten des eingeloggten Users laden und Profile → Anzeige-Zeilen (Name/Ort/Rolle) auflösen. Reine Mapping-Logik zuerst (TDD).

**Files:**
- Create: `src/lib/netzwerk/verbindungen-display.ts` (pure)
- Create: `src/lib/netzwerk/verbindungen-queries.ts`
- Test: `src/lib/netzwerk/__tests__/verbindungen-display.test.ts`

**Interfaces:**
- Consumes: `netzwerk_verbindungen` + `profiles`/Entity-Tabellen (via `createAdminClient` — der eingeloggte Partner darf fremde `profiles` nicht per RLS lesen; die Kanten-Gegenseite wird service-role aufgelöst, gescopt auf die eigenen Kanten).
- Produces:
  - `verbindungen-display.ts`: `type PartnerAnzeige = { profilId: string; rolle: NetzwerkRolle; name: string; ort: string | null }`; `bauePartnerAnzeige(profil, sv, werkstatt): PartnerAnzeige` (reine Namens-Priorität: SV `firmenname` → Werkstatt `name` → `profiles.anzeigename` → `vorname+nachname` → `firma`).
  - `verbindungen-queries.ts`: `type VerbindungAnzeige = { verbindungId: string; partner: PartnerAnzeige }`; `type AnfrageAnzeige = VerbindungAnzeige & { richtung: 'eingehend'|'ausgehend' }`; `ladeMeineVerbindungen(): Promise<VerbindungAnzeige[]>` (status `angenommen`), `ladeMeineAnfragen(): Promise<{ eingehend: AnfrageAnzeige[]; ausgehend: AnfrageAnzeige[] }>` (status `offen`). Konsumiert von Task 5.

- [ ] **Schritt 1: Failing Test schreiben** (`verbindungen-display.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { bauePartnerAnzeige } from '../verbindungen-display'

describe('bauePartnerAnzeige — Namens-Prioritaet', () => {
  const p = { id: 'p1', rolle: 'werkstatt', anzeigename: null, vorname: 'Max', nachname: 'Muster', firma: null, ort: 'Köln' }
  it('Werkstatt-Name gewinnt vor Profil-Namen', () => {
    const a = bauePartnerAnzeige(p as any, null, { name: 'Auto Meier GmbH', adresse_ort: 'Köln' } as any)
    expect(a).toEqual({ profilId: 'p1', rolle: 'werkstatt', name: 'Auto Meier GmbH', ort: 'Köln' })
  })
  it('SV firmenname gewinnt vor Profil-Namen', () => {
    const sv = { firmenname: 'KFZ-Gutachter Nord' }
    const a = bauePartnerAnzeige({ ...p, rolle: 'sachverstaendiger' } as any, sv as any, null)
    expect(a.name).toBe('KFZ-Gutachter Nord')
  })
  it('Fallback auf vorname+nachname wenn keine Entity/anzeigename', () => {
    const a = bauePartnerAnzeige(p as any, null, null)
    expect(a.name).toBe('Max Muster')
  })
})
```

- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/verbindungen-display.test.ts` → FAIL.

- [ ] **Schritt 3: `verbindungen-display.ts` implementieren**
```ts
// src/lib/netzwerk/verbindungen-display.ts  (pure)
import type { NetzwerkRolle } from './types'

export type PartnerAnzeige = { profilId: string; rolle: NetzwerkRolle; name: string; ort: string | null }
type ProfilRow = { id: string; rolle: string; anzeigename: string | null; vorname: string | null; nachname: string | null; firma: string | null; ort: string | null }
type SvRow = { firmenname: string | null } | null
type WerkstattRow = { name: string | null; adresse_ort: string | null } | null

export function bauePartnerAnzeige(profil: ProfilRow, sv: SvRow, werkstatt: WerkstattRow): PartnerAnzeige {
  const nameAusProfil = (profil.anzeigename || [profil.vorname, profil.nachname].filter(Boolean).join(' ').trim() || profil.firma || 'Partner')
  const name = (sv?.firmenname) || (werkstatt?.name) || nameAusProfil
  const ort = werkstatt?.adresse_ort ?? profil.ort ?? null
  return { profilId: profil.id, rolle: profil.rolle as NetzwerkRolle, name, ort }
}
```

- [ ] **Schritt 4: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/verbindungen-display.test.ts` → PASS.

- [ ] **Schritt 5: `verbindungen-queries.ts` implementieren** (service-role, gescopt auf die eigenen Kanten):
```ts
// src/lib/netzwerk/verbindungen-queries.ts  (kein 'use server' — Server-Query fuer Server-Components)
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bauePartnerAnzeige, type PartnerAnzeige } from './verbindungen-display'

export type VerbindungAnzeige = { verbindungId: string; partner: PartnerAnzeige }
export type AnfrageAnzeige = VerbindungAnzeige & { richtung: 'eingehend' | 'ausgehend' }

async function ladeAnzeigen(admin: ReturnType<typeof createAdminClient>, profilIds: string[]): Promise<Map<string, PartnerAnzeige>> {
  const out = new Map<string, PartnerAnzeige>()
  if (profilIds.length === 0) return out
  const [{ data: profile }, { data: svs }, { data: wks }] = await Promise.all([
    admin.from('profiles').select('id, rolle, anzeigename, vorname, nachname, firma, ort').in('id', profilIds),
    admin.from('sachverstaendige').select('profile_id, firmenname').in('profile_id', profilIds),
    admin.from('werkstaetten').select('user_id, name, adresse_ort').in('user_id', profilIds),
  ])
  const svByProfil = new Map((svs ?? []).map((s: any) => [s.profile_id, s]))
  const wkByProfil = new Map((wks ?? []).map((w: any) => [w.user_id, w]))
  for (const p of (profile ?? []) as any[]) out.set(p.id, bauePartnerAnzeige(p, svByProfil.get(p.id) ?? null, wkByProfil.get(p.id) ?? null))
  return out
}

export async function ladeMeineVerbindungen(): Promise<VerbindungAnzeige[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return []
  const { data: kanten } = await supabase.from('netzwerk_verbindungen')
    .select('id, anfrager_id, empfaenger_id').eq('status', 'angenommen')
  const admin = createAdminClient()
  const gegen = (kanten ?? []).map((k: any) => ({ id: k.id, other: k.anfrager_id === user.id ? k.empfaenger_id : k.anfrager_id }))
  const anzeigen = await ladeAnzeigen(admin, gegen.map((g) => g.other))
  return gegen.flatMap((g) => { const p = anzeigen.get(g.other); return p ? [{ verbindungId: g.id, partner: p }] : [] })
}

export async function ladeMeineAnfragen(): Promise<{ eingehend: AnfrageAnzeige[]; ausgehend: AnfrageAnzeige[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser(); if (!user) return { eingehend: [], ausgehend: [] }
  const { data: kanten } = await supabase.from('netzwerk_verbindungen')
    .select('id, anfrager_id, empfaenger_id').eq('status', 'offen')
  const admin = createAdminClient()
  const rows = (kanten ?? []) as any[]
  const otherIds = rows.map((k) => (k.anfrager_id === user.id ? k.empfaenger_id : k.anfrager_id))
  const anzeigen = await ladeAnzeigen(admin, otherIds)
  const eingehend: AnfrageAnzeige[] = [], ausgehend: AnfrageAnzeige[] = []
  for (const k of rows) {
    const otherId = k.anfrager_id === user.id ? k.empfaenger_id : k.anfrager_id
    const p = anzeigen.get(otherId); if (!p) continue
    if (k.empfaenger_id === user.id) eingehend.push({ verbindungId: k.id, partner: p, richtung: 'eingehend' })
    else ausgehend.push({ verbindungId: k.id, partner: p, richtung: 'ausgehend' })
  }
  return { eingehend, ausgehend }
}
```

- [ ] **Schritt 6: tsc + Commit**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add src/lib/netzwerk && git commit -m "feat(netzwerk): verbindungs-queries + anzeige-aufloesung (P1 T2)"
```

---

## Task 3: Profi-Verzeichnis — SECURITY-DEFINER-Such-RPC + Wrapper

**⚠ Directory-Falle:** `profiles`-SELECT-RLS = staff/self; ein RLS-Policy-Fix rekursiert (42P17, belegt). Lösung = **DEFINER-RPC** (Muster `search_makler`), nur sichere Felder, `grant execute … to authenticated`, **kein** breiter `profiles`-Grant.

**Files:**
- Create (DDL via Plugin): `supabase/migrations/<V>_netzwerk_verzeichnis_suche.sql`
- Create: `src/lib/netzwerk/verzeichnis.ts`
- Modify: `src/lib/supabase/database.types.ts` (regen)

**Interfaces:**
- Produces: RPC `public.netzwerk_verzeichnis_suche(q text, ziel_rolle text default null)` → `TABLE(profil_id uuid, rolle text, anzeige_name text, ort text, avatar_url text)`; `sucheVerzeichnis(q, zielRolle?): Promise<VerzeichnisTreffer[]>`. Konsumiert von Task 5.

- [ ] **Schritt 1: Migration anwenden** (`apply_migration`, name `netzwerk_verzeichnis_suche`). RPC + trigram-GIN-Indizes:
```sql
create extension if not exists pg_trgm;
create index if not exists idx_profiles_trgm_name on public.profiles using gin ((coalesce(vorname,'')||' '||coalesce(nachname,'')||' '||coalesce(firma,'')||' '||coalesce(anzeigename,'')) gin_trgm_ops);
create index if not exists idx_profiles_trgm_ort on public.profiles using gin (ort gin_trgm_ops);
create index if not exists idx_werkstaetten_trgm_name on public.werkstaetten using gin (name gin_trgm_ops);
create index if not exists idx_sachverstaendige_trgm_firmenname on public.sachverstaendige using gin (firmenname gin_trgm_ops);

create or replace function public.netzwerk_verzeichnis_suche(q text, ziel_rolle text default null)
returns table(profil_id uuid, rolle text, anzeige_name text, ort text, avatar_url text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_caller_rolle text;
begin
  -- Selbst-Gate: nur eingeloggte Profis duerfen suchen (DEFINER umgeht RLS -> selbst gaten).
  select p.rolle::text into v_caller_rolle from profiles p where p.id = auth.uid();
  if v_caller_rolle is null or v_caller_rolle not in ('sachverstaendiger','werkstatt','flottenmanager','makler') then
    return;
  end if;
  if length(coalesce(q,'')) < 2 then return; end if;

  return query
    select p.id,
           p.rolle::text,
           coalesce(sv.firmenname, wk.name, nullif(p.anzeigename,''),
                    nullif(trim(coalesce(p.vorname,'')||' '||coalesce(p.nachname,'')),''),
                    p.firma, 'Partner') as anzeige_name,
           coalesce(wk.adresse_ort, p.ort) as ort,
           p.avatar_url
      from profiles p
      left join sachverstaendige sv on sv.profile_id = p.id
      left join werkstaetten wk on wk.user_id = p.id
     where p.rolle::text in ('sachverstaendiger','werkstatt','flottenmanager')  -- Knoten-Rollen (Makler v1 kein Ziel)
       and p.id <> auth.uid()                                                    -- nie sich selbst
       and (ziel_rolle is null or p.rolle::text = ziel_rolle)
       and (
            (coalesce(p.vorname,'')||' '||coalesce(p.nachname,'')||' '||coalesce(p.firma,'')||' '||coalesce(p.anzeigename,'')) ilike '%'||q||'%'
         or coalesce(sv.firmenname,'') ilike '%'||q||'%'
         or coalesce(wk.name,'') ilike '%'||q||'%'
         or coalesce(wk.adresse_ort, p.ort, '') ilike '%'||q||'%'
       )
     order by anzeige_name
     limit 30;
end;
$$;

revoke all on function public.netzwerk_verzeichnis_suche(text, text) from public;
grant execute on function public.netzwerk_verzeichnis_suche(text, text) to authenticated;
comment on function public.netzwerk_verzeichnis_suche(text, text) is
  'Netzwerk-Profi-Verzeichnis-Suche. DEFINER + Selbst-Gate; projiziert nur sichere Anzeige-Felder (kein email/telefon-Leak). Kein profiles-SELECT-Grant.';
```

- [ ] **Schritt 2: Version ablesen + File committen** (`list_migrations` → `<V>`; Dateiname == getrackte Version). **Kein neuer CHECK-Enum → kein flag-drift-Snapshot.**

- [ ] **Schritt 3: Verifizieren** (`execute_sql` READ):
```sql
select proname, prosecdef from pg_proc where proname='netzwerk_verzeichnis_suche';   -- prosecdef=true
select grantee, privilege_type from information_schema.role_routine_grants where routine_name='netzwerk_verzeichnis_suche';  -- nur authenticated EXECUTE, KEIN public/anon
-- Kein neuer breiter profiles-Grant:
select grantee, privilege_type from information_schema.role_table_grants where table_name='profiles' and grantee in ('anon','authenticated');
```
Erwartet: DEFINER=true; EXECUTE nur `authenticated`; profiles-Grants unverändert (kein neuer anon/authenticated-SELECT auf die Tabelle).

- [ ] **Schritt 4: Wrapper implementieren** (`verzeichnis.ts`, RLS-Client → `auth.uid()` = Caller):
```ts
// src/lib/netzwerk/verzeichnis.ts
import { createClient } from '@/lib/supabase/server'
import type { NetzwerkRolle } from './types'

export type VerzeichnisTreffer = { profilId: string; rolle: NetzwerkRolle; name: string; ort: string | null; avatarUrl: string | null }

export async function sucheVerzeichnis(q: string, zielRolle?: NetzwerkRolle): Promise<VerzeichnisTreffer[]> {
  const supabase = await createClient()
  // as never: neue RPC ist bis zum naechsten Types-Regen nicht in database.types.ts (Repo-Konvention).
  const { data, error } = await supabase.rpc('netzwerk_verzeichnis_suche' as never, { q, ziel_rolle: zielRolle ?? null } as never)
  if (error) { console.error('[sucheVerzeichnis]', error.message); return [] }
  return ((data ?? []) as any[]).map((r) => ({ profilId: r.profil_id, rolle: r.rolle, name: r.anzeige_name, ort: r.ort ?? null, avatarUrl: r.avatar_url ?? null }))
}
```

- [ ] **Schritt 5: Typen regen + Ratchets + Commit**
```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
npm run check:rls-policies -- --ratchet && npm run check:rls-grants
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add supabase/migrations src/lib/supabase/database.types.ts src/lib/netzwerk/verzeichnis.ts
git commit -m "feat(netzwerk): verzeichnis-such-rpc (definer, leak-safe) + wrapper (P1 T3)"
```

---

## Task 4: Kalt-Einladung — `netzwerk_einladungen` + Einladung-Lib (Token/Create/Redeem)

**Ziel:** Kalt-Einladung eines Nicht-Plattform-Kontakts per Email; bei Registrierung entsteht die **Auto-Kante** (`angenommen`). Airdrop-Token-Muster (Hash+Prefix; Klartext nur im Link). Reuse: `invite-email.ts` (HTML) + `sendEmail` (Versand); `anlegePartnerKern` + `/{rolle}/registrieren` liefern den Account (Wiring in Task 6).

**Files:**
- Create (DDL via Plugin): `supabase/migrations/<V>_netzwerk_einladungen.sql`
- Create: `src/lib/netzwerk/einladung-core.ts` (pure: Token + Redemption-Eligibility)
- Create: `src/lib/netzwerk/einladung.ts` (create+send, redeem→edge)
- Test: `src/lib/netzwerk/__tests__/einladung-core.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (regen)

**Interfaces:**
- Consumes: `netzwerk_verbindungen` (P0), `profiles`, `einladungEmailHtml` (`@/lib/auth/invite-email`), `sendEmail` (`@/lib/email/google/client`).
- Produces:
  - `einladung-core.ts`: `generateEinladungToken(): { token; tokenHash; lookupPrefix }` (Airdrop-Muster, sha256 hex + 8-Zeichen-Prefix); `istEinloesbar(row, jetzt): boolean` (`status==='offen'` und `ablauf_am > jetzt`); `ROLLE_TO_REGISTRIER_PFAD: Record<'sachverstaendiger'|'werkstatt'|'makler', string>`.
  - `einladung.ts`: `erstelleNetzwerkEinladung(einladerProfilId, email, zielRolle): Promise<{ok:true;link:string}|{ok:false;error:string}>`; `loeseNetzwerkEinladungEin(admin, token, neuesProfilId): Promise<{ok:boolean}>` (best-effort). Konsumiert von Task 6.

- [ ] **Schritt 1: Migration anwenden** (`apply_migration`, name `netzwerk_einladungen`):
```sql
create table public.netzwerk_einladungen (
  id                   uuid primary key default gen_random_uuid(),
  einlader_id          uuid not null references public.profiles(id) on delete cascade,
  email                text not null,
  ziel_rolle           text not null check (ziel_rolle in ('sachverstaendiger','werkstatt','makler')),
  token_hash           text not null unique,
  token_lookup_prefix  varchar(8) not null,
  status               text not null default 'offen' check (status in ('offen','eingeloest','abgelaufen')),
  erstellt_am          timestamptz not null default now(),
  ablauf_am            timestamptz not null default (now() + interval '30 days'),
  eingeloest_am        timestamptz,
  eingeloest_profil_id uuid references public.profiles(id)
);
create index netzwerk_einladungen_prefix_idx  on public.netzwerk_einladungen (token_lookup_prefix);
create index netzwerk_einladungen_einlader_idx on public.netzwerk_einladungen (einlader_id, status);

alter table public.netzwerk_einladungen enable row level security;
-- Einlader sieht seine eigenen Einladungen; Writes ausschliesslich service_role (create/redeem via Admin-Client).
create policy netzwerk_einladungen_select_own on public.netzwerk_einladungen
  for select to authenticated using (einlader_id = auth.uid());
grant select on public.netzwerk_einladungen to authenticated;
-- KEIN insert/update/delete-Grant an authenticated.
```

- [ ] **Schritt 2: Version ablesen + File committen** (Dateiname == getrackte Version).

- [ ] **Schritt 3: flag-drift-Snapshot regenerieren** (neuer CHECK-Enum `netzwerk_einladungen.status` + `ziel_rolle`) — **vor** jedem Code, der die Werte schreibt:
```bash
node --env-file=.env.local scripts/build-flag-drift-snapshot.mjs
npm run check:flag-drift -- --ratchet   # exit 0
```

- [ ] **Schritt 4: Failing Test schreiben** (`einladung-core.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { generateEinladungToken, istEinloesbar, ROLLE_TO_REGISTRIER_PFAD } from '../einladung-core'

describe('generateEinladungToken', () => {
  it('liefert Token + sha256-hex-Hash + 8-Zeichen-Prefix', () => {
    const t = generateEinladungToken()
    expect(t.token.length).toBeGreaterThan(0)
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(t.lookupPrefix).toBe(t.token.slice(0, 8))
  })
  it('zwei Aufrufe unterscheiden sich', () => {
    expect(generateEinladungToken().token).not.toBe(generateEinladungToken().token)
  })
})

describe('istEinloesbar', () => {
  const jetzt = new Date('2026-07-28T00:00:00Z')
  it('offen + nicht abgelaufen = true', () => {
    expect(istEinloesbar({ status: 'offen', ablauf_am: '2026-08-01T00:00:00Z' }, jetzt)).toBe(true)
  })
  it('abgelaufen = false', () => {
    expect(istEinloesbar({ status: 'offen', ablauf_am: '2026-07-01T00:00:00Z' }, jetzt)).toBe(false)
  })
  it('bereits eingeloest = false', () => {
    expect(istEinloesbar({ status: 'eingeloest', ablauf_am: '2999-01-01T00:00:00Z' }, jetzt)).toBe(false)
  })
})

describe('ROLLE_TO_REGISTRIER_PFAD', () => {
  it('sv->/sv, werkstatt->/werkstatt, makler->/makler', () => {
    expect(ROLLE_TO_REGISTRIER_PFAD.sachverstaendiger).toBe('/sv/registrieren')
    expect(ROLLE_TO_REGISTRIER_PFAD.werkstatt).toBe('/werkstatt/registrieren')
    expect(ROLLE_TO_REGISTRIER_PFAD.makler).toBe('/makler/registrieren')
  })
})
```

- [ ] **Schritt 5: Test laufen (FAIL)** — `npx vitest run src/lib/netzwerk/__tests__/einladung-core.test.ts` → FAIL.

- [ ] **Schritt 6: `einladung-core.ts` implementieren** (Airdrop-Muster aus `src/lib/airdrop/token.ts`):
```ts
// src/lib/netzwerk/einladung-core.ts  (pure)
import { createHash, randomBytes } from 'node:crypto'

export type EinladungZielRolle = 'sachverstaendiger' | 'werkstatt' | 'makler'
const TOKEN_BYTES = 16, PREFIX_LEN = 8

export function hashEinladungToken(token: string): string { return createHash('sha256').update(token).digest('hex') }
export function generateEinladungToken(): { token: string; tokenHash: string; lookupPrefix: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashEinladungToken(token), lookupPrefix: token.slice(0, PREFIX_LEN) }
}
export function istEinloesbar(row: { status: string; ablauf_am: string }, jetzt: Date = new Date()): boolean {
  return row.status === 'offen' && new Date(row.ablauf_am) > jetzt
}
export const ROLLE_TO_REGISTRIER_PFAD: Record<EinladungZielRolle, string> = {
  sachverstaendiger: '/sv/registrieren', werkstatt: '/werkstatt/registrieren', makler: '/makler/registrieren',
}
```

- [ ] **Schritt 7: Test laufen (PASS)** — `npx vitest run src/lib/netzwerk/__tests__/einladung-core.test.ts` → PASS.

- [ ] **Schritt 8: `einladung.ts` implementieren** (create+send + redeem→edge):
```ts
// src/lib/netzwerk/einladung.ts  (kein 'use server' — importierbar von Action UND Registrier-Flows)
import { createAdminClient } from '@/lib/supabase/admin'
import { einladungEmailHtml } from '@/lib/auth/invite-email'
import { sendEmail } from '@/lib/email/google/client'
import { generateEinladungToken, hashEinladungToken, istEinloesbar, ROLLE_TO_REGISTRIER_PFAD, type EinladungZielRolle } from './einladung-core'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function erstelleNetzwerkEinladung(
  einladerProfilId: string, email: string, zielRolle: EinladungZielRolle,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const mail = email.trim().toLowerCase()
  if (!EMAIL_RX.test(mail)) return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  const admin = createAdminClient()
  // Kein Doppel-Account: existiert bereits ein Profil zur Mail -> das ist eine Freund-Anfrage, keine Kalt-Einladung.
  const { data: existing } = await admin.from('profiles').select('id').eq('email', mail).maybeSingle()
  if (existing) return { ok: false, error: 'Zu dieser E-Mail existiert bereits ein Konto — nutze „Vernetzen" im Verzeichnis.' }

  const { token, tokenHash, lookupPrefix } = generateEinladungToken()
  const { error } = await admin.from('netzwerk_einladungen').insert({
    einlader_id: einladerProfilId, email: mail, ziel_rolle: zielRolle, token_hash: tokenHash, token_lookup_prefix: lookupPrefix,
  })
  if (error) return { ok: false, error: 'Einladung konnte nicht erstellt werden.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  const link = `${appUrl}${ROLLE_TO_REGISTRIER_PFAD[zielRolle]}?einladung=${token}`
  const { data: einlader } = await admin.from('profiles').select('vorname, nachname, firma, anzeigename').eq('id', einladerProfilId).maybeSingle()
  const einladerName = (einlader?.anzeigename as string | null) || [einlader?.vorname, einlader?.nachname].filter(Boolean).join(' ').trim() || (einlader?.firma as string | null) || 'Ein Partner'
  try {
    await sendEmail({
      to: mail,
      subject: `${einladerName} lädt dich ins Claimondo-Netzwerk ein`,
      html: einladungEmailHtml({
        vorname: '', email: mail, appUrl, magicLink: link,
        introHtml: `<p><strong>${einladerName}</strong> möchte sich mit dir im Claimondo-Netzwerk verbinden. Registriere dich kostenlos über den Button — ihr seid danach automatisch vernetzt.</p>`,
      }),
    })
  } catch (e) { console.error('[erstelleNetzwerkEinladung] email', e) } // non-fatal: Einladung steht, Link ist da
  return { ok: true, link }
}

/** Redemption: aus /{rolle}/registrieren nach anlegePartnerKern aufgerufen. Best-effort — ein Fehler bricht die Registrierung NIE. */
export async function loeseNetzwerkEinladungEin(
  admin: ReturnType<typeof createAdminClient>, token: string, neuesProfilId: string,
): Promise<{ ok: boolean }> {
  try {
    const { data: row } = await admin.from('netzwerk_einladungen').select('id, einlader_id, status, ablauf_am').eq('token_hash', hashEinladungToken(token)).maybeSingle()
    if (!row || !istEinloesbar(row as any, new Date())) return { ok: false }
    // Auto-Kante: die Einladung IST die Anfrage, die Registrierung die Annahme -> direkt 'angenommen'.
    const { error: edgeErr } = await admin.from('netzwerk_verbindungen').insert({
      anfrager_id: row.einlader_id, empfaenger_id: neuesProfilId, status: 'angenommen', beantwortet_am: new Date().toISOString(),
    })
    if (edgeErr && edgeErr.code !== '23505') return { ok: false } // 23505 = Kante existiert schon -> trotzdem Einladung schliessen
    await admin.from('netzwerk_einladungen').update({ status: 'eingeloest', eingeloest_am: new Date().toISOString(), eingeloest_profil_id: neuesProfilId }).eq('id', row.id)
    return { ok: true }
  } catch (e) { console.error('[loeseNetzwerkEinladungEin]', e); return { ok: false } }
}
```

- [ ] **Schritt 9: Typen regen + Ratchets + Commit**
```bash
SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts
npm run check:rls-policies -- --ratchet && npm run check:rls-grants && npm run check:flag-drift -- --ratchet
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add supabase/migrations scripts/lib/status-check-constraints.json src/lib/supabase/database.types.ts src/lib/netzwerk
git commit -m "feat(netzwerk): kalt-einladung — netzwerk_einladungen + token/create/redeem (P1 T4)"
```

---

## Task 5: Tabs-UI + Portale (Gutachter/Werkstatt/Flotte) + `/flotte/netzwerk`

**Ziel:** Feed | Verbindungen | Anfragen als Tabs auf den 3 Portalen; Verbindungen = Kontakt-Manager (Freunde + entfernen/blockieren + Verzeichnis-Suche + „Vernetzen"-CTA); Anfragen = eingehend annehmen/ablehnen + ausgehend. Neue Route `/flotte/netzwerk` + Nav-Item. Feed unberührt. (Makler-Feed unverändert — v1 kein Knoten.)

**Files:**
- Create: `src/components/netzwerk/NetzwerkPortalPage.tsx` (Server — lädt Daten je Tab, DRY über 3 Portale)
- Create: `src/components/netzwerk/NetzwerkTabBar.tsx` (Server — 3 `<Link>`, aktiver Tab)
- Create: `src/components/netzwerk/VerbindungenTab.tsx` (Client)
- Create: `src/components/netzwerk/AnfragenTab.tsx` (Client)
- Create: `src/components/netzwerk/VerzeichnisSuche.tsx` (Client — Suche + „Vernetzen")
- Create: `src/app/flotte/(shell)/netzwerk/page.tsx`
- Modify: `src/app/gutachter/netzwerk/page.tsx`, `src/app/werkstatt/(shell)/netzwerk/page.tsx` (Tabs einhängen)
- Modify: `src/components/shared/netzwerk/types.ts` (`NetzwerkPortal` += `'flotte'`; `NETZWERK_HREF` += flotte)
- Modify: `src/components/flotte/FlotteManagerShell.tsx` (Nav-Item)
- Test: `src/components/netzwerk/__tests__/tab.test.ts` (pure Tab-Resolver)

**Interfaces:**
- Consumes: `ladeMeineVerbindungen`/`ladeMeineAnfragen` (T2), `sucheVerzeichnis` (T3), `getNetzwerkFeed`/`getUserLikedKeys`/`getTopCommentsPreview` (Feed), Actions aus T1.
- Produces: `parseTab(raw): 'feed'|'verbindungen'|'anfragen'` (pure, default `'feed'`); `<NetzwerkPortalPage portal searchParams />`.

- [ ] **Schritt 1: `NetzwerkPortal` + `NETZWERK_HREF` erweitern**
```ts
// src/components/shared/netzwerk/types.ts
export type NetzwerkPortal = 'gutachter' | 'makler' | 'werkstatt' | 'flotte'
export const NETZWERK_HREF: Record<NetzwerkPortal, string> = {
  gutachter: '/gutachter/netzwerk', makler: '/makler/netzwerk', werkstatt: '/werkstatt/netzwerk', flotte: '/flotte/netzwerk',
}
```

- [ ] **Schritt 2: Failing Test schreiben** (`tab.test.ts`):
```ts
import { describe, it, expect } from 'vitest'
import { parseTab } from '../NetzwerkPortalPage'

describe('parseTab', () => {
  it('gueltige Tabs bleiben', () => {
    for (const t of ['feed','verbindungen','anfragen'] as const) expect(parseTab(t)).toBe(t)
  })
  it('unbekannt/undefined -> feed', () => {
    expect(parseTab(undefined)).toBe('feed'); expect(parseTab('xyz')).toBe('feed')
  })
})
```

- [ ] **Schritt 3: Test laufen (FAIL)** — `npx vitest run src/components/netzwerk/__tests__/tab.test.ts` → FAIL.

- [ ] **Schritt 4: `NetzwerkPortalPage.tsx` (Server) implementieren** — DRY-Kern für alle 3 Portale:
```tsx
// src/components/netzwerk/NetzwerkPortalPage.tsx  (Server Component)
import { getNetzwerkFeed, getUserLikedKeys } from '@/lib/community/feed'
import { getTopCommentsPreview } from '@/lib/community/threads'
import { NetzwerkFeed } from '@/components/shared/netzwerk/NetzwerkFeed'
import type { NetzwerkPortal } from '@/components/shared/netzwerk/types'
import { ladeMeineVerbindungen, ladeMeineAnfragen } from '@/lib/netzwerk/verbindungen-queries'
import { NetzwerkTabBar } from './NetzwerkTabBar'
import { VerbindungenTab } from './VerbindungenTab'
import { AnfragenTab } from './AnfragenTab'

export type NetzwerkTab = 'feed' | 'verbindungen' | 'anfragen'
export function parseTab(raw: string | undefined): NetzwerkTab {
  return raw === 'verbindungen' || raw === 'anfragen' ? raw : 'feed'
}

export async function NetzwerkPortalPage({ portal, searchParams }: { portal: NetzwerkPortal; searchParams: { tab?: string } }) {
  const tab = parseTab(searchParams?.tab)
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <NetzwerkTabBar portal={portal} active={tab} />
      {tab === 'feed' && await FeedBlock({ portal })}
      {tab === 'verbindungen' && <VerbindungenTab verbindungen={await ladeMeineVerbindungen()} />}
      {tab === 'anfragen' && await AnfragenBlock()}
    </div>
  )
}

async function FeedBlock({ portal }: { portal: NetzwerkPortal }) {
  const entries = await getNetzwerkFeed()
  const [likedKeys, previewsByKey] = await Promise.all([getUserLikedKeys(entries), getTopCommentsPreview(entries)])
  return <NetzwerkFeed portal={portal} entries={entries} likedKeys={likedKeys} previewsByKey={previewsByKey} />
}
async function AnfragenBlock() {
  const { eingehend, ausgehend } = await ladeMeineAnfragen()
  return <AnfragenTab eingehend={eingehend} ausgehend={ausgehend} />
}
```

- [ ] **Schritt 5: Test laufen (PASS)** — `npx vitest run src/components/netzwerk/__tests__/tab.test.ts` → PASS.

- [ ] **Schritt 6: `NetzwerkTabBar.tsx` (Server) implementieren** — 3 Links, aktiver Tab hervorgehoben (kein Status-Farb-Map → Registry-Ratchet-safe):
```tsx
// src/components/netzwerk/NetzwerkTabBar.tsx  (Server Component)
import Link from 'next/link'
import type { NetzwerkPortal } from '@/components/shared/netzwerk/types'
import { NETZWERK_HREF } from '@/components/shared/netzwerk/types'
import type { NetzwerkTab } from './NetzwerkPortalPage'

const TABS: { key: NetzwerkTab; label: string }[] = [
  { key: 'feed', label: 'Feed' }, { key: 'verbindungen', label: 'Verbindungen' }, { key: 'anfragen', label: 'Anfragen' },
]
export function NetzwerkTabBar({ portal, active }: { portal: NetzwerkPortal; active: NetzwerkTab }) {
  const base = NETZWERK_HREF[portal]
  return (
    <nav className="flex gap-1 border-b border-claimondo-border" aria-label="Netzwerk-Tabs">
      {TABS.map((t) => (
        <Link key={t.key} href={t.key === 'feed' ? base : `${base}?tab=${t.key}`}
          className={`px-4 py-2 text-body-sm font-medium border-b-2 -mb-px ${active === t.key ? 'border-claimondo-ondo text-claimondo-navy' : 'border-transparent text-claimondo-shield hover:text-claimondo-navy'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Schritt 7: `VerbindungenTab.tsx` + `AnfragenTab.tsx` + `VerzeichnisSuche.tsx` (Client) implementieren.** Buttons via `@/components/primitives`, Karten via `SectionCard`, Toasts via `sonner`. `VerbindungenTab`: Freunde-Liste (Name/Ort/Rolle + „Entfernen"/„Blockieren" → `entferneVerbindung`/`blockiereVerbindung`) + eingebettete `VerzeichnisSuche`. `AnfragenTab`: eingehend (Karte + „Annehmen"/„Ablehnen" → `nimmAnfrageAn`/`lehneAnfrageAb`) + ausgehend (Karte „ausstehend"). `VerzeichnisSuche`: Input (debounced) → `sucheVerzeichnis` (als Client-Wrapper-Action ODER `/api/netzwerk/verzeichnis`-Route) → Treffer + „Vernetzen" (`sendeFreundAnfrage`). Alle Actions Result-Check (`if (!res.ok) toast.error(res.error)`), danach `router.refresh()`.

```tsx
// src/components/netzwerk/AnfragenTab.tsx  (Client — Kernmuster, gekuerzt)
'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { nimmAnfrageAn, lehneAnfrageAb } from '@/lib/netzwerk/verbindungen-actions'
import type { AnfrageAnzeige } from '@/lib/netzwerk/verbindungen-queries'

export function AnfragenTab({ eingehend, ausgehend }: { eingehend: AnfrageAnzeige[]; ausgehend: AnfrageAnzeige[] }) {
  const router = useRouter(); const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const res = await fn(); if (!res.ok) toast.error(res.error ?? 'Fehler'); else router.refresh()
  })
  return (
    <div className="space-y-6">
      <SectionCard title="Eingehende Anfragen">
        {eingehend.length === 0 ? <p className="text-body-sm text-claimondo-shield">Keine offenen Anfragen.</p> :
          eingehend.map((a) => (
            <div key={a.verbindungId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-body-sm text-claimondo-navy">{a.partner.name}{a.partner.ort ? ` · ${a.partner.ort}` : ''}</span>
              <div className="flex gap-2">
                <Button variant="primary" loading={pending} onClick={() => run(() => nimmAnfrageAn(a.verbindungId))}>Annehmen</Button>
                <Button variant="ghost" loading={pending} onClick={() => run(() => lehneAnfrageAb(a.verbindungId))}>Ablehnen</Button>
              </div>
            </div>
          ))}
      </SectionCard>
      <SectionCard title="Gesendete Anfragen">
        {ausgehend.length === 0 ? <p className="text-body-sm text-claimondo-shield">Keine ausstehenden Anfragen.</p> :
          ausgehend.map((a) => <p key={a.verbindungId} className="text-body-sm text-claimondo-navy py-1">{a.partner.name} — ausstehend</p>)}
      </SectionCard>
    </div>
  )
}
```
(`VerbindungenTab`/`VerzeichnisSuche` analog: gleiche `run()`-Struktur; `VerzeichnisSuche` nutzt eine dünne Route `src/app/api/netzwerk/verzeichnis/route.ts`, die `sucheVerzeichnis(q, zielRolle)` als eingeloggter Caller aufruft — Muster `src/app/api/search/route.ts`.)

- [ ] **Schritt 8: Portale einhängen.** `gutachter/netzwerk/page.tsx` + `werkstatt/(shell)/netzwerk/page.tsx` ersetzen den Body durch `return <NetzwerkPortalPage portal="…" searchParams={await searchParams} />` (Next 15: `searchParams` ist ein Promise → `{ searchParams }: { searchParams: Promise<{ tab?: string }> }`, `await searchParams`). Neue Route:
```tsx
// src/app/flotte/(shell)/netzwerk/page.tsx
import { NetzwerkPortalPage } from '@/components/netzwerk/NetzwerkPortalPage'
export const dynamic = 'force-dynamic'
export default async function FlotteNetzwerkPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return <NetzwerkPortalPage portal="flotte" searchParams={await searchParams} />
}
```

- [ ] **Schritt 9: Flotte-Nav-Item.** In `FlotteManagerShell.tsx` `MessagesSquareIcon` importieren (lucide, wie die anderen Portale) und `FLOTTE_NAV_ITEMS` ergänzen:
```tsx
{ href: '/flotte/netzwerk', label: 'Netzwerk', icon: MessagesSquareIcon },
```

- [ ] **Schritt 10: Build + Ratchets + Commit**
```bash
npm run build   # Next 15 Route-Validator (searchParams-Promise, Server/Client-Grenzen)
npm run check:component-set -- --ratchet && npm run check:status-registry -- --ratchet && npm run check:token-audit && npm run check:knip -- --ratchet
git add src/components/netzwerk src/components/shared/netzwerk/types.ts src/components/flotte/FlotteManagerShell.tsx src/app/gutachter/netzwerk src/app/werkstatt src/app/flotte src/app/api/netzwerk
git commit -m "feat(netzwerk): tabs (feed/verbindungen/anfragen) + /flotte/netzwerk + verzeichnis-suche (P1 T5)"
```

---

## Task 6: Kalt-Einladung wiring — Redemption an `/{rolle}/registrieren` + Einladen-UI

**Ziel:** Die Einladen-UI (im Verbindungen-Tab) erzeugt eine Kalt-Einladung; die Registrier-Actions lösen den Token nach `anlegePartnerKern` ein → Auto-Kante.

**Files:**
- Create: `src/lib/netzwerk/einladen-actions.ts` (`'use server'` — `sendeNetzwerkEinladung`)
- Create: `src/components/netzwerk/EinladenForm.tsx` (Client)
- Modify: `src/app/werkstatt/registrieren/actions.ts`, `src/app/makler/registrieren/actions.ts`, `src/app/sv/registrieren/` (Action) — `einladung`-Token einlesen + nach Anlage `loeseNetzwerkEinladungEin`
- Modify: die zugehörigen `registrieren`-Clients/Pages — `?einladung=<token>` aus der URL in ein Hidden-Field durchreichen
- Modify: `src/components/netzwerk/VerbindungenTab.tsx` (EinladenForm einbetten)

**Interfaces:**
- Consumes: `erstelleNetzwerkEinladung`/`loeseNetzwerkEinladungEin` (T4), `anlegePartnerKern` (bestehend).
- Produces: `sendeNetzwerkEinladung(email, zielRolle): Promise<{ok:true}|{ok:false;error:string}>`.

- [ ] **Schritt 1: `einladen-actions.ts` implementieren**
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { erstelleNetzwerkEinladung } from '@/lib/netzwerk/einladung'
import type { EinladungZielRolle } from '@/lib/netzwerk/einladung-core'

export async function sendeNetzwerkEinladung(email: string, zielRolle: EinladungZielRolle): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  if (!['sachverstaendiger', 'werkstatt', 'makler'].includes(zielRolle)) return { ok: false, error: 'Ungültige Zielrolle.' }
  const res = await erstelleNetzwerkEinladung(user.id, email, zielRolle)
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}
```

- [ ] **Schritt 2: Redemption in die Registrier-Actions einziehen** — Muster identisch für werkstatt/makler/sv. Beispiel `werkstatt/registrieren/actions.ts` (nach dem erfolgreichen `anlegePartnerKern`, vor `return { ok: true }`):
```ts
// Token aus dem Formular (durchgereicht aus ?einladung=<token>).
const einladungToken = String(formData.get('einladung') ?? '').trim()
// ... bestehende Anlage ... result.ok === true, result.userId vorhanden:
if (einladungToken) {
  const { loeseNetzwerkEinladungEin } = await import('@/lib/netzwerk/einladung')
  try { await loeseNetzwerkEinladungEin(admin, einladungToken, result.userId) } catch (e) { console.error('[registriereWerkstattSelf] einladung', e) } // best-effort
}
```
(Bei `sv/registrieren`: die dortige Anlage-Action analog; `result.userId` = das neue Profil. Der Import dynamisch, damit die pure-Test-Grenzen der Registrier-Actions unberührt bleiben.)

- [ ] **Schritt 3: Token durch die Registrier-Pages reichen.** Jede `registrieren/page.tsx` liest `searchParams.einladung` und gibt es an ihren Client; der Client rendert `<input type="hidden" name="einladung" value={einladung} />` im Formular. (Kein neuer sichtbarer UI-Zweig — der Token fährt nur mit.)

- [ ] **Schritt 4: `EinladenForm.tsx` (Client) implementieren** — Email + Rollen-Select + „Einladen" → `sendeNetzwerkEinladung`; Hinweis „Flotten lädst du über eine bestehende Verbindung ein" (Flotte-Self-Signup deferred). Result-Check + Toast. In `VerbindungenTab` unter der Verzeichnis-Suche einbetten.

- [ ] **Schritt 5: tsc + Build + Commit**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run build
git add src/lib/netzwerk/einladen-actions.ts src/components/netzwerk/EinladenForm.tsx src/components/netzwerk/VerbindungenTab.tsx src/app/werkstatt/registrieren src/app/makler/registrieren src/app/sv/registrieren
git commit -m "feat(netzwerk): kalt-einladung wiring — redemption in registrieren + einladen-ui (P1 T6)"
```

---

## Task 7: Grün-Gate + Prod-Journey-Smoke (Regel 4)

**Files:**
- Test: alle Ratchets + Build + der Prod-Smoke-Nachweis (im PR/Marker).

- [ ] **Schritt 1: Voller Gate-Durchlauf (lokal)**
```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
npm run build
npx vitest run src/lib/netzwerk src/components/netzwerk
npm run check:rls-policies -- --ratchet && npm run check:rls-grants && npm run check:flag-drift -- --ratchet
npm run check:knip -- --ratchet && npm run check:component-set -- --ratchet && npm run check:token-audit && npm run check:status-registry -- --ratchet
```
Erwartet: alles grün / 0-neu.

- [ ] **Schritt 2: PR gegen `staging`** (nicht selbst mergen). Im PR: Smoke-Plan (Flows + Wegwerf-Konten) benennen; DDL-Reihenfolge-Notiz (P0 gemergt, DELETE-Policy additiv).

- [ ] **Schritt 3: Nach Prod-Deploy — vollständiger Playwright-Journey-Smoke gegen `https://app.claimondo.de`.** Zwei Wegwerf-Partner seeden (`node scripts/smoke/throwaway-account.mjs` — SV + Werkstatt, `telefon = NULL`). Journey (jeden betroffenen Flow):
  1. **Login Wegwerf-SV** → `/gutachter/netzwerk` → Tabs Feed/Verbindungen/Anfragen rendern (nicht leere Shell).
  2. **Verbindungen-Tab** → Verzeichnis-Suche nach dem Wegwerf-Werkstatt-Namen → Treffer erscheint → **„Vernetzen"** → Toast ok.
  3. **Login Wegwerf-Werkstatt** → `/werkstatt/netzwerk?tab=anfragen` → eingehende Anfrage sichtbar + **Glocke** (`mitteilungen`) zeigt „Neue Netzwerk-Anfrage" → **„Annehmen"**.
  4. Beide Seiten: **Verbindungen-Tab** listet den jeweils anderen; SV-Glocke zeigt „angenommen".
  5. **Entfernen** (unfriend) auf einer Seite → verschwindet bei beiden (`router.refresh`).
  6. **Flotte:** Login Wegwerf-Flotte (falls seedbar) → `/flotte/netzwerk` rendert Tabs (Nav-Item vorhanden).
  7. **Kalt-Einladung:** SV → Verbindungen-Tab → „Partner einladen" mit Wegwerf-Email + Rolle Werkstatt → `execute_sql` (Admin-JWT/Service): `select status, ziel_rolle from netzwerk_einladungen order by erstellt_am desc limit 1` = `offen`. Registrierung über den Link → nach Anlage `execute_sql`: neue `netzwerk_verbindungen`-Kante `status='angenommen'` zwischen Einlader + neuem Profil + Einladung `status='eingeloest'`.
- [ ] **Schritt 4:** Ergebnis (grün/rot + Screenshots/Assertions + DB-Nachweise) im PR/Marker dokumentieren. **Rot → Fix-PR**, nicht als erledigt markieren. Deploy nicht in dieser Session? Smoke-Pflicht explizit an die Merge-/Deploy-Session übergeben (Flow-Liste + Wegwerf-Konten).

---

## Definition of Done (P1)

- Migrationen appliziert + Files getrackt (Dateiname == getrackte Version); `database.types.ts` regeneriert + committed; flag-drift-Snapshot enthält `netzwerk_einladungen.status`/`ziel_rolle`.
- **RLS/Grants-Nachweis** (`execute_sql`): `netzwerk_verbindungen` hat DELETE-Policy + authenticated-DELETE-Grant; `netzwerk_einladungen` authenticated-**SELECT-only**; `netzwerk_verzeichnis_suche` = DEFINER + EXECUTE nur authenticated; **kein** neuer `profiles`-Grant; `v_netzwerk_freunde` weiterhin service-role-only.
- vitest grün (verbindungen-core, verbindungen-display, einladung-core, tab); tsc + build grün; alle Ratchets 0-neu.
- Tabs **Feed/Verbindungen/Anfragen** live auf Gutachter/Werkstatt/Flotte (Makler unverändert = feed-only, v1); Feed unberührt; `/flotte/netzwerk` erreichbar + Nav-Item.
- Freund-Anfrage senden/annehmen/ablehnen/entfernen/blockieren funktioniert; jede Aktion Result-Object + RLS-`.select()`-Row-Check; In-App-Mitteilung erscheint in der echten Glocke (`mitteilungen`).
- Verzeichnis-Suche liefert Treffer ohne `email`/`telefon`-Leak.
- Kalt-Einladung: Email raus, `netzwerk_einladungen`-Row `offen`; Registrierung über Link → Auto-Kante `angenommen` + Einladung `eingeloest`.
- PR gegen `staging`, nicht selbst gemergt; **Regel-4-Prod-Journey-Smoke grün** (oder explizit an Merge-/Deploy-Session übergeben).

---

## Self-Review (durchgeführt beim Schreiben)

1. **Spec-Coverage:** Tabs Verbindungen/Anfragen (Design §7.2) → T5. Freund-Anfrage senden/annehmen/ablehnen/blockieren + entfernen (Kontaktverwaltung Overview §2b, Design §7.1/§10) → T1. RLS-Write + `.select()`-Row-Check (AGENTS.md/DSGVO-Lehre) → T1. Profi-Verzeichnis Name/Ort/Rolle + DEFINER-RPC ohne Leak (Design §7.3, Overview §3.1, Landminen §6) → T3. `/flotte/netzwerk` + `NETZWERK_HREF`-Erweiterung (Design §7.2) → T5. Einladen bestehend=Freund-Anfrage / kalt=partner-lead-Muster+anlegePartnerKern+registrieren+invite-email+airdrop-token → Auto-Kante bei Registrierung (Roadmap P1, Overview §3.6) → T4/T6. Notifications über Mitteilungs-Infra + ⚠ C-Migration → T1 (`createMitteilung`, C3-Note). DDL via Plugin/Grants/Ratchets/kein-main-Push/PR→staging (Global Constraints). Regel-4-Journey-Smoke → T7.
2. **Bewusste Spec-Abweichungen (dokumentiert):** (a) **Makler ohne Tabs** v1 — LOCKED (Design §2/§7.2 + Overview §4); Task-Prompt-Klammer „(gutachter/makler/werkstatt)" = die existierenden Feed-Seiten, nicht die v1-Entry-Points. (b) **Notifications via `createMitteilung`** statt `emitEvent`/`event-to-task-map` — der emitEvent-Pfad ist claim-scoped (No-Claim-Events werden in `fan-out.ts` still verworfen) + task-orientiert; `benachrichtigungen` ist tot. `createMitteilung` ist die live gelesene Glocke; C3-Outbox-Migration als ⚠ notiert. (c) **Kalt-Einladung via net-new `netzwerk_einladungen`** statt Schreiben in `partner_leads` — `partner_leads`-RLS ist staff-only (ein Partner darf nicht inserten) + Sales-CRM-Semantik; der *Account-Kern* `anlegePartnerKern` + `/{rolle}/registrieren` + `invite-email.ts` + Airdrop-Token-Muster werden wie gefordert wiederverwendet. (d) **Flotte-als-Eingeladener deferred** (keine Flotte-Self-Registrierung).
3. **⚠ C-Abhängigkeiten (C-Migration-Notizen):** Notifications → **C3-Outbox** (user-scoped Event + fan-out-Branch, Muster `gast.conversion_reminder`) für Multi-Kanal statt in-app-only `createMitteilung`. Sonst hat P1 **keine** offene C-Abhängigkeit (der Boost/das Entitlement/die Bindung sind P2/P3 und werden hier nicht berührt).
4. **Placeholder-Scan:** kein TBD/„handle edge cases" — alle DDL/RPC/TS/Tests/Commands konkret; UI-Detail-Komponenten (`VerbindungenTab`/`VerzeichnisSuche`/`EinladenForm`) mit Kernmuster + exakten Consumer-Signaturen.
5. **Typ-Konsistenz:** `VerbindungRow`/`VerbindungStatus`/`NetzwerkRolle` (types.ts) durchgängig; `darfAnnehmenOderAblehnen`/`darfEntfernenOderBlockieren` (T1) → Actions (T1); `PartnerAnzeige`/`VerbindungAnzeige`/`AnfrageAnzeige` (T2) → UI (T5); `sucheVerzeichnis`/`VerzeichnisTreffer` (T3) → UI (T5); `generateEinladungToken`/`istEinloesbar`/`ROLLE_TO_REGISTRIER_PFAD`/`EinladungZielRolle` (T4) → `erstelleNetzwerkEinladung`/`loeseNetzwerkEinladungEin` (T4) → wiring (T6); `parseTab`/`NetzwerkTab`/`NetzwerkPortal` (T5).
6. **Ratchet-Bewusstsein:** neue CHECK-Enums nur in `netzwerk_einladungen` (T4) → Snapshot-Regen VOR Code; `mitteilungen.kategorie` = bestehender Wert `'update'` (kein Enum-Add); `benachrichtigungen.typ` nicht genutzt; UI nutzt `primitives.Button`/`SectionCard` (component-set) + neutrale `Badge`-tones (kein neuer Status-Farb-Map → status-registry); UI-Text inline deutsch (kein neuer i18n-Key); DEFINER-RPC `set search_path`+`revoke from public` (rls-grants).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-28-netzwerk-p1-verbindungen-ui-invite.md`.** P1 baut auf dem P0-Merge auf und geht live → Regel-4-Journey-Smoke ist Teil der DoD. Zwei Ausführungs-Optionen:

**1. Subagent-Driven (empfohlen)** — fresh Subagent je Task, Review zwischen Tasks, schnelle Iteration.
**2. Inline Execution** — Tasks in dieser Session mit Checkpoints.

Welcher Ansatz?
