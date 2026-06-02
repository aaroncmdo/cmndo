# SV-Basic-Tier P2a — Unified Dynamic Onboarding (Basic-Pfad) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Voraussetzung:** P1 (#2223) auf staging (pending Basic-Account: `paket='basic'`, `verifizierung_status='ausstehend'`, `ist_aktiv=false`, `portal_zugang_freigeschaltet=false`). Branch für P2a off **aktualisiertem** staging.

**Goal:** Ein pending Basic-SV (eingeloggt via P1-Recovery-Link) durchläuft einen **config-getriebenen, dynamischen** Onboarding-Flow, der bereits Bekanntes (aus dem Claim) überspringt und nur die Lücken sammelt (Telefon-Verify, Profil, Kalender, Vertrag) → landet danach in einem „Prüfung läuft"-Zustand bis zur P3-Freigabe.

**Architecture:** Neuer `flow_key='sv-onboarding'` auf der bestehenden Wizard-Engine (`onboarding_phasen`/`onboarding_felder` + `WizardClient` + Skip-Loader). **Additiv** — das bezahlte `/gutachter/willkommen` (statischer `WillkommenClient`) bleibt **unangetastet**; `willkommen/page.tsx` verzweigt nur bei `paket='basic'` in den neuen Flow. Die 3 neuen Feld-Typen (`phone-verify`/`avatar-upload`/`calendar-connect`) sind **self-persisting Widgets** (Muster `_termin`/`TerminField`): sie persistieren via ihre bestehenden Actions selbst, die Wizard-`saveStep`-Schleife fasst sie nicht an. Plain-Felder (Beschreibung etc.) schreibt eine **neue, spaltenweise gewhitelistete** Save-Action gegen die EIGENE `sachverstaendige`/`profiles`-Zeile (Mass-Assignment-Guard).

**Tech Stack:** Next.js 16 App Router, Supabase (DDL nur via Plugin `apply_migration`), TypeScript, vitest. Wizard-Engine wie investigiert (siehe §Ground-Truth unten).

**Scope-Lock (Aaron 2026-06-02):** **Stripe-Zahlungsmethode (SetupIntent) = NICHT in P2a** — verschoben auf P5 (Billing-Gate greift erst dort). P2a-Phasen: identitaet (phone-verify) · standort (prefill→skip) · profil (avatar+beschreibung) · kalender (connect) · vertrag (signatur). P2b (Migration der bezahlten Rollen auf denselben flow_key + Entfernen von `WillkommenClient`) = **separater Plan** (Regressionsrisiko bezahlte Strecke).

---

## Ground-Truth (investigiert 2026-06-02 — verbindlich)

**Engine:**
- `onboarding_phasen(flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on jsonb, i18n jsonb)`; unique `(flow_key,phase_key)`+`(flow_key,reihenfolge)`.
- `onboarding_felder(phase_id FK, reihenfolge, feld_key, typ [CHECK], label, hint, placeholder, pflicht, optionen jsonb, validation jsonb, db_target jsonb {tabelle,spalte} NOT NULL, conditional_on jsonb, i18n jsonb, audience, sektion)`; unique `(phase_id,feld_key)`.
- `typ`-CHECK (Stand `20260601172527`): `text,email,tel,number,textarea,segmented,toggle-cards,select,slot,signature,file,checkbox,zb1-upload,termin`.
- Renderer `src/components/onboarding/WizardClient.tsx`: `FieldRenderer` `switch(feld.typ)` ~Zeile 681/812; Sichtbarkeit `visiblePhases`/`visibleFelder` via `conditional_on` (`meetsCondition` Zeile 28: `String(vals[cond.feld] ?? '') === cond.equals`). `handleWeiter` (Zeile 312) hat flow-spezifische Branches (`gutachter-finden` → `saveOnboardingStep`; `beauftragung` → eigene Actions).
- Feld-Typ-Union: `src/components/onboarding/types.ts:1`.
- Save heute: `src/components/onboarding/saveStep.ts` `ALLOWED_TABLES={'gutachter_finder_anfragen'}`; `beauftragung` nutzt `speichereBeauftragungStep` (`allowedTables={'leads'}`). **KEIN Pfad schreibt heute `sachverstaendige`/`profiles`.**
- Skip-Loader `src/lib/onboarding/load-needed-phases.ts` `ladeNoetigePhasen(fallId, flowKey)`: baut `prefilled`-Map, skippt eine Phase wenn sie ≥1 `pflicht`-Feld hat UND **alle** pflicht-Felder in `prefilled` (lookup `f.feld_key ?? f.db_target.spalte`) non-null/non-empty sind. Phasen mit 0 pflicht-Feldern werden NIE geskippt. Sentinels `_finalize`/`_termin` (db_target.tabelle) werden vom Save-Loop übersprungen; `TerminField` ruft `bucheTermin` direkt.
- Feld-Typ hinzufügen = (a) Migration `onboarding_felder_typ_check` erweitern, (b) `types.ts`-Union, (c) Component `fields/<X>.tsx`, (d) `FieldRenderer`-`case` + Import.

