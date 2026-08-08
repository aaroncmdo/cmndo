# Tier-2-Dokumente-Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freigeschaltete SVs ohne geprüfte Berufshaftpflicht + Gewerbeanmeldung erhalten eine 14-Tage-Frist ab Freischaltung; danach `verifizierung_status='frist_ueberschritten'` → automatischer Dispatch-Stopp (bestehendes FG3-Gate), bis die Docs geprüft sind.

**Architecture:** Der Dispatch-Gate (`svDarfFaelleEmpfangen`) + der Reminder-Cron existieren bereits. Kaputt ist nur, dass `freigebeBasicSvCore` `verifizierung_status='geprueft'` ohne Doc-Prüfung setzt. Fix = Freischaltung entkoppeln (geprueft nur nach echter Prüfung, sonst ausstehend+Frist), plus Admin-Steuerung, SV-Banner, Bestandsheilung.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres via Admin-Client), TypeScript, vitest.

## Global Constraints

- **DDL nur via `mcp__plugin_supabase_supabase__apply_migration`** — keine neue Spalte nötig (alle Felder existieren), daher voraussichtlich KEINE Migration.
- **Server-Actions:** Result-Object `{ success/ok, error? }`, nie throw; jede Mutation `revalidatePath`.
- **Frontend-Texte:** echte Umlaute (ä/ö/ü/ß).
- **Tier-2-Slots:** `sv_berufshaftpflicht`, `sv_gewerbeanmeldung` (beide gemeinsam = ein `verifizierung_status`).
- **Frist:** 14 Tage ab Freischaltung. `verifizierung_status`-Kanon: NULL · `ausstehend` · `geprueft` · `frist_ueberschritten`.
- **Interne Test-SVs ausnehmen:** `ist_testaccount=true` ODER Email `@claimondo.de`/`@claimondo.test`.
- **7-Punkte-Audit im Commit-Body; Regel 4 Prod-Smoke nach Deploy.**

---

### Task 1: Tier-2-Doc-Status-Helper (pure, testbar)

**Files:**
- Create: `src/lib/sv/tier2-docs.ts`
- Test: `src/lib/sv/__tests__/tier2-docs.test.ts`

**Interfaces:**
- Produces: `TIER2_SLOTS: readonly ['sv_berufshaftpflicht','sv_gewerbeanmeldung']`; `async sindTier2DocsGeprueft(db, svId): Promise<boolean>` (true nur wenn BEIDE Slots `status='geprueft'`).

- [ ] **Step 1: Failing test** — `tier2-docs.test.ts`: mocke einen `db` mit `.from().select().eq().in()` der 2 geprüfte Rows liefert → `sindTier2DocsGeprueft` == true; mit 1 Row → false; mit 0 → false. (Muster: bestehende `queries.test.ts` für den Mock-Stil.)
- [ ] **Step 2: Run** `npx vitest run src/lib/sv/__tests__/tier2-docs.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implement** `tier2-docs.ts`:
```ts
import type { createAdminClient } from '@/lib/supabase/admin'
type AdminClient = ReturnType<typeof createAdminClient>

export const TIER2_SLOTS = ['sv_berufshaftpflicht', 'sv_gewerbeanmeldung'] as const

