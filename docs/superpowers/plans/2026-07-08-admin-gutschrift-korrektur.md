# Admin-Gutschrift-Korrektur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Admin kann eine ausgestellte Partner-Gutschrift korrigieren (recompute-reissue: Storno + korrigierte Neuausstellung), mit optionalem manuellen Override von netto/ust_satz.

**Architecture:** Neuer Orchestrierungs-Baustein `korrigierePartnerGutschrift` (Storno via `erstelleStornoGutschrift` → recompute/override → Reissue via `erstellePartnerGutschrift`, pre-validate + Kompensations-Revert). Ein partieller Unique-Index wird relaxt (`WHERE typ='gutschrift' AND status <> 'storniert'`), damit die korrigierte Neu-Original neben der stornierten Alt-Original koexistiert. Weil ein Ledger dann **mehrere** `typ='gutschrift'`-Zeilen haben kann (1 aktive + N stornierte), werden alle Gutschrift-Reader **aktiv-/ID-bewusst** gemacht.

**Tech Stack:** Next.js 15, TypeScript, Supabase (Postgres/RLS), vitest, react-pdf (bestehend).

## Global Constraints

- **DDL nur via `mcp__plugin_supabase_supabase__apply_migration`** (Regel 2); danach `list_migrations` → File `supabase/migrations/<V>_<name>.sql` == recorded version. `execute_sql` nur READ.
- **Nie auf `main` pushen** (Regel 1); Feature-Branch `kitta/gutschrift-korrektur` (off `staging`), PR gegen `staging`.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` (kein throw); `revalidatePath` bei Mutation; `requireAdmin()` als Guard (darf werfen).
- **Money-Beträge:** intern in **Cent** rechnen (`Math.round`), erst beim DB-Insert `/100` (wie `erstellePartnerGutschrift`). Konsistenz-Invariante: `bruttoCent = nettoCent + ustBetragCent`, `ustBetragCent = Math.round(nettoCent * ustSatz / 100)`.
- **DB-Spalten** (verifiziert): `partner_gutschriften` = `gutschrift_nr`, `betrag_netto`, `ust_satz`, `ust_betrag`, `betrag_brutto`, `empfaenger_snapshot`, `aussteller_snapshot`, `leistung_text`, `leistung_datum`, `typ`('gutschrift'|'storno'), `status`('erstellt'|'versendet'|'storniert'), `bezug_gutschrift_id`, `storno_grund`, `pdf_storage_path`, `ledger_tabelle`, `ledger_id`, `partner_typ`, `partner_id`, `erstellt_am`.
- **Umlaute** in nutzersichtbaren Strings (Modal, Toasts, PDF): echte `ä/ö/ü/ß`.
- **7-Punkte-Audit** in jeder Commit-Message; `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Shared-Lane:** `partner-gutschrift.ts`, `provision-status.ts`, `partner-billing-actions.ts`, `partner-billing.ts`, `PartnerBillingPanel.tsx`, `PartnerGutschriftenListe.tsx` werden von anderen Finanz-Sessions angefasst — Branch vor Merge aktuell halten; neuen Kern in eigenem File.

---

### Task 1: DDL — partiellen Unique-Index relaxen

**Files:**
- Migration via `apply_migration`, dann File: `supabase/migrations/<recorded>_partner_gutschriften_ledger_original_relax.sql`

**Interfaces:**
- Produces: Index `partner_gutschriften_ledger_original_uniq` erlaubt jetzt 1 aktive Original + N stornierte je Ledger.

- [ ] **Step 1: DDL anwenden** (Controller-Job, nicht Subagent — MCP). `apply_migration({ name: 'partner_gutschriften_ledger_original_relax', query: ... })`:
```sql
DROP INDEX IF EXISTS public.partner_gutschriften_ledger_original_uniq;
CREATE UNIQUE INDEX partner_gutschriften_ledger_original_uniq
  ON public.partner_gutschriften (ledger_tabelle, ledger_id)
  WHERE typ = 'gutschrift' AND status <> 'storniert';
```
- [ ] **Step 2: Verify** via `execute_sql` (READ): `SELECT indexdef FROM pg_indexes WHERE indexname='partner_gutschriften_ledger_original_uniq'` → enthält `status <> 'storniert'`.
- [ ] **Step 3:** `list_migrations` → recorded Version ablesen → Migration-File exakt danach benennen + committen (Regel 2).

**Hinweis:** Prod hat aktuell 0 Gutschriften → Drop/Create ohne Datenkonflikt.

