# HANDOFF — Payment-Ledger-Normalisierung: Phase 2b + 3 + 4

**Datum:** 2026-07-07
**Fuer:** eine frische Session, die die Payment-Ledger-Normalisierung fortsetzt.
**Prod-DB:** `paizkjajbuxxksdoycev` (Claimondo). Alle DDL NUR via `apply_migration` (Regel 2).

---

## 0. TL;DR

Die claim-native Geld-/Payment-Schicht wird in einen kanonischen `claim_payments`-Ledger
(1 Zeile pro `(claim_id, partei)`, partei = `vs`/`kunde`/`sv`) normalisiert. **Phase 0 (Schema),
Phase 1 (Write-Seam, Ledger fuellt sich), Phase 2-Grundlage (Pivot-View + Read-Seam) und der erste
2b-View (`faelle_kunde_view`) sind FERTIG + prod-verifiziert.** Offen: die zwei GROSSEN Views
umstellen (`v_faelle_mit_aktuellem_termin` 339 Spalten, `v_claim_base` 32k), die Code-Reader auf
`getClaimPayments` umstellen, dann Phase 3 (Cache-Drop + Backfill) + Phase 4 (Cleanup).

**Der Ansatz ist voll validiert** (RLS-Kette, LEFT-JOIN-Sicherheit, CREATE-OR-REPLACE-Safety) —
s. Abschnitt 3. Die grossen Views brauchen nur eine methodische Technik (Abschnitt 5), kein
Neudenken.

**Design-Spec:** `docs/superpowers/specs/2026-07-07-payment-ledger-normalisierung-design.md`
**Plan:** `docs/superpowers/plans/2026-07-07-payment-ledger-normalisierung.md`
**Marker:** `memory/COORDINATION-payment-ledger-normalisierung.md`
**Branch:** `kitta/payment-ledger-phase2` (baut auf `phase1` -> `phase0` -> staging; gestapelt).

---

## 1. Was schon steht (FERTIG, prod-verifiziert)

| PR | Phase | Inhalt | Prod |
|----|-------|--------|------|
| #3771 | 0 | Schema: `claim_payments.partei` (vs/kunde/sv, DEFAULT vs) + `richtung` (eingang/auszahlung, DEFAULT eingang) + `unique(claim_id, partei)` | Migration `20260707104014` live |
| #3773 | 1 | Write-Seam `upsertClaimPayment(partei)` + alle Writer geroutet | build gruen |
| #3778 | 2 | Pivot-View `v_claim_payments` + Read-Seam `getClaimPayments` + `faelle_kunde_view`-Switch | Migrationen `20260707112006` + `20260707113428` live |

**Der Write-Pfad ist KOMPLETT** (Phase 1): jede Geldbewegung schreibt jetzt PARALLEL den Ledger:
- VS-Eingang: `state-machine.ts` (`zahlung-eingegangen`), `kanzlei-paket.ts` (`erfasseZahlungseingang`),
  `process-event.ts` (`zahlung_eingegangen`-Handler) -> `upsertClaimPayment('vs', ...)`.
- Kunde/SV-Auszahlung: `stammdaten.ts` (`updateFallField` — Admin-Eingabe) + `process-event.ts`
  (`auszahlung_split_eingegangen`) -> `upsertClaimPayment('kunde'/'sv', ...)`.
- `endzustand-actions.ts` (`markClaimAsReguliert`) -> vs-Soll (`forderungsbetrag`).

Die Alt-Cache-Writes (`claims.regulierungs_betrag`, `claims.auszahlung_gutachter_*`) bleiben dabei
UNVERAENDERT (Dual-Write) -> verhaltensneutral, Reader lesen weiter die Caches.

**Der Read-Pfad ist erst zur Haelfte** (Phase 2):
- `v_claim_payments` (Pivot) + `getClaimPayments` (Code-Seam) existieren, werden aber noch von
  KEINEM Reader konsumiert.
- `faelle_kunde_view` (Kunde-Portal) liest `auszahlung_kunde_*` bereits aus dem Ledger.
- Die restlichen Views + alle Code-Reader lesen noch die Caches/Alt-Felder.

---

## 2. Das Datenmodell (mentales Modell)

