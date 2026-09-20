# Kunde kommt nur mit Telefonnummer in sein Konto (Stufe 2) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Lead, der nur eine Mobilnummer hat, kommt über `/login` (Telefon-Tab) in sein Konto — Konto ohne E-Mail, SMS-Code, Portal rendert ohne `user.email`, kein Fremdzugriff durch NULL-Gleichheit.

**Architecture:** Eine DDL (`profiles.email DROP NOT NULL`, per Supabase-MCP `apply_migration`, Datei im selben PR). Der Login-Pfad aus Stufe 1 (`bereiteTelefonLoginVor`) legt das Konto jetzt auch ohne Lead-E-Mail an (`createUser({ phone, phone_confirm })`). Ein gemeinsamer Besitz-Helfer `kundeBesitztLead` ersetzt die drei nackten `lead.email !== user.email`-Vergleiche (mit NULL beidseitig = Wildcard). Alles andere ist Sweep.

**Tech Stack:** Next.js 16 Server-Actions, Supabase Auth Admin-API, vitest (Admin-Client gemockt), Playwright.

**Soll-Blatt (Regel 6, vor dem Bau):** `memory/abnahmen/2026-09-20-kunde-konto-nur-telefon-stufe-2.md`. **Stufe 1:** `docs/superpowers/plans/2026-09-19-kunde-login-ohne-link.md` (#6000, auf prod).

## Global Constraints

- **Branch von `origin/staging`**, nie von `origin/main` (staging hat eine eigene Wurzel — #6000 und #5986 mussten verpflanzt werden). Worktree: `.claude/worktrees/kunde-konto-nur-telefon`, Branch `kitta/kunde-konto-nur-telefon`, PR-Base `staging`.
- Regel 2/L4: DDL nur per `mcp__plugin_supabase_supabase__apply_migration`, Version per `list_migrations` ablesen, Datei `supabase/migrations/<V>_profiles_email_nullable.sql` im selben PR, Typen regenerieren und committen.
- Regel 4: Test-Leads mit Musternummer `+4915512345678` (keine echte SMS ohne Supabase-Test-Nummer); nie echte Kundendaten anfassen.
- `NODE_OPTIONS=--max-old-space-size=8192` für tsc/build; Exit-Code prüfen (134 = OOM, nicht „0 Fehler").
- Server-Actions: Result-Object `{ ok, error? }`; Non-critical Writes in try/catch; keine Value-Exports aus `'use server'`-Files.
- Frontend-Strings mit echten Umlauten.
- Ratchets vor jedem Commit: `check:silent-writes`, `check:flag-drift`, `check:server-actions`, `check:component-set`; am Ende die volle Batterie + `check:vitest -- --ratchet`.

---

### Task 1: Worktree von `origin/staging`, Abhängigkeiten

**Files:** keine (Infrastruktur)

- [ ] **Step 1:** Vom Haupt-Checkout: `git fetch origin staging && git worktree add "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.claude/worktrees/kunde-konto-nur-telefon" -b kitta/kunde-konto-nur-telefon origin/staging`
- [ ] **Step 2:** Im neuen Worktree `npm ci` (Vordergrund, ~3 min; Paketzahl am Ende lesen — ein gekillter Lauf hinterlässt 779 statt ~1.035 Einträge).
- [ ] **Step 3:** `git merge-base HEAD origin/staging` liefert einen Commit (Basis vorhanden) — sonst falsch abgezweigt.

---

### Task 2: Migration `profiles.email DROP NOT NULL` (Regel 2)

**Files:**
- Create: `supabase/migrations/<V>_profiles_email_nullable.sql`
- Modify: `src/lib/supabase/database.types.ts` (regeneriert)

**Interfaces:** Produces: `profiles.email` nullable; `Database['public']['Tables']['profiles']['Insert']['email']` wird optional.

- [ ] **Step 1:** Vorher lesen (MCP `execute_sql`, READ): `select is_nullable from information_schema.columns where table_name='profiles' and column_name='email'` → `NO`.
- [ ] **Step 2:** `apply_migration({ name: "profiles_email_nullable", query: "alter table public.profiles alter column email drop not null;" })`
- [ ] **Step 3:** `list_migrations` → Version `<V>` ablesen. Datei schreiben, Inhalt exakt:

```sql
-- Stufe 2 "Konto nur mit Telefon" (Soll-Blatt 2026-09-20-kunde-konto-nur-telefon-stufe-2.md, 6b):
-- profiles.email war die einzige NOT-NULL-Spalte neben id. UNIQUE (profiles_email_key) bleibt —
-- NULLs kollidieren nicht. Abhaengige Views/Funktionen gelesen (v_claim_parties_safe,
-- v_vertrieb_kontakt, dsgvo_anonymize_user_data, create_auto_beratungstermin,
-- set_reparatur_werkstatt_from_qr): keine setzt NOT NULL voraus.
alter table public.profiles alter column email drop not null;
```

- [ ] **Step 4:** Nachher lesen: dieselbe Abfrage → `YES`.
- [ ] **Step 5:** Typen regenerieren: `SUPABASE_ACCESS_TOKEN=<aus .env.local> npx supabase gen types typescript --project-id paizkjajbuxxksdoycev --schema public > src/lib/supabase/database.types.ts`; Diff prüfen — nur `profiles.email` (Row `string | null`, Insert `email?: string | null`) darf sich ändern, sonst fremde Drift → nur die eigene Zeile übernehmen.
- [ ] **Step 6:** `npm run check:query-drift` lesen; bei kleinerer Baseline `-- --update-baseline`.
- [ ] **Step 7:** Commit `feat(db): profiles.email nullable — Konto nur mit Telefon (Stufe 2)`.

---

### Task 3: Besitz-Helfer `kundeBesitztLead` (NULL ist nie gleich NULL)

**Files:**
- Create: `src/lib/kunde/besitz.ts`
- Test: `src/lib/kunde/besitz.test.ts`

**Interfaces:** Produces:
```ts
export type KontaktUser = { id: string; email?: string | null; phone?: string | null }
export type LeadKontakt = { email?: string | null; telefon?: string | null; telefon_ziffern?: string | null }
export function passtKontaktZuLead(user: KontaktUser, lead: LeadKontakt): boolean
export async function kundeBesitztLead(admin: SupabaseClient, user: KontaktUser, leadId: string): Promise<boolean>
```
Consumes: `telefonSuffix` aus `src/lib/auth/lead-kontakt.ts` (9 Ziffern, Stufe 1).

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { passtKontaktZuLead } from './besitz'

describe('passtKontaktZuLead', () => {
  it('E-Mail gleich (case-insensitiv) → true', () => {
    expect(passtKontaktZuLead({ id: 'u', email: 'A@B.de' }, { email: 'a@b.de' })).toBe(true)
  })
  it('beide E-Mails NULL → NIE true (Wildcard-Falle)', () => {
    expect(passtKontaktZuLead({ id: 'u', email: null, phone: null }, { email: null, telefon: null })).toBe(false)
  })
  it('Telefon-Suffix (9 Ziffern) gleich → true, auch bei Formatunterschied', () => {
    expect(passtKontaktZuLead({ id: 'u', phone: '4915178429156' }, { telefon: '0151 7842 9156', telefon_ziffern: '015178429156' })).toBe(true)
  })
  it('Telefon verschieden → false', () => {
    expect(passtKontaktZuLead({ id: 'u', phone: '4915178429156' }, { telefon_ziffern: '015178429157' })).toBe(false)
  })
  it('User ohne beides → false', () => {
    expect(passtKontaktZuLead({ id: 'u' }, { email: 'x@y.de', telefon: '0151' })).toBe(false)
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/kunde/besitz.test.ts` → rot (Modul fehlt).
- [ ] **Step 3: Implementierung**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { telefonSuffix } from '@/lib/auth/lead-kontakt'

export type KontaktUser = { id: string; email?: string | null; phone?: string | null }
export type LeadKontakt = { email?: string | null; telefon?: string | null; telefon_ziffern?: string | null }

// Reiner Vergleich, testbar. NULL auf beiden Seiten ist NIE ein Treffer — genau das war die
// Wildcard in `lead?.email !== user.email` (Soll-Blatt Stufe 2, 6b).
export function passtKontaktZuLead(user: KontaktUser, lead: LeadKontakt): boolean {
  const ue = user.email?.trim().toLowerCase()
  const le = lead.email?.trim().toLowerCase()
  if (ue && le && ue === le) return true
  const us = telefonSuffix(user.phone ?? null)
  const ls = telefonSuffix(lead.telefon_ziffern ?? lead.telefon ?? null)
  if (us && ls && us === ls) return true
  return false
}

/** Gehört der Lead diesem Kunden? Liest den Lead über den Admin-Client (leads-Policy hat keinen Kunden-Zweig). */
export async function kundeBesitztLead(admin: SupabaseClient, user: KontaktUser, leadId: string): Promise<boolean> {
  const { data: lead } = await admin.from('leads').select('email, telefon, telefon_ziffern').eq('id', leadId).maybeSingle()
  if (!lead) return false
  return passtKontaktZuLead(user, lead as LeadKontakt)
}
```

- [ ] **Step 4:** Test grün (5/5). tsc auf die Datei.
- [ ] **Step 5:** Commit `feat(kunde): Besitz-Helfer kundeBesitztLead — E-Mail oder Telefon, NULL nie gleich NULL`.

---

### Task 4: Sweep — die drei Wildcard-Vergleiche, ICS, Termin-Guard, ZB1, Kalt-Lead, Dokumente

**Files (Modify):**
- `src/app/kunde/termine/[id]/page.tsx:55-68`
- `src/lib/actions/termin-actions.ts:128-142`
- `src/lib/aircall/bridge.ts:36-48`
- `src/app/api/kunde/termin/ics/[id]/route.ts:72-84`
- `src/lib/termine/kann-termin-verwalten.ts` (`istKundeOwner` + Lead-Telefon)
- `src/app/kunde/onboarding-details/zb1-actions.ts:81,181,213ff` (`resolveLeadIdForKunde` mit Telefon)
- `src/app/kunde/page.tsx:60-66` (Kalt-Lead-Reaktivierung)
- `src/app/dispatch/leads/[id]/_actions/dokumente-anfordern.ts:196-212`
- `src/lib/actions/makler-settings.ts:170`, `src/lib/actions/werkstatt-settings.ts:194` (`email: user.email ?? undefined`)

- [ ] **Step 1:** Die drei Vergleiche ersetzen. Muster (termine/[id]/page.tsx):

```ts
const owned = fall.kunde_id === user.id
if (!owned) {
  if (!fall.lead_id || !(await kundeBesitztLead(admin, user, fall.lead_id))) notFound()
}
```
`termin-actions.ts` / `aircall/bridge.ts`: `if (!claim.lead_id || !(await kundeBesitztLead(db, user, claim.lead_id))) return { error: 'Kein Zugriff' }`. ICS-Route: `owned = !!fall.lead_id && (await kundeBesitztLead(admin, user, fall.lead_id))`.

- [ ] **Step 2:** `istKundeOwner` erweitern (bestehender Test in `kann-termin-verwalten.test.ts` erweitern, nicht ersetzen):

```ts
type User = { id: string; email: string | null; phone?: string | null }
export function istKundeOwner(fall: { kunde_id: string | null; lead_email: string | null; lead_telefon?: string | null }, user: User): boolean {
  if (fall.kunde_id && fall.kunde_id === user.id) return true
  return passtKontaktZuLead(user, { email: fall.lead_email, telefon: fall.lead_telefon ?? null })
}
```
Im DB-Zweig `select('email, telefon')` am Lead lesen und `lead_telefon` mitgeben. Neuer Testfall: `kunde_id null, lead_email null, user.email null` → false; `lead_telefon` = User-Phone → true.

- [ ] **Step 3:** `resolveLeadIdForKunde(admin, fallId, userId, email)` → Signatur `(admin, fallId, user: KontaktUser)`; im Lead-Zweig `kundeBesitztLead` statt E-Mail-Gleichheit. Beide Aufrufer (Z.81/181) anpassen: `resolveLeadIdForKunde(admin, fallId, { id: user.id, email: user.email, phone: user.phone })`.
- [ ] **Step 4:** Kalt-Lead-Reaktivierung in `kunde/page.tsx`: statt `.eq('email', user.email!)`:

```ts
const kontakt = await findeVorgaengeZuKontakt(admin, { email: user.email ?? null, telefon: user.phone ?? null })
const { data: kaltLeads } = kontakt.leadIds.length
  ? await admin.from('leads').select('id, vorname, nachname').in('id', kontakt.leadIds).eq('qualifizierungs_phase', 'kalt')
  : { data: [] as { id: string; vorname: string | null; nachname: string | null }[] }
```

- [ ] **Step 5:** `dokumente-anfordern.ts`: vor dem E-Mail-Zweig `if (kanal === 'email' && !lead.email) return { ok: false, error: 'Dieser Lead hat keine E-Mail-Adresse — bitte per WhatsApp oder SMS anfordern.' }` (Result-Shape der Datei übernehmen — vorher lesen, `success` vs `ok`).
- [ ] **Step 6:** makler-/werkstatt-settings: `email: user.email ?? undefined` (kein NULL-Write in Partner-Stammdaten).
- [ ] **Step 7:** tsc 0 · `npx vitest run src/lib/termine src/lib/kunde src/app/kunde` grün · `check:silent-writes`, `check:server-actions` grün.
- [ ] **Step 8:** Commit `fix(kunde): Besitz per E-Mail ODER Telefon — NULL-Gleichheit war eine Wildcard (4 Stellen), Kalt-Lead/ZB1/Dokumente ohne E-Mail`.

---

### Task 5: `bereiteTelefonLoginVor` legt Konten ohne E-Mail an

**Files:**
- Modify: `src/app/login/bekannter-kontakt-actions.ts:23-85`
- Test: `src/app/login/bekannter-kontakt-actions.test.ts` (bestehend, erweitern)

- [ ] **Step 1: Failing tests** (Mock-Muster der Datei übernehmen):
  - Lead nur mit Telefon → `createUser` wird mit `{ phone, phone_confirm: true }` **ohne** `email` aufgerufen; `profiles.upsert` mit `email: null`, `auth_provider: 'phone'`, `vorname` aus dem Lead; Rückgabe `{ ok: true }`.
  - Lead mit E-Mail → wie bisher (`email` + `email_confirm`).
  - `createUser` liefert Fehler mit `code: 'phone_exists'` (oder Message enthält `users_phone_key`) → kein zweiter Versuch, `{ ok: true }` (Konto existiert, OTP geht an dieses).
  - `kontoVorhanden` liest **alle** Seiten von `listUsers` (Mock: Seite 1 voll mit 1000, Seite 2 enthält den Treffer) → true.
- [ ] **Step 2:** rot.
- [ ] **Step 3: Implementierung** — der Guard `if (!vorgaenge.leadEmail) { warn; return NEUTRAL }` fällt weg:

```ts
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  phone,
  phone_confirm: true,
  ...(vorgaenge.leadEmail ? { email: vorgaenge.leadEmail, email_confirm: true } : {}),
})
if (createErr || !created?.user) {
  // 23505 users_phone_key / phone_exists: Konto gibt es schon (z. B. Admin-Override) -> OTP geht dorthin.
  if (!/phone_exists|users_phone_key/i.test(createErr?.message ?? '') && createErr?.code !== 'phone_exists') {
    console.error('[login-kontakt] createUser fehlgeschlagen:', createErr?.message)
  }
  return NEUTRAL
}
const { error: profErr } = await admin.from('profiles').upsert(
  { id: created.user.id, rolle: 'kunde', email: vorgaenge.leadEmail ?? null, telefon: phone, vorname: vorgaenge.leadVorname, auth_provider: 'phone', force_password_change: false },
  { onConflict: 'id' },
)
```
`kontoVorhanden`: Schleife `page = 1..` mit `perPage: 1000`, abbrechen, wenn `users.length < 1000`.

- [ ] **Step 4:** grün; tsc 0; `check:server-actions` R1 0.
- [ ] **Step 5:** Commit `feat(login): Konto nur mit Telefon — createUser({ phone }) ohne E-Mail, Kollision users_phone_key = bestehendes Konto`.

---

### Task 6: Login-Hinweis, Journey-Delta, Register

**Files:**
- Modify: `src/app/login/LoginClient.tsx` (Verify-Schritt: Zusatzzeile)
- Modify: `docs/fundament/journeys/j02-meldung-alle-kanaele.md` (Schritt 2b), `docs/fundament/entry-points-flowlink.md` (L-2)

- [ ] **Step 1:** Unter dem Code-Feld: `<p className="text-sm text-claimondo-ondo">Kein Code angekommen? Prüfen Sie die Nummer — oder nutzen Sie den Anmelde-Link per E-Mail, falls Sie eine Adresse hinterlegt haben.</p>` (Umlaute!). Kein Enumerations-Leck: der Satz ist für alle gleich.
- [ ] **Step 2:** J2 2b: „… auch ohne E-Mail: Konto entsteht nur mit der Mobilnummer (Stufe 2, 20.09.); Code per SMS (60 s gültig)". L-2-Zeile ergänzen.
- [ ] **Step 3:** `check:component-set` 112=112, `check:copy-lint` (Marketing n/a). Commit `feat(login): Hinweis im Code-Schritt; J2/Register Stufe 2`.

---

### Task 7: Regel-4-Smoke für den Telefon-Weg (Seed + Spec, gated)

**Files:**
- Modify: `scripts/smoke/kunde-login-ohne-link-seed.mjs` (Modus `--telefon`: Lead mit `telefon='+4915512345678'`, `email=null`)
- Modify: `tests/e2e/flows/kunde-login-ohne-link-smoke.spec.ts` (Test S wird echt, gated)

- [ ] **Step 1:** Seed `--telefon`: Lead wie bisher, aber `telefon: '+4915512345678', email: null` (Musternummer — Supabase-Test-Nummer, falls Aaron sie einträgt; sonst geht keine SMS raus, weil Supabase ohne Test-Nummer an diese Nummer tatsächlich senden würde → **nur mit gesetzter Test-Nummer seeden**). JSON bekommt `telefon`, `otpCode` aus `SMOKE_PHONE_OTP_CODE`.
- [ ] **Step 2:** Test S:

```ts
test('S · Weg 2b (Telefon): Lead nur mit Mobilnummer -> Code -> Portal -> Karte', async ({ page }) => {
  test.skip(!seed?.telefon || !seed?.otpCode, 'Telefon-Seed + Supabase-Test-Nummer (SMOKE_PHONE_OTP_CODE) fehlen — ohne Test-Nummer ginge eine echte SMS raus')
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Telefon/ }).click()
  await page.getByPlaceholder('+49 170 1234567').fill(seed!.telefon!)
  await page.getByRole('button', { name: /Code senden/ }).click()
  await expect(page.getByText(/haben wir gerade einen Code per SMS geschickt/)).toBeVisible({ timeout: 20_000 })
  await page.getByPlaceholder(/Code|123456/).fill(seed!.otpCode!)
  await page.getByRole('button', { name: /Anmelden|Bestätigen/ }).click()
  await page.waitForURL(/\/kunde/, { timeout: 30_000 })
  await expect(page.getByText(/Ihre Schadenmeldung vom/)).toBeVisible({ timeout: 20_000 })
})
```
(Selektoren beim Bau aus `LoginClient.tsx` lesen — Button-Texte „Code senden"/„Anmelden" nachschlagen, nicht raten.)
- [ ] **Step 3:** `--verify` prüft zusätzlich: `auth.users.phone` gesetzt, `email` NULL, `profiles.email` NULL, `auth_provider='phone'`.
- [ ] **Step 4:** `check:e2e-toplevel-fs`, `check:stumme-waechter` grün (kein `RUN_*`). Commit `test(e2e): Telefon-Weg mit Supabase-Test-Nummer (gated), verify prueft Konto ohne E-Mail`.

---

### Task 8: Build, Ratchets, PR, Abnahme

- [ ] **Step 1:** `npm run build` **entkoppelt** (`Start-Process` mit Log — der Tool-Wrapper killt nach 10 min, der TS-Worker stirbt dann mit 0xC0000142); Log lesen: `Compiled`, `Finished TypeScript`, Seitenzahl. `check:vitest -- --ratchet` **ohne** parallelen Build (Flakes unter Last).
- [ ] **Step 2:** Ratchet-Batterie (15 Gates) — alle „0 neue", Ausgabe gelesen.
- [ ] **Step 3:** PR gegen `staging` (Base prüfen!), Body: Befund (11/28 Leads ohne E-Mail), Kette, Migration `<V>` + Datei, Sweep-Liste, Regel-4-Plan (E-Mail-Weg wie Stufe 1; Telefon-Weg nur mit Test-Nummer), Abnahme-Link.
- [ ] **Step 4:** Abnahme-Datei Abschnitte 3/4/5/7/8 füllen, INDEX `🟡 PR offen`; Marker.
- [ ] **Step 5:** Merge nach L1–L5; nach Deploy Regel-4 (E-Mail-Weg per Seed/Spec; Telefon-Weg mit Test-Nummer oder Aarons Gerät).

## Self-Review
* Spec-Coverage: Kriterium 1/2/6/8 → T5 (+ T2); 3 → T5 (kein createUser für Unbekannte, Stufe-1-Test bleibt); 4 → T4 (Seiten ohne E-Mail) + T8-Smoke; 5 → T3/T4; 7 → T4 Step 5; 9 (A3) → bewusst nicht (Annahme A3); 10 → T7 (gated).
* Placeholder-Scan: keine TBD; Selektoren in T7 sind als „nachschlagen" markiert, nicht geraten.
* Typkonsistenz: `KontaktUser { id, email?, phone? }` in T3/T4/T5 identisch; `passtKontaktZuLead(user, lead)` Argumentreihenfolge überall gleich.
