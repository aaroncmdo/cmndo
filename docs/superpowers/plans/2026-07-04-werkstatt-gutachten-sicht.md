# SP3 Gutachten-an-Werkstatt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Die Werkstatt sieht (bei fertiggestelltem Gutachten) die reparatur-relevanten OCR-Werte + kann das Gutachten-PDF herunterladen.

**Architecture:** `v_werkstatt_auftrag` additiv um einen minimierten Gutachten-Satz (LATERAL, gated `fertiggestellt_am`). PDF via signed-URL-Server-Action (werkstatt-access-verifiziert). UI-Sektion in `/werkstatt/auftraege`.

**Tech Stack:** Next.js 15, Supabase (SECURITY DEFINER View + Storage signed URLs), TypeScript, vitest.

## Global Constraints

- **Regel 2 (DDL):** View NUR via `apply_migration` → `list_migrations` → File==Version. `execute_sql` READ. **Controller macht Task 1.**
- **Umlaute:** nutzersichtbare Strings echte `ä/ö/ü/ß`.
- **Server-Actions:** Result-Object (`{ ok:true; url } | { ok:false; error }`), kein throw. Keine Konstanten aus `'use server'` exportieren.
- **Komponenten-Set:** `primitives.Button`, `shared/SectionCard`/`StatusBadge` — kein handgerolltes Markup; kein raw Status-Scale.
- **PII/Sicherheit:** `bericht_pdf_url` NICHT an den Client rendern — nur über die signed-URL-Action. View-Gate unverändert (`is_staff() OR is_werkstatt_for_claim`).
- **Additiv:** SP3 erweitert die eigenen SP2-Files (`v_werkstatt_auftrag`, `queries.ts`, `WerkstattAuftraege.tsx`, `auftraege/actions.ts`) rein additiv.
- **7-Punkte-Audit** je Commit.

---

### Task 1: DB — `v_werkstatt_auftrag` +Gutachten (Controller/Plugin)

**Files:** Migration `supabase/migrations/<V>_v_werkstatt_auftrag_gutachten.sql`

**Interfaces:** Produces 8 neue View-Spalten: `gutachten_bericht_pdf_url`, `gutachten_reparaturkosten_netto`, `gutachten_reparaturkosten_brutto`, `gutachten_minderwert`, `gutachten_restwert`, `gutachten_wiederbeschaffungswert`, `gutachten_totalschaden`, `gutachten_fertiggestellt_am`.

- [ ] **Step 1: Aktuelle Definition lesen** — `execute_sql`: `SELECT pg_get_viewdef('public.v_werkstatt_auftrag'::regclass, true);` (enthält die SP2-Reparaturtermin-LATERAL + alle Spalten).
- [ ] **Step 2: `CREATE OR REPLACE VIEW`** — die gelesene Definition 1:1 übernehmen, additiv (a) die 8 SELECT-Spalten und (b) den LATERAL-Join ergänzen:
```sql
-- Neue SELECT-Spalten (nach den SP2-reparatur_*-Spalten):
    gu.bericht_pdf_url AS gutachten_bericht_pdf_url,
    gu.reparaturkosten_netto AS gutachten_reparaturkosten_netto,
    gu.reparaturkosten_brutto AS gutachten_reparaturkosten_brutto,
    gu.minderwert AS gutachten_minderwert,
    gu.restwert AS gutachten_restwert,
    gu.wiederbeschaffungswert AS gutachten_wiederbeschaffungswert,
    gu.totalschaden AS gutachten_totalschaden,
    gu.fertiggestellt_am AS gutachten_fertiggestellt_am
-- Neuer LATERAL-Join (vor der WHERE-Gate-Klausel):
     LEFT JOIN LATERAL ( SELECT g.bericht_pdf_url, g.reparaturkosten_netto, g.reparaturkosten_brutto,
            g.minderwert, g.restwert, g.wiederbeschaffungswert, g.totalschaden, g.fertiggestellt_am
           FROM gutachten g
          WHERE g.claim_id = c.id AND g.fertiggestellt_am IS NOT NULL
          ORDER BY g.fertiggestellt_am DESC
         LIMIT 1) gu ON true
```
Gate (`WHERE ... AND (is_staff() OR is_werkstatt_for_claim(c.id))`) unverändert.
- [ ] **Step 3: Version ablesen + File committen** — `list_migrations` → File `<V>_v_werkstatt_auftrag_gutachten.sql` == Version.
- [ ] **Step 4: Verifizieren (READ)** — `SELECT column_name FROM information_schema.columns WHERE table_name='v_werkstatt_auftrag' AND column_name LIKE 'gutachten_%';` → 8 Spalten. Zusätzlich `SELECT bericht_pdf_url FROM gutachten WHERE bericht_pdf_url IS NOT NULL LIMIT 1;` → **Pfad-vs-URL feststellen** (für Task 2 dokumentieren).