**Bestehende Integrationen (reuse):**
- Phone-Verify (PARTIAL): `requestPhoneVerification(telefon)` + `confirmPhoneVerification(telefon, code)` (`src/lib/auth/twofa/{send-code,verify-code}.ts`) — letztere schreibt bei Erfolg `profiles.twofa_telefon` + `profiles.twofa_telefon_verifiziert_am`. WA: `checkAndCacheAvailability('profile', userId, telefon)` schreibt `profiles.whatsapp_verfuegbar`/`whatsapp_geprueft_am`. **UI (send→check-Loop) muss gebaut werden.**
- Avatar (DROP-IN): `@/components/shared/AvatarUpload` props `{currentUrl, initials, size?, onChanged?}` → `src/lib/profile/avatar.ts` `uploadAvatar(formData)`→`profiles.avatar_url`; `updateProfilText(anzeigename, profilbeschreibung)`→`profiles.{anzeigename,profilbeschreibung}` (beide existieren).
- Kalender (DROP-IN): `src/components/KalenderConnectStep.tsx` props `{svId, gcalConnected, caldavConnected?, onDone}` — kapselt Google-OAuth (`/api/auth/google/connect` → schreibt `profiles.google_*` inkl. `google_connected_at`) + CalDAV (`CalDavConnectModal` → `sv_kalender_verbindungen`).
- Vertrag: `signSvVertrag({signaturePngDataUri, unterschriftName})` (`src/lib/actions/sv-onboarding-actions.ts`) schreibt `vertrag_unterschrieben=true`, `vertrag_unterschrieben_am`, `onboarding_status='vertrag_unterzeichnet'`, inserts `vertraege_unterzeichnet` (+PDF). **Für Basic adaptieren** (s. Task 7).

**Routing:** `src/app/gutachter/layout.tsx:66-70`: `portal_zugang_freigeschaltet===false` → `redirect('/gutachter/willkommen')`. `willkommen/page.tsx` rendert sonst `WillkommenClient` (statisch, paid). `ist_aktiv`/`verifizierung_status` lösen KEINEN Redirect aus. → Pending Basic-SV landet bei `/gutachter/willkommen`.

---

## File Structure

- **Migration A** (Plugin): `onboarding_felder_typ_check` um `phone-verify,avatar-upload,calendar-connect` erweitern.
- **Migration B** (Plugin): `sachverstaendige.basic_onboarding_abgeschlossen_am timestamptz` (Completion-Marker für Routing) + Seed `flow_key='sv-onboarding'` (phasen+felder).
- `src/components/onboarding/types.ts` (modify) — Feld-Typ-Union erweitern.
- `src/components/onboarding/fields/PhoneVerifyField.tsx` (neu) — send→check-UI, self-persisting.
- `src/components/onboarding/fields/AvatarUploadField.tsx` (neu) — wraps `AvatarUpload`, self-persisting.
- `src/components/onboarding/fields/CalendarConnectField.tsx` (neu) — wraps `KalenderConnectStep`, self-persisting.
- `src/components/onboarding/WizardClient.tsx` (modify) — 3 `case`s + Imports + `sv-onboarding`-Branch in `handleWeiter`.
- `src/lib/sv-onboarding/save-step.ts` (neu, `'use server'`) — `speichereSvOnboardingStep` (gewhitelistet, eigene Zeile).
- `src/lib/sv-onboarding/finalize.ts` (neu, `'use server'`) — `schliesseSvBasicOnboardingAb` (Vertrag-Signatur + Completion-Marker).
- `src/lib/sv-onboarding/__tests__/whitelist.test.ts` (neu) — Unit-Test Spalten-Whitelist (pure).
- `src/lib/onboarding/lade-sv-onboarding-phasen.ts` (neu) — Prefill+Skip-Loader für den eingeloggten SV.
- `src/app/gutachter/willkommen/page.tsx` (modify) — Branch `paket==='basic'`.
- `src/app/gutachter/willkommen/SvBasicOnboardingClient.tsx` (neu) — `'use client'` Wrapper um `WizardClient` (flowKey='sv-onboarding').
- `src/app/gutachter/willkommen/SvBasicPendingReview.tsx` (neu) — „Prüfung läuft"-Seite.

---

## Task 0: Branch off staging

- [ ] **Step 1**
```bash
git fetch origin staging
node scripts/new-session-worktree.mjs sv-basic-p2a-onboarding staging
# im Worktree: node_modules-Junction (New-Item -ItemType Junction) fuer vitest/tsc
```
Verifiziere P1 ist drin: `git show HEAD:src/lib/sv-basic/claim-actions.ts | head -1` zeigt `'use server'`. (P1 muss auf staging gemergt sein; falls nicht, off `origin/kitta/sv-basic-p1-claim` branchen und im PR-Body notieren.)

---

## Task 1: Feld-Typ-CHECK erweitern (Migration A)

