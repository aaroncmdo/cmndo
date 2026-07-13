# Firmen-Flotte Layer 2 · Slice 1 — Fahrzeug-Detail-Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Die Fahrzeug-Detailview (`/flotte/fahrzeug/[id]`) vom Stammdaten-Skeleton zum **Hub** ausbauen: Schäden-Liste (claims + Draft-Leads) + Mini-Aktionen + read-only Claim-Detail; dazu Mini-Aktionen/Links pro Fahrzeug in der Flotten-Liste.

**Architecture:** Alle Reads server-seitig via `createAdminClient()` (service-role) + **explizites firma-scoping** (Muster aus Layer 0/1 — `getFlottenmanagerFirma`). KEINE neue Claims-RLS nötig (der flottenmanager sieht nur claims/leads, deren `vehicle_id` in der Flotte SEINER Firma liegt; das prüft der Loader in Code). Status-Labels aus der Registry `@/lib/status`.

**Tech Stack:** Next 15 RSC, Supabase service-role, `@/components/shared/*` + `@/components/primitives/*`, `@/lib/status` (StatusBadge domain=`claims-status`).

## Global Constraints
- NIE auf main pushen; Branch `kitta/firmen-flotte-layer2` (off staging), PR gegen staging.
- Server-Reads: `createAdminClient() as AnyDb`; **jede** claim/lead-Query firma-scoped (vehicle_id ∈ Flotte der aufgelösten firma). Firma IMMER server-seitig aus `getFlottenmanagerFirma(db, user.id)` — nie aus Client-Input.
- `requirePortalAccess(['flottenmanager'])` gated jede /flotte-Route.
- Frontend-Strings echte Umlaute (ä/ö/ü/ß). Kein Inline-Status-Farb-Ternary (Registry nutzen). Komponenten aus shared/primitives. Kein Redirect-Stub (jede page.tsx hat Content-return).
- Kein Edit an aar-956-Territorium (`src/app/flow/*`, `melde-schaden`, `src/lib/leads/*` Signaturen nur lesen/reusen).
- tsc: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck`. Ratchets 0-neu. 7-Punkte-Audit je Commit + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure
- **Create** `src/lib/flotte/fahrzeug-schaeden.ts` — Loader + Typen (ClaimMini, DraftMini, FahrzeugSchaeden).
- **Create** `src/lib/flotte/fahrzeug-schaeden.test.ts` — Unit-Tests (firma-scoping, mapping, draft-filter).
- **Create** `src/components/flotte/FahrzeugSchaedenSection.tsx` — Schäden-Liste (Server-Component-tauglich; StatusBadge + Links).
- **Modify** `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx` — Section einhängen + Mini-Aktionen.
- **Modify** `src/components/flotte/FlotteClient.tsx` — Fahrzeug-Zeile verlinkt auf Detail + „Details"-Affordance.
- **Create** `src/lib/flotte/flotten-claim-detail.ts` — firma-gated read-only Claim-Detail-Loader (+ Test).
- **Create** `src/app/flotte/(shell)/fahrzeug/[id]/schaden/[claimId]/page.tsx` — read-only Claim-Detail-View.

---

### Task 1: Loader `getFahrzeugSchaeden`

**Files:** Create `src/lib/flotte/fahrzeug-schaeden.ts`, Test `src/lib/flotte/fahrzeug-schaeden.test.ts`.

**Interfaces — Produces:**
```typescript
export type ClaimMini = {
  claimId: string
  claimNummer: string | null
  status: string | null            // domain 'claims-status'
  schadentag: string | null        // ISO date
  schadensHoeheNetto: number | null
  createdAt: string | null
}
export type DraftMini = {
  leadId: string
  status: string | null            // domain 'lead-workflow'
  createdAt: string | null
}
export type FahrzeugSchaeden = { claims: ClaimMini[]; drafts: DraftMini[] }

