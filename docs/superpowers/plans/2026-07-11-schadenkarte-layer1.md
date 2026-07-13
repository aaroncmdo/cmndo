# Schadenkarte (Layer 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Die NFC+QR-Schadenkarte als Entity (1:1 an ein Flotten-Fahrzeug), mit Batch-Anlage, Binden im `/flotte`-Portal, QR-Erzeugung/Druck und einem „Welches Fahrzeug ist diese Karte?"-Scanner — durch **Wiederverwendung** des Werkstatt-QR-Pool-Musters.

**Architecture:** Karte-Token (Plaintext, `SKT-`-Prefix) spiegelt `werkstatt_qr_pool` (Pool: `frei -> gebunden`, optimistic guard). QR-Gen/Scanner/Download/Batch-PDF sind bestehende Bausteine. NDEF/QR-URL = `https://claimondo.de/schaden/{token}` (die `/schaden/[token]`-Route selbst = Layer 2, NICHT hier). Isoliert-stacked auf Layer 0.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (Postgres + RLS, `mcp__plugin_supabase_supabase__apply_migration`), `qrcode`-Lib, vitest, `@/components/primitives` + `@/components/shared`.

## Global Constraints

- **DDL nur via `apply_migration`** (Plugin-MCP, `project_id` paizkjajbuxxksdoycev). File exakt nach getrackter Version benennen (Twin-Drift). `execute_sql` nur READ.
- **Nie auf `main`.** Branch `kitta/schadenkarte-layer1` (stacked off Layer 0), PR gegen `staging`.
- **Types-Lag (Regel 2):** `schadenkarten` wird NICHT in `database.types.ts` regeneriert -> Zugriff via `AnyDb`-Helper (wie `firmen_flotten_konten` in `src/lib/flotte/konto-firma.ts`).
- **Server-Actions:** Result-Object `{ ok, error? }`; `'use server'`-Files exportieren keine Konstanten/Types.
- **UI-Strings echte Umlaute** (ä/ö/ü/ß). Component-Set: `primitives`/`shared`. 7-Audit im Commit. Ratchets 0-neu.
- **Reuse-Pflicht:** `generateQrPoolToken`-Muster · `generateQrCodeSvg` · `QrCodeDownloadButtons` · `buildQrGridPdf` · `PoolQrScanner` · `auth_flottenmanager_firma_id()` (RLS, existiert). Nicht duplizieren.
- **Karte 1:1 Fahrzeug:** `UNIQUE(fahrzeug_id) WHERE status='gebunden'`.
- **tsc:** `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` (bare tsc OOMt).

---

## File Structure

**Neu:**
- `supabase/migrations/<V>_schadenkarten.sql` — Tabelle + RLS (mirror werkstatt_qr_pool + 1:1-vehicle).
- `src/lib/schadenkarte/token.ts` — `generateSchadenkarteToken` / `extractSchadenkarteToken` (Klon von `qr-pool-token.ts`, `SKT-`-Prefix, 16 Zeichen).
- `src/lib/schadenkarte/schadenkarte.ts` — AnyDb-Service: `mintSchadenkarten` (Batch), `bindeSchadenkarteAnFahrzeug`, `resolveSchadenkarteToFahrzeug` (Reverse-Lookup), `getKartenFuerFirma`.
- `src/app/flotte/(shell)/karten/page.tsx` + `KartenClient.tsx` — Karten-Liste + Scanner (Identify) + Batch-Download.
- `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx` — Fahrzeug-Detail-Skeleton (Stammdaten + Karten-Status) = Reverse-Lookup-Ziel.
- `src/components/flotte/SchadenkarteScanner.tsx` — Fork von `PoolQrScanner` mit `extractSchadenkarteToken`.
- `src/app/flotte/(shell)/flotte/schadenkarte-actions.ts` — `'use server'` bind/mint/resolve gated `['flottenmanager']`/`['admin']`.

**Modifiziert:**
- `src/components/flotte/FlotteManagerShell.tsx` — Nav-Item „Karten" -> `/flotte/karten`.
- `src/app/flotte/(shell)/flotte/page.tsx` — `<SchadenkarteBindenHinweis>` / Mini-Aktion pro Fahrzeug (Sibling, keine FlotteClient-Prop-Inflation).

---

## Task 1: Migration `schadenkarten`

**Files:** Create `supabase/migrations/<V>_schadenkarten.sql`

- [ ] **Step 1: DDL schreiben + via apply_migration anwenden**

