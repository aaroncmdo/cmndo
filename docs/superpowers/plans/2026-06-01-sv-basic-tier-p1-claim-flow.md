# SV Basic-Tier — P1 GMB-Claim-Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> **Voraussetzung:** P0 (#2193) ist auf `staging` gemergt (paket='basic', sv_leads.konvertiert_zu_sv_id/claim_status, verifizierung_status+'abgelehnt', onboarding_quelle, PAKET_PRIO basic=0, istKontingentBlockiert). Branch für P1 off dem **aktualisierten** staging.

**Goal:** Ein angeworbener Kfz-Gutachter kann seinen vorhandenen DAT-Kalt-Pin (`sv_leads`) selbst beanspruchen (oder sich frisch eintragen) und bekommt einen **pending** kostenlosen Basic-Account (`sachverstaendige`, paket='basic') mit Prefill — live erst nach Team-Freigabe (P3).

**Architecture:** Schlanke Marketing-Landing auf **gutachter.claimondo.de** (separates `claimondo-marketing`-App → nur CTA, hier NICHT gebaut) verlinkt in eine **Public-Route im Haupt-App**. Anon-Suche über die DAT-Pins läuft über eine **service-role-Action mit Minimal-Projektion** (kein Verbreitern der anon-RLS → kein DAT-Listen-Leak). Der Claim erzeugt via service-role Account+Profil+Basic-SV (Muster `anlegeSv`), prefillt aus `sv_leads`, verlinkt `konvertiert_zu_sv_id`, sendet Magic-Link (+ Email-Fallback). Account ist `ist_aktiv=false`/`portal_zugang_freigeschaltet=false`/`verifizierung_status='ausstehend'` → nicht dispatchbar/sichtbar bis P3.

**Tech Stack:** Next.js App Router, Supabase (service-role via `createAdminClient`; DDL nur via Plugin `apply_migration`), TypeScript, vitest. UI nur `primitives/*` + `shared/*`.

**Spec:** `docs/superpowers/specs/2026-06-01-sv-basic-tier-self-service-onboarding-design.md` §6.

**Harte Regeln:** DDL nur via Plugin (recorded-version-File). Branch off staging, PR gegen staging, nie main, nicht selbst mergen. 7-Punkte-Audit. Umlaute in UI-Strings. Server-Actions = Result-Object. Vor Migration Live-Schema/RLS prüfen. Keine Self-Writes auf privilegierte Spalten (paket/verifiziert/verifizierung_status nur service-role).

---

## File Structure

- `src/lib/sv-basic/claim-eligibility.ts` (neu) — pure Helpers: Prefill-Mapping sv_leads→SV-Insert, Eligibility (claim_status='offen', nicht schon konvertiert), Such-Normalisierung. **Pure → TDD.**
- `src/lib/sv-basic/claim-actions.ts` (neu, `'use server'`) — `sucheSvLeadKandidaten` (service-role, Minimal-Projektion) · `beanspracheSvLead` (service-role: Account+Prefill+Link+Magic-Link) · `registriereSvBasicNeu` (fresh, ohne Pin).
- `src/app/sv/registrieren/page.tsx` + Client-Komponenten (neu) — Public-Route: Suche → Kandidaten-Liste → Claim/Neu → Bestätigung.
- Migration (nur falls Task 1 zeigt, dass eine gezielte anon-Lese-Policy/Index fehlt) — sonst keine.
- `src/lib/sv-basic/__tests__/claim-eligibility.test.ts` (neu) — Unit-Tests.

---

## Task 0: Branch off aktualisiertem staging

- [ ] **Step 1**
```bash
git fetch origin staging
node scripts/new-session-worktree.mjs sv-basic-p1-claim staging   # ODER: git switch -c kitta/sv-basic-p1-claim origin/staging
```
Verifiziere, dass `git show HEAD:supabase/migrations/20260601194439_sv_basic_sv_leads_claim_link.sql` existiert (P0 ist drin). Falls Worktree: `node_modules`-Junction anlegen (`New-Item -ItemType Junction`), damit vitest/tsc laufen.

---