/** True nur wenn BEIDE Tier-2-Slots status='geprueft' haben. */
export async function sindTier2DocsGeprueft(db: AdminClient, svId: string): Promise<boolean> {
  const { data } = await db
    .from('pflichtdokumente')
    .select('dokument_typ')
    .eq('sv_id', svId)
    .eq('status', 'geprueft')
    .in('dokument_typ', TIER2_SLOTS as unknown as string[])
  const set = new Set((data ?? []).map((r) => r.dokument_typ as string))
  return TIER2_SLOTS.every((s) => set.has(s))
}
```
- [ ] **Step 4: Run** vitest → PASS.
- [ ] **Step 5: Commit** `feat(tier2): sindTier2DocsGeprueft-Helper + TIER2_SLOTS`

---

### Task 2: Freischaltung entkoppeln (Kern-Fix)

**Files:**
- Modify: `src/lib/sv-basic/freigabe.ts` (SELECT erweitern + Update-Payload `verifizierung_status`-Logik)
- Test: `src/lib/sv-basic/__tests__/freigabe.test.ts` (neu, falls nicht vorhanden)

**Interfaces:**
- Consumes: `sindTier2DocsGeprueft` (Task 1).

- [ ] **Step 1: Failing test** — mocke `db`: `freigebeBasicSvCore` mit einem SV, dessen Tier-2-Docs NICHT geprüft sind + `verifizierung_frist_bis` NULL → das Update-Objekt enthält `verifizierung_status:'ausstehend'` und ein `verifizierung_frist_bis` ~14 Tage in der Zukunft (NICHT `'geprueft'`). Zweiter Fall: Docs geprüft → `verifizierung_status:'geprueft'`, kein frist-Overwrite. Dritter Fall: aktueller Status `frist_ueberschritten` → NICHT auf ausstehend zurückgesetzt.
- [ ] **Step 2: Run** vitest → FAIL.
- [ ] **Step 3: Implement** — in `freigabe.ts`:
  - SELECT erweitern: `.select('standort_lat, standort_lng, paket_umkreis_km, isochrone_polygon, verifizierung_status, verifizierung_frist_bis')`.
  - Vor dem Update den Tier-2-Status berechnen:
```ts
import { sindTier2DocsGeprueft } from '@/lib/sv/tier2-docs'
// … nach dem Geo-Guard, vor dem Update:
const FRIST_TAGE = 14
const tier2Patch: Record<string, unknown> = {}
if (await sindTier2DocsGeprueft(db, svId)) {
  tier2Patch.verifizierung_status = 'geprueft'
} else if (sv.verifizierung_status !== 'frist_ueberschritten') {
  // Freischaltung startet die Tier-2-Frist (statt blind 'geprueft').
  // 'geprueft' setzt kuenftig NUR tier2Freigeben nach echter Doc-Pruefung.
  tier2Patch.verifizierung_status = 'ausstehend'
  if (sv.verifizierung_frist_bis == null) {
    tier2Patch.verifizierung_frist_bis = new Date(Date.now() + FRIST_TAGE * 864e5).toISOString()
  }
}
```
  - Im `.update({...})` das feste `verifizierung_status: 'geprueft'` **entfernen** und `...tier2Patch` einsetzen. `verifiziert:true, verifiziert_am, ist_aktiv, portal_zugang_freigeschaltet, onboarding_status:'abgeschlossen'` bleiben.
- [ ] **Step 4: Run** vitest → PASS.
- [ ] **Step 5: Commit** `fix(tier2): Freischaltung setzt ausstehend+14d-Frist statt blind geprueft`

---

### Task 3: Anti-Bypass-Guard in tier2Freigeben

**Files:**
- Modify: `src/app/admin/sachverstaendige/[id]/verifizierung-actions.ts` (`tier2Freigeben`, ab Z.57)

**Interfaces:**
- Consumes: `sindTier2DocsGeprueft` bzw. direkte pflichtdokumente-Prüfung; `TIER2_SLOTS` (Task 1).

- [ ] **Step 1: Failing test** — `verifizierung-actions` ist `'use server'` (schwer unit-testbar); stattdessen die Guard-Logik als kleine pure Funktion `tier2FreigabeErlaubt(docs)` in `tier2-docs.ts` extrahieren + testen: gibt `{ok:false}` wenn ein Slot weder `hochgeladen` noch `geprueft` ist.
- [ ] **Step 2: Run** vitest → FAIL.
- [ ] **Step 3: Implement** — in `tier2-docs.ts` `tier2FreigabeErlaubt` ergänzen (pure); in `tier2Freigeben` VOR dem `verifizierung_status='geprueft'`-Update die beiden Slots laden und guarden:
```ts
// Kein Blind-Freigeben (sonst neuer Bypass wie freigebeBasicSvCore alt).
const { data: docs } = await db.from('pflichtdokumente')
  .select('dokument_typ, status').eq('sv_id', svId)
  .in('dokument_typ', TIER2_SLOTS as unknown as string[])