---

### Task 2: `computeKorrekturBetraege` — pure Money-Helper

**Files:**
- Create: `src/lib/finance/partner-gutschrift-korrektur.ts` (nur diese pure Funktion in diesem Task)
- Test: `src/lib/finance/partner-gutschrift-korrektur.test.ts`

**Interfaces:**
- Consumes: `computeProvisionUst(nettoEur: number, istKleinunternehmer: boolean|null) => { ustSatz, ustBetrag, brutto, bekannt }` aus `./partner-billing-ust`.
- Produces:
```typescript
export type KorrekturBetraege = { nettoCent: number; ustSatz: number | null; ustBetragCent: number | null; bruttoCent: number }
export function computeKorrekturBetraege(input: {
  currentNettoEur: number
  istKleinunternehmer: boolean | null
  override?: { nettoCent?: number; ustSatz?: number }
}): { ok: true; betraege: KorrekturBetraege } | { ok: false; error: string }
```

- [ ] **Step 1: Failing tests** (`partner-gutschrift-korrektur.test.ts`):
```typescript
import { describe, it, expect } from 'vitest'
import { computeKorrekturBetraege } from './partner-gutschrift-korrektur'

describe('computeKorrekturBetraege', () => {
  it('recompute default (regelbesteuert 19%)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 19, ustBetragCent: 1900, bruttoCent: 11900 } })
  })
  it('recompute default (Kleinunternehmer §19 -> 0%)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: true })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 0, ustBetragCent: 0, bruttoCent: 10000 } })
  })
  it('blockt wenn USt-Status unbekannt und kein ust_satz-Override', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: null })
    expect(r.ok).toBe(false)
  })
  it('Override netto -> USt neu abgeleitet', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: false, override: { nettoCent: 20000 } })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 20000, ustSatz: 19, ustBetragCent: 3800, bruttoCent: 23800 } })
  })
  it('Override ust_satz gewinnt (auch wenn Status unbekannt)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 100, istKleinunternehmer: null, override: { ustSatz: 7 } })
    expect(r).toEqual({ ok: true, betraege: { nettoCent: 10000, ustSatz: 7, ustBetragCent: 700, bruttoCent: 10700 } })
  })
  it('Rundung: netto 33,33 * 19% = 6,33 (round half)', () => {
    const r = computeKorrekturBetraege({ currentNettoEur: 33.33, istKleinunternehmer: false })
    expect(r.ok && r.betraege).toEqual({ nettoCent: 3333, ustSatz: 19, ustBetragCent: 633, bruttoCent: 3966 })
  })
})
```
- [ ] **Step 2:** Tests laufen → FAIL (Funktion fehlt).
- [ ] **Step 3: Implementieren:**
```typescript
import { computeProvisionUst } from './partner-billing-ust'

export type KorrekturBetraege = { nettoCent: number; ustSatz: number | null; ustBetragCent: number | null; bruttoCent: number }

export function computeKorrekturBetraege(input: {
  currentNettoEur: number
  istKleinunternehmer: boolean | null
  override?: { nettoCent?: number; ustSatz?: number }
}): { ok: true; betraege: KorrekturBetraege } | { ok: false; error: string } {
  const def = computeProvisionUst(input.currentNettoEur, input.istKleinunternehmer)
  const nettoCent = input.override?.nettoCent ?? Math.round(input.currentNettoEur * 100)
  if (!Number.isFinite(nettoCent) || nettoCent < 0) return { ok: false, error: 'Ungültiger Netto-Betrag' }
  const ustSatz = input.override?.ustSatz ?? def.ustSatz
  if (ustSatz === null || ustSatz === undefined) {
    return { ok: false, error: 'USt-Status des Partners unbekannt — Steuerdaten erfassen oder USt-Satz manuell setzen.' }
  }
  const ustBetragCent = Math.round((nettoCent * ustSatz) / 100)
  const bruttoCent = nettoCent + ustBetragCent
  return { ok: true, betraege: { nettoCent, ustSatz, ustBetragCent, bruttoCent } }
}
```
- [ ] **Step 4:** Tests → PASS. **Step 5:** Commit.

---

### Task 3: `korrigierePartnerGutschrift` — Orchestrierungs-Baustein