## Task 1: sv_leads anon-RLS + Such-Strategie live klären

- [ ] **Step 1: Live-RLS lesen** (`execute_sql`, READ):
```sql
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='sv_leads' ORDER BY policyname;
SELECT has_table_privilege('anon','public.sv_leads','SELECT') AS anon_select;
```
- [ ] **Step 2: Entscheidung festhalten.**
  - Erwartung: anon darf höchstens minimal lesen. **Design-Lock:** Die Such-Action `sucheSvLeadKandidaten` läuft **service-role** (`createAdminClient`) und projiziert NUR `{id, vorname, name, firma, plz, ort}` für Treffer einer konkreten Suchanfrage (Name/PLZ/DAT-Nr.). **KEIN** Verbreitern der anon-RLS, **kein** Voll-Listing. Rate-Limit wie bei GFA (`check_gfa_rate_limit`-Muster) gegen Enumeration.
  - Nur falls ein gezielter Index fehlt (Suche nach plz/name) → optionaler additiver Index via Plugin-Migration. Sonst keine DDL in P1.

---

## Task 2: Pure Helpers (TDD)

**Files:** Create `src/lib/sv-basic/claim-eligibility.ts` + Test.

- [ ] **Step 1: Failing Test** `src/lib/sv-basic/__tests__/claim-eligibility.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { istClaimbar, buildSvInsertAusLead, normalisiereSuche } from '../claim-eligibility'

describe('istClaimbar', () => {
  it('offen + nicht konvertiert => true', () => {
    expect(istClaimbar({ claim_status: 'offen', konvertiert_zu_sv_id: null })).toBe(true)
  })
  it('schon beansprucht/konvertiert => false', () => {
    expect(istClaimbar({ claim_status: 'beansprucht_pending', konvertiert_zu_sv_id: null })).toBe(false)
    expect(istClaimbar({ claim_status: 'konvertiert', konvertiert_zu_sv_id: 'x' })).toBe(false)
  })
})

describe('buildSvInsertAusLead', () => {
  it('mappt sv_leads-Felder auf Basic-SV-Insert (paket=basic, pending, 25km default)', () => {
    const lead = {
      vorname: 'Max', name: 'Muster', firma: 'KFZ Muster', telefon: '+49170', email: 'm@x.de',
      adresse: 'Hauptstr 1', plz: '42103', ort: 'Wuppertal', lat: 51.2, lng: 7.1,
      dat_id: 'DAT123', bvsk_nr: null, ihk_zertifikat: false, oebuv_nr: null,
      qualifikationen: ['kfz'], fachschwerpunkte: 'Lack', jahre_erfahrung: 10,
      isochrone_polygon: null, paket_umkreis_km: null,
    }
    const ins = buildSvInsertAusLead(lead, 'profile-uuid')
    expect(ins.profile_id).toBe('profile-uuid')
    expect(ins.paket).toBe('basic')
    expect(ins.onboarding_quelle).toBe('self_service_claim')
    expect(ins.verifizierung_status).toBe('ausstehend')
    expect(ins.ist_aktiv).toBe(false)
    expect(ins.portal_zugang_freigeschaltet).toBe(false)
    expect(ins.paket_umkreis_km).toBe(25)
    expect(ins.standort_lat).toBe(51.2)
    expect(ins.standort_plz).toBe('42103')
  })
})

describe('normalisiereSuche', () => {
  it('trimmt + lowercased', () => {
    expect(normalisiereSuche('  Muster ')).toBe('muster')
  })
})
```
- [ ] **Step 2** `npx vitest run ...claim-eligibility.test.ts` → FAIL.
- [ ] **Step 3: Implementieren** `src/lib/sv-basic/claim-eligibility.ts`:
```ts
// Pure Helpers fuer den SV-Basic-Claim. KEINE 'use server'-Direktive hier
// (Konstanten/Pure-Fns nie aus 'use server' exportieren).
export const BASIC_DEFAULT_RADIUS_KM = 25

export type SvLeadRow = {
  vorname: string | null; name: string | null; firma: string | null
  telefon: string | null; email: string | null; adresse: string | null
  plz: string | null; ort: string | null; lat: number | null; lng: number | null
  dat_id: string | null; bvsk_nr: string | null; ihk_zertifikat: boolean | null
  oebuv_nr: string | null; qualifikationen: string[] | null; fachschwerpunkte: string | null
  jahre_erfahrung: number | null; isochrone_polygon: unknown; paket_umkreis_km: number | null
}

export function istClaimbar(lead: { claim_status: string | null; konvertiert_zu_sv_id: string | null }): boolean {
  return lead.claim_status === 'offen' && lead.konvertiert_zu_sv_id == null
}

export function normalisiereSuche(s: string): string {
  return s.trim().toLowerCase()
}

export function buildSvInsertAusLead(lead: SvLeadRow, profileId: string) {
  return {
    profile_id: profileId,
    paket: 'basic',
    onboarding_quelle: 'self_service_claim',
    verifizierung_status: 'ausstehend' as const,
    ist_aktiv: false,
    portal_zugang_freigeschaltet: false,
    firmenname: lead.firma ?? null,
    standort_adresse: lead.adresse ?? null,
    standort_plz: lead.plz ?? null,
    standort_lat: lead.lat ?? null,
    standort_lng: lead.lng ?? null,
    gebiet_plz: lead.plz ? [lead.plz] : [],
    paket_umkreis_km: lead.paket_umkreis_km ?? BASIC_DEFAULT_RADIUS_KM,
    paket_faelle_gesamt: 0,            // 0 Inklusivfaelle (Pro-Lead-Billing, P5)
    paket_faelle_genutzt: 0,
    isochrone_polygon: lead.isochrone_polygon ?? null,
    bvsk_mitgliedsnummer: lead.bvsk_nr ?? null,
    oebuv_bestellungsnummer: lead.oebuv_nr ?? null,
    fachschwerpunkte: lead.fachschwerpunkte ?? null,
    partner_seit: null as string | null, // wird beim service-role-Insert gestempelt
  }
}
```
- [ ] **Step 4** vitest → PASS. **Step 5** Commit `feat(sv-basic-p1): claim-eligibility pure helpers`.