- [ ] **Step 1: Live-CHECK lesen** (`execute_sql` READ): `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='onboarding_felder_typ_check';` — bestätige die 14 Werte.
- [ ] **Step 2: Migration via Plugin** `apply_migration({ name: 'onboarding_felder_typ_sv_onboarding', query: ... })`:
```sql
ALTER TABLE public.onboarding_felder DROP CONSTRAINT IF EXISTS onboarding_felder_typ_check;
ALTER TABLE public.onboarding_felder ADD CONSTRAINT onboarding_felder_typ_check
  CHECK (typ = ANY (ARRAY['text','email','tel','number','textarea','segmented','toggle-cards',
    'select','slot','signature','file','checkbox','zb1-upload','termin',
    'phone-verify','avatar-upload','calendar-connect']));
```
- [ ] **Step 3: recorded-Version ablesen** (`list_migrations`) → File `supabase/migrations/<V>_onboarding_felder_typ_sv_onboarding.sql` exakt so benennen (Twin-Drift, Regel 2). **Step 4:** `execute_sql` (READ) verifizieren. **Step 5:** Commit.

---

## Task 2: Feld-Typ-Union + 3 Feld-Components

**Files:** `src/components/onboarding/types.ts` (modify) + 3 neue `fields/*.tsx`.

- [ ] **Step 1:** `types.ts` Union erweitern um `| 'phone-verify' | 'avatar-upload' | 'calendar-connect'`.
- [ ] **Step 2: PhoneVerifyField** `src/components/onboarding/fields/PhoneVerifyField.tsx`. Self-persisting: ruft die bestehenden Actions; setzt `onChange(<timestamp>)` damit der Step als gefüllt zählt. Telefon-Default aus `feld.placeholder`/Prefill — hier als eigenes Input (der SV bestätigt die im Claim hinterlegte Nummer oder ändert sie).
```tsx
'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import type { OnboardingFeld } from '../types'

export function PhoneVerifyField({ feld, value, onChange, disabled }: {
  feld: OnboardingFeld; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  const [telefon, setTelefon] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<'eingabe' | 'code' | 'fertig'>(value ? 'fertig' : 'eingabe')
  const [fehler, setFehler] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function senden() {
    setFehler(null)
    if (telefon.trim().length < 5) { setFehler('Bitte eine gültige Telefonnummer eingeben.'); return }
    startTransition(async () => {
      const { requestPhoneVerification } = await import('@/lib/auth/twofa/send-code')
      const res = await requestPhoneVerification(telefon.trim())
      if (!res.success) { setFehler(res.error ?? 'Code konnte nicht gesendet werden.'); return }
      setPhase('code')
    })
  }
  function bestaetigen() {
    setFehler(null)
    if (code.trim().length < 4) { setFehler('Bitte den 6-stelligen Code eingeben.'); return }
    startTransition(async () => {
      const { confirmPhoneVerification } = await import('@/lib/auth/twofa/verify-code')
      const res = await confirmPhoneVerification(telefon.trim(), code.trim())
      if (!res.success) { setFehler(res.error ?? 'Code ungültig.'); return }
      // WA-Reachability fire-and-forget
      try {
        const { checkAndCacheAvailability } = await import('@/lib/whatsapp/availability')
        const { createClient } = await import('@/lib/supabase/client')
        const u = (await createClient().auth.getUser()).data.user
        if (u) void checkAndCacheAvailability('profile', u.id, telefon.trim())
      } catch { /* non-critical */ }
      setPhase('fertig')
      onChange(new Date().toISOString()) // markiert Step als erledigt
    })
  }

  if (phase === 'fertig') {
    return <p className="text-sm font-semibold text-emerald-700">✓ Telefonnummer bestätigt.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {phase === 'eingabe' && (
        <>
          <TextField label={feld.label} type="tel" placeholder={feld.placeholder ?? '+49 151 12345678'}
            value={telefon} onChange={(e) => setTelefon(e.target.value)} hint={feld.hint ?? undefined} disabled={disabled} />
          <Button variant="navy" onClick={senden} loading={pending}>Code senden</Button>
        </>
      )}
      {phase === 'code' && (
        <>
          <TextField label="Bestätigungscode" type="text" placeholder="123456"
            value={code} onChange={(e) => setCode(e.target.value)} />
          <Button variant="navy" onClick={bestaetigen} loading={pending}>Bestätigen</Button>
        </>
      )}
      {fehler && <p className="text-sm text-red-700">{fehler}</p>}
    </div>
  )
}
```
- [ ] **Step 3: AvatarUploadField** `fields/AvatarUploadField.tsx` (wraps `AvatarUpload`, self-persisting → `profiles.avatar_url`):
```tsx
'use client'
import { AvatarUpload } from '@/components/shared/AvatarUpload'
import type { OnboardingFeld } from '../types'

export function AvatarUploadField({ feld, value, onChange }: {
  feld: OnboardingFeld; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-claimondo-navy">{feld.label}</p>
      {feld.hint && <p className="text-xs text-claimondo-shield">{feld.hint}</p>}
      <AvatarUpload currentUrl={value || null} initials="SV" size="lg"
        onChanged={(url) => onChange(url ?? '')} />
    </div>
  )
}
```
- [ ] **Step 4: CalendarConnectField** `fields/CalendarConnectField.tsx` (wraps `KalenderConnectStep`; braucht die svId + connected-Flags aus dem Prefill → via `feld.optionen` durchgereicht vom Loader, ODER aus einem Context. Einfachster Weg: der Loader legt die Werte in `feld.placeholder`/`optionen` ab. Hier: svId aus einem data-Attribut/Prop. **Da `WizardClient` Felder ohne SV-Context rendert, reicht der Loader svId/Flags als `optionen`-jsonb durch** — `optionen: [{value:'svId', label:<id>},{value:'gcal', label:'true|false'},{value:'caldav', label:'true|false'}]`):
```tsx
'use client'
import { useRouter } from 'next/navigation'
import { KalenderConnectStep } from '@/components/KalenderConnectStep'
import type { OnboardingFeld } from '../types'

export function CalendarConnectField({ feld, onChange }: {
  feld: OnboardingFeld; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  const router = useRouter()
  const opt = (k: string) => feld.optionen?.find((o) => o.value === k)?.label ?? ''
  const svId = opt('svId')
  return (
    <KalenderConnectStep svId={svId} gcalConnected={opt('gcal') === 'true'} caldavConnected={opt('caldav') === 'true'}
      onDone={() => { onChange(new Date().toISOString()); router.refresh() }} />
  )
}
```
> **Hinweis Implementer:** `OnboardingFeld.optionen` Shape `[{value,label}]` ist vorhanden (siehe Ground-Truth). Falls `KalenderConnectStep` `requireSv()`/`getGutachterForUser()` serverseitig nutzt, funktioniert es nur für den eingeloggten SV — exakt unser Fall.