**Files:**
- Modify: `src/lib/finance/partner-gutschrift-korrektur.ts` (Funktion ergänzen)
- Test: `src/lib/finance/partner-gutschrift-korrektur.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `erstelleStornoGutschrift(db, origId, grund)`, `erstellePartnerGutschrift(db, p)` aus `./partner-gutschrift`; `computeKorrekturBetraege` (Task 2); `generateAndUploadPartnerGutschriftPdf`, `versendePartnerGutschrift` (bestehende Imports wie in `provision-status.ts`); die `META`-Map + `ProvisionTabelle`-Typ aus `provision-status.ts` (exportieren falls nötig — **prüfen, ob `META` schon exportiert ist**; wenn nicht, minimalen Reader-Helper `resolveLedgerFuerKorrektur` in `provision-status.ts` exportieren, der `{ nettoEur, partnerId, partnerTyp, istKleinunternehmer, leistungsDatum, leistungText }` liefert — spiegelt `auszahlenProvision` Step 1+ Z. 198-240).
- Produces:
```typescript
export async function korrigierePartnerGutschrift(
  db: SupabaseClient<any>,
  ledgerTabelle: string,
  ledgerId: string,
  grund: string,
  override?: { nettoCent?: number; ustSatz?: number },
): Promise<{ ok: true; stornoNummer: string; korrekturNummer: string } | { ok: false; error: string }>
```

**Flow (Reihenfolge sicherheitskritisch — mirror `provision-status.ts:105-361`):**
1. Aktive Original finden: `partner_gutschriften WHERE ledger_tabelle AND ledger_id AND typ='gutschrift' AND status <> 'storniert'` `.maybeSingle()`. Keine → `{ok:false,'Keine aktive Gutschrift zum Korrigieren gefunden'}`. `origStatus = orig.status` merken (für Revert).
2. Ledger-Kontext lesen (`resolveLedgerFuerKorrektur` bzw. inline mirror von `auszahlenProvision` Z. 198-240): `nettoEur`, `partnerId`, `partnerTyp`, `istKleinunternehmer`, `leistungsDatum`, `leistungText`.
3. `computeKorrekturBetraege({ currentNettoEur: nettoEur, istKleinunternehmer, override })` → bei `!ok` **sofort return** (kein Write).
4. **Pre-Validate §14c (vor Storno):** Partner-Steuerdaten lesen (mirror `erstellePartnerGutschrift` Z. 227-269): `adresseVollstaendig = strasse&&plz&&ort`, `ustDatenOk = ist_kleinunternehmer===true || !!ust_id`. Unvollständig → `{ok:false,'Empfänger-Steuerdaten unvollständig — Gutschrift nicht korrigierbar'}` (kein Write).
5. **Storno** `erstelleStornoGutschrift(db, orig.id, grund)`. `!ok` → `{ok:false, error}`.
6. **Reissue** `erstellePartnerGutschrift(db, { tabelle: ledgerTabelle, ledgerId, partnerTyp, partnerId, betraege: { nettoCent, ustSatz, ustBetrag: ustBetragCent, bruttoCent }, leistungText, leistungsDatum })`.
   - `!ok` → **Kompensations-Revert:** Storno-Zeile löschen (`delete().eq('id', stornoId)`) + Original zurück (`update({status: origStatus}).eq('id', orig.id)`); `{ok:false, error: 'Korrektur fehlgeschlagen: '+error}` + `console.error`.
7. **PDFs (non-fatal, mirror `provision-status.ts:139-174` für Storno + `:322-346` für Korrektur):** Storno-Row nachladen → `generateAndUploadPartnerGutschriftPdf({...storno-Felder, storno:{bezugNummer: orig.gutschrift_nr, bezugDatum, grund}})` → `pdf_storage_path` patchen → `versendePartnerGutschrift`. Analog Korrektur-Row (ohne `storno`-Param). Beide in `try/catch` (non-fatal, `console.error`).
8. `{ ok: true, stornoNummer: storno.nummer, korrekturNummer: reissue.nummer }`.

- [ ] **Step 1: Failing tests** (fakeDb wie in `provision-status.test.ts` / `partner-gutschrift.test.ts` — chainbarer Query-Builder). Fälle:
  - Happy: aktive Original vorhanden, Steuerdaten vollständig → Storno-Zeile (negiert) + neue aktive Original mit Override-Beträgen; return `{ok:true, stornoNummer, korrekturNummer}`.
  - „Keine aktive Gutschrift" → `{ok:false}`, kein Write.
  - Pre-Validate blockt bei unvollständiger Adresse → `{ok:false}`, **kein Storno** (assert: kein update auf Original-status).
  - Reissue-Fehler → Kompensation: Storno-Zeile gelöscht + Original-status restauriert; `{ok:false}`.
  - Override greift durch (nettoCent/ustSatz landen im Reissue-Insert).
- [ ] **Step 2:** FAIL. **Step 3:** Implementieren (Flow oben). **Step 4:** PASS. **Step 5:** Commit.

---

### Task 4: Gutschrift-Reader aktiv-/ID-bewusst machen (Reader-Hardening)

**Kontext:** Nach dem Index-Relax hat ein Ledger evtl. **mehrere** `typ='gutschrift'`-Zeilen (1 aktive + N stornierte). Reader, die „die Gutschrift je Ledger" per `(ledger,typ)` lesen, brechen.

**Files:**
- Modify: `src/lib/finance/provision-status.ts` (`auszahlenProvision` Pre-Check Z. 258-282)
- Modify: `src/lib/finance/partner-billing.ts` (`belegeFuerZeile` → Liste mit IDs) + Typ `LedgerGutschriftDocs`
- Modify: `src/lib/finance/partner-billing-actions.ts` (`getPartnerGutschriftDownloadUrl` → per Gutschrift-ID statt (ledger,typ); `ladePartnerBilling` liefert Belege mit ID)
- Test: die jeweiligen `.test.ts` (`partner-billing.test.ts`, `partner-billing-actions.test.ts`, `provision-status.test.ts`)

**Interfaces:**
- Produces: `belegeFuerZeile(row, docsByLedger)` gibt `Array<{ gutschriftId: string; nr: string; typ: 'gutschrift'|'storno'; status: string; bezugNr?: string }>` (statt `{original, storno}`). Download per `gutschriftId`.

- [ ] **Step 1: `auszahlenProvision` Pre-Check härten.** Aktuell Z. 266-272 `.eq('typ','gutschrift').maybeSingle()` (nimmt an: ≤1). Ändern zu:
  - aktive Original lesen: `.eq('typ','gutschrift').neq('status','storniert').maybeSingle()` → falls vorhanden = `row` (reuse).
  - falls keine aktive: separat prüfen ob eine **stornierte** Original existiert (`.eq('typ','gutschrift').eq('status','storniert').limit(1).maybeSingle()`) → wenn ja: `{ok:false,'…bereits storniert…'}` (Z. 277-282-Semantik erhalten). Sonst `row=null` → erstellen.
  - Test (`provision-status.test.ts`): (a) aktive+stornierte gleichzeitig → reuse aktive; (b) nur stornierte → block; (c) keine → create.
- [ ] **Step 2: Belege-Model → Liste.** `belegeFuerZeile` (in `partner-billing.ts`): statt `{original, storno}` eine flache Liste ALLER `partner_gutschriften` des Ledgers (aus `gutschriftDocsByLedger`), je mit `gutschriftId/nr/typ/status/bezugNr`. `LedgerGutschriftDocs` → `{ belege: Array<{gutschriftId,nr,typ,status,bezugNr?}> }`. `ladePartnerBilling` (`partner-billing-actions.ts`) füllt es aus einem Query aller Gutschriften je Ledger (mit `id`). Tests (`partner-billing.test.ts`): Ledger mit storniertem Original + Storno + korrigiertem Original → 3 Belege, korrekt gelabelt.
- [ ] **Step 3: Download per ID.** `getPartnerGutschriftDownloadUrl` neue Signatur `(gutschriftId: string)` (oder additiv `(quelle, id, typ?, gutschriftId?)` mit Vorrang `gutschriftId`) → lädt Row per `id`, gibt signed URL für `pdf_storage_path`. Consumer (PartnerBillingPanel, PartnerGutschriftenListe) in Task 6 nachziehen. Test (`partner-billing-actions.test.ts`): download by id, unbekannte id → `{ok:false}`.
- [ ] **Step 4:** alle Tests PASS. **Step 5:** Commit.

---

### Task 5: Server-Actions — Vorschau + Ausführung

**Files:**
- Modify: `src/lib/finance/partner-billing-actions.ts` (2 Actions ergänzen)
- Test: `src/lib/finance/partner-billing-actions.test.ts`

**Interfaces:**
- Produces:
```typescript
// Vorschau fuer das Modal: Original-Beleg-Betraege + Recompute-Default.
export async function getKorrekturVorschauAction(ledgerTabelle: string, ledgerId: string): Promise<
  | { ok: true; original: { nettoCent: number; ustSatz: number|null; ustBetragCent: number|null; bruttoCent: number; nr: string }
      recompute: { nettoCent: number; ustSatz: number|null; ustBetragCent: number|null; bruttoCent: number } }
  | { ok: false; error: string }>