---

### Task 2: Query-Erweiterung + `oeffneGutachtenPdf`-Action

**Files:**
- Modify: `src/lib/werkstatt/queries.ts` (Typ + SELECT additiv; PDF-Pfad NICHT an Client)
- Modify: `src/app/werkstatt/(shell)/auftraege/actions.ts` (neue Action, additiv)
- Test: `src/app/werkstatt/(shell)/auftraege/__tests__/gutachten-pdf.test.ts`

**Interfaces:**
- Consumes: `createClient` (Werkstatt-Session), `createServiceClient` (Gutachten-Read), Storage-signed-URL-Helper (`src/lib/storage/url.ts` bzw. `src/lib/supabase/storage.ts`).
- Produces: `oeffneGutachtenPdf(claimId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>`. `WerkstattAuftrag`-Typ + Query um `gutachten_*` erweitert (OHNE `gutachten_bericht_pdf_url` im Client-Typ — nur `gutachten_fertiggestellt_am` + die Kennzahlen).

**LIES ZUERST** `src/lib/werkstatt/queries.ts` (WerkstattAuftrag-Typ + SELECT), `src/app/werkstatt/(shell)/auftraege/actions.ts` (SP2-Actions-Muster, createServiceClient-Import), `src/lib/storage/url.ts` + `src/lib/supabase/storage.ts` (welche Funktion path→signed-URL macht; Signatur), und (aus dem Task-1-Report) ob `bericht_pdf_url` ein Storage-Pfad oder eine volle URL ist + welcher Bucket.

- [ ] **Step 1: Failing Test** — `gutachten-pdf.test.ts`. Mock `createClient` (v_werkstatt_auftrag-Read → Zeile/keine Zeile), `createServiceClient` (gutachten-Read → bericht_pdf_url), Storage-Helper (signed URL). Kernaussagen:
  - kein Auftrag/kein Access (v-Query leer) → `{ ok:false }`.
  - Auftrag ok, aber kein `bericht_pdf_url` → `{ ok:false }`.
  - Erfolg → `{ ok:true, url:<signed> }`.
  Run → FAIL.

- [ ] **Step 2: Action implementieren** (`'use server'`, additiv):
```ts
export async function oeffneGutachtenPdf(
  claimId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!claimId) return { ok: false, error: 'Kein Auftrag.' }
  const supabase = await createClient()
  // Access-Gate: die Werkstatt sieht den Auftrag nur via RLS-View.
  const { data: auftrag } = await supabase
    .from('v_werkstatt_auftrag').select('claim_id').eq('claim_id', claimId).maybeSingle()
  if (!auftrag) return { ok: false, error: 'Kein Zugriff auf diesen Auftrag.' }
  // Gutachten-PDF-Pfad (Service-Client; Access ist verifiziert).
  const svc = createServiceClient()
  const { data: g } = await svc
    .from('gutachten').select('bericht_pdf_url')
    .eq('claim_id', claimId).not('bericht_pdf_url', 'is', null)
    .order('fertiggestellt_am', { ascending: false }).limit(1).maybeSingle()
  const pfad = (g as { bericht_pdf_url: string | null } | null)?.bericht_pdf_url ?? null
  if (!pfad) return { ok: false, error: 'Kein Gutachten verfügbar.' }
  // Signed URL (Storage-Helper — exakte Funktion/Bucket beim Lesen ermitteln).
  // Falls pfad bereits eine volle URL ist: direkt zurückgeben.
  const url = /* signed-URL-Helper(pfad) bzw. pfad wenn schon URL */
  return { ok: true, url }
}
```
(Storage-Mechanik exakt nach Task-1-Report + storage.ts umsetzen.)