`claim_payments` = 1 Zeile pro `(claim_id, partei)`. Spalten:
- Diskriminatoren: `partei` (`vs`/`kunde`/`sv`), `richtung` (`eingang` fuer vs, `auszahlung` fuer kunde/sv).
- Betraege (neutral re-interpretiert): `forderungsbetrag` = Soll, `erhaltener_betrag` = Ist,
  `differenz_betrag` = GENERATED (forderung-ist), `zahlungseingang_am` = Datum, `zahlungsweg`,
  `status` (ausstehend/teilweise/erhalten/final/abgelehnt), `zahlungsreferenz`, `notiz`.
- **Tote Alt-Spalte:** `empfaenger` (CHECK kunde/sv) — durch `partei` abgeloest, wird in Phase 4 gedroppt.

Die 3 kanonischen Zeilen je Claim:
| partei | forderungsbetrag (Soll) | erhaltener_betrag (Ist) | ersetzt (Alt-Cache) |
|--------|-------------------------|-------------------------|---------------------|
| vs | VS-angekuendigte Regulierung | tatsaechlich eingegangen | `claims.regulierungs_betrag` |
| kunde | (heute NULL, optional/kuenftig) | an Kunde ausgezahlt (`auszahlung_kunde_betrag`) | **KEIN Cache** (war homeless) |
| sv | `gutachten.gutachten_sv_honorar_netto` | an SV ausgezahlt | `claims.auszahlung_gutachter_*` |

**Pivot-View `v_claim_payments`** dreht das in Spalten: `vs_soll/vs_ist/vs_am/vs_status/vs_zahlungsweg`,
`kunde_soll/kunde_ist/kunde_am/kunde_status`, `sv_soll/sv_ist/sv_am/sv_status`. `security_invoker=true`.

---

## 3. VERIFIZIERTE FAKTEN (die den Rest de-risken — nicht neu ermitteln)

1. **RLS-Kette geloest:** Alle 5 Haupt-Views + `claim_payments` + `v_claim_payments` gehoeren
   `postgres`, und `postgres.rolbypassrls = true`. Die Views sind **DEFINER** (default, NICHT
   security_invoker). => Ein DEFINER-Parent-View laeuft als postgres, liest die invoker-Pivot-View
   im postgres-Kontext, bypassed die claim_payments-RLS -> sieht ALLE Zahlungen -> der Parent gated
   selbst (wie bisher). **Der Pivot-Join surft die Zahlung korrekt. Kein JWT-Sim noetig.**
2. **Direkt-Query-Sicherheit:** `v_claim_payments` ist invoker + `REVOKE anon` + `GRANT authenticated`.
   Direkter Query erbt claim_payments-RLS (admin/besitzender KB). `has_table_privilege('anon',...)=false`.
   `audit_ungated_definer_views` flaggt es NICHT (invoker != definer). Kein anon-Leak.
3. **LEFT-JOIN-Sicherheit:** `v_claim_payments` hat GENAU 1 Zeile pro claim_id (GROUP BY). Ein
   `LEFT JOIN v_claim_payments p ON p.claim_id = base.claim_id` kann daher **keine Zeilen
   multiplizieren und keine verlieren**. Non-breaking per Konstruktion.
4. **CREATE-OR-REPLACE-Safety:** Solange die Spalten-Signatur (Namen + Typen + Reihenfolge)
   IDENTISCH bleibt, ist `CREATE OR REPLACE VIEW` erlaubt + resettet Owner/Grants/Security NICHT.
   Die Pivot-Spalten muessen auf die Original-Typen gecastet werden (z.B. `p.kunde_ist::numeric(10,2)`).
5. **auth-gated Views:** `v_claim_base` (und alle Kinder) haben einen internen `auth.uid()`-Filter
   -> `execute_sql` als service-role sieht **0 Zeilen**. **=> Snapshot-Verifikation von View-DATEN
   via execute_sql geht NICHT.** Verifiziere stattdessen ueber die **Spalten-Signatur** (Abschnitt 6)
   + apply-success + `pg_get_viewdef`. Fuer echte Daten: JWT-Sim.
6. **auszahlung_kunde_* braucht KEIN COALESCE + KEINEN Backfill:** es hatte nie einen Cache (immer
   View-NULL). Reiner Ledger-Read (`p.kunde_ist`) -> NULL fuer Altdaten (wie bisher), echt fuer neue
   Kunde-Auszahlungen. Das war der `faelle_kunde_view`-Fix (Vorlage!).
7. **regulierung_betrag / auszahlung_gutachter_* BRAUCHEN COALESCE:** sie kommen aus `claims`-Cache
   (`c.regulierungs_betrag`, `c.auszahlung_gutachter_*`), bestehende Claims haben Cache-Werte aber
   leere Ledger-Zeilen. => `COALESCE(p.vs_ist, c.regulierungs_betrag)` etc., damit Altdaten nicht
   auf NULL fallen. Der Backfill Ledger<-Cache passiert erst bei Phase 3.