- [ ] **Step 5:** Manueller Render-Smoke später (Task 9). **Step 6:** Commit `feat(sv-p2a): 3 onboarding field types (phone-verify/avatar/calendar)`.

---

## Task 3: WizardClient — Feld-Typen registrieren + sv-onboarding-Branch

**Files:** `src/components/onboarding/WizardClient.tsx` (modify).

- [ ] **Step 1:** Imports der 3 neuen Components oben ergänzen.
- [ ] **Step 2:** Im `FieldRenderer`-`switch` vor `default:` ergänzen:
```tsx
case 'phone-verify':
  return <PhoneVerifyField feld={feld} value={(value as string) ?? ''} onChange={onChange as (v: string) => void} disabled={disabled} />
case 'avatar-upload':
  return <AvatarUploadField feld={feld} value={(value as string) ?? ''} onChange={onChange as (v: string) => void} disabled={disabled} />
case 'calendar-connect':
  return <CalendarConnectField feld={feld} value={(value as string) ?? ''} onChange={onChange as (v: string) => void} disabled={disabled} />
```
- [ ] **Step 3:** In `handleWeiter` (Zeile ~312) einen `flowKey === 'sv-onboarding'`-Branch (analog `beauftragung`):
  - Normaler Schritt → `speichereSvOnboardingStep(phaseKey, values, felder)` (Task 4).
  - Letzte Phase (`vertrag`, Signatur-Feld) → `schliesseSvBasicOnboardingAb({ signaturePngDataUri, unterschriftName })` (Task 7) → bei `ok` Redirect/State auf „pending review" (die Seite re-rendert via `router.refresh()`).
  - Self-persisting-Felder (`phone-verify`/`avatar-upload`/`calendar-connect`/`signature`) NICHT an `speichereSvOnboardingStep` geben (sie sind in keiner `db_target.tabelle`-Whitelist → werden eh übersprungen; analog `_termin`).
- [ ] **Step 4:** `npx tsc --noEmit` grün. **Step 5:** Commit.

---

## Task 4: Save-Action `speichereSvOnboardingStep` (gewhitelistet, eigene Zeile)

**Files:** `src/lib/sv-onboarding/save-step.ts` (neu) + `__tests__/whitelist.test.ts`.

- [ ] **Step 1: Failing Test** (pure Whitelist-Helper):
```ts
import { describe, it, expect } from 'vitest'
import { filterAufWhitelist } from '../save-step'
describe('filterAufWhitelist', () => {
  it('lässt erlaubte Spalten durch, droppt privilegierte', () => {
    const { sv, profile, dropped } = filterAufWhitelist([
      { tabelle: 'sachverstaendige', spalte: 'bvsk_mitgliedsnummer', value: 'X' },
      { tabelle: 'sachverstaendige', spalte: 'paket', value: 'premium' },          // privilegiert -> drop
      { tabelle: 'profiles', spalte: 'profilbeschreibung', value: 'Hi' },
      { tabelle: 'profiles', spalte: 'rolle', value: 'admin' },                     // privilegiert -> drop
    ])
    expect(sv).toEqual({ bvsk_mitgliedsnummer: 'X' })
    expect(profile).toEqual({ profilbeschreibung: 'Hi' })
    expect(dropped).toEqual(expect.arrayContaining(['sachverstaendige.paket', 'profiles.rolle']))
  })
})
```
- [ ] **Step 2:** vitest → FAIL. **Step 3: Implementieren** `save-step.ts`:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingFeld } from '@/components/onboarding/types'