- [ ] **Step 3: queries.ts erweitern** — `WerkstattAuftrag` += `gutachten_fertiggestellt_am: string | null`, `gutachten_reparaturkosten_netto/brutto: number | null`, `gutachten_minderwert/restwert/wiederbeschaffungswert: number | null`, `gutachten_totalschaden: boolean | null`. **`gutachten_bericht_pdf_url` NICHT** in den Client-Typ/SELECT-Ausgabe (bleibt server-only; die Action liest ihn frisch). SELECT additiv um die Kennzahlen + fertiggestellt_am.

- [ ] **Step 4: Test → PASS.** `tsc --noEmit` grün. `npm run build` (8 GB).
- [ ] **Step 5: Commit** (`feat(werkstatt): Gutachten-Werte + PDF-Action fuer Werkstatt (SP3 Task 2)` + Audit).

---

### Task 3: Gutachten-Sektion in `/werkstatt/auftraege`

**Files:** Modify: `src/components/werkstatt/WerkstattAuftraege.tsx`

**Interfaces:** Consumes den erweiterten `WerkstattAuftrag` (Task 2) + `oeffneGutachtenPdf` (Task 2).

**LIES ZUERST** `WerkstattAuftraege.tsx` — die SP2-`ReparaturterminSektion` liegt schon hier (als Muster für eine additive Sektion); der Euro-Formatter + `SectionCard`/`StatusBadge`-Nutzung.

- [ ] **Step 1: Gutachten-Sektion** — je Auftrag, wenn `auftrag.gutachten_fertiggestellt_am` gesetzt:
  - `SectionCard` „Gutachten" (+ „vom {formatBerlin(gutachten_fertiggestellt_am)}").
  - Kennzahlen (Euro-formatiert, bestehenden Formatter nutzen): Reparaturkosten brutto (+ netto), Minderwert, Restwert, Wiederbeschaffungswert. `gutachten_totalschaden===true` → `StatusBadge` „Totalschaden" (warning-Ton, gemappt wie SP2).
  - `primitives.Button` „Gutachten-PDF öffnen" → `useTransition` → `oeffneGutachtenPdf(auftrag.claim_id)`; `if (!res.ok) toast.error(res.error)` sonst `window.open(res.url, '_blank', 'noopener')`.
  - Echte Umlaute; kein raw Status-Scale.

- [ ] **Step 2: `tsc --noEmit` + `npm run build` (8 GB) grün + `check:token-audit` + `check:component-set -- --ratchet` = 0 neue.**
- [ ] **Step 3: Commit** (`feat(werkstatt): Gutachten-Sektion in /werkstatt/auftraege (SP3 Task 3)` + Audit).

---

## Self-Review-Checkliste (nach Bau)

- **Spec-Coverage:** View (T1) · Query+Action (T2) · UI (T3).
- **Sicherheit:** `bericht_pdf_url` nie im Client-Bundle/DOM; Action access-verifiziert (v-View-RLS); signed URL kurze TTL.
- **Typen:** Kennzahlen `number | null`, `totalschaden boolean | null`, `fertiggestellt_am string | null` — Query-Shape == Card-Nutzung.
- **Additiv:** View-Gate + bestehende Spalten unverändert; queries/UI/actions nur ergänzt.
- **Verifikation nach Deploy (READ, Prod):** 8 Spalten; fertiggestelltes Gutachten liefert Werte unter Werkstatt-JWT; PDF-Action liefert ladbare signed URL.