> **Hinweis Implementer:** `paket_faelle_gesamt: 0` ist nur Billing-Semantik; das Matching siebt Basic NICHT darüber aus (P0 `istKontingentBlockiert` bypasst). Vor dem realen Insert via `execute_sql` die exakten NOT-NULL-Spalten von `sachverstaendige` gegen `information_schema` prüfen und fehlende Pflichtwerte ergänzen (z.B. `steuernummer` ist im Admin-Wizard Pflicht — für Basic ggf. nullable lassen falls Constraint es zulässt; sonst im Onboarding P2 nachfordern).

---

## Task 3: `beanspracheSvLead` service-role Claim-Action

**Files:** Create `src/lib/sv-basic/claim-actions.ts` (`'use server'`).

- [ ] **Step 1: Action implementieren** (Muster aus `src/app/admin/sachverstaendige/anlegen/actions.ts:120-260` adaptieren, OHNE ensureAdmin — anon-Pfad, dafür Eligibility-Gate + Rate-Limit):
  1. Input: `{ svLeadId: string; email: string; telefon: string }`. Validieren (email-Regex, telefon vorhanden — Pflicht für Koordination).
  2. `const admin = createAdminClient()`.
  3. Lead laden (`sv_leads` by id) + `istClaimbar()` prüfen → sonst `{ ok:false, error:'Eintrag bereits beansprucht' }`.
  4. Email-Dedupe: existiert `auth.users`/`profiles` mit der Email? → freundlicher Fehler (oder Login-Hinweis).
  5. `admin.auth.admin.createUser({ email, email_confirm:true, user_metadata:{ force_password_change:true, onboarding_quelle:'self_service_claim' } })` (KEIN Passwort → Magic-Link setzt es; alternativ randomPassword + force_password_change wie anlegeSv).
  6. `profiles` insert: id=user.id, rolle='sachverstaendiger', vorname/nachname aus Lead, telefon, twofa off, force_password_change. Rollback (deleteUser) bei Fehler.
  7. `sachverstaendige` insert: `{ ...buildSvInsertAusLead(lead, user.id), partner_seit: <today>, verifizierung_frist_bis: <now+48h> }`. Rollback (delete profile + user) bei Fehler.
  8. `sv_leads` update: `konvertiert_zu_sv_id = svRow.id`, `konvertiert_am = now`, `claim_status='beansprucht_pending'`, `ist_aktiv=false` (Kalt-Pin aus, Account-Pin übernimmt — aber Account ist noch pending → erscheint NICHT auf Karte bis P3-Freigabe; sicherstellen, dass währenddessen kein Doppel-Pin UND kein Loch entsteht: da Account `verifiziert!=true` → nicht auf Karte; Kalt-Pin aus → Pin verschwindet temporär bis Freigabe. Akzeptiert, da Pending kurz, 48h. Im Zweifel `sv_leads.ist_aktiv` erst bei P3-Freigabe ausschalten — **Design-Entscheidung in Step-Review festhalten**).
  9. Telefon WA-Reachability cachen (`checkAndCacheAvailability('profile', user.id, telefon)`, fire-and-forget) + Twilio-Verify-Trigger optional (P2 kann das vertiefen).
  10. Magic-Link senden (`dispatch-magic-link` / `generateLink`-Muster) → SV setzt Passwort + landet im Onboarding (P2). Email-Fallback (Registrierungs-Mail) wenn Magic-Link-Send failt. Non-critical try/catch.
  11. Admin-Benachrichtigung „Neue Basic-Claim wartet auf Freigabe" (Reuse `benachrichtigungen`, empfaenger_rolle='admin', Link zur P3-Queue).
  12. Return `{ ok:true, svId }`. `revalidatePath` n/a (anon).