// NUR diese Spalten darf der SV über das Onboarding setzen. NIE paket/verifiziert/
// verifizierung_status/ist_aktiv/portal_zugang_freigeschaltet/onboarding_status/rolle
// (Mass-Assignment-Guard, vgl. Live-RLS-Audit). fachschwerpunkte existiert NICHT auf sachverstaendige.
const SV_WHITELIST = new Set(['bvsk_mitgliedsnummer', 'ihk_zertifikat_nummer', 'oebuv_bestellungsnummer',
  'standort_adresse', 'standort_plz', 'standort_lat', 'standort_lng', 'standort_place_id', 'paket_umkreis_km'])
const PROFILE_WHITELIST = new Set(['profilbeschreibung', 'anzeigename', 'telefon'])

export function filterAufWhitelist(
  items: Array<{ tabelle: string; spalte: string; value: unknown }>,
): { sv: Record<string, unknown>; profile: Record<string, unknown>; dropped: string[] } {
  const sv: Record<string, unknown> = {}, profile: Record<string, unknown> = {}, dropped: string[] = []
  for (const it of items) {
    if (it.tabelle === 'sachverstaendige' && SV_WHITELIST.has(it.spalte)) sv[it.spalte] = it.value
    else if (it.tabelle === 'profiles' && PROFILE_WHITELIST.has(it.spalte)) profile[it.spalte] = it.value
    else dropped.push(`${it.tabelle}.${it.spalte}`)
  }
  return { sv, profile, dropped }
}

export async function speichereSvOnboardingStep(
  _phaseKey: string, values: Record<string, unknown>, felder: OnboardingFeld[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const admin = createAdminClient()
  // Gate: nur eigene Basic-SV-Zeile
  const { data: sv } = await admin.from('sachverstaendige')
    .select('id, paket').eq('profile_id', user.id).maybeSingle()
  if (!sv || sv.paket !== 'basic') return { ok: false, error: 'Kein Basic-Onboarding für dieses Konto.' }

  const items = felder
    .filter((f) => f.db_target && values[f.feld_key] !== undefined)
    .map((f) => ({ tabelle: f.db_target!.tabelle, spalte: f.db_target!.spalte, value: values[f.feld_key] }))
  const { sv: svPatch, profile: profilePatch, dropped } = filterAufWhitelist(items)
  if (dropped.length) console.warn('[sv-onboarding] gedropte Nicht-Whitelist-Felder:', dropped)

  if (Object.keys(svPatch).length) {
    const { error } = await admin.from('sachverstaendige').update(svPatch).eq('id', sv.id)
    if (error) { console.error('[sv-onboarding] sv update:', error.message); return { ok: false, error: 'Speichern fehlgeschlagen.' } }
  }
  if (Object.keys(profilePatch).length) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', user.id)
    if (error) { console.error('[sv-onboarding] profile update:', error.message); return { ok: false, error: 'Speichern fehlgeschlagen.' } }
  }
  return { ok: true }
}
```
- [ ] **Step 4:** vitest → PASS; `tsc` grün. **Step 5:** Commit.

> **🔴 Adversarial (Pflicht im Review):** (a) kann ein Nicht-Basic/Nicht-Owner schreiben? (Gate `profile_id=user.id` + `paket='basic'`). (b) kann eine privilegierte Spalte durchrutschen? (Whitelist-Test). (c) keine `service_role`-Operation ohne `user.id`-Bindung.

---

## Task 5: Skip-Loader `ladeSvOnboardingPhasen`

**Files:** `src/lib/onboarding/lade-sv-onboarding-phasen.ts` (neu).

- [ ] **Step 1: Implementieren** (Muster `ladeNoetigePhasen`, aber Prefill aus der EIGENEN `sachverstaendige`+`profiles`-Zeile + synthetische Keys `phone_verified`/`kalender_connected`; reicht svId/Flags an `calendar-connect` via `optionen` durch):
```ts
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OnboardingPhase, OnboardingFeld } from '@/components/onboarding/types'

export type SvOnboardingState = { phasen: OnboardingPhase[]; svId: string; abgeschlossen: boolean }