```sql
-- Schadenkarte: NFC+QR-Karte, 1:1 an ein Flotten-Fahrzeug. Spiegelt werkstatt_qr_pool
-- (Pool frei->gebunden). karten_token = Plaintext (auf Karte/QR sichtbar, kein Secret),
-- hoehere Entropie (SKT-<16>). URL: https://claimondo.de/schaden/{karten_token}.
create table if not exists public.schadenkarten (
  id uuid primary key default gen_random_uuid(),
  karten_token text not null unique,
  status text not null default 'bestellt' check (status in ('bestellt','frei','gebunden','gesperrt','ersetzt')),
  fahrzeug_id uuid references public.vehicles(id) on delete set null,
  firma_id uuid references public.firmen(id) on delete set null,
  nfc_uid text,
  charge text,
  gebunden_am timestamptz,
  gebunden_von uuid references auth.users(id) on delete set null,
  erstellt_am timestamptz not null default now()
);
create index if not exists idx_schadenkarten_fahrzeug on public.schadenkarten(fahrzeug_id);
create index if not exists idx_schadenkarten_firma on public.schadenkarten(firma_id);
-- 1:1 — max. eine GEBUNDENE Karte pro Fahrzeug:
create unique index if not exists schadenkarten_fahrzeug_gebunden_uniq
  on public.schadenkarten (fahrzeug_id) where status = 'gebunden';

alter table public.schadenkarten enable row level security;
-- RLS: flottenmanager sieht/updated Karten SEINER firma; Staff alles. (INSERT/mint via Admin-Client.)
create policy skt_fm_select on public.schadenkarten for select to authenticated
  using (firma_id = public.auth_flottenmanager_firma_id());
create policy skt_fm_update on public.schadenkarten for update to authenticated
  using (firma_id = public.auth_flottenmanager_firma_id())
  with check (firma_id = public.auth_flottenmanager_firma_id());
create policy skt_staff_all on public.schadenkarten for all to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')))
  with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.rolle in ('admin','dispatch','kundenbetreuer')));
revoke all on public.schadenkarten from anon;
grant select, update on public.schadenkarten to authenticated;
```
Run: `apply_migration({ project_id:"paizkjajbuxxksdoycev", name:"schadenkarten", query:"<DDL>" })`.

- [ ] **Step 2: Version ablesen + File benennen**
`list_migrations` (bzw. `execute_sql("select version,name from supabase_migrations.schema_migrations where name='schadenkarten'")`) -> File `supabase/migrations/<V>_schadenkarten.sql`.

- [ ] **Step 3: Verifizieren (READ)**
`execute_sql("select to_regclass('public.schadenkarten') is not null as ok, (select count(*) from pg_policies where tablename='schadenkarten') as policies")` -> ok=true, policies=3.

- [ ] **Step 4: Commit** `git add supabase/migrations/<V>_schadenkarten.sql && git commit -m "feat(schadenkarte): schadenkarten-Tabelle (1:1 vehicle) + RLS"`

---

## Task 2: Token-Util `src/lib/schadenkarte/token.ts`

**Files:** Create `src/lib/schadenkarte/token.ts`, `src/lib/schadenkarte/token.test.ts`
**Interfaces produced:** `generateSchadenkarteToken(): string` (`SKT-` + 16 crypto-random ambiguity-free chars) · `extractSchadenkarteToken(scanned: string): string | null`

- [ ] **Step 1: Failing test** `src/lib/schadenkarte/token.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { generateSchadenkarteToken, extractSchadenkarteToken } from './token'

describe('schadenkarte token', () => {
  it('generates SKT-prefixed 16-char tokens', () => {
    const t = generateSchadenkarteToken()
    expect(t).toMatch(/^SKT-[0-9A-Z]{16}$/)
    expect(generateSchadenkarteToken()).not.toBe(t)
  })
  it('extracts token from a full /schaden URL', () => {
    expect(extractSchadenkarteToken('https://claimondo.de/schaden/SKT-ABCDEFGH23456789')).toBe('SKT-ABCDEFGH23456789')
  })
  it('extracts a bare token', () => {
    expect(extractSchadenkarteToken('skt-abcdefgh23456789')).toBe('SKT-ABCDEFGH23456789')
  })
  it('returns null for non-matches', () => {
    expect(extractSchadenkarteToken('hello world')).toBeNull()
  })
})
```
- [ ] **Step 2: Run -> FAIL** `npx vitest run src/lib/schadenkarte/token.test.ts`
- [ ] **Step 3: Implement** — READ `src/lib/werkstatt/qr-pool-token.ts` first and clone its structure (crypto.getRandomValues over the ambiguity-free ALPHABET `23456789ABCDEFGHJKMNPQRSTVWXYZ`), but prefix `SKT-`, length 16, and the extractor regex `/\b(SKT-[0-9A-HJKMNP-TV-Z]{16})\b/i` matching both `/schaden/{token}` URLs and bare tokens, normalised uppercase.
- [ ] **Step 4: Run -> PASS.**
- [ ] **Step 5: Commit** `git add src/lib/schadenkarte/token.ts src/lib/schadenkarte/token.test.ts && git commit -m "feat(schadenkarte): token-util (SKT-, 16, mirror qr-pool-token)"`