---

## 4. View-Landschaft (Ist-Stand)

| View | def_len | Spalten | auszahlung_kunde | auszahlung_gutachter | regulierung(s)_betrag | Struktur | Status |
|------|---------|---------|------------------|----------------------|-----------------------|----------|--------|
| `v_claim_base` | 32576 | ~300 | — (nicht exponiert) | ✓ (`c.`) | ✓ beide | BASE (keine Dep) | offen |
| `v_faelle_mit_aktuellem_termin` | 9058 | **339** | ✓ NULL | ✓ | ✓ reg_betrag | von v_claim_base + CTE/UNION/LATERAL | **offen (gross!)** |
| `v_claim_full` | 5084 | — | — | — | ✓ beide | von v_claim_base | offen |
| `faelle_sv_view` | 1276 | — | — | ✓ | — | von v_claim_base | offen |
| `faelle_kunde_view` | ~1500 | 40 | ✓ **Ledger** | — | — | von v_claim_base | ✅ FERTIG |

**Wichtig:** `auszahlung_kunde_*` wird NUR in `v_faelle_mit_aktuellem_termin` (Admin/KB-Fallakte) und
`faelle_kunde_view` (Kunde-Portal, fertig) als NULL gehalten — NICHT in `v_claim_base`. Also fuer den
Kern-Wert (`auszahlung_kunde_*` echt) muss nur noch **`v_faelle_mit_aktuellem_termin`** ran.

---

## 5. DIE VERBLEIBENDE ARBEIT (Reihenfolge + Technik)

### Schritt A — `v_faelle_mit_aktuellem_termin` (auszahlung_kunde_* echt) — der Kern-Wert, aber gross

**Warum zuerst:** die AuszahlungSection (Admin/KB) liest `fall` aus dieser View. Ohne den Fix
bleibt der Admin-Split inkohaerent zum Kunde-Portal (aktuell unsichtbar, weil 0 Kunde-Ledger-Rows).

**Technik (NICHT von Hand abtippen — 339 Spalten):**
1. `select pg_get_viewdef('v_faelle_mit_aktuellem_termin'::regclass, true)` — exakte Def holen.
2. **Spalten-Signatur VORHER sichern:**
   `select column_name, data_type, ordinal_position from information_schema.columns
    where table_schema='public' and table_name='v_faelle_mit_aktuellem_termin' order by ordinal_position;`
3. In der geholten Def CHIRURGISCH ersetzen (nur diese Substrings):
   - `NULL::numeric(...) AS auszahlung_kunde_betrag` -> `p.kunde_ist::numeric(...) AS auszahlung_kunde_betrag`
     (den EXAKTEN Original-Typ aus der Def uebernehmen fuer den Cast).
   - `NULL::timestamp with time zone AS auszahlung_kunde_eingegangen_am` -> `p.kunde_am::timestamp with time zone AS auszahlung_kunde_eingegangen_am`
4. Den Join in die FROM einfuegen. ACHTUNG LATERAL: die View joint via LATERAL den aktuellen Termin.
   Fuege `LEFT JOIN v_claim_payments p ON p.claim_id = <base-alias>.claim_id` an der aeussersten
   FROM-Ebene hinzu, wo der v_claim_base-Alias sichtbar ist (den Alias aus der Def ablesen — bei
   faelle_kunde_view war es `base`). Nicht INNERHALB der LATERAL-Subquery.
5. `apply_migration({name, query: 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS <neue-def>'})`.
6. **Spalten-Signatur NACHHER == VORHER** verifizieren (identische 339 Zeilen, Namen+Typen+Reihenfolge).
   Das ist das Sicherheitsnetz statt Daten-Snapshot (Views sind auth-gated).
7. `pg_get_viewdef` bestaetigt `p.kunde_ist` + den Join. Migration-File == getrackte Version (Regel 2).

### Schritt B — COALESCE regulierung_betrag + auszahlung_gutachter_* (Phase-3-Vorbereitung)

