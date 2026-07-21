# Schadenkarte Rollen-Split + Binding-überall + Lifecycle-Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Beschreiben = nur Admin; Binden = Flottenmanager+Admin (device-agnostisch via `/schaden/[token]`-Tap oder in-app QR); nur gebundene Karten in der Flotte; Mint-Batch raus; FM kann versehentliche Schäden stornieren.

**Architecture:** `/schaden/[token]` wird rollen-bewusst (3 Zweige: FM+ungebunden→binden, FM+gebunden→Info/„Schaden melden", sonst→Gegner-Flow). Der Flottenmanager-Write-Provisioner wird ausgebaut; der Admin behält ihn (aus #4647). In-app QR-Bind bleibt. FM-Storno geht über die State-Machine-Engine.

**Tech Stack:** Next.js 15 (Server Components + Actions), Supabase (`AnyDb`), vitest, State-Machine (`transitionFallStatus`).

## Global Constraints

- **Beschreiben nur Admin** — der `NfcKarteBeschreiben`-Provisioner bleibt NUR im Admin (`FirmenFlotteDetailClient`), raus aus `KartenClient` (Flottenmanager).
- **Kein Web-NFC-Read** — `SchadenkarteScanner` bleibt QR-Kamera + manuell. NFC-Tap-Bind läuft über `/schaden/[token]`.
- **`/schaden/[token]`-Gegner-Flow für Fremde bleibt unangetastet** (kein Regression am Ernstfall).
- **FM-Storno NUR über `transitionFallStatus`** (State-Machine) → NIE direkter `operative_status`/`status`-Write (Operative-Status-Write-Gate). Ziel `'storniert'`, nur aus früh-stufigen Quell-Zuständen.
- Server-Actions: Result-Object, `revalidatePath`. UI-Strings Deutsch/Umlaute. `AnyDb`-Cast für `schadenkarten`.
- **Koordination:** touch dieselben Files wie A (#4657, offen) + gemergtes #4647. Reihenfolge #4647(done)→A→C; bei Konflikt C auf A rebasen.
- Worktree `.claude/worktrees/schadenkarte-rollen-cleanup` (Branch `kitta/schadenkarte-rollen-cleanup`, aus `origin/staging`). `npm ci` vorab.

---

### Task 1: `getKartenFuerFirma` — `nurGebunden`-Param (Flotten-Liste nur gebunden)

**Files:** Modify `src/lib/schadenkarte/schadenkarte.ts` (getKartenFuerFirma) · Test `src/lib/schadenkarte/schadenkarte.test.ts`

- [ ] **Step 1: Test (append zum bestehenden `getKartenFuerFirma`-describe)**

```ts
  it('nurGebunden=true filtert auf status=gebunden', async () => {
    const eqCalls: Array<[string, string]> = []
    const db = {
      from: () => ({
        select: () => ({
          eq: (c: string, v: string) => { eqCalls.push([c, v]); return {
            eq: (c2: string, v2: string) => { eqCalls.push([c2, v2]); return { order: () => ({ data: [] }) } },
            order: () => ({ data: [] }),
          } },
        }),
      }),
    } as never
    await getKartenFuerFirma(db, 'f1', { nurGebunden: true })
    expect(eqCalls).toContainEqual(['status', 'gebunden'])
  })
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run src/lib/schadenkarte/schadenkarte.test.ts`

- [ ] **Step 3: Implement.** In `getKartenFuerFirma` die Signatur um `opts?: { nurGebunden?: boolean }` erweitern; die Query als Variable bauen und `if (opts?.nurGebunden) query = query.eq('status', 'gebunden')` VOR `.order('erstellt_am', …)`. (Achtung: die bestehende Chain `.select().eq('firma_id').order()` in eine `let query`-Form bringen, dann bedingt `.eq` einschieben.)

- [ ] **Step 4: Run → PASS** (+ bestehende getKartenFuerFirma-Tests grün).

- [ ] **Step 5: Commit** `feat(schadenkarte): getKartenFuerFirma nurGebunden-Param`

---

### Task 2: `/schaden/[token]` — rollen-bewusster 3-Zweig (Bind/Manage/Gegner)

**Files:** Modify `src/app/schaden/[token]/page.tsx` · Create `src/app/schaden/[token]/FlottenmanagerKartePanel.tsx` (Client) · Create/extend `src/app/schaden/[token]/actions.ts` (bind-Action) · reuse `resolveSchadenkarteToFahrzeug` + `getFlottenmanagerFirma` + `getKundeFlotte` + `bindeKarte`.

**Interfaces:**
- Consumes: `resolveSchadenkarteToFahrzeug(db, token) → {fahrzeugId, firmaId, status}|null`; `getFlottenmanagerFirma`; `getKundeFlotte`; `bindeKarte(token, vehicleId)` (aus `src/app/flotte/(shell)/flotte/schadenkarte-actions.ts` — Signatur beim Bauen bestätigen).
- Produces: rollen-bewusste Token-Seite.

- [ ] **Step 1: Verzweigungs-Logik als pure Funktion + Test**

Create `src/app/schaden/[token]/schaden-zweig.ts`:
```ts
export type SchadenZweig = 'bind' | 'manage' | 'gegner'
/** Rolle × firma-Match × Karten-Status → welcher Zweig. */
export function schadenZweig(input: {
  istFlottenmanager: boolean
  fmFirmaId: string | null
  kartenFirmaId: string | null
  status: string | null // schadenkarten.status
}): SchadenZweig {
  const eigeneKarte =
    input.istFlottenmanager && !!input.fmFirmaId && input.fmFirmaId === input.kartenFirmaId
  if (!eigeneKarte) return 'gegner'
  return input.status === 'gebunden' ? 'manage' : 'bind'
}
```
Test `src/app/schaden/[token]/schaden-zweig.test.ts`: FM+eigene+ungebunden→bind; FM+eigene+gebunden→manage; FM+fremde→gegner; nicht-FM→gegner; kein fmFirmaId→gegner. Run FAIL→implement→PASS.

- [ ] **Step 2: bind-Action** (`src/app/schaden/[token]/actions.ts`, `'use server'`)
```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { resolveSchadenkarteToFahrzeug, bindeSchadenkarteAnFahrzeug } from '@/lib/schadenkarte/schadenkarte'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

export async function bindeKarteAnFahrzeugPublic(
  token: string, fahrzeugId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht eingeloggt.' }
  const admin = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(admin, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const karte = await resolveSchadenkarteToFahrzeug(admin, token)
  if (!karte || karte.firmaId !== firma.id) return { ok: false, error: 'Karte gehört nicht zu Ihrer Flotte.' }
  const res = await bindeSchadenkarteAnFahrzeug(admin, { token, fahrzeugId, firmaId: firma.id, userId: user.id })
  if (res.ok) { revalidatePath(`/schaden/${token}`); revalidatePath('/flotte/karten') }
  return res
}
```

- [ ] **Step 3: Page verzweigen.** In `page.tsx` VOR dem `resolveSchadenTokenContext`/Render: aktuellen User (`createClient().auth.getUser()`) + dessen FM-Firma (`getFlottenmanagerFirma`) + die Karte (`resolveSchadenkarteToFahrzeug(db, token)`) laden. `schadenZweig(...)` berechnen. Bei `'bind'`/`'manage'` → `<FlottenmanagerKartePanel zweig=... token=... fahrzeuge=getKundeFlotte(...) karte=... onBind={bindeKarteAnFahrzeugPublic} />`. Bei `'gegner'` → **unveränderter** bestehender Pfad (ctx-Error bzw. `SchadenGegnerWizard`).

- [ ] **Step 4: `FlottenmanagerKartePanel.tsx`** (Client): `zweig='bind'` → Fahrzeug-Picker (`fahrzeuge`) + „An Fahrzeug binden"-Button → `onBind(token, vehicleId)`. `zweig='manage'` → Info (gebundenes Fahrzeug/Status) + Button „Schaden melden" (rendert/verlinkt den Gegner-Wizard bewusst) + (Storno-Einstieg optional, Task 6). primitives.Button + SectionCard.

- [ ] **Step 5: tsc + Commit** `feat(schaden): rollen-bewusster /schaden/[token] (FM bind/manage, Gegner-Flow unangetastet)`

---

### Task 3: Flottenmanager `/flotte/karten` — Beschreiben RAUS + Liste nur-gebunden

**Files:** `KartenClient.tsx`, `karten/page.tsx`, `karten/actions.ts` (alle `src/app/flotte/(shell)/karten/`).

- [ ] **Step 1:** `KartenClient.tsx`: `<NfcKarteBeschreiben …>` (Z.112) + Import + Props `onMintToken`/`onFinalize` aus dem `Props`-Type + Destructuring **entfernen**.
- [ ] **Step 2:** `page.tsx`: `onMintToken`/`onFinalize` nicht mehr übergeben; `provisioniereKarteToken`/`finalisiereKarte`-Import raus; `getKartenFuerFirma(db, firma.id, { nurGebunden: true })`.
- [ ] **Step 3:** `actions.ts`: `provisioniereKarteToken` + `finalisiereKarte` **löschen** (dead) + ungenutzte Imports (`mintSchadenkarten`, `finalisiereSchadenkarte`) bereinigen. `identifiziereKarte`/`baueKartenQrPdf`/`sperreKarte`/… bleiben.
- [ ] **Step 4:** tsc + `npm run check:knip -- --ratchet` (dead-code sauber). Commit `feat(flotte): Karten-Schreiben aus dem Flottenmanager entfernt; Liste nur gebunden`

---

### Task 4: Fahrzeug-Detail — Binden wenn ungebunden

**Files:** `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx` · Create `src/components/flotte/FahrzeugKarteBindClient.tsx`

- [ ] **Step 1:** `FahrzeugKarteBindClient` (Client): `SchadenkarteScanner` (QR+manuell) → Token → `onBind(token)` → Erfolg/Fehler. Prop `onBind: (token) => Promise<{ok;error?}>`.
- [ ] **Step 2:** In `page.tsx` den `else`-Zweig („Keine Karte gebunden.") ersetzen: `<FahrzeugKarteBindClient onBind={(token) => bindeKarteAnFahrzeugFuerDetail(token, id)} />`. Neue thin Server-Action (in einer `fahrzeug/[id]/actions.ts` oder reuse `bindeKarte`): bindet firma-scoped an `id`. (bindeKarte-Signatur bestätigen; sonst dünner Wrapper wie Task-2-bind-Action, vehicleId = Route-`id`.)
- [ ] **Step 3:** tsc + Commit `feat(flotte): Fahrzeug-Detail — Schadenkarte binden wenn keine gebunden (QR)`

---

### Task 5: Admin `firmen-flotte` — Mint-Batch RAUS (Beschreiben bleibt)

**Files:** `FirmenFlotteDetailClient.tsx`, `firmen-flotte-karten.ts`.

- [ ] **Step 1:** `FirmenFlotteDetailClient.tsx`: `kartenErzeugen`, States `mintAnzahl`/`mintCharge`/`mintBusy`/`mintFehler`, die „Anzahl/Charge"-Inputs + „Karten erzeugen"-Button + `minteKartenFuerFlotte`-Import **entfernen**. `NfcKarteBeschreiben`-Provisioner + Dropdown-Bind + Karten-Tabelle **bleiben** (alle Status).
- [ ] **Step 2:** `firmen-flotte-karten.ts`: `minteKartenFuerFlotte` **löschen** (dead). `provisioniereKarteTokenStaff`/`finalisiereKarteStaff`/`bindeKarteAnFahrzeug` bleiben.
- [ ] **Step 3:** tsc + knip. Commit `feat(admin): Mint-Batch „Karten erzeugen" entfernt (Beschreiben bleibt)`

---

### Task 6: FM-Storno versehentlicher Schäden

**Files:** Create `src/app/flotte/(shell)/fahrzeug/[id]/storno-actions.ts` · Modify `src/components/flotte/FahrzeugSchaedenSection.tsx` · reuse `transitionFallStatus`.

**Interfaces:** Consumes `transitionFallStatus` (Signatur beim Bauen aus `src/lib/faelle/state-machine.ts` ablesen); `getFlottenmanagerFirma`; firma-Scope über `claims.vehicle_id → flotten_fahrzeuge.firma_id`.

- [ ] **Step 1: Guard-Funktion + Test** — `src/lib/flotte/fm-storno-erlaubt.ts`:
```ts
// Nur früh-stufig (kein SV/Werkstatt committed) darf der Flottenmanager selbst stornieren.
export const FM_STORNO_STATUS = ['ersterfassung', 'onboarding', 'sv-gesucht', 'reparatur-werkstatt-suche'] as const
export function fmDarfStornieren(status: string | null | undefined): boolean {
  return !!status && (FM_STORNO_STATUS as readonly string[]).includes(status)
}
```
Test: erlaubte + verbotene (z.B. `sv-zugewiesen`, `abgeschlossen`, `storniert`) Zustände. FAIL→impl→PASS. (Initial-Status eines schadenkarte-Claims beim Bauen verifizieren — ggf. Set anpassen.)

- [ ] **Step 2: Storno-Action** (`storno-actions.ts`, `'use server'`): FM eingeloggt + Claim gehört zu einem Fahrzeug seiner Firma (via `flotten_fahrzeuge`) + `fmDarfStornieren(currentStatus)` → sonst `{ok:false,error:'Bitte Admin kontaktieren.'}`. Dann `transitionFallStatus(claimId, 'storniert', { grund, ... })` (Signatur ablesen; `storno_grund` mitgeben). `revalidatePath` Fahrzeug-Detail. Result-Object.

- [ ] **Step 3: UI** in `FahrzeugSchaedenSection.tsx`: pro Schaden ein „Stornieren"-Button (nur wenn `fmDarfStornieren(schaden.status)`), Bestätigungs-Dialog + Pflicht-Grund → `onStorno(claimId, grund)`. Der Prop kommt von der Server-Component (Fahrzeug-Detail-Page).

- [ ] **Step 4:** tsc + `npm run check:operative-status-writes -- --ratchet` (sicherstellen: KEIN direkter status-Write — nur Engine). Commit `feat(flotte): FM-Storno versehentlicher (frueh-stufiger) Schaeden via Engine`

---

### Task 7: `SchadenkarteBindenSection` — Hinweis „oder Karte antippen"

- [ ] Kleiner Label-/Subtitle-Zusatz („QR scannen oder Karte antippen — öffnet die Bind-Seite"). Commit `feat(flotte): SchadenkarteBindenSection-Hinweis auf NFC-Tap-Bind`

---

### Task 8: Vollverifikation + Regel-4-Handoff

- [ ] `npx vitest run src/lib/schadenkarte/ src/lib/flotte/ src/app/schaden/` → grün.
- [ ] `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün.
- [ ] Ratchets: token-audit, component-set, status-registry, **operative-status-writes**, knip, vitest (alle `--ratchet`) → keine neuen Verletzer.
- [ ] Push + PR gegen `staging` (base staging; Koordinations-Hinweis A#4657 im PR).
- [ ] **Regel 4** (nach Deploy, Test-Konto): Admin beschreibt → FM bindet (Tap→/schaden/token UND in-app QR) → gebunden; gebundene Karte als FM antippen → Info/„Schaden melden"; Nicht-FM → Gegner-Flow; Flotten-Liste nur gebunden; Mint weg; FM storniert früh-stufigen Test-Schaden → `storniert`, fortgeschrittener → verweigert.

---

## Self-Review
- Spec-Coverage: #1→T3, #2→T2, #3→T7, #4→T4, #5→T5, #6→T1, #7(Storno)→T6. Alle 7 Spec-Änderungen abgedeckt + 3-Zweig-Edge (bound+FM) in T2/T4. ✓
- Placeholder: die „Signatur beim Bauen bestätigen"-Hinweise (bindeKarte, transitionFallStatus, Initial-Status) zeigen auf exakte Files — beim inline-Bauen aufzulösen, kein toter Platzhalter.
- Typ-Konsistenz: `schadenZweig`/`fmDarfStornieren` pure + getestet; `bindeKarteAnFahrzeugPublic(token,fahrzeugId)` konsistent genutzt.

## Out of Scope
Alt-`bestellt`-Cleanup (Datenlauf); Sub-Projekt B (Foto-Doku); Cardentity.
