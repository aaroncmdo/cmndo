# KI-Aufsicht SLA-Rollen — Inkrement 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine KI-Aufsichts-Fläche `/admin/ki-aufsicht`, die die SLA-Fristen-Lage aus `sla_tracking` **pro Rolle** aggregiert, Claude priorisieren/erklären lässt und freigabepflichtige `create_task`-Remediationen an die hängende Rolle vorschlägt.

**Architecture:** Deterministische Aggregation von `sla_tracking` (read-only) → `SlaRollenLage`; Claude-Batch-Tool-Use (gespiegelt aus `orchestrator/run.ts`) → `propose_sla_task`-Remediationen, persistiert im geteilten `ai_claim_proposals`-Spine (`quelle='aufsicht'`, additiv); Freigabe reuset `buildTaskFromProposal`+`decideProposal`; Report-Fläche = surface-agnostischer `KiAufsichtPanel` (Ops-Cockpit einbettbar).

**Tech Stack:** Next.js 15 App Router, Supabase (service_role Admin-Client), Anthropic SDK (Batch `messages.create` + Tool-Use), Zod, Vitest (env=node), React + Component-Set.

## Global Constraints

- **Migrationen NUR via Supabase-Plugin** `apply_migration` (Regel 2): DDL → apply_migration → `list_migrations` Version `<V>` → File `supabase/migrations/<V>_<name>.sql` (Name==Version) → `execute_sql` READ verify.
- **Nie auf `main`** — Branch `kitta/ki-aufsicht-sla-rollen`, PR gegen `staging`.
- **NICHT anfassen:** `src/lib/orchestrator/*`, `src/lib/sla/*`, `src/app/admin/ai-vorschlaege/*`, `src/app/faelle/[id]/claim-ai-actions.ts`, Ops-Cockpit (`src/app/admin/faelle/*`, `src/lib/ops/*`) — nur **importieren/lesen**. Geteilte Edits: `src/lib/ai/models.ts` (+1 Key) + additive `ai_claim_proposals.quelle`-CHECK-Migration + `src/components/portal-nav/*` AdminNav-Link (additiv).
- **Server-Actions Result-Object** `{ ok: boolean; error?: string }`, kein `throw`; `revalidatePath` nach Mutation. Non-critical (Timeline) in try/catch.
- **Keine Konstanten/Types aus `'use server'`-Files exportieren.** Verb-/Rollen-Registry ist KEIN `'use server'`.
- **Umlaute-Pflicht** in UI-Strings. **Component-Set** (`shared/SectionCard`, `primitives.Button` variant=navy|ghost|success|danger|ondo|bare, `onClick`/`loading`). **Status-Registry** für Badges (keine inline Farb-Map). **Token-Audit** (keine Hex/bracket).
- **Redirect-Stub-Gate:** die neue `page.tsx` rendert Content (kein reiner `redirect()`).
- **DSGVO Art. 22:** Remediation freigabe-gated; die Aufsicht meldet + schlägt vor, führt NIE autonom aus.
- **Service_role liest Basis-Tabellen**, nie `v_claim_*` (auth-gated → 0 Zeilen).

### Verifizierte Fakten (gegen Prod `paizkjajbuxxksdoycev` + Code, 08.07.)

