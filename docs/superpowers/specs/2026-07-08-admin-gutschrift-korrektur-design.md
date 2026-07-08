# Admin-Gutschrift-Korrektur — Design

**Datum:** 2026-07-08
**Status:** Design (Review offen)
**Session:** 457ab612

## 1. Problem / Motivation

Eine ausgestellte Partner-Gutschrift (Self-Billing §14 Abs. 2 UStG) kann falsche Werte enthalten —
am häufigsten **falsche USt**, weil die Partner-Steuerdaten (`ust_id` / `ist_kleinunternehmer`) erst
*nach* Ausstellung korrekt gesetzt wurden, oder ein **falscher Netto-Betrag**, wenn die zugrunde
liegende Provision im Ledger korrigiert wurde.

Der bestehende **Storno** (`erstelleStornoGutschrift`) reicht nicht: er negiert nur den Beleg, aber die
Provision bleibt ausgezahlt — es fehlt danach ein *gültiger* Beleg. Es braucht eine **Korrektur** =
Storno der falschen + Neuausstellung einer korrigierten Gutschrift.

## 2. Ansatz — recompute-reissue mit optionalem Override

Spiegelt das etablierte `reissueAbrechnung`-Muster (`src/lib/abrechnung/reissue-abrechnung.ts`):
alten Beleg stornieren, neuen aus **aktuellen Daten** ausstellen, beide via Rückbezug verknüpfen.

- **Recompute (Default):** Beträge werden neu berechnet aus dem **aktuellen** Ledger-Netto
  (`partner_provisionen.betrag_netto_eur`) + den **aktuellen** Partner-Steuerdaten
  (`ist_kleinunternehmer`) über den vorhandenen Helper `computeProvisionUst(netto, istKleinunternehmer)`.
- **Manuelles Override (Aaron-Entscheidung 08.07.):** Der Admin kann im Korrektur-Modal die beiden
  **Eingabe-Größen** `netto` und `ust_satz` überschreiben. `ust_betrag` und `brutto` werden daraus
  **abgeleitet** (`ust_betrag = round(netto · ust_satz/100)`, `brutto = netto + ust_betrag`) — nie
  frei editierbar. So bleibt `brutto = netto + ust_betrag` **immer konsistent** (kein inkonsistenter
  §14c-Beleg durch Tippfehler).

## 3. Bausteine

**Vorhanden (wiederverwenden):**
- `erstelleStornoGutschrift(db, originalGutschriftId, grund)` — negierter Spiegel + Original→`storniert`
  (`src/lib/finance/partner-gutschrift.ts:130`).
- `computeProvisionUst(nettoEur, istKleinunternehmer)` → `{ustSatz, ustBetrag, brutto, bekannt}`
  (`src/lib/finance/partner-billing-ust.ts`; genutzt in `provision-status.ts:242`).
- `erstellePartnerGutschrift(db, {tabelle, ledgerId, partnerTyp, partnerId, betraege, leistungText, leistungsDatum})`
  — inkl. §14c-Vollständigkeits-Gate (Adresse + `ust_id`-oder-Kleinunternehmer) + Nummern-Allokation
  `CMNDO-GS-YYYY-#####` (`partner-gutschrift.ts:208`).
- `generateAndUploadPartnerGutschriftPdf` + Versand (non-fatal), wie in `provision-status.ts`.

**Neu:**
- `korrigierePartnerGutschrift(db, ledgerTabelle, ledgerId, grund, override?)` — Orchestrierungs-Baustein
  (`src/lib/finance/partner-gutschrift.ts` oder eigenes `partner-gutschrift-korrektur.ts`).
- `korrigierePartnerGutschriftAction(...)` — Server-Action (`partner-billing-actions.ts`), `requireAdmin`.
- Korrektur-Modal in `PartnerBillingPanel.tsx`.

## 4. DDL — Index-Relax (die einzige Schema-Änderung)

Aktuell (`20260707123746_partner_gutschriften_storno.sql:13`):
```sql
CREATE UNIQUE INDEX partner_gutschriften_ledger_original_uniq
  ON partner_gutschriften (ledger_tabelle, ledger_id) WHERE typ = 'gutschrift';
```
Eine stornierte Original-Gutschrift behält `typ='gutschrift'` (nur `status='storniert'`) → der Index
**blockt** eine korrigierte Neuausstellung für denselben Ledger. Relax:
```sql
DROP INDEX partner_gutschriften_ledger_original_uniq;
CREATE UNIQUE INDEX partner_gutschriften_ledger_original_uniq
  ON partner_gutschriften (ledger_tabelle, ledger_id) WHERE typ = 'gutschrift' AND status <> 'storniert';
```
Danach koexistieren stornierte Original + korrigierte Neu-Original (wie reissueAbrechnung alt+neu),
aber es bleibt **max. 1 aktive** Original je Ledger (Idempotenz-Schutz erhalten).