export async function getFahrzeugSchaeden(
  db: AnyDb, firmaId: string, vehicleId: string,
): Promise<FahrzeugSchaeden>
```

**Consumes:** `AnyDb` (`@/lib/supabase/admin`-Client-Typ, wie in `fahrzeug-schaeden` sibling-Files — nutze denselben `type AnyDb = SupabaseClient<any,any,any>` wie `src/lib/schadenkarte/schadenkarte.ts`).

- [ ] **Step 1 — Failing test:** firma-scoping gate. Schreibe Test: `getFahrzeugSchaeden` gibt `{claims:[],drafts:[]}` zurück, wenn `vehicleId` NICHT in `flotten_fahrzeuge` der `firmaId` liegt (Mock: `flotten_fahrzeuge`-Query liefert `[]`). Mock `db` als Fake mit `.from().select().eq()...` — spiegele das Mock-Muster aus `src/lib/schadenkarte/schadenkarte.test.ts`.
- [ ] **Step 2 — Run:** `npx vitest run src/lib/flotte/fahrzeug-schaeden` → FAIL (fn undefined).
- [ ] **Step 3 — Implement:**
  1. **Ownership-Gate:** `select id from flotten_fahrzeuge where firma_id=firmaId and vehicle_id=vehicleId` → wenn keine Zeile: return leer (das Fahrzeug gehört nicht zur Firma → keine Daten leaken).
  2. **Claims:** `db.from('claims').select('id,claim_nummer,status,schadentag,schadens_hoehe_netto,created_at').eq('vehicle_id', vehicleId).order('created_at',{ascending:false})` → map auf `ClaimMini`.
  3. **Drafts:** `db.from('leads').select('id,status,created_at').eq('vehicle_id', vehicleId).in('status', ['neu','rueckruf','quali-offen','flow-gesendet']).order('created_at',{ascending:false})` → map auf `DraftMini`. (Nur „noch nicht umgewandelt/verworfen" = aktive Drafts = „Schaden in Bearbeitung".)
  Result-Objekt-frei (reiner Loader; wirft nicht — bei query-error `console.error` + leeres Array für den Teil).
- [ ] **Step 4 — Tests:** ergänze Tests: (a) claims werden gemappt + sortiert; (b) drafts-Filter schließt `umgewandelt`/`disqualifiziert`/`kalt` aus; (c) vehicle-nicht-in-firma → leer. `npx vitest run src/lib/flotte/fahrzeug-schaeden` → PASS.
- [ ] **Step 5 — Commit:** `feat(flotte-l2): getFahrzeugSchaeden loader (firma-scoped claims+drafts)`.

---

### Task 2: `FahrzeugSchaedenSection` Komponente

**Files:** Create `src/components/flotte/FahrzeugSchaedenSection.tsx`.

**Consumes:** `FahrzeugSchaeden` (Task 1). **Produces:** `<FahrzeugSchaedenSection schaeden={FahrzeugSchaeden} vehicleId={string} />` (Server-Component — keine `'use client'`, rein darstellend).

- [ ] **Step 1 — Implement:** `SectionCard title="Schäden"`:
  - Wenn `claims.length===0 && drafts.length===0`: `<EmptyState>` („Noch keine Schäden für dieses Fahrzeug erfasst.").
  - **Drafts zuerst** (falls vorhanden): je Draft eine Zeile mit `<StatusBadge domain="lead-workflow" code={d.status} />` + „In Bearbeitung" + Datum (`formatDatum`). Kein Detail-Link (Draft = noch kein Claim).
  - **Claims:** je claim eine Zeile: `<StatusBadge domain="claims-status" code={c.status} role="flottenmanager" />` + `claimNummer ?? '—'` + schadentag (`formatDatum`) + Betrag (falls `schadensHoeheNetto` gesetzt, `toLocaleString('de-DE',{style:'currency',currency:'EUR'})`). Ganze Zeile ist ein `<Link href={`/flotte/fahrzeug/${vehicleId}/schaden/${c.claimId}`}>` (→ Task 5).
  - Umlaute korrekt; Datum-Helper lokal (wie `formatDatum` in `fahrzeug/[id]/page.tsx`, ggf. dorthin/`@/lib/format` extrahieren wenn schon vorhanden — sonst lokal).
- [ ] **Step 2 — Verify:** tsc clean (`NODE_OPTIONS=… npx tsc --noEmit --skipLibCheck`). check:component-set + check:status-registry + check:token-audit 0-neu.
- [ ] **Step 3 — Commit:** `feat(flotte-l2): FahrzeugSchaedenSection (claims+drafts, StatusBadge)`.

---

### Task 3: Section in Fahrzeug-Detail einhängen + Mini-Aktionen

**Files:** Modify `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx`.

**Consumes:** `getFahrzeugSchaeden` (T1), `FahrzeugSchaedenSection` (T2). Bestehende Loads (firma, flotte, karte) bleiben.

- [ ] **Step 1 — Implement:** nach den bestehenden Loads: `const schaeden = await getFahrzeugSchaeden(db, firma.id, id)`. Rendern: **nach** der Stammdaten-Card, **vor** oder **nach** der Schadenkarte-Card: `<FahrzeugSchaedenSection schaeden={schaeden} vehicleId={id} />`. Zusätzlich eine **Mini-Aktionen-Zeile** (oben, unter dem Header): `primitives/Button`-Row — „Karte identifizieren" (`<Link href="/flotte/karten">`) + „Schaden melden" (vorerst `disabled` mit Titel „kommt in Slice 2" ODER Link auf `#` — NICHT bauen, Gegner/Direkt-Flow ist Slice 2). Umlaute.
- [ ] **Step 2 — Verify:** `npm run build` grün (Route-Change → voller Build Pflicht). Redirect-Stub-Check 0-neu (Content-return bleibt).
- [ ] **Step 3 — Commit:** `feat(flotte-l2): Fahrzeug-Detail zeigt Schäden-Liste + Mini-Aktionen`.

---

### Task 4: Flotten-Liste — Fahrzeug-Zeilen verlinken

**Files:** Modify `src/components/flotte/FlotteClient.tsx`.

