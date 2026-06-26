# Werkstatt-KVA Anzeige + Claim-Carry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Den (bereits erfassten) Werkstatt-Kostenvoranschlag-Betrag bei Lead→Claim-Konvertierung auf den Claim snapshotten (B) und in Dispatch-Lead- + Fallakte-Ansicht read-only anzeigen (A), klar getrennt vom SV-Wert.

**Architecture:** Additive claims-Spalte + 2-Zeilen-Carry in `convertLeadToClaim` (analog `werkstatt_id`). Zwei read-only UI-Anzeigen (kein Edit, conditional-render). Liest `leads.kostenvoranschlag_*` (live) bzw. `claims.kostenvoranschlag_*` (neu).

**Tech Stack:** Next.js 16, Supabase (Postgres + Plugin-Migration), TypeScript/React.

## Global Constraints
- DDL nur via Supabase-Plugin `apply_migration` (Regel 2): apply → list_migrations → File==Version → verify.
- KVA-Invariante: `kostenvoranschlag_*` ist Werkstatt-Schätzung — **nie** in `claims.schadens_hoehe_netto`/`gutachten.*`.
- A ist **read-only**, conditional-render (nur wenn Betrag gesetzt). Komponenten aus `primitives`/`shared`; echte Umlaute; Claimondo-/semantische Tokens (kein raw Hex/Status/Accent; `rounded-ios-*`).
- Type-Lag: `kostenvoranschlag_*` fehlt in generierten Types → Record-Cast (`as Record<string, unknown>` beim Insert; `as number | null` beim Read), wie das bestehende `werkstatt_id`-Muster.
- Worktree-Isolation: alle Pfade absolut unter dem Worktree; `git -C "<worktree>"`. Commit-Messages enden mit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + Audit-Block.

---

### Task 1: Migration `claims.kostenvoranschlag_*`
**Files:** Create `supabase/migrations/<V>_werkstatt_kva_claims_snapshot_cols.sql`
- [ ] apply_migration `werkstatt_kva_claims_snapshot_cols`:
```sql
ALTER TABLE public.claims
  ADD COLUMN kostenvoranschlag_netto numeric,
  ADD COLUMN kostenvoranschlag_brutto numeric;
COMMENT ON COLUMN public.claims.kostenvoranschlag_brutto IS
  'Werkstatt-Kostenvoranschlag (Schaetzung, Snapshot vom Lead). NICHT der SV-Gutachten-Wert / schadens_hoehe_netto.';
```
- [ ] `list_migrations` → Version `<V>` ablesen; File `<V>_…sql` committen.
- [ ] `execute_sql` verify: 2 numeric-Spalten auf `claims`.
- [ ] Commit `feat(werkstatt-kva): claims.kostenvoranschlag_netto/brutto (Werkstatt-Snapshot)`.

---

### Task 2: Carry `lead.kostenvoranschlag_*` → `claims.*` in `convertLeadToClaim`
**Files:** Modify `src/lib/leads/convert-lead-to-claim.ts` (nach der `werkstatt_id`-Record-Cast-Zeile, ~L422, vor dem Makler-Block)
- [ ] Einfügen, exakt analog zum bestehenden `werkstatt_id`-Carry:
```ts
  // AAR Werkstatt-KVA: Werkstatt-Kostenvoranschlag (Schaetzung) auf den Claim snapshotten.
  // Eigene Spur, NIE schadens_hoehe_netto/gutachten.* (SV-Wert). Record-Cast (Type-Lag, AGENTS §6).
  ;(claimsInsert as Record<string, unknown>).kostenvoranschlag_netto =
    (lead.kostenvoranschlag_netto as number | null) ?? null
  ;(claimsInsert as Record<string, unknown>).kostenvoranschlag_brutto =
    (lead.kostenvoranschlag_brutto as number | null) ?? null
```
- [ ] `npx tsc --noEmit` → exit 0.
- [ ] Commit `feat(werkstatt-kva): kostenvoranschlag-Snapshot lead->claim im Convert (additiv)`.

---