if (!tier2FreigabeErlaubt(docs ?? [])) {
  return { success: false, error: 'Berufshaftpflicht und Gewerbeanmeldung müssen zuerst hochgeladen sein.' }
}
```
  Zusätzlich beim Freigeben `verifizierung_frist_bis=null, verifizierung_frist_ueberschritten_am=null` mitschreiben (Frist-Reset). Die pflichtdokumente-Slots auf `status='geprueft'` setzen.
- [ ] **Step 4: Run** vitest → PASS.
- [ ] **Step 5: Commit** `fix(tier2): tier2Freigeben verlangt hochgeladene Docs (Anti-Bypass) + Frist-Reset`

---

### Task 4: tier2FristVerlaengern-Action

**Files:**
- Modify: `src/app/admin/sachverstaendige/[id]/verifizierung-actions.ts` (neue Action)

**Interfaces:**
- Produces: `async tier2FristVerlaengern(svId: string, tage: number): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Implement** (Muster: `tier2DokumentNachfordern`, requireAdmin + revalidateBoth):
```ts
export async function tier2FristVerlaengern(svId: string, tage: number): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.success) return { success: false, error: auth.error }
  if (!Number.isFinite(tage) || tage < 1 || tage > 90) return { success: false, error: 'Ungültige Verlängerung (1–90 Tage).' }
  const db = createAdminClient()
  const { error } = await db.from('sachverstaendige').update({
    verifizierung_status: 'ausstehend',
    verifizierung_frist_bis: new Date(Date.now() + tage * 864e5).toISOString(),
    verifizierung_frist_ueberschritten_am: null,
    verifizierung_reminder_7d_gesendet_am: null,
  }).eq('id', svId)
  if (error) return { success: false, error: `Frist-Verlängerung fehlgeschlagen: ${error.message}` }
  revalidateBoth(svId)
  return { success: true }
}
```
- [ ] **Step 2: Verify** `npx tsc --noEmit` grün (Server-Action-Signatur).
- [ ] **Step 3: Commit** `feat(tier2): tier2FristVerlaengern-Admin-Action`

---

### Task 5: Admin-Sicht — Enforcement-Status + Frist-verlängern-Button