// Ausfuehrung.
export async function korrigierePartnerGutschriftAction(
  ledgerTabelle: string, ledgerId: string, grund: string, override?: { nettoCent?: number; ustSatz?: number },
): Promise<{ ok: boolean; error?: string; stornoNummer?: string; korrekturNummer?: string }>
```

- [ ] **Step 1: Failing tests** (mirror bestehende Action-Tests, `requireAdmin` gemockt): Vorschau liefert original+recompute; Ausführung ruft `korrigierePartnerGutschrift` + `revalidatePath('/admin/...')`; Fehler propagiert.
- [ ] **Step 2:** FAIL. **Step 3: Implementieren:** `requireAdmin()`; `createAdminClient()`; Vorschau = aktive Original lesen + `resolveLedgerFuerKorrektur` + `computeKorrekturBetraege` (ohne Override) für recompute; Ausführung = `korrigierePartnerGutschrift(...)` + `revalidatePath` der Admin-Billing-Route (Pfad aus bestehender Action übernehmen). Result-Object-Pattern. **Step 4:** PASS. **Step 5:** Commit.

---

### Task 6: UI — „Korrigieren"-Button + Korrektur-Modal (+ Portal-Belege-Liste)

**Files:**
- Modify: `src/components/shared/finance/PartnerBillingPanel.tsx` (`ZeilenAktionen` + neues Modal)
- Modify: `src/components/.../PartnerGutschriftenListe.tsx` (Portal: Belege-Liste per ID rendern, Task-4-Model)
- (ggf.) Create: `src/components/shared/finance/GutschriftKorrekturModal.tsx`

**Interfaces:**
- Consumes: `getKorrekturVorschauAction`, `korrigierePartnerGutschriftAction`, `getPartnerGutschriftDownloadUrl` (by id), `belegeFuerZeile` (Liste).

- [ ] **Step 1: Belege-Rendering** in `ZeilenAktionen` (`PartnerBillingPanel.tsx:107-141`) auf die neue `belegeFuerZeile`-Liste umstellen: je Beleg ein Download-Button (by `gutschriftId`), Label nach `typ`+`status` („Gutschrift ↓" / „Storno ↓" / „Gutschrift (storniert) ↓"). Portal `PartnerGutschriftenListe` analog.
- [ ] **Step 2: „Korrigieren"-Button** neben Download bei Zeilen mit **aktiver** Original-Gutschrift (`richtung==='auszahlung' && status_norm==='erledigt'` und aktive Original vorhanden). Nur Admin (Panel ist admin-only). Öffnet Modal.
- [ ] **Step 3: `GutschriftKorrekturModal`:** onOpen → `getKorrekturVorschauAction` → zeigt Original-Beträge + vorbelegte editierbare Felder **netto** (€) + **ust_satz** (%) (default = recompute); daraus live abgeleitet **ust_betrag** + **brutto** (read-only); Diff-Hervorhebung Original→Neu; Grund-Pflichtfeld. Wenn Neu==Original → Hinweis „Keine Änderung — nichts zu korrigieren", Bestätigen deaktiviert. Alle Strings mit Umlauten. Komponenten aus `@/components/ui/*` (dialog/input/label) + `primitives.Button`.
- [ ] **Step 4: Absenden:** `korrigierePartnerGutschriftAction(ledgerTabelle, ledgerId, grund, { nettoCent, ustSatz })` → Result-Check → `toast.success`/`toast.error` → Modal schließen (revalidate zieht die neuen Belege).
- [ ] **Step 5: Build-Check** `npx tsc --noEmit` (bzw. `npm run build` — UI/Component-Change). **Step 6:** Commit.

---

## Verifikation / Abschluss

- vitest `src/lib/finance` grün (neue + bestehende Tests).
- `npm run build` grün.
- 4 Ratchets (token-audit / component-set / knip / status-registry) 0 neu.
- **Prod-Smoke (Go-Confirm, nach Deploy):** Test-Makler — Original ausstellen → Steuerdaten „korrigieren" (z.B. Kleinunternehmer togglen) → Korrektur-Modal → bestätigen → Storno-Zeile + neue aktive Original mit korrigierter USt + beide PDFs abrufbar; danach prod pristine zurückbauen (P3-Rezept, Marker).