- `sla_tracking` Spalten: `id, fall_id, claim_id, sla_typ, started_at, breach_at, completed_at, status ('pending'|'completed'|'breached'), eskalation_task_id, target_rolle ('kanzlei'|'sv'|'kunde'|null), phase, n_mahnungen`. Prod: 48 Zeilen (43 breached/5 pending/0 completed).
- SV-SLA-Typen (`src/lib/sla/tracker.ts`, `target_rolle` NULL): `gutachter_zuweisung, termin_bestaetigung, besichtigung, gutachten_upload, qc_filmcheck`. Fristen `SLA_FRIST_MIN` + `SLA_LABEL` dort.
- Kanzlei-SLA-Typen (`src/lib/sla/kanzlei-tracker.ts`, `target_rolle='kanzlei'`): `kanzlei_as_versand, kanzlei_ruege_versand, kanzlei_kuerzung_antwort, kanzlei_vs_nachfass`. `KANZLEI_SLA_LABEL` dort.
- `ai_claim_proposals` CHECKs: `quelle ∈ {orchestrator,copilot}` → **additiv `aufsicht`**; `vorschlag_typ ∈ {task,escalation,next_step,draft_message,add_note}` (enthält `task` — genügt). Spalten: `id, claim_id, erstellt_am, vorschlag_typ, ziel_rolle, payload jsonb, begruendung, modell, dedupe_key, status, entschieden_von, entschieden_am, feedback, auto_ausgefuehrt, erzeugte_task_id, quelle, ausfuehrung_ergebnis`. RLS = nur service_role.
- `buildTaskFromProposal(payload: TaskProposalPayload, zielRolle: string|null, claimId: string, triggerEvent: string): Promise<{task_id: string|null}>` — `@/lib/orchestrator/task-from-proposal`. `TaskProposalPayload = { titel?, beschreibung?, prioritaet?, faellig_in_tagen? }`.
- `decideProposal(id, status:'angenommen'|'verworfen'|'bearbeitet', userId, feedback?): Promise<{ok,error?}>` — `@/lib/orchestrator/proposals`.
- Batch-Tool-Use-Muster: `src/lib/orchestrator/run.ts` (`client.messages.create({model,max_tokens,system,tools,messages})`, `extractProposalsFromToolUse`, `validateToolCall` mit zod in `tools.ts`).
- `AI_MODELS` in `src/lib/ai/models.ts` (Orchestrator ergänzte `claim_orchestrator`, Ink.1 `claim_copilot`). `logAiUsage({endpoint,model,fallId,usage:{input_tokens,output_tokens}})`.
- `requireAdminUserId()`-Muster: `createClient().auth.getUser()` → `profiles.rolle==='admin' ? user.id : null` (aus `admin/ai-vorschlaege/actions.ts`).
- `claims.claim_nummer` für Titel/Anzeige. `logFallEvent` braucht Fall-ID (Aufsicht nutzt es NICHT — task-only, claim_id genügt).

---

## Task 1: Additive Migration (quelle += 'aufsicht')

**Files:** Create (Plugin): `supabase/migrations/<V>_ai_claim_proposals_quelle_aufsicht.sql`

- [ ] **Step 1: DDL via `apply_migration`** (name `ai_claim_proposals_quelle_aufsicht`, project `paizkjajbuxxksdoycev`)
```sql
alter table public.ai_claim_proposals drop constraint if exists ai_claim_proposals_quelle_check;
alter table public.ai_claim_proposals add constraint ai_claim_proposals_quelle_check
  check (quelle in ('orchestrator','copilot','aufsicht'));
```
- [ ] **Step 2:** `list_migrations` → Version `<V>`.
- [ ] **Step 3:** File committen als `supabase/migrations/<V>_ai_claim_proposals_quelle_aufsicht.sql` (Name==Version).
- [ ] **Step 4: Verify** (`execute_sql` READ): `select pg_get_constraintdef(oid) from pg_constraint where conname='ai_claim_proposals_quelle_check';` → enthält `aufsicht`. (Bestand quelle-Werte orchestrator/copilot erfüllen den neuen CHECK → safe.)
- [ ] **Step 5: Commit** `git commit -m "feat(ki-aufsicht): additive Migration — ai_claim_proposals.quelle += aufsicht"`

---

## Task 2: Rollen-Attribution + Aggregation `src/lib/aufsicht/sla-rollen.ts`

**Files:** Create `src/lib/aufsicht/sla-rollen.ts` · Test `src/lib/aufsicht/sla-rollen.test.ts`

**Interfaces (Produces):**
- `type AufsichtRolle = 'dispatch'|'sachverstaendiger'|'kanzlei'|'admin'|'kunde'|'unbekannt'`
- `type SlaRow = { id, claim_id, claim_nummer, sla_typ, status, breach_at, target_rolle }`
- `type SlaRollenLage = { proRolle: Array<{ rolle: AufsichtRolle; breached: number; impending: number; pending: number; kritischste: Array<{ claim_id, claim_nummer, sla_typ, ueberfaellig_std: number }> }>; gesamt: { breached, impending, pending } }`
- `const IMPENDING_FENSTER_STD = 6` (breach_at in < 6h aber noch pending)
- `function rolleForSla(row: Pick<SlaRow,'sla_typ'|'target_rolle'>): AufsichtRolle`
- `function aggregiereSlaLage(rows: SlaRow[], now: Date): SlaRollenLage`
- `async function ladeSlaRows(): Promise<SlaRow[]>` (Admin-Client, `sla_tracking` join `claims` für claim_nummer; nur status in pending/breached)
- `function summarizeSlaRollenLage(lage: SlaRollenLage): string` (pure Markdown für den Prompt)