---

## Task 3: Schadenkarte-Service `src/lib/schadenkarte/schadenkarte.ts`

**Files:** Create `src/lib/schadenkarte/schadenkarte.ts`, `src/lib/schadenkarte/schadenkarte.test.ts`
**Interfaces (AnyDb, wegen Types-Lag):**
- `mintSchadenkarten(db, { firmaId, anzahl, charge }): Promise<{ ok: true; tokens: string[] } | { ok: false; error: string }>` — Batch-Insert `status='bestellt'`, UNIQUE-Retry (max 5/Token), max 200.
- `bindeSchadenkarteAnFahrzeug(db, { token, fahrzeugId, firmaId, userId }): Promise<{ ok: boolean; error?: string }>` — guard `status IN ('bestellt','frei')` + `.eq('firma_id', firmaId)`, optimistic `.eq('status', <alt>)` beim Update auf `gebunden` + `fahrzeug_id`; mappt UNIQUE-Verletzung (1:1) auf „Dieses Fahrzeug hat bereits eine aktive Karte."
- `resolveSchadenkarteToFahrzeug(db, token): Promise<{ fahrzeugId: string; firmaId: string; status: string } | null>` — Reverse-Lookup.

- [ ] **Step 1: Failing test** — mock db; assert (1) `bindeSchadenkarteAnFahrzeug` mappt `23505` (das 1:1-partial-unique) auf die freundliche Meldung; (2) `resolveSchadenkarteToFahrzeug` liefert null bei unbekanntem Token. (Analog `src/lib/flotte/mutate-flotte.test.ts`.)
- [ ] **Step 2: Run -> FAIL.**
- [ ] **Step 3: Implement** — READ `src/app/admin/werkstaetten/qr-pool-actions.ts` (mint/assign-Muster: batch insert mit Retry, assign mit optimistic guard) und `src/lib/flotte/konto-firma.ts` (AnyDb-Muster). `mintSchadenkarten` nutzt `generateSchadenkarteToken` je Zeile. Kein Hash (Plaintext-Token).
- [ ] **Step 4: Run -> PASS** + `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck`.
- [ ] **Step 5: Commit** `git commit -m "feat(schadenkarte): service (mint/binde/resolve, AnyDb, mirror qr-pool-actions)"`

---

## Task 4: Binden im /flotte-Portal + QR

**Files:** Create `src/components/flotte/SchadenkarteScanner.tsx`, `src/app/flotte/(shell)/flotte/schadenkarte-actions.ts`; Modify `src/app/flotte/(shell)/flotte/page.tsx`
**Consumes:** Task 2/3, `generateQrCodeSvg` (`src/lib/kanzlei/qr-code.ts`), `QrCodeDownloadButtons` (`@/components/shared/QrCodeDownloadButtons`), `buildQrGridPdf` (`src/lib/werkstatt/flyer/build-qr-grid.ts`), `PoolQrScanner` (`src/components/werkstatt/PoolQrScanner.tsx`), `getFlottenmanagerFirma`.

- [ ] **Step 1: `SchadenkarteScanner.tsx`** — fork `PoolQrScanner` (READ it) 1:1, nur `extractQrPoolToken` -> `extractSchadenkarteToken`. Props `{ onToken: (token: string) => void; disabled?: boolean }`. Camera-QR + Manual (kein NFC — NFC-Tap oeffnet die URL selbst, Layer 2).
- [ ] **Step 2: `schadenkarte-actions.ts`** (`'use server'`):
```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { bindeSchadenkarteAnFahrzeug, mintSchadenkarten } from '@/lib/schadenkarte/schadenkarte'

export async function bindeKarte(token: string, fahrzeugId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient()
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto.' }
  const res = await bindeSchadenkarteAnFahrzeug(db, { token, fahrzeugId, firmaId: firma.id, userId: user.id })
  if (res.ok) revalidatePath('/flotte/flotte')
  return res
}
```
(Mint bleibt admin/staff — hier nur der flottenmanager-Bind. Eine minimale Admin-mint-Action kommt mit der Vertrieb-Integration/386b3bd8; fuer P2 reicht bind.)
- [ ] **Step 3: `page.tsx`** — nach `<FlotteClient>` eine `<SchadenkarteBindenSection flotte={flotte} onBinde={bindeKarte} />` (neue Client-Component im selben File-Ordner ODER inline): pro Fahrzeug „Karte binden" -> Modal mit `<SchadenkarteScanner onToken={t => bindeKarte(t, fz.flottenId... vehicleId)} />`. Keine FlotteClient-Prop-Aenderung.
- [ ] **Step 4: QR-Anzeige** — im Fahrzeug-Detail (Task 5) den QR via `generateQrCodeSvg('https://claimondo.de/schaden/' + token)` (server) + `<QrCodeDownloadButtons qrSvg={svg} fileBaseName={'karte-' + token} />` (client).
- [ ] **Step 5: Build** `npm run build` grün + tsc + Ratchets (component-set/token-audit) 0-neu.
- [ ] **Step 6: Commit** `git commit -m "feat(schadenkarte): Binden im /flotte-Portal (Scanner + bind-action + QR-Download)"`