Diese Felder kommen aus `v_claim_base` (`c.regulierungs_betrag`, `c.auszahlung_gutachter_*`). Damit
Phase 3 die claims-Cache-Spalten droppen kann, muessen die Views vorher auf den Ledger COALESCEn.
Am DRY-sten in `v_claim_base` (Wurzel, propagiert zu allen Kindern) — ABER das ist die 32k-View,
hoechstes Risiko. Gleiche Technik wie Schritt A (fetch -> surgical replace -> signatur-check):
- `c.regulierungs_betrag` (bzw. das `AS regulierung_betrag`-Alias) -> `COALESCE(p.vs_ist, p.vs_soll, c.regulierungs_betrag)`.
- `c.auszahlung_gutachter_betrag` -> `COALESCE(p.sv_ist, c.auszahlung_gutachter_betrag)`,
  `c.auszahlung_gutachter_eingegangen_am` -> `COALESCE(p.sv_am, c.auszahlung_gutachter_eingegangen_am)`.
- + `LEFT JOIN v_claim_payments p ON p.claim_id = <v_claim_base's claim_id>`.
**Alternativ (risikoaermer):** COALESCE nur in den Kind-Views die die Felder exponieren
(`v_faelle_mit_aktuellem_termin`, `v_claim_full`, `faelle_sv_view`) statt in v_claim_base — mehr
Stellen, aber jede kleiner als die 32k-Wurzel. Abwaegung der naechsten Session.

### Schritt C — Code-Reader auf `getClaimPayments` umstellen

- `src/lib/finance/fall-finanzen.ts:~108` — `getCurrentClaimPayment` -> `getClaimPayments(db, claimId).vs`.
- `src/lib/state-machine/autoPhase.ts:~73` (oder wo autoPhase getCurrentClaimPayment nutzt) -> dito.
- `src/lib/abrechnung/kanzlei/eligibility.ts:~34` — liest claim_payments direkt (embed); pruefen ob
  Umstellung noetig (evtl. schon partei-agnostisch korrekt).
- `src/lib/fall/subphase-resolver.ts:226-239` (Phase 8) liest `claim.regulierung_betrag` +
  `claim.auszahlung_kunde_eingegangen_am` + `claim.auszahlung_gutachter_eingegangen_am` AUS DER VIEW.
  Sobald die Views (Schritt A/B) den Ledger surfacen, liest der Resolver ihn automatisch. ABER:
  der Kunde-Trigger (`auszahlung_kunde_eingegangen_am`) wird dann AKTIV (war strukturell immer false)
  -> **`src/lib/fall/subphase-resolver.test.ts` anpassen** (neue Phase-8-Kunde-Faelle).
- `getCurrentClaimPayment` erst entfernen, wenn 0 Consumer (dann Phase 4).

### Phase 3 — Cache-Drop (grep-gegated, Regel 3)

1. Backfill: fuer jeden Claim mit `claims.regulierungs_betrag` einen `vs`-Ledger-Eintrag anlegen
   (falls fehlt), analog `auszahlung_gutachter_*` -> `sv`-Eintrag. (Migration, per apply_migration.)
2. Grep-Gate: `grep -rn "regulierungs_betrag\|auszahlung_gutachter_betrag\|auszahlung_gutachter_eingegangen_am" src/`
   -> nur noch Seam + Views. 0 direkte Reader.
3. Caller-Cache-Writes entfernen (recordZahlung/erfasseZahlungseingang/markClaimAsReguliert/
   process-event schreiben dann NUR noch den Ledger -> "4-fach-Write kollabiert").
4. `apply_migration`: `claims.regulierungs_betrag` + `claims.auszahlung_gutachter_betrag` +
   `_eingegangen_am` droppen; Views entfernen die COALESCE-cache-Referenz (reiner Ledger).

### Phase 4 — Cleanup

- `regulierung_betrag`-Alias-Dedup (der role-gated View-Alias).
- Totes `empfaenger`-Split-Schema: `claim_payments.empfaenger` + `claim_payments_empfaenger_check` droppen.
- `upsertCurrentClaimPayment` + `getCurrentClaimPayment` loeschen (0 Consumer nach Phase 2b/3).
- SP-J-Reroute-Kommentare aktualisieren.

---

## 6. Verifikations-Rezept (pro View-Aenderung)