- [ ] **Step 2: Auth-Smoke gegen Live-Constraints** (reversibel, @claimondo.test): einen offenen Test-`sv_leads` anlegen → `beanspracheSvLead` → prüfen: auth.users+profiles+sachverstaendige(paket=basic, ist_aktiv=false, verifizierung_status=ausstehend, frist gesetzt) erzeugt, sv_leads verlinkt+claim_status=beansprucht_pending. **Cleanup restlos** (FK-Reihenfolge). Screenshot/Output → `docs/<DD.MM>/smoke-sv-basic-p1/`.
- [ ] **Step 3: Commit** `feat(sv-basic-p1): beanspracheSvLead service-role claim action`.

> **🔴 Adversarial-Review-Punkte (Pflicht im Quality-Review):** (a) Kann jemand einen FREMDEN Pin claimen? → Ja per Design, aber Live-Schaltung erst nach P3-Team-Freigabe (Identitätsprüfung) → akzeptiert, dokumentieren. (b) Enumeration/Spam → Rate-Limit + email-Dedupe. (c) Privilege-Escalation: Insert setzt paket/verifizierung_status via service-role (nicht via user) → ok; sicherstellen, dass es KEINE user-facing Action gibt, die diese Felder setzt. (d) Rollback-Kaskade bei jedem Teilfehler vollständig. (e) `sv_leads.ist_aktiv`-Timing (Step 1.8) — kein Karten-Loch/Doppel-Pin.

---

## Task 4: `registriereSvBasicNeu` (fresh, ohne Pin)

**Files:** `src/lib/sv-basic/claim-actions.ts` (erweitern).

- [ ] **Step 1:** Action `registriereSvBasicNeu(input)` mit Stammdaten (vorname/nachname/email/telefon/adresse→geocode/dat_nr Pflicht). Gleicher Account-Aufbau wie Task 3, aber ohne sv_leads-Quelle: `onboarding_quelle='self_service_neu'`, Geo via Mapbox-Forward (Muster `gutachter-waitlist.ts:geocodePlz`), `paket_umkreis_km=25`. DAT-Nr. in `dat_id`/Quali-Feld ablegen (für P3-Prüfung).
- [ ] **Step 2:** Auth-Smoke (reversibel) + Cleanup. **Step 3:** Commit.

---

## Task 5: Public-Route + UI