export async function ladeSvOnboardingPhasen(): Promise<SvOnboardingState | null> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return null
  const admin = createAdminClient()
  const { data: sv } = await admin.from('sachverstaendige')
    .select('id, paket, standort_adresse, standort_plz, standort_lat, standort_lng, bvsk_mitgliedsnummer, dat_nummer, basic_onboarding_abgeschlossen_am')
    .eq('profile_id', user.id).maybeSingle()
  if (!sv || sv.paket !== 'basic') return null
  const { data: profile } = await admin.from('profiles')
    .select('avatar_url, profilbeschreibung, twofa_telefon_verifiziert_am, google_connected_at').eq('id', user.id).maybeSingle()
  const { data: caldav } = await admin.from('sv_kalender_verbindungen').select('id').eq('sv_id', sv.id).limit(1)

  const gcal = !!profile?.google_connected_at, hasCaldav = (caldav?.length ?? 0) > 0
  const prefilled: Record<string, unknown> = {
    ...sv, ...profile,
    phone_verified: profile?.twofa_telefon_verifiziert_am ?? null,
    kalender_connected: (gcal || hasCaldav) ? 'true' : null,
  }

  // Phasen + Felder für flow_key='sv-onboarding' laden (ein Query, join)
  const { data: phasenRaw } = await admin.from('onboarding_phasen')
    .select('*, onboarding_felder(*)').eq('flow_key', 'sv-onboarding').order('reihenfolge')
  const phasen: OnboardingPhase[] = []
  for (const p of (phasenRaw ?? []) as any[]) {
    const felder = (p.onboarding_felder ?? []).sort((a: any, b: any) => a.reihenfolge - b.reihenfolge) as OnboardingFeld[]
    // calendar-connect: svId + Flags via optionen durchreichen
    for (const f of felder) {
      if (f.typ === 'calendar-connect') {
        f.optionen = [{ value: 'svId', label: sv.id }, { value: 'gcal', label: String(gcal) }, { value: 'caldav', label: String(hasCaldav) }]
      }
    }
    const pflicht = felder.filter((f) => f.pflicht)
    const erfuellt = pflicht.length > 0 && pflicht.every((f) => {
      const v = prefilled[f.feld_key] ?? (f.db_target ? prefilled[f.db_target.spalte] : undefined)
      return v !== null && v !== undefined && v !== ''
    })
    if (erfuellt) continue // skip
    phasen.push({ ...p, felder })
  }
  return { phasen, svId: sv.id, abgeschlossen: !!sv.basic_onboarding_abgeschlossen_am }
}
```
> **Hinweis:** exakte `OnboardingPhase`/`OnboardingFeld`-Shape + wie WizardClient `felder` erwartet (Feld-Array auf der Phase vs. separat) beim Bau gegen `types.ts` + `lade-beauftragung-phasen.ts` abgleichen; ggf. Mapping angleichen.
- [ ] **Step 2:** `tsc` grün. **Step 3:** Commit.

---

## Task 6: Seed `flow_key='sv-onboarding'` + Completion-Marker (Migration B)

- [ ] **Step 1: Completion-Spalte** via Plugin: `ALTER TABLE public.sachverstaendige ADD COLUMN IF NOT EXISTS basic_onboarding_abgeschlossen_am timestamptz;` → recorded-Version-File.
- [ ] **Step 2: Seed** (zweite Migration via Plugin) — Phasen (reihenfolge 10–60) + Felder. Pflicht-Felder steuern Skip; self-persisting-Felder haben `db_target` auf die reale Spalte (Loop überspringt sie beim Save). Beispiel-Kern:
```sql
INSERT INTO onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung) VALUES
  ('sv-onboarding', 10, 'identitaet', 'Telefon bestätigen', 'Schritt 1', 'Wir verifizieren deine Nummer für die Koordination.'),
  ('sv-onboarding', 20, 'standort',   'Dein Standort', 'Schritt 2', 'Adresse & Einsatzradius.'),
  ('sv-onboarding', 30, 'profil',     'Dein Profil', 'Schritt 3', 'Foto & kurze Beschreibung.'),
  ('sv-onboarding', 40, 'kalender',   'Kalender verbinden', 'Schritt 4', 'Damit Termine automatisch passen.'),
  ('sv-onboarding', 50, 'vertrag',    'Vertrag & Datenschutz', 'Schritt 5', 'Kurz unterschreiben.');
-- identitaet: phone-verify (pflicht, db_target profiles.twofa_telefon_verifiziert_am)
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, pflicht, db_target)
SELECT p.id, 10, 'phone_verified', 'phone-verify', 'Telefonnummer', true,
  '{"tabelle":"profiles","spalte":"twofa_telefon_verifiziert_am"}'::jsonb