## 5. `korrigierePartnerGutschrift` — Signatur + Flow

```typescript
export async function korrigierePartnerGutschrift(
  db: SupabaseClient<any>,
  ledgerTabelle: string,      // 'partner_provisionen' | 'partner_staffel_bonus' | 'provisionen_maik'
  ledgerId: string,
  grund: string,
  override?: { nettoCent?: number; ustSatz?: number },
): Promise<
  | { ok: true; stornoNummer: string; korrekturNummer: string }
  | { ok: false; error: string }
>
```

**Flow (Reihenfolge ist sicherheitskritisch):**
1. **Aktive Original finden:** `partner_gutschriften WHERE ledger_tabelle AND ledger_id AND typ='gutschrift' AND status <> 'storniert'` `.maybeSingle()`. Keine → `{ok:false, 'keine aktive Gutschrift zum Korrigieren'}`.
2. **Ziel-Beträge bestimmen:** Default aus `computeProvisionUst(aktuellesLedgerNetto, aktuellesIstKleinunternehmer)`; `override.nettoCent`/`override.ustSatz` gewinnen falls gesetzt; `ustBetrag`+`brutto` ableiten.
3. **PRE-VALIDIEREN (vor jedem Write):** Partner-Steuerdaten vollständig (Adresse + `ust_id`-oder-Kleinunternehmer)? Beträge sane (netto ≥ 0, brutto = netto + ustBetrag)? Nein → `{ok:false, error}` **ohne irgendetwas zu ändern** (kein Storno, kein Reissue).
4. **Storno** des Originals (`erstelleStornoGutschrift`) — Original→`storniert` + Storno-Zeile.
5. **Reissue** (`erstellePartnerGutschrift` mit Ziel-Beträgen) → neue aktive Original-Gutschrift.
6. **Kompensation bei Reissue-Fehler:** schlägt Schritt 5 doch fehl (Race o.ä.), **Storno zurückrollen** (Storno-Zeile löschen + Original zurück auf vorherigen `status`) → Ledger hat wieder genau eine gültige Gutschrift; `{ok:false, error}` + laut loggen.
7. **PDF + Versand** für Storno **und** Korrektur (beide non-fatal, wie im Storno-Flow).

**Warum Storno-VOR-Reissue:** der Relax-Index erlaubt nur 1 aktive Original → Reissue-vor-Storno hätte
kurzzeitig 2 aktive → 23505. Also Storno first; die Pre-Validierung (Schritt 3) macht den Reissue-Fehler
in Schritt 5 unwahrscheinlich, die Kompensation (6) fängt den Rest.

**Idempotenz / Retry:** Alle Reads typ-gefiltert (`typ='gutschrift'`, `status <> 'storniert'`). Ein
Retry nach vollständigem Lauf findet die neue Korrektur-Gutschrift als „aktive Original" → recompute
gg. die (jetzt korrekten) Daten ergibt keinen Diff → Modal zeigt „nichts zu korrigieren" (siehe UI).

## 6. UI — Korrektur-Modal im PartnerBillingPanel

- **Einstiegspunkt:** „Korrigieren"-Button in `ZeilenAktionen` (`PartnerBillingPanel.tsx:82`) auf Zeilen
  mit **aktiver** Original-Gutschrift (ausgezahlte/erledigte Provision, `typ='gutschrift'` nicht storniert),
  neben „Gutschrift ↓". Nur Admin (Panel ist admin-only).
- **Modal-Inhalt:**
  - Anzeige: **Original-Beträge** (netto / ust_satz / ust_betrag / brutto) der aktiven Gutschrift.
  - Editierbar (vorbelegt mit Recompute): **netto** + **ust_satz**; daraus live abgeleitet **ust_betrag** + **brutto**.
  - **Diff-Hervorhebung** Original → Neu (welche Felder sich ändern).
  - **Grund**-Pflichtfeld (Freitext).
  - Wenn Neu == Original (kein Override, Recompute deckungsgleich) → Hinweis „Keine Änderung — nichts zu korrigieren", Bestätigen deaktiviert.