### Task 3: Dispatch-Lead read-only KVA-Anzeige
**Files:** Modify Dispatch-Lead-Detail (`src/app/dispatch/leads/[id]/page.tsx` + zugehörige Detail-/Form-Komponente; Anzeige-Stelle aus dem Code ablesen — die Lead-Felder werden config-getrieben gerendert, der Override-Punkt ist `src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.tsx`)
- [ ] Lies die Dispatch-Lead-Detail-Komponente + `dispatch-field-overrides.tsx`. Ergänze eine **read-only** Anzeige „**Kostenvoranschlag (Werkstatt):** € {brutto} — Schätzung", **nur** wenn `lead.kostenvoranschlag_brutto != null` (sonst `kostenvoranschlag_netto`). Nutze eine bestehende read-only-Zeilen-/Badge-Darstellung aus der Datei (kein editierbares Config-Feld, kein neues Form-Feld). €-Format de-DE (`new Intl.NumberFormat('de-DE', { style:'currency', currency:'EUR' })`). Lead-Read um `kostenvoranschlag_netto, kostenvoranschlag_brutto` erweitern, falls die Projektion sie nicht lädt.
- [ ] `npx tsc --noEmit` → exit 0.
- [ ] Commit `feat(werkstatt-kva): Werkstatt-KVA-Betrag read-only im Dispatch-Lead-View`.

---

### Task 4: Fallakte `WerkstattKvaSection` (read-only)
**Files:** Create `src/app/faelle/[id]/_stammdaten/WerkstattKvaSection.tsx` (oder dem Section-Muster der Datei folgen); Modify `src/app/faelle/[id]/_stammdaten/UebersichtTab.tsx` (Section einhängen, neben — nicht in — der `KernwerteSection`)
- [ ] Lies `src/app/faelle/[id]/_stammdaten/Sections.tsx` (`KernwerteSection`, ~L322) + `UebersichtTab.tsx` (~L44) um das Section-Muster (Props, wie der Claim/Daten reinkommen) zu verstehen. Baue eine **read-only** `WerkstattKvaSection`: Label „**Kostenvoranschlag Werkstatt** (Schätzung, vor SV-Gutachten)" + Betrag (€ de-DE). **Nur sichtbar wenn `claim.kostenvoranschlag_brutto`/`_netto` gesetzt.** Liest `claims.kostenvoranschlag_*` (Record-Cast wegen Type-Lag; den Claim-Read der Übersicht ggf. um die Spalten erweitern). Hänge sie in `UebersichtTab` **direkt über oder unter** der `KernwerteSection` ein. KernwerteSection NICHT ändern.
- [ ] `npx tsc --noEmit` → exit 0.
- [ ] Commit `feat(werkstatt-kva): WerkstattKvaSection in der Fallakte (getrennt vom SV-Wert)`.

---

### Task 5: Gates + PR
- [ ] `npx tsc --noEmit` + `NODE_OPTIONS=--max-old-space-size=8192 npm run build` (exit 0).
- [ ] Ratchets: `npm run check:token-audit` + `npm run check:component-set -- --ratchet` + `npm run check:termin-engine-contract` (keine neuen Verstöße).
- [ ] 7-Punkte-Audit; finaler Whole-Branch-Review (opus); Push + PR gegen `staging`.
- [ ] Manuell nach Deploy: Werkstatt-KVA-Lead → Betrag im Dispatch sichtbar; nach Convert `claims.kostenvoranschlag_*` gesetzt + in der Fallakte als „Werkstatt-KVA" sichtbar (getrennt vom Gutachten-Wert).

## Self-Review (gegen Spec)
- Spec-Coverage: B = Task 1 (Spalte) + Task 2 (Carry); A = Task 3 (Dispatch) + Task 4 (Fallakte); Gates/PR = Task 5. ✓
- Invariante: kostenvoranschlag nur in eigene Spur; KernwerteSection/schadens_hoehe/gutachten unberührt. ✓
- Typ-Konsistenz: `kostenvoranschlag_netto/brutto` durchgängig; Record-Cast-Muster wie `werkstatt_id`. ✓