FROM onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='identitaet';
-- standort: adresse (pflicht, sachverstaendige.standort_adresse) + radius (number, paket_umkreis_km)
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, pflicht, db_target)
SELECT p.id, 10, 'standort_adresse', 'text', 'Adresse', true, '{"tabelle":"sachverstaendige","spalte":"standort_adresse"}'::jsonb
FROM onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='standort';
-- profil: avatar (optional, self-persist) + beschreibung (pflicht, profiles.profilbeschreibung)
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, pflicht, db_target)
SELECT p.id, 10, 'avatar_url', 'avatar-upload', 'Profilfoto', false, '{"tabelle":"profiles","spalte":"avatar_url"}'::jsonb
FROM onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='profil';
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, pflicht, db_target)
SELECT p.id, 20, 'profilbeschreibung', 'textarea', 'Kurzbeschreibung', true, '{"tabelle":"profiles","spalte":"profilbeschreibung"}'::jsonb
FROM onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='profil';
-- kalender: calendar-connect (pflicht, feld_key kalender_connected -> Loader liefert synthetischen Wert)
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, pflicht, db_target)
SELECT p.id, 10, 'kalender_connected', 'calendar-connect', 'Kalender', true, '{"tabelle":"_self","spalte":"kalender_connected"}'::jsonb
FROM onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='kalender';
-- vertrag: signature (pflicht, _finalize sentinel -> ruft schliesseSvBasicOnboardingAb)
INSERT INTO onboarding_felder (phase_id, reihenfolge, feld_key, typ, label, pflicht, db_target)
SELECT p.id, 10, 'unterschrift', 'signature', 'Unterschrift', true, '{"tabelle":"_finalize","spalte":"unterschrift"}'::jsonb
FROM onboarding_phasen p WHERE p.flow_key='sv-onboarding' AND p.phase_key='vertrag';
```
> **Wichtig:** `_self` als db_target.tabelle für `kalender_connected` → von `speichereSvOnboardingStep` NICHT geschrieben (nicht in Whitelist → gedroppt, ok), Skip-Logik liest den synthetischen Loader-Key. `_finalize` für die Signatur → Finalize-Pfad statt DB-Write. Umlaute in allen `titel`/`label`/`beschreibung` (DB-Strings sind user-sichtbar). i18n-Spalten optional in P2a (Default DE), kann nachgezogen werden.
- [ ] **Step 3:** recorded-Version-Files committen. **Step 4:** `execute_sql` READ: `SELECT phase_key, count(*) FROM onboarding_phasen p JOIN onboarding_felder f ON f.phase_id=p.id WHERE p.flow_key='sv-onboarding' GROUP BY 1;` verifizieren. **Step 5:** Commit.

---

## Task 7: Basic-Vertrag-Finalize `schliesseSvBasicOnboardingAb`

**Files:** `src/lib/sv-onboarding/finalize.ts` (neu).

- [ ] **Step 1:** Implementieren — adaptiert `signSvVertrag`, aber **ohne** `onboarding_status`-Transition die die paid-Strecke stört, und setzt den **Completion-Marker**. Reuse den bestehenden Vertrag-PDF/Insert-Mechanismus wenn möglich (sonst minimal: `vertraege_unterzeichnet`-Insert + Flags):
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function schliesseSvBasicOnboardingAb(input: { signaturePngDataUri: string; unterschriftName: string }):
  Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.signaturePngDataUri || !input.unterschriftName?.trim()) return { ok: false, error: 'Unterschrift fehlt.' }
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }
  const admin = createAdminClient()
  const { data: sv } = await admin.from('sachverstaendige').select('id, paket').eq('profile_id', user.id).maybeSingle()
  if (!sv || sv.paket !== 'basic') return { ok: false, error: 'Kein Basic-Konto.' }

  // Vertrag-Insert (vereinfacht; Muster vertraege_unterzeichnet). PDF/Storage analog signSvVertrag falls vorhanden.
  await admin.from('vertraege_unterzeichnet').insert({
    sv_id: sv.id, vorlage_typ: 'sv_basic_partnervertrag', unterschrift_name: input.unterschriftName.trim(),
    // signatur_data_url / pdf_url je nach bestehender Spalte; bei Bedarf Storage-Upload wie signSvVertrag
  })
  const { error } = await admin.from('sachverstaendige').update({
    vertrag_unterschrieben: true,
    vertrag_unterschrieben_am: new Date().toISOString(),
    basic_onboarding_abgeschlossen_am: new Date().toISOString(), // Completion-Marker -> Routing
    // KEIN onboarding_status-Flip, KEIN ist_aktiv/portal_zugang (P3 schaltet frei).
    // verifizierung_status bleibt 'ausstehend' (aus P1) -> P3-Queue.
  }).eq('id', sv.id)
  if (error) { console.error('[sv-onboarding] finalize:', error.message); return { ok: false, error: 'Abschluss fehlgeschlagen.' } }
  return { ok: true }
}
```
> **Hinweis Implementer:** exakte Spalten von `vertraege_unterzeichnet` gegen `information_schema` prüfen; den PDF-Pfad aus `signSvVertrag` nur übernehmen wenn schnell, sonst Signatur-Data-URL in einer vorhandenen Spalte ablegen + PDF als P2-Folgeschliff notieren. **Admin-Benachrichtigung** „Basic-Onboarding abgeschlossen — bereit zur Freigabe" via `createLinkedTask` (Muster P1).
- [ ] **Step 2:** Auth-Smoke (reversibel, Test-Basic-SV) + Cleanup. **Step 3:** Commit.

---

## Task 8: Routing — `willkommen` verzweigt bei `paket='basic'`

**Files:** `src/app/gutachter/willkommen/page.tsx` (modify) + `SvBasicOnboardingClient.tsx` + `SvBasicPendingReview.tsx` (neu).