**Files:** Create `src/app/sv/registrieren/page.tsx` + `SvRegistrierenClient.tsx` (+ ggf. Map-Komponente).

- [ ] **Step 1:** Middleware-Whitelist für `/sv/registrieren` (anon-Zugang, Muster `/anfrage`-Whitelist in `src/lib/supabase/middleware.ts`).
- [ ] **Step 2:** Page (Server-Component, schlank) + Client:
  - Schritt A „Finde deinen Eintrag": Suchfeld (Name/PLZ/DAT-Nr.) → `sucheSvLeadKandidaten` → Kandidaten-Liste (nur `{vorname, name, firma, plz, ort}`). „Mein Eintrag ist nicht dabei" → Schritt C.
  - Schritt B „Beanspruchen": gewählter Kandidat → Email + Telefon eingeben → `beanspracheSvLead` → Bestätigung „Wir haben dir einen Link geschickt; Freischaltung in 48 h nach Prüfung".
  - Schritt C „Neu eintragen": Formular → `registriereSvBasicNeu` → gleiche Bestätigung.
  - **UI nur `primitives.Button`/`primitives.Card`/`shared/*`** (CI-Ratchet). Umlaute. Claimondo-Tokens.
- [ ] **Step 3:** `next build` (Route/Server-Action-Validierung) grün. **Step 4:** Commit.

> Map (Mapbox) optional in P1 — Text-Suche reicht für MVP; Karten-Pin-Auswahl kann Folge-Increment sein. Falls Map: `position`/`inset` per inline-style (mapbox-gl-Incident), nicht Tailwind-Utility.

---

## Task 6: Build-Gate + Smoke + PR

- [ ] **Step 1:** `npx tsc --noEmit` · `npx vitest run src/lib/sv-basic` · `npm run check:token-audit` · `npm run check:component-set` · `next build` (Routen!). Alle grün.
- [ ] **Step 2: Staging-Smoke (nach Merge/Deploy ODER lokal `npm run dev`):** voller Pfad Suche→Claim→pending Account→Magic-Link-Mail; Negativ: schon-beanspruchter Pin; Invalid. Screenshots Pflicht.
- [ ] **Step 3:** Push + `gh pr create --base staging` + 7-Punkte-Audit. Nicht selbst mergen.

---

## Self-Review (Plan-Autor)

- **Spec §6-Coverage:** Public-Einstieg (Task 5, marketing-CTA in claimondo-marketing separat/out-of-scope notiert) · Claim service-role + Prefill + pending (Task 3) · Fresh-Variante (Task 4) · Privacy/anon-Suche (Task 1, service-role Minimal-Projektion) · Magic-Link+Telefon/WA (Task 3 Steps 9-10) · pending nicht dispatchbar/sichtbar (verifizierung/ist_aktiv aus P0 + Task 3 inserts).
- **Sicherheit:** Adversarial-Punkte in Task 3 explizit; Live-RLS-Prüfung Task 1; keine neue anon-RLS-Verbreiterung.
- **Typ-Konsistenz:** `buildSvInsertAusLead`/`istClaimbar`/`normalisiereSuche` identisch in Test+Impl; Insert-Shape matcht sachverstaendige (NOT-NULL-Check als Impl-Step).
- **Offen (an P2/P3 übergeben):** Onboarding-Wizard (P2), Team-Freigabe-Queue (P3), Karten-Sichtbarkeit/Matching-Feinschliff (P4), Billing (P5). `steuernummer`/Pflichtfeld-Nullbarkeit für Basic live verifizieren (Task 2-Hinweis).

---

## ⚠️ Risiko-Hinweis (vs. P0)
P1 erzeugt **echte Auth-Accounts via service-role aus einem anon-Pfad** + berührt RLS/Privacy + eine öffentliche Route. Das ist eine **höhere Risikoklasse als P0** (rein additive Spalten). Daher: Live-RLS vor Bau prüfen, Adversarial-Quality-Review verbindlich, Auth-Smokes gegen echte Constraints (nicht Mocks), und vor dem ersten echten anon-Claim auf prod den Rate-Limit + Email-Dedupe verifizieren.