```sql
-- 1. Spalten-Signatur VORHER (in eine Notiz kopieren):
select column_name, data_type, ordinal_position from information_schema.columns
 where table_schema='public' and table_name='<VIEW>' order by ordinal_position;

-- 2. apply_migration CREATE OR REPLACE ...

-- 3. Spalten-Signatur NACHHER == VORHER? (MUSS identisch sein)
--    (gleiche Query — Zeile fuer Zeile vergleichen)

-- 4. Def bestaetigt die Aenderung:
select (pg_get_viewdef('<VIEW>'::regclass) ilike '%p.kunde_ist%')::text,
       (pg_get_viewdef('<VIEW>'::regclass) ~* 'join v_claim_payments')::text;

-- 5. Security bewahrt (immer noch DEFINER, nicht versehentlich invoker):
select coalesce((select 'security_invoker=true'=any(reloptions)
        from pg_class where relname='<VIEW>' and relnamespace='public'::regnamespace),false)=false as still_definer;
```
+ Migration-File committen als `supabase/migrations/<getrackte-version>_<name>.sql` (Version aus
`select version from supabase_migrations.schema_migrations where name='<name>' order by version desc limit 1`).
+ Golden-Tests: `npx vitest run src/lib/finance src/lib/abrechnung src/lib/fall` gruen halten.

---

## 7. FALLEN (aus Incidents gelernt)

- **Regel 2:** DDL NUR via `apply_migration`. NIE CLI `db push` / raw `execute_sql` mit DDL.
  `execute_sql` nur READ. Migration-File-Name == getrackte Plugin-Version (kein Twin-Drift).
- **Regel 3:** Cache-Spalten droppen NUR nach grep-verifizierter Reader-Migration + Backfill.
- **anon-Leak:** jede NEUE View -> `REVOKE ALL ... FROM anon` + `has_table_privilege('anon',...)=false`
  verifizieren + `audit_ungated_definer_views` pruefen. (v_partner_billing-Incident war ein
  Release-Totalblocker.)
- **auth-gated Views = service-role 0 Zeilen:** Daten NICHT via execute_sql snapshotten -> Spalten-
  Signatur nutzen. Fuer echte Daten JWT-Sim (`set local role authenticated; set local request.jwt.claims ...`).
- **CREATE OR REPLACE:** Spalten-Signatur MUSS identisch bleiben (sonst Error oder stiller Bruch).
  Pivot-Spalten auf Original-Typen casten.
- **`execute_sql` Multi-Statement gibt nur das LETZTE Ergebnis zurueck** -> pro Check EINE Query
  (UNION ALL fuer mehrere Werte; Subquery statt `order by ... limit` vor UNION).
- **database.types.ts:** CHIRURGISCH editieren (nicht Full-Regen) — geteilte Datei, viele Sessions.
  `partei`/`richtung` sind bereits drin (claim_payments Row/Insert/Update).
- **Lokaler tsc/build OOMt** (kaputte shared node_modules + viele Sessions) -> **CI ist autoritativ.**
  `npx vitest run <datei>` einzeln geht lokal.
- **Supabase-Preview-CI-Check faellt** an einem pre-existierenden Replay-Domino (profiles_sprache_check/
  halter-repoint, braucht Squash) — **non-blocking, von Aaron akzeptiert.** Der `build`-Check ist der Gate.
- **claims hat KEINE `kunde_id`-Spalte** (der Kunde-Link laeuft ueber Party/Person — nicht raten,
  bei Bedarf via v_claim_base's kunde_id oder die geschaedigter-Party aufloesen).

---

## 8. Datei-/Artefakt-Karte

- Spec: `docs/superpowers/specs/2026-07-07-payment-ledger-normalisierung-design.md`
- Plan: `docs/superpowers/plans/2026-07-07-payment-ledger-normalisierung.md`
- Seam + Read-Seam: `src/lib/faelle/claim-payments.ts` (`upsertClaimPayment`, `getClaimPayments`,
  Typen `Partei`/`ClaimPaymentFields`/`ClaimPaymentsByPartei`) + Test `claim-payments.test.ts` (4/4).
- Migrationen: `20260707104014` (Schema), `20260707112006` (Pivot), `20260707113428` (faelle_kunde_view).
- Vorlage fuer die grossen Views: die `faelle_kunde_view`-Migration
  (`supabase/migrations/20260707113428_faelle_kunde_view_auszahlung_kunde_ledger.sql`).
- Marker (laufend): `memory/COORDINATION-payment-ledger-normalisierung.md`.
- Branches (gestapelt, in Reihenfolge mergen): `kitta/payment-ledger-normalisierung` (#3771) ->
  `kitta/payment-ledger-phase1` (#3773) -> `kitta/payment-ledger-phase2` (#3778).

**Start-Empfehlung fuer die naechste Session:** Schritt A (`v_faelle_mit_aktuellem_termin`,
auszahlung_kunde_*) — hoechster Wert, klar umrissen, mit der validierten Technik + Spalten-Signatur-
Verifikation. Danach B/C/3/4 wie oben.