- [ ] **Step 1:** In `willkommen/page.tsx` früh `paket` des eingeloggten SV bestimmen. Wenn `paket==='basic'`:
  - `const state = await ladeSvOnboardingPhasen()`
  - `state.abgeschlossen` ODER `state.phasen.length===0` → `<SvBasicPendingReview />`
  - sonst → `<SvBasicOnboardingClient phasen={state.phasen} svId={state.svId} />`
  - **paid (paket!='basic') → unveränderter Bestandspfad** (`WillkommenClient`). Kein Eingriff in den paid-Branch.
- [ ] **Step 2:** `SvBasicOnboardingClient.tsx` (`'use client'`) = dünner Wrapper, rendert `<WizardClient flowKey="sv-onboarding" phases={phasen} ... />` mit dem sv-onboarding-`handleWeiter`-Branch (Task 3). Claimondo-Layout, Umlaute.
- [ ] **Step 3:** `SvBasicPendingReview.tsx` — `primitives.Card`, Erfolgs-Häkchen, Text „Geschafft! Wir prüfen dein Profil und schalten dich innerhalb von 48 Stunden frei. Du bekommst eine E-Mail, sobald es losgeht." Umlaute, Tokens.
- [ ] **Step 4:** `next build` (Route/Server-Action-Validierung) grün. **Step 5:** Commit.

---

## Task 9: Build-Gate + Smoke + PR

- [ ] **Step 1:** `npx tsc --noEmit` · `npx vitest run src/lib/sv-onboarding` · `npm run check:token-audit` · `npm run check:component-set` · `next build`. Alle grün.
- [ ] **Step 2: Live-Smoke** (Test-Basic-SV via P1-Probe anlegen ODER manuell): einloggen → Wizard zeigt nur Lücken-Phasen (Claim-Prefill skippt standort) → phone-verify (Twilio-Testnummer) → avatar/beschreibung → kalender → vertrag → `basic_onboarding_abgeschlossen_am` gesetzt → Reload zeigt PendingReview. Negativ: paid-SV (paket!='basic') sieht UNVERÄNDERT den `WillkommenClient`. Screenshots Pflicht. Cleanup restlos.
- [ ] **Step 3:** Push + `gh pr create --base staging`. 7-Punkte-Audit. **Nicht selbst mergen.** Smoke-Doc `docs/<DD.MM>/sv-basic-tier-p2a.md`.

---

## Self-Review (Plan-Autor)

- **Spec §7-Coverage (Basic-Pfad):** dynamischer Flow auf bestehender Engine (Task 5/6) · skip Bekanntes (Loader-Prefill) · phone-verify+WA (Task 2) · profil avatar+beschreibung (Task 2/6) · kalender (Task 2) · vertrag signatur (Task 7) · **zahlung/SetupIntent bewusst NICHT (Aaron-Lock → P5)**. P2b (paid-Migration + WillkommenClient-Drop) = separater Plan (notiert).
- **Sicherheit:** Save-Action gewhitelistet + owner/basic-gated (Task 4 + Adversarial-Punkte); keine privilegierte Self-Write. Finalize setzt NICHT ist_aktiv/portal_zugang (P3-Gate bleibt).
- **Routing:** paid-Pfad unangetastet (nur `paket==='basic'`-Branch); Completion-Marker verhindert Wizard-Reentry nach Abschluss (kein Redirect-Loop trotz portal_zugang=false).
- **P1-Interaktion:** `verifizierung_status='ausstehend'` bleibt aus P1 (kein P1-Amend); Completion = `basic_onboarding_abgeschlossen_am` (neue Spalte), NICHT der Status. H1-Konsistenz: weiterhin KEIN `verifizierung_frist_bis`.
- **Typ-Konsistenz:** `filterAufWhitelist`/`speichereSvOnboardingStep`/`ladeSvOnboardingPhasen`/`schliesseSvBasicOnboardingAb` Signaturen über Tasks konsistent; `OnboardingFeld`/`OnboardingPhase`-Shape beim Bau gegen `types.ts` abgleichen (Loader-Hinweis).
- **Offen/Risiko:** (1) exakte `OnboardingPhase.felder`-Shape (Phase-eingebettet vs separat) — beim Bau verifizieren. (2) `vertraege_unterzeichnet`-Spalten + PDF-Pfad live prüfen. (3) `calendar-connect` via `optionen`-Durchreichung ist ein Kniff — falls `WizardClient` `optionen` mutiert/cached, alternativ React-Context für svId. (4) Twilio-Verify im Smoke = echte SMS (Testnummer nutzen).

---

## ⚠️ Risiko-Hinweis
P2a ist **additiv** (paid-Strecke unangetastet → niedriges Regressionsrisiko), aber berührt die **geteilte Wizard-Engine** (`WizardClient`/`types.ts`/CHECK-Constraint). Pflicht-Gate vor Merge: voller `next build` + Smoke, dass die bestehenden Flows (`gutachter-finden`/`beauftragung`/`kunde-onboarding`) unverändert rendern (die 3 neuen `case`s + Union-Erweiterung dürfen sie nicht brechen). P2b (paid-Migration) bleibt bewusst draußen.