**Rollen-Map** (SV-Typen; kanzlei via target_rolle):
```ts
const SLA_TYP_ROLLE: Record<string, AufsichtRolle> = {
  gutachter_zuweisung: 'dispatch', termin_bestaetigung: 'sachverstaendiger',
  besichtigung: 'sachverstaendiger', gutachten_upload: 'sachverstaendiger', qc_filmcheck: 'admin',
}
// rolleForSla = (target_rolle als AufsichtRolle) ?? SLA_TYP_ROLLE[sla_typ] ?? 'unbekannt'
```

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from 'vitest'
import { rolleForSla, aggregiereSlaLage, summarizeSlaRollenLage } from './sla-rollen'
const NOW = new Date('2026-07-08T12:00:00Z')
describe('rolleForSla', () => {
  it('mappt SV-Typen', () => { expect(rolleForSla({ sla_typ: 'gutachten_upload', target_rolle: null })).toBe('sachverstaendiger') })
  it('mappt gutachter_zuweisung -> dispatch', () => { expect(rolleForSla({ sla_typ: 'gutachter_zuweisung', target_rolle: null })).toBe('dispatch') })
  it('nutzt target_rolle bei kanzlei', () => { expect(rolleForSla({ sla_typ: 'kanzlei_as_versand', target_rolle: 'kanzlei' })).toBe('kanzlei') })
})
describe('aggregiereSlaLage', () => {
  const rows = [
    { id:'1', claim_id:'c1', claim_nummer:'CLM-1', sla_typ:'gutachten_upload', status:'breached', breach_at:'2026-07-06T12:00:00Z', target_rolle:null },
    { id:'2', claim_id:'c2', claim_nummer:'CLM-2', sla_typ:'gutachten_upload', status:'pending', breach_at:'2026-07-08T15:00:00Z', target_rolle:null }, // impending (<6h)
    { id:'3', claim_id:'c3', claim_nummer:'CLM-3', sla_typ:'gutachten_upload', status:'pending', breach_at:'2026-07-10T12:00:00Z', target_rolle:null }, // pending
    { id:'4', claim_id:'c4', claim_nummer:'CLM-4', sla_typ:'kanzlei_as_versand', status:'breached', breach_at:'2026-07-05T12:00:00Z', target_rolle:'kanzlei' },
  ]
  it('zaehlt pro Rolle breached/impending/pending', () => {
    const lage = aggregiereSlaLage(rows as never, NOW)
    const sv = lage.proRolle.find(r => r.rolle === 'sachverstaendiger')!
    expect(sv.breached).toBe(1); expect(sv.impending).toBe(1); expect(sv.pending).toBe(1)
    const kanzlei = lage.proRolle.find(r => r.rolle === 'kanzlei')!
    expect(kanzlei.breached).toBe(1)
    expect(lage.gesamt.breached).toBe(2)
  })
  it('kritischste enthaelt ueberfaellig_std absteigend', () => {
    const lage = aggregiereSlaLage(rows as never, NOW)
    const sv = lage.proRolle.find(r => r.rolle === 'sachverstaendiger')!
    expect(sv.kritischste[0].claim_nummer).toBe('CLM-1'); expect(sv.kritischste[0].ueberfaellig_std).toBeGreaterThan(40)
  })
})
it('summarize enthaelt Rollen + Zahlen', () => {
  const lage = aggregiereSlaLage([{ id:'1', claim_id:'c1', claim_nummer:'CLM-1', sla_typ:'gutachten_upload', status:'breached', breach_at:'2026-07-06T12:00:00Z', target_rolle:null }] as never, NOW)
  const s = summarizeSlaRollenLage(lage); expect(s).toContain('sachverstaendiger'); expect(s).toContain('CLM-1')
})
```
- [ ] **Step 2: Run FAIL** — `npx vitest run src/lib/aufsicht/sla-rollen.test.ts`
- [ ] **Step 3: Implement** — `rolleForSla` (target_rolle-cast ?? map ?? 'unbekannt'); `aggregiereSlaLage`: gruppiere nach `rolleForSla`, zähle `breached` (status==='breached'), `impending` (status==='pending' && breach_at ≤ now+6h), `pending` (status==='pending' && breach_at > now+6h), `kritischste` = breached+impending sortiert nach `ueberfaellig_std` (= (now-breach_at)/3.6e6, für impending negativ) desc, top 5; `ladeSlaRows` via `createAdminClient().from('sla_tracking').select('id,claim_id,sla_typ,status,breach_at,target_rolle, claims(claim_nummer)').in('status',['pending','breached'])` + Nested-FK-Normalisierung (`Array.isArray`); `summarizeSlaRollenLage` deterministischer Markdown. KEIN `'use server'`.
- [ ] **Step 4: Run PASS** · **Step 5: Commit** `git commit -m "feat(ki-aufsicht): SLA-Rollen-Aggregation (sla_tracking -> SlaRollenLage)"`

---

## Task 3: Claude-Synthese `src/lib/aufsicht/synthese.ts`

**Files:** Create `src/lib/aufsicht/synthese.ts` · Test `src/lib/aufsicht/synthese.test.ts` · Modify `src/lib/ai/models.ts` (+`ki_aufsicht`)

**Interfaces (Consumes):** `SlaRollenLage`/`summarizeSlaRollenLage` (Task 2), `AI_MODELS`, `logAiUsage`, `createAdminClient`.
**Produces:**
- `const AUFSICHT_TOOLS: Anthropic.Tool[]` — 1 Tool `propose_sla_task` (properties: `claim_id` string, `ziel_rolle` enum[dispatch,sachverstaendiger,kanzlei,admin], `titel` string, `begruendung` string, `prioritaet` enum[normal,dringend,kritisch]; required claim_id/ziel_rolle/titel/begruendung).
- `function extractAufsichtDrafts(content: Anthropic.ContentBlock[]): AufsichtDraft[]` (zod-validiert) · `type AufsichtDraft = { claimId, zielRolle, titel, begruendung, prioritaet }`
- `async function persistAufsichtRemediation(modell: string, drafts: AufsichtDraft[]): Promise<string[]>` — insert `ai_claim_proposals` { claim_id, vorschlag_typ:'task', ziel_rolle, payload:{titel,beschreibung:begruendung,prioritaet}, begruendung, modell, dedupe_key (sha256 claim+titel+randomUUID), quelle:'aufsicht' }
- `async function laufeSlaAufsicht(lage: SlaRollenLage): Promise<{ findings: number }>` — Batch-Claude-Call (mirror `orchestrator/run.ts reviewClaim`), extract, persist, logAiUsage(endpoint:'ki_aufsicht'). Wirft nie.

- [ ] **Step 1: Failing test** — `extractAufsichtDrafts` filtert text/invalide; `persistAufsichtRemediation` insert quelle='aufsicht'. (Anthropic + admin-client gemockt, wie Ink.1 proposals.test.)
- [ ] **Step 2: Run FAIL**
- [ ] **Step 3: Implement** — spiegle `orchestrator/tools.ts` (zod `safeParse`) + `run.ts` (Konstruktor im try, `messages.create({ model: AI_MODELS.ki_aufsicht, max_tokens:1500, system: AUFSICHT_SYSTEM, tools: AUFSICHT_TOOLS, messages:[{role:'user',content: summarizeSlaRollenLage(lage)}] })`, `extractAufsichtDrafts(res.content)`, `logAiUsage` non-critical). `AUFSICHT_SYSTEM` = „Du bist Ops-Aufsicht … priorisiere die SLA-Lage über alle Rollen, schlage 0–N konkrete Tasks an die hängende Rolle vor (nur die kritischsten), begründe faktenbasiert; wird NICHT automatisch ausgeführt, ein Mensch gibt frei." `models.ts`: additive Zeile `ki_aufsicht: 'claude-sonnet-4-6',`.
- [ ] **Step 4: Run PASS** · **Step 5: Commit** `git commit -m "feat(ki-aufsicht): Claude-Synthese (propose_sla_task -> ai_claim_proposals quelle=aufsicht) + models.ki_aufsicht"`

---

## Task 4: Freigabe-Actions `src/app/admin/ki-aufsicht/actions.ts`

**Files:** Create `src/app/admin/ki-aufsicht/actions.ts` (`'use server'`) · Test `src/app/admin/ki-aufsicht/actions.test.ts`

**Interfaces (Consumes):** `buildTaskFromProposal`, `decideProposal` (orchestrator, import), `createAdminClient`, `createClient`, `revalidatePath`.
**Produces (Result-Object):**
- `freigebenAufsichtVorschlag(proposalId: string)` — requireAdminUserId; Proposal laden (claim_id, ziel_rolle, payload, status); Idempotenz `status==='offen'`; `buildTaskFromProposal(payload, ziel_rolle, claim_id, 'ki_aufsicht_sla')` (claim_id genügt, kein fallId); `decideProposal(id,'angenommen',userId)`; `revalidatePath('/admin/ki-aufsicht')`.
- `verwerfenAufsichtVorschlag(proposalId: string, feedback?: string)` — Idempotenz + `decideProposal(id,'verworfen',userId,feedback)`; revalidate.

- [ ] **Step 1: Failing test** — freigeben ruft buildTaskFromProposal mit claim_id + decideProposal('angenommen'); Idempotenz (status!='offen' → ok:false). (Mocks wie Ink.1 claim-ai-actions.test: vi.hoisted spies für buildTaskFromProposal/decideProposal/admin-client/server-client(rolle admin)/next-cache.)
```ts
it('freigeben: buildTaskFromProposal mit claim_id + angenommen', async () => {
  // proposalRow { id:'p1', claim_id:'c1', vorschlag_typ:'task', ziel_rolle:'sachverstaendiger', payload:{titel:'X'}, status:'offen' }
  const r = await freigebenAufsichtVorschlag('p1')
  expect(r.ok).toBe(true)
  expect(taskSpy).toHaveBeenCalledWith({ titel:'X' }, 'sachverstaendiger', 'c1', 'ki_aufsicht_sla')
  expect(decideSpy).toHaveBeenCalledWith('p1','angenommen','admin-1')
})
```
- [ ] **Step 2: Run FAIL** · **Step 3: Implement** (requireAdminUserId spiegeln; Result-Object; kein throw) · **Step 4: Run PASS** · **Step 5: Commit** `git commit -m "feat(ki-aufsicht): Freigabe-Executor (task-only, reuse buildTaskFromProposal, claim-scoped)"`

---

## Task 5: Report-Fläche `src/app/admin/ki-aufsicht/` + AdminNav-Link

**Files:** Create `src/app/admin/ki-aufsicht/page.tsx` (Server, admin-gated) · Create `src/app/admin/ki-aufsicht/_components/KiAufsichtPanel.tsx` (Client, exportiert für Cockpit-Embed) · Modify `src/components/portal-nav/*` (AdminNav +Link „KI-Aufsicht", additiv, wie #3753 „KI-Vorschläge"-Link).

- [ ] **Step 1: page.tsx** — admin-gated (redirect non-admin zu `/admin`); lädt `aggregiereSlaLage(await ladeSlaRows(), new Date())` + offene `quelle='aufsicht'`-Proposals (`ai_claim_proposals`.select where quelle='aufsicht' and status='offen'); rendert `<KiAufsichtPanel lage={...} vorschlaege={...} />`. **Content-return** (kein reiner redirect → Redirect-Stub-Gate).
- [ ] **Step 2: KiAufsichtPanel** — `shared/SectionCard`-Rahmen; pro Rolle eine Zeile/Card: Rolle + Ampel (`<StatusBadge domain=...>` aus `src/lib/status/` ODER plain Label — KEINE inline Farb-Map) + breached/impending/pending-Zahlen + Drill-down auf `kritischste` (claim_nummer, sla_typ, „N Std überfällig"). Vorschlags-Karten: titel/begruendung/ziel_rolle + `[Freigeben]`(navy)/`[Verwerfen]`(ghost) → Task-4-Actions (`useTransition`, `toast.error` bei `!ok`). Nach Mutation `router.refresh()`. Umlaute („KI-Aufsicht", „Freigeben", „überfällig", „hängt"), Tokens, `primitives.Button`.
- [ ] **Step 3: AdminNav-Link** — additiver Eintrag „KI-Aufsicht" (Icon z.B. `ShieldAlertIcon`/`GaugeIcon`) → `/admin/ki-aufsicht`, admin-sichtbar. Redirect alter Pfade n/a (neue Route).
- [ ] **Step 4: Verify** — `npm run build` (Route+Server-Action-Validator); `npm run check:token-audit && npm run check:component-set -- --warn && npm run check:status-registry -- --warn && npm run check:redirect-stubs -- --warn` → 0 neu.
- [ ] **Step 5: Commit** `git commit -m "feat(ki-aufsicht): /admin/ki-aufsicht Report-Flaeche + KiAufsichtPanel + AdminNav-Link"`

---

## Task 6: Cron `src/app/api/cron/ki-aufsicht-sla/route.ts`

**Files:** Create `src/app/api/cron/ki-aufsicht-sla/route.ts`

- [ ] **Step 1: Implement** — `runtime='nodejs'`, `dynamic='force-dynamic'`; GET-Handler (Cron-Muster wie `api/cron/claim-orchestrator`, inkl. Cron-Auth-Header falls im Projekt genutzt — bestehendes Cron-Muster prüfen + spiegeln); ruft `laufeSlaAufsicht(aggregiereSlaLage(await ladeSlaRows(), new Date()))`; `NextResponse.json({ findings })`. Fehler gefangen (nie 500-crashen), `log_cron_job_run`-RPC falls im Projekt Standard (prüfen).
- [ ] **Step 2: Verify** — `npx tsc --noEmit` (Route); manueller GET (lokal/CI) optional.
- [ ] **Step 3: Commit** `git commit -m "feat(ki-aufsicht): taeglicher SLA-Aufsicht-Cron"`. **VPS-crontab-Eintrag = Ops-Schritt post-Merge** (wie #3687 claim-orchestrator, im PR-Body notieren).

---

## Task 7: Full Build + 7-Punkte-Audit + PR

- [ ] **Step 1:** `npm run typecheck` (voller `tsc --noEmit` — CI-Gate, strenger als build!) **grün**, dann `npm run build` grün.
- [ ] **Step 2:** `npx vitest run src/lib/aufsicht src/app/admin/ki-aufsicht/actions.test.ts` alle grün.
- [ ] **Step 3:** 7-Punkte-Audit dokumentieren (Build/UI=AdminNav-Link+Route/Redundanz=sla_tracking+Orchestrator-Executor reused/Dead-Code/Spec-Treue Ink.1/Inkonsistenz=Umlaute+Tokens+Rollen-Map/Regression=orchestrator+sla+ops-cockpit unberührt).
- [ ] **Step 4:** `git push -u origin kitta/ki-aufsicht-sla-rollen`; PR gegen `staging` mit Audit-Body + „VPS-crontab nachtragen"-Note + „Cockpit-Embed koordiniert mit 470d55c9". Prod-Smoke (frischer SW-freier Browser, test-admin via 2FA-TOTP-Technik [[reference-headless-2fa-prod-smoke]]): `/admin/ki-aufsicht` rendert Rollen-Lage → Vorschlag freigeben → Task entsteht.

---

## Self-Review (gegen Spec)

**Spec-Coverage:** §4-Units → T2(sla-rollen)/T3(synthese)/T4(actions)/T5(Fläche)/T6(cron). §5 Datenmodell → T1(quelle additiv)+T3(persist). §6 Verben → T3/T4 (MVP `create_task`; draft/assign_sv = Ink.2, bewusst deferred). §7 Sicherheit → T4(freigabe-gated/admin)/T5(admin-gated). §3 „baut auf sla_tracking" → T2 read-only.
**Placeholder-Scan:** T3-Synthese + T5-UI verweisen auf konkrete Vorbilder (orchestrator run.ts/tools.ts; Ink.1-Panel-Muster) statt lange Vorlagen zu duplizieren — bewusst, keine „TODO".
**Typ-Konsistenz:** `SlaRollenLage` (T2) → `laufeSlaAufsicht`/`summarize` (T3) → page.tsx (T5). `AufsichtDraft` (T3) → persist. `buildTaskFromProposal`-Sig (T4) 1:1 aus verifizierten Fakten.
**Offen für Ink. 2:** draft_message/assign_sv-Remediation · KB-/Makler-Handoff-SLAs neu tracken · Snapshot/Trends · Cockpit-Embed-Verdrahtung mit 470d55c9.