- **Absenden:** `korrigierePartnerGutschriftAction(ledgerTabelle, ledgerId, grund, {nettoCent, ustSatz})`
  → Result-Object → Toast + `revalidatePath`. Danach beide Belege (Storno + Korrektur) unter „Belege" abrufbar (bestehende `belegeFuerZeile`-Logik zeigt alle `partner_gutschriften` je Ledger).

## 7. §14 / Audit / Sicherheit

- **Lückenlose Nummernkette:** Storno + Korrektur bekommen je eine fortlaufende `CMNDO-GS`-Nummer.
- **Audit-Trail:** Storno-Zeile via `bezug_gutschrift_id` an Original; Korrektur ist neue Original-Zeile
  (Verknüpfung zum stornierten Vorgänger optional via `storno_grund`-Kontext / gleicher Ledger).
- **Datum-Freeze Europe/Berlin** (wie etabliert, `sv-SE`-Format) für `leistung_datum`.
- **§14c-Gate** bleibt scharf: `erstellePartnerGutschrift` verweigert bei unvollständigen Steuerdaten →
  Pre-Validierung fängt das *vor* dem Storno ab.
- **Money-Path → Go-Confirm-Smoke** nach Deploy (Test-Makler, prod, dann pristine zurückbauen — P3-Rezept).

## 8. Scope / Non-Goals (YAGNI)

- **In Scope:** Korrektur ausgestellter Partner-Gutschriften (makler / werkstatt / marketing / maik-Ledger),
  recompute + Override von netto/ust_satz, Index-Relax, UI-Modal.
- **Non-Goal:** Bearbeiten der abgeleiteten Felder (`ust_betrag`/`brutto`) frei — immer abgeleitet.
- **Non-Goal:** Massen-Korrektur / Batch. Eine Gutschrift je Aktion.
- **Non-Goal:** Provisions-Betrag im Ledger editieren — wer den Netto strukturell ändern will, fixt den
  Ledger; die Korrektur zieht den neuen Netto per Recompute (oder Override) nach.

## 9. Shared-Lane-Koordination

Berührt Finanz-Files, die andere Sessions anfassen (Marker `coordination-partner-payout-gutschrift`):
`src/lib/finance/partner-gutschrift.ts`, `provision-status.ts` (nur ggf. shared Recompute-Helper),
`partner-billing-actions.ts`, `components/shared/finance/PartnerBillingPanel.tsx`. Neuer Kern in
eigenem File (`partner-gutschrift-korrektur.ts`) halten, um Kollision zu minimieren; nur additive
Exports. Vor Merge Branch aktuell halten (Marker-Lehre: nur aktuelle grüne PRs releasen).

## 10. Testing

- **Unit (vitest, `partner-gutschrift-korrektur.test.ts`):** recompute-Default, Override-Ableitung
  (ust_betrag/brutto), Pre-Validierung blockt bei unvollständigen Steuerdaten (kein Storno), Storno+Reissue
  Happy-Path (Nummern, negierte Storno-Zeile, neue aktive Original), Kompensation bei Reissue-Fehler
  (Zustand restauriert), „keine aktive Gutschrift"-Guard, Idempotenz (recompute==Original → Diff leer).
- **Index-Relax:** Migration prod-appliziert + `execute_sql`-Verify (2 Original je Ledger erlaubt, wenn
  1 storniert; 2 aktive weiterhin 23505).
- **Prod-Smoke (Go-Confirm):** Test-Makler, Original ausstellen → Steuerdaten „korrigieren" → Korrektur →
  Storno-Zeile + neue Original mit korrigierter USt + beide PDFs; danach pristine zurückbauen.

## 11. Offene Punkte für Review

1. **Override-Umfang:** nur `netto` + `ust_satz` editierbar (abgeleitete Felder gesperrt) — bestätigt das
   die gewünschte Flexibilität, oder soll `ust_betrag` doch frei setzbar sein (z.B. Kulanz-Rundung)?
2. **Verknüpfung Korrektur→Vorgänger:** reicht „gleicher Ledger + stornierter Vorgänger", oder soll die
   neue Original-Zeile ein explizites `korrigiert_gutschrift_id` bekommen (zusätzliche Spalte)?
3. **Kompensation-Robustheit:** Pre-Validierung + Revert-on-failure ausreichend, oder plpgsql-Transaktion
   gewünscht (atomar, aber dupliziert Nummern-/Snapshot-Logik in SQL)?