- [ ] **Step 1 — Implement:** Jede Fahrzeug-`<li>` (Zeilen ~103–130): den Info-Block (Kennzeichen + Hersteller/Modell) in einen `<Link href={`/flotte/fahrzeug/${v.vehicleId}`} className="min-w-0 flex-1 …hover…">` wickeln (statt reiner `<div>`). Der bestehende Entfernen-Button (`handleEntferne`) bleibt daneben, **außerhalb** des Links (kein verschachteltes Klick-Target). Optional dezenter Chevron/„Details"-Hinweis. `FlotteClient` bleibt `'use client'`; `next/link` import.
- [ ] **Step 2 — Verify:** tsc + component-set 0-neu; `npm run build` grün. Manuell: Klick auf Zeile → /flotte/fahrzeug/[id]; Entfernen-Button feuert NICHT den Link (stopPropagation falls nötig).
- [ ] **Step 3 — Commit:** `feat(flotte-l2): Flotten-Liste verlinkt Fahrzeug-Detail`.

---

### Task 5: Read-only Claim-Detail für flottenmanager (firma-gated)

**Files:** Create `src/lib/flotte/flotten-claim-detail.ts` (+ Test), Create `src/app/flotte/(shell)/fahrzeug/[id]/schaden/[claimId]/page.tsx`.

**Produces:**
```typescript
export type FlottenClaimDetail = {
  claimId: string; claimNummer: string | null; status: string | null
  schadentag: string | null; schadensHoeheNetto: number | null
  hergangKundeText: string | null           // was am Fahrzeug/Fahrer erfasst wurde
  kennzeichen: string | null; hersteller: string | null; modell: string | null
}
export async function getFlottenClaimDetail(
  db: AnyDb, firmaId: string, vehicleId: string, claimId: string,
): Promise<FlottenClaimDetail | null>   // null wenn claim nicht zur firma/zum Fahrzeug gehört
```

- [ ] **Step 1 — Failing test:** `getFlottenClaimDetail` gibt `null`, wenn der claim `vehicle_id !== vehicleId` ODER das Fahrzeug nicht in der Flotte der firma ist (Sicherheits-Gate). Mock-Muster wie Task 1.
- [ ] **Step 2 — Run:** vitest → FAIL.
- [ ] **Step 3 — Implement:** (1) Ownership-Gate wie T1 (vehicle ∈ firma). (2) `db.from('claims').select('id,claim_nummer,status,schadentag,schadens_hoehe_netto,hergang_kunde_text,vehicle_id').eq('id',claimId).maybeSingle()`; wenn `claim.vehicle_id !== vehicleId` → `null` (verhindert Cross-Fahrzeug-Leak). (3) vehicle-Stammdaten aus `getKundeFlotte`-Row oder direkt `vehicles`. Map → `FlottenClaimDetail`. **Nur read-only**, keine Mutationen. (Kein `hergang_gegner_text`/`unfallberichte` hier — die kommen erst mit Slice 2; nur bestehende Felder lesen.)
- [ ] **Step 4 — Page:** `schaden/[claimId]/page.tsx`: `requirePortalAccess(['flottenmanager'])` + firma + `getFlottenClaimDetail(db, firma.id, params.id, params.claimId)`; wenn `null` → `<ErrorState>`/`<EmptyState>` „Schaden nicht gefunden". Sonst read-only SectionCards: Stammdaten des Schadens (Nummer, `<StatusBadge domain="claims-status">`, schadentag, Betrag) + Hergang (`hergang_kunde_text`). `export const dynamic='force-dynamic'`. `params` ist Promise → `const {id, claimId} = await params`. Content-return (kein Redirect-Stub).
- [ ] **Step 5 — Verify:** vitest PASS; `npm run build` grün; alle Ratchets 0-neu.
- [ ] **Step 6 — Commit:** `feat(flotte-l2): read-only Claim-Detail (firma-gated) via Fahrzeug-Detail`.

---

## Self-Review (nach Schreiben, vor Bau)
- Spec-Coverage: Detail-Hub Schäden-Liste ✓ (§10 „kleine Claim-Übersicht in der Fahrzeug-Detailview"), Claim-Detail erreichbar ✓, Mini-Aktionen pro Fahrzeug ✓ (Flotten-Liste-Link + Detail-Aktionen). Draft-Sichtbarkeit („Schaden in Bearbeitung") ✓ via leads.
- Sicherheit: JEDER Loader firma-gated (vehicle ∈ firma) + claim.vehicle_id-Match → kein Cross-Firma/Cross-Fahrzeug-Leak trotz service-role.
- Kein Claims-RLS-Change → keine 470d55c9-Blockade für Slice 1.
- Bewusst NICHT in Slice 1: „Schaden melden"-Aktion (Gegner/Direkt-Flow = Slice 2), `hergang_gegner_text`/`unfallberichte` (Slice 2), Kasko/Kanzlei-Sicht (Slice 3).

## Deferred → Slice 2 / 3
- Slice 2: `/schaden/[token]` Gegner-Flow, `unfallberichte`, `hergang_gegner_text`, Foto-Slots, claim-first convertLeadToClaim, VS-Meldung, „Schaden melden"-Aktion scharf schalten.
- Slice 3: Kasko-Angebot (`eigene_versicherung_id`), SV-Sicht-Nachzug, Kanzlei-Detail-View.