---

## Task 5: Fahrzeug-Detail + Karte-Identify (`/flotte/karten`)

**Files:** Create `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx`, `src/app/flotte/(shell)/karten/page.tsx` + `KartenClient.tsx`; Modify `src/components/flotte/FlotteManagerShell.tsx`
**Consumes:** Task 3 `resolveSchadenkarteToFahrzeug`, `getKundeFlotte`, `SchadenkarteScanner`.

- [ ] **Step 1: `fahrzeug/[id]/page.tsx`** — `requirePortalAccess(['flottenmanager'])`; Fahrzeug (via `flotten_fahrzeuge`+vehicles, firma-gescoped über `getFlottenmanagerFirma`) laden; Stammdaten (Kennzeichen/Marke/Modell) + Karten-Status (`schadenkarten WHERE fahrzeug_id`) rendern. **Skeleton** — die Claim-Übersicht + Mini-Aktionen kommen in P5. `@/components/shared/SectionCard`.
- [ ] **Step 2: `karten/page.tsx` + `KartenClient.tsx`** — `KartenClient` rendert `<SchadenkarteScanner onToken={onIdentify} />`; `onIdentify` ruft eine Server-Action `identifiziereKarte(token)` -> `resolveSchadenkarteToFahrzeug` (firma-gescoped) -> bei Treffer `router.push('/flotte/fahrzeug/' + fahrzeugId)`, sonst Fehlertext „Karte gehört zu keinem Ihrer Fahrzeuge." Darunter Liste aller Karten der firma (`getKartenFuerFirma`) mit Status.
- [ ] **Step 3: Nav** — in `FlotteManagerShell.tsx` `FLOTTE_NAV_ITEMS` ergänzen: `{ href: '/flotte/karten', label: 'Karten' }`.
- [ ] **Step 4: Build** grün + Ratchets (redirect-stubs/component-set/knip) 0-neu.
- [ ] **Step 5: Commit** `git commit -m "feat(schadenkarte): Fahrzeug-Detail-Skeleton + Karte-Identify (/flotte/karten Scanner-Reverse-Lookup)"`

---

## Self-Review

- **Spec-Coverage:** Karte-Entity 1:1 (Task1) · Token/QR (Task2/4) · Binden im Portal (Task4) · Karte-Identify Reverse-Lookup (Task5) · Batch-Druck (buildQrGridPdf, Task4). **Deferred (bewusst):** Admin/Vertrieb-Zuweisung (-> 386b3bd8), Fahrzeug-Detail-Claim-Übersicht + Mini-Aktionen (-> P5), `/schaden/[token]`-Route (-> Layer 2).
- **Spec §4.2-Korrektur:** Token ist **Plaintext** (`karten_token` UNIQUE), NICHT gehasht — spiegelt das werkstatt_qr_pool-Muster (Token ist auf Karte/QR ohnehin sichtbar; kein Secret). Der frühere `karten_token_hash`/`_prefix`-Entwurf entfällt. Brute-Force-Schutz = 16-Zeichen-Entropie + Rate-Limit auf `/schaden/[token]` (Layer 2).
- **Types-Lag:** alle `schadenkarten`-Zugriffe via AnyDb-Service (Task 3). Keine typed-client-`.from('schadenkarten')`.
- **Placeholder:** `<V>` = getrackte Migration-Version (Regel 2).

## Nächste Pläne (nicht dieser)
- **P5:** flottenmanager Claim-Mgmt (Fahrzeug-Detail-Claim-Übersicht via `leads WHERE vehicle_id`/claims, Mini-Aktionen, Claim-Detail-Link).
- **Layer 2 (P3/P4):** `/schaden/[token]`-Route (Gegner-Flow) + Claim-Erzeugung via `createLead`/`convertLeadToClaim`.
