# Payment-Ledger-Normalisierung — Design

**Datum:** 2026-07-07
**Status:** Design freigegeben (Brainstorming), Implementierungsplan folgt (writing-plans)
**Scope:** Claim-native Geldbewegungen (VS-Eingang + Auszahlungen an Kunde/SV) in einen
kanonischen `claim_payments`-Ledger normalisieren. Provisions-/Abrechnungs-Ledger
(Kanzlei/Makler/Marketing) sind bereits per-`empfaenger` normalisiert -> ausserhalb.

---

## 1. Motivation & IST-Zustand (verifiziert per Payment-Survey 2026-07-07)

Die claim-native Geld-Schicht ist heute inkonsistent verstreut. Kern-Befunde:

- **`claim_payments` ist laut `COMMENT ON TABLE` der VS-Zahlungseingang** ("Zahlungseingaenge
  vom Versicherer — reine Buchhaltung"), NICHT die Kunde-Auszahlung.
- **Der VS-Betrag wird an bis zu 4 Stellen parallel geschrieben:** `zahlungseingaenge`/
  `zahlungspositionen` (Positions-Detail), `claims.regulierungs_betrag` (Summe/Phase),
  `claim_payments` (erhaltener_betrag/status/datum), `kanzlei_faelle.regulierung_am` (Datum).
  Je nach Erfassungs-Route ist `cp.erhaltener_betrag` mal gefuellt, mal NULL -> Drift.
- **Der `empfaenger`-Split (kunde/sv) auf `claim_payments` ist totes Schema:** kein Writer
  setzt `empfaenger` (alle fallen auf Default 'kunde'), kein Reader filtert danach
  (`getCurrentClaimPayment` liest die *neueste* Row blind).
- **Die Auszahlung an den Kunden (`auszahlung_kunde_betrag` / `_eingegangen_am`) hat KEINEN
  DB-Home:** nur `NULL::...`-Platzhalter in `v_faelle_mit_aktuellem_termin` + `faelle_kunde_view`.
  Writer (`process-event`, `updateFallField` inline-edit) laufen ins Leere; der
  `subphase-resolver` Phase-8-Kunde-Trigger ist dadurch strukturell immer `false`.
- **Die SV-Auszahlung (`auszahlung_gutachter_betrag` / `_eingegangen_am`) liegt auf `claims`**
  — asymmetrisch zum homeless Kunde-Split.
- **SV-Honorar existiert doppelt:** `gutachten.gutachten_sv_honorar_netto` (verdient) vs
  `claims.auszahlung_gutachter_betrag` (ausgezahlt).
- **`regulierung_betrag` ist nur ein role-gated View-Alias** auf `claims.regulierungs_betrag`
  (keine zweite Spalte), Code liest mal so, mal so.

Ziel: ein **einziger kanonischer Ledger** als Quelle der Wahrheit; `claims`/Views leiten
Aggregate ab; Alt-Spalten uebergangsweise als synchronisierte Caches, Drop erst wenn sicher.

Entscheidung Aaron (Brainstorming): **Voller Ledger, Views leiten ab** (nicht nur die
Auszahlungen; nicht sofort-droppen).

---

## 2. Ziel-Datenmodell: `claim_payments` als kanonischer Ledger

**Kernidee:** Eine Zeile pro `(claim_id, partei)` = aktueller Zahlungs-Zustand dieser Partei.

**Diskriminatoren (neu):**
- `partei` — `'vs'` | `'kunde'` | `'sv'` (verallgemeinert das heutige `empfaenger`; fuegt `'vs'` hinzu).
- `richtung` — `'eingang'` (VS->Claimondo) | `'auszahlung'` (Claimondo->Kunde/SV). Aus `partei`
  ableitbar, aber explizit gespeichert (klar + zukunftsfest, z.B. VS-Rueckforderung).

**Betragsspalten (bestehende, neutral re-interpretiert — KEIN Rename -> migrationssicher; Views aliasen):**
- `forderungsbetrag` = **Soll** dieser Bewegung.
- `erhaltener_betrag` = **Ist** (tatsaechlich geflossen, aus Sicht der Partei).
- `differenz_betrag` = GENERATED `forderung - ist` (Kuerzung/offene Differenz).
- `zahlungseingang_am` = Bewegungsdatum; plus `zahlungsweg` / `status` / `zahlungsreferenz` / `notiz`.

**Die 3 kanonischen Zeilen je Claim:**

| partei | richtung   | forderungsbetrag (Soll)                     | erhaltener_betrag (Ist) | ersetzt heute |
|--------|------------|---------------------------------------------|-------------------------|---------------|
| `vs`   | eingang    | VS-angekuendigte Regulierung (`regulierungs_betrag`) | tatsaechlich eingegangen | `claims.regulierungs_betrag` + jetziger cp-Eingang |
| `kunde`| auszahlung | *optional/kuenftig* (Anspruchsanteil, heute NULL)    | an Kunde ausgezahlt (`auszahlung_kunde_betrag`) | das **homeless** `auszahlung_kunde_*` |
| `sv`   | auszahlung | `gutachten.gutachten_sv_honorar_netto` (verdient)    | an SV ausgezahlt (`auszahlung_gutachter_betrag`) | `claims.auszahlung_gutachter_*` |

**Soll/Ist-Asymmetrie (bewusst, ehrlich zum IST):** `vs` + `sv` haben einen klaren Soll
(`regulierungs_betrag` bzw. Honorar), der Kunde-Soll (Anspruchsanteil) ist heute nicht separat
gefuehrt -> `kunde.forderungsbetrag` bleibt optional/NULL, bis ein Kuerzungs-Tracking je Partei
gewuenscht ist (additive Erweiterung, kein Blocker).

**Eindeutigkeit:** partial-unique Index `(claim_id, partei)` -> sauberer Upsert pro Partei
(loest den "neueste-Row-blind"-Read ab).

**Abgrenzungen:**
- **`zahlungseingaenge` / `zahlungspositionen` bleiben** — positionsgenaue Detail-Ebene (welche
  Schadenposition der VS zahlte/kuerzte), groeber-granular als der Claim-Ledger. Rollt in die
  `partei=vs`-Zeile hoch (Summe), wird nicht eingefaltet.
- **SV-Honorar-Doppelung loest sich auf:** `gutachten...honorar_netto` (verdient) = der **Soll**
  der `partei=sv`-Zeile (bei Row-Anlage kopiert), die Auszahlung = der **Ist**. "Verdient vs
  ausgezahlt" = `forderung` vs `ist` auf *einer* Zeile. `gutachten` bleibt die Honorar-Quelle.
- **Provisions-/Abrechnungs-Ledger** (`abrechnungen`, `kanzlei_abrechnungen`,
  `partner_provisionen`, `werkstatt_provisionen`, `provisionen_maik`, `partner_gutschriften`)
  sind bereits per-`empfaenger` normalisiert -> ausserhalb. Nur ihre Summen-Quellfelder auf
  `claims` (`kanzlei_honorar`, `marketing_provision`, `lead_preis_netto`, `sv_nachzahlung_netto`)
  beruehren die Grenze und bleiben unangetastet.

---

## 3. Feld->Ledger-Mapping + Uebergangs-Caches

| Heute | -> Ledger-Ziel | Alt-Feld |
|-------|----------------|----------|
| `claims.regulierungs_betrag` | `partei=vs` · forderungsbetrag | **Cache** (synced, treibt Phase 8 + Alias), Drop Spaet-Phase |
| jetzige `claim_payments`-Row | `partei=vs` · erhaltener_betrag/zahlungseingang_am | Backfill zur vs-Zeile |
| `kanzlei_faelle.regulierung_am` | `partei=vs` · zahlungseingang_am (Datum) | **bleibt** (KB-Kontext), synced |
| `zahlungseingaenge`/`zahlungspositionen` | Detail hinter `partei=vs` (Rollup) | **bleibt** (Positions-Ebene) |
| `auszahlung_kunde_betrag`/`_eingegangen_am` (homeless) | `partei=kunde` · erhaltener_betrag (Ist) + zahlungseingang_am | **jetzt echter Home** (fixt toten Write + Phase-8-Trigger) |
| `claims.auszahlung_gutachter_betrag`/`_eingegangen_am` | `partei=sv` · erhaltener_betrag/zahlungseingang_am | **Cache** (synced), Drop Spaet-Phase |
| `gutachten.gutachten_sv_honorar_netto` | `partei=sv` · forderungsbetrag (kopiert bei Anlage) | **bleibt Quelle** in `gutachten` |

**Cache-Prinzip:** In der Uebergangsphase schreibt der Payment-Seam **beide** (Ledger + Cache-
Spalte) in **einer Transaktion** -> nie Drift. Views werden schrittweise vom Cache aufs
Ledger-Aggregat umgestellt; wenn 0 Reader mehr am Cache haengen (per Grep verifiziert), faellt
die Spalte (eigene Migration, Regel 2/3).

**Kunde-Auszahlung (Ist):** heute schon manuell im `InlineEditField` der AuszahlungSection
erfasst (`auszahlung_kunde_betrag`) — der Admin traegt den an den Kunden ausgezahlten Betrag ein.
Wandert 1:1 als `erhaltener_betrag` der `kunde`-Zeile. Ein separater Kunde-Soll ist heute nicht
gefuehrt (s. Soll/Ist-Asymmetrie oben).

---

## 4. Read-Pfad: Views leiten ab

- **Neue Pivot-View `v_claim_payments`** dreht die Ledger-Zeilen in Pro-Partei-Spalten:
  `vs_soll/vs_ist/vs_am`, `kunde_soll/kunde_ist/kunde_am`, `sv_soll/sv_ist/sv_am` (+ Status je
  Partei). **Eine** Stelle fuer die Pivot-Logik (DRY).
- **Haupt-Views** (`v_claim_base`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`,
  `faelle_sv_view`) LATERAL-joinen die Pivot-View -> liefern `regulierung_betrag` (= vs),
  `auszahlung_kunde_*` (= kunde), `auszahlung_gutachter_*` (= sv). **Das homeless
  `auszahlung_kunde_*` wird endlich echt** (statt hardcoded NULL).
- **Kanonischer Code-Read-Seam** `getClaimPayments(db, claimId) -> {vs, kunde, sv}` ersetzt
  `getCurrentClaimPayment`s "neueste-Row-blind". finance/autophase/eligibility haengen dran.
- **`subphase-resolver` Phase 8** liest vs/kunde/sv aus der View -> Kunde-Trigger funktioniert
  endlich (war strukturell immer false).
- **Gating bleibt:** `faelle_kunde_view` nur `partei=kunde`, `faelle_sv_view` nur `partei=sv`,
  role-gates (`rolle_sieht_regulierung`/`_margen`) unveraendert.

---

## 5. Write-Pfad: ein Seam, 4-fach-VS-Write kollabiert

- **EIN kanonischer Seam** `upsertClaimPayment(db, claimId, partei, { forderungsbetrag?,
  erhaltener_betrag?, zahlungseingang_am?, zahlungsweg?, status? }, userId)` — Upsert der
  `(claim_id, partei)`-Zeile. Uebergangsweise **Dual-Write (Ledger + Cache-Spalte) in einer
  Transaktion**. Reine Funktion (kein `'use server'`), importierbar von
  state-machine/process-event/actions.
- **Alle Writer routen durch:**
  - **VS-Eingang** (state-machine `zahlung-eingegangen`, kanzlei-paket `recordZahlung` +
    `erfasseZahlungseingang`, process-event) -> `upsertClaimPayment(vs)`. Der **4-fach-Write
    kollabiert**: Seam schreibt Ledger-vs-Zeile + Cache `regulierungs_betrag` (+
    `kf.regulierung_am`); `zahlungseingaenge` bleibt der separate Positions-Detail-Write.
  - **Kunde** (updateFallField `auszahlung_kunde_*`, process-event split) ->
    `upsertClaimPayment(kunde)`. **Fixt den toten Write.**
  - **SV** (updateFallField `auszahlung_gutachter_*`, process-event) -> `upsertClaimPayment(sv)` + Cache.
  - `markClaimAsReguliert` (endzustand) -> vs-Zeile Soll ueber den Seam.

---

## 6. Migrations-Phasen (jede Phase = eigener, getesteter, shippbarer PR)

**Prinzip:** Dual-Write -> Reader migrieren -> erst dann droppen. Nie sieht ein Reader
inkonsistente Daten. Die **byte-genauen Golden-Abrechnungstests laufen in JEDER Phase** — die
fakturierten Betraege muessen byte-identisch bleiben (einzige gewollte Ausnahme:
`auszahlung_kunde_*` geht NULL->echt).

### Phase 0 — Schema-Foundation (rein additiv, 0 Verhalten)
- `apply_migration`: `partei` (CHECK -> vs/kunde/sv) + `richtung` auf `claim_payments`;
  partial-unique `(claim_id, partei)`. Backfill: bestehende cp-Rows -> `partei='vs',
  richtung='eingang'`. Types regen. Kein Code-Change -> Golden unberuehrt.

### Phase 1 — Write-Seam + Dual-Write (Ledger fuellt sich, Caches autoritativ)
- `upsertClaimPayment(partei)` per **TDD**. Alle Writer routen durch. Dual-Write: Ledger-Zeile
  + Cache-Spalte in einer Transaktion. (`auszahlung_kunde_*` hat keinen Cache -> nur Ledger.)
- Reader lesen weiter Caches -> **verhaltensneutral**. Golden unberuehrt. Reconciliation-Query
  (READ) bestaetigt Ledger == Cache. Groesste Code-Phase, aber risikoarm.

### Phase 2 — Pivot-View + Read-Umstellung (Reader wechseln aufs Ledger)
- `apply_migration`: `v_claim_payments`-Pivot; Haupt-Views leiten die Payment-Felder per
  LATERAL-Join daraus ab statt aus Cache/`NULL`. **Hier wird `auszahlung_kunde_*` echt.**
- Read-Seam `getClaimPayments` + finance/autophase/eligibility/subphase-resolver auf
  per-partei umstellen.
- **Verifikation:** Weil Phase 1 dual-schrieb, ist Ledger == Cache -> Views liefern **dieselben
  Werte** (Before/After-Snapshot je Sample-Claim via `execute_sql`, Gleichheit asserten). Golden
  byte-identisch. subphase-resolver Phase-8-Kunde-Trigger wird aktiv (gewollt) -> Resolver-Test
  anpassen.

### Phase 3 — Caches droppen (Reinheit, nur wenn sicher · Regel 3)
- Grep-Gate: **0 Reader** von `regulierungs_betrag`/`auszahlung_gutachter_*` ausserhalb des
  Seams. Dual-Write aus (Seam schreibt nur noch Ledger). `apply_migration`: Cache-Spalten
  droppen, Views referenzieren sie eh nicht mehr. Types regen. Golden unberuehrt.

### Phase 4 — Cleanup (optional)
- `regulierung_betrag`-Alias-Dedup, totes `empfaenger`-Split-Schema entfernen, Doku.

**Risiko-Landung:** Phase 0-1 verhaltensneutral (additiv + Dual-Write). Phase 2 ist der
Verhaltens-Switch, aber Dual-Write garantiert Gleichheit -> per Snapshot verifizierbar. Phase 3
der Drop (grep-gegated). Golden-Tests = Sicherheitsnetz durchgehend.

---

## 7. Verifikation

- **Dual-Write-Reconciliation (Phase 1):** READ-Query, die pro Claim Ledger-vs-Zeile gegen
  `claims.regulierungs_betrag` + gegen die jetzige cp-Row prueft (Gleichheit).
- **View-Snapshot (Phase 2):** Before/After der Haupt-View-Payment-Spalten fuer eine
  Sample-Menge Claims; assert byte-Gleichheit (ausser `auszahlung_kunde_*` NULL->echt).
- **Golden-Abrechnungstests:** `descriptors/*.golden.test.ts`, `process-case-billing.test.ts`,
  `eligibility.test.ts`, `subphase-resolver.test.ts` — in jeder Phase gruen.
- **Grep-Gate (Phase 3):** `grep -rn "regulierungs_betrag\|auszahlung_gutachter_"` -> nur noch
  Seam + Views, kein direkter Reader.
- **TDD** fuer `upsertClaimPayment` + `getClaimPayments` (RED vor GREEN).

---

## 8. Blast-Radius (aus Survey, nach Risiko)

**Hoch** (Geld-korrekt, mehrfach beschrieben): `src/lib/faelle/claim-payments.ts` (Seam),
`src/lib/faelle/state-machine.ts` (`zahlung-eingegangen`), `src/app/faelle/[id]/_actions/
kanzlei-paket.ts` (recordZahlung/erfasseZahlungseingang — die Doppel-/Vierfach-Schreibung),
`src/lib/claims/endzustand-actions.ts` (markClaimAsReguliert).

**Mittel** (Phasen-Logik + Views): `src/lib/fall/subphase-resolver.ts` (Phase 8) + `.test.ts`,
die Views (`v_claim_base`/`v_claim_full`/`v_faelle_mit_aktuellem_termin`/`faelle_kunde_view`/
`faelle_sv_view`), `src/lib/lexdrive/process-event.ts` (auszahlung_split + cp-Peel),
UI-Reader/Writer (`AuszahlungCard`, `SvHonorarCard`, `Sections.tsx` AuszahlungSection,
`LexDriveTriggerPanel`).

**Niedrig** (Analytics/Abrechnung): `src/lib/analytics/finance.ts`,
`src/lib/finance/fall-finanzen.ts`, `src/lib/abrechnung/kanzlei/eligibility.ts`,
Golden-Tests, `database.types.ts` (nach jeder DDL regen).

---

## 9. Nicht-Ziele / Scope-Grenzen

- Provisions-/Abrechnungs-Ledger (Kanzlei/Makler/Marketing) — bereits normalisiert, ausserhalb.
- Kein Event-/Teilzahlungs-Historien-Modell im Ledger (YAGNI — VS-Teilzahlungs-Detail liegt in
  `zahlungseingaenge`). Eine Zeile pro `(claim, partei)`.
- Keine Rename der Betragsspalten (migrationssicher; Views aliasen).
- `kanzlei_faelle`-Verhandlungsfelder (`kuerzungs_betrag`, `vs_quote_*`, `as_geforderte_summe`,
  `ruege_betrag`) bleiben auf `kanzlei_faelle` (VS-Verhandlungs-Kontext, nicht claim-nativ).

---

## 10. Regel-Compliance

- **Regel 2:** Alle DDL ausschliesslich via `apply_migration` (Plugin). `execute_sql` nur READ
  (Reconciliation/Snapshot/Verifikation). Migration-File == getrackte Plugin-Version.
- **Regel 3:** Cache-Drop (Phase 3) nur nach grep-verifizierter Reader-Migration; kein
  unbegleiteter Stash; jede Phase eigener PR gegen `staging`.