**Files:**
- Modify: `src/app/admin/sachverstaendige/[id]/VerifizierungsTab.tsx` (Enforcement-Status-Zeile + „Frist verlängern"-Button, ruft Task-4-Action)
- Modify: `src/app/admin/sachverstaendige/SvListeContent.tsx` (Tier-2-Badge je Zeile: liest `verifizierung_status` + `verifizierung_frist_bis` → „Tier-2 ausstehend (X Tage)" / „überfällig — kein Dispatch")

**Interfaces:**
- Consumes: `tier2FristVerlaengern` (Task 4), `verifizierung_status`/`verifizierung_frist_bis` (bereits geladen).

- [ ] **Step 1:** `VerifizierungsTab.tsx` lesen (aktueller Aufbau der Tier-2-Sektion) — die bestehenden `tier2Freigeben`/`tier2DokumentNachfordern`-Buttons zeigen, wohin die Status-Zeile + der Button passen.
- [ ] **Step 2:** Enforcement-Status-Zeile rendern (Frist, Tage verbleibend, „Dispatch pausiert" bei `frist_ueberschritten`) via `StatusBadge`/token-basiertes Markup; „Frist verlängern (+14 Tage)"-Button (`loading`-Button) der `tier2FristVerlaengern(svId, 14)` ruft + Result-Toast.
- [ ] **Step 3:** `SvListeContent.tsx` — Badge-Spalte/Chip ableiten aus `verifizierung_status` (Status-Registry-konform, kein inline-Farb-Ternary → `resolveStatus`/`StatusBadge` nutzen, sonst Ratchet rot).
- [ ] **Step 4: Verify** `npm run build` grün (Route/Layout → voller Build, nicht nur tsc).
- [ ] **Step 5: Commit** `feat(tier2/admin): Enforcement-Status + Frist-verlaengern in SV-Akte + Liste-Badge`

---

### Task 6: SV-Portal-Banner

**Files:**
- Modify: `src/app/gutachter/layout.tsx` (oder `GutachterShell` — je nachdem wo Banner sitzen; das `isDeactivated`-Banner in layout.tsx:110 ist das Muster) — Tier-2-Frist-Banner
- Prüfen: `src/app/gutachter/verifizierung/page.tsx` (kein doppelter Hinweis)

**Interfaces:**
- Consumes: `verifizierung_status`, `verifizierung_frist_bis` des eingeloggten SV (im layout bereits geladen — sonst nachladen).

- [ ] **Step 1:** `layout.tsx` Umgebung des `isDeactivated`-Banners (Z.110) lesen; prüfen welche sv-Felder schon geladen sind.
- [ ] **Step 2:** Banner-Bedingung: `verifizierung_status==='ausstehend'` → „Berufshaftpflicht & Gewerbeanmeldung fehlen — noch X Tage, dann pausieren wir deine Fälle" (Link `/gutachter/verifizierung`); `==='frist_ueberschritten'` → „Deine Fälle sind pausiert — bitte Nachweise hochladen". Umlaute korrekt, `bg-warning-soft`/`bg-danger-soft`-Token.
- [ ] **Step 3: Verify** `npm run build` grün.
- [ ] **Step 4: Commit** `feat(tier2/sv): Portal-Banner Tier-2-Frist + Fall-Pause`

---

### Task 7: Journey-Delta J8 + J10

**Files:**
- Modify: `docs/fundament/journeys/j08-onboarding-je-rolle.md` (Tier-2-Frist-Absatz nach Freischaltung)
- Modify: `docs/fundament/journeys/j10-*.md` (frist_ueberschritten als regulärer Nicht-Empfangs-Grund — Klarstellung)

- [ ] **Step 1:** J8 „Ablauf (Soll)" um Punkt ergänzen: „Nach Freischaltung 14-Tage-Frist für Berufshaftpflicht + Gewerbeanmeldung; Nichterfüllung → Fall-Pause (kein Zugangsverlust), Reaktivierung nach Doc-Prüfung."
- [ ] **Step 2:** J10 Fehlerfälle/Gates: `frist_ueberschritten` als Nicht-Empfangs-Grund (FG3) explizit nennen.
- [ ] **Step 3: Commit** `docs(journeys): J8/J10 Tier-2-Frist-Soll`

---

### Task 8: Bestandsheilung-Script (gated, NICHT im Deploy auto-ausgeführt)

**Files:**
- Create: `scripts/tier2-bestandsheilung.mjs` (Dry-run default; `--live` schreibt)

**Interfaces:**
- Setzt für aktive SVs ohne geprüfte Tier-2-Docs und `verifizierung_status != 'frist_ueberschritten'`, NICHT Test-SV: `verifizierung_status='ausstehend'`, `verifizierung_frist_bis=now+14d`, `verifizierung_reminder_7d_gesendet_am=null`.

- [ ] **Step 1: Implement** Script (Muster: `scripts/smoke/*` mit `.env.local`-Keys, PostgREST oder pg): Dry-run listet die betroffenen SVs (Email, aktueller Status); `--live` schreibt. Test-SV-Ausschluss (`ist_testaccount` ODER Email-Muster).
- [ ] **Step 2: Dry-run** `node scripts/tier2-bestandsheilung.mjs` → listet die ~9 SVs, schreibt NICHTS.
- [ ] **Step 3: Commit** `feat(tier2): Bestandsheilung-Script (dry-run default)` — **`--live` erst auf Aarons Signal (§9-Timing-Entscheidung).**

---

### Task 9: PR + Prod-Smoke (Regel 4)

- [ ] **Step 1:** PR gegen `staging`, Body mit Smoke-Plan (Task-9-Assertions).
- [ ] **Step 2:** Nach Merge + Deploy — Wegwerf-SV: freischalten → DB-Assert `verifizierung_status='ausstehend'` + Frist gesetzt (NICHT geprueft). Portal-Banner sichtbar. Admin-Liste zeigt Badge. Doc-Upload + `tier2Freigeben` → `geprueft` → Banner weg. Frist per DB auf Vergangenheit → Cron-Trigger → `frist_ueberschritten` → `svDarfFaelleEmpfangen`-Assert=false. 0-Residue.
- [ ] **Step 3:** Ergebnis im PR dokumentieren.

---

## Self-Review

- **Spec-Coverage:** §4.1→T2, §4.3→(T2/Cron unverändert), §4.4→T3+T4+T5, §4.5→T6, §4.6→T8, §6→T7, §10→T9. §4.2 (Paid-Frist-Konsistenz) → in T2 abgedeckt (Core-Fallback setzt nur wenn NULL). ✓
- **Placeholder:** keine — Kern-Code inline; UI-Tasks mit „Step 1: lesen" statt geratenem Markup (bewusst, weil Consumer-Struktur beim Bau gelesen wird).
- **Typ-Konsistenz:** `sindTier2DocsGeprueft(db,svId)`, `tier2FreigabeErlaubt(docs)`, `tier2FristVerlaengern(svId,tage)`, `TIER2_SLOTS` durchgängig.
