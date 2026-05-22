# CMM-44 SP-J PR2 — Call-Site-Inventur (Zahlungs-/Abrechnungs-Spalten)

**Datum:** 2026-05-22 · **Branch:** `kitta/cmm-44-spj-pr2-sweep` (off origin/staging @ 67072e81)
**Plan:** `docs/superpowers/plans/2026-05-22-cmm44-spj-payment-split.md` (Task 3) · **Spec:** `…/specs/2026-05-22-cmm44-spj-payment-split-design.md`

## Methode (3 Quellen, weil from()-Window allein nicht reicht)

1. **`scripts/cmm44-spj-grep.mjs`** — paren-balanced `from('faelle')`/nested `faelle(...)` der 11 A+B-Spalten, strip-Sub-Embeds (`claims(...)`, `claim_payments(...)`, `auftraege(...)`). → **27 Treffer**.
2. **Assignment-Grep** (`<col>\s*[:=]` über `src/`) — fängt **Object-Build-Writes**, die NICHT im 1500-Zeichen-Fenster eines `from('faelle')` stehen (z.B. lexdrive `updates.zahlung_eingegangen_am = …` Zeilen 240–242/308, appliziert erst 80 Zeilen später via `splitOrKeepFaelleUpdate`).
3. **Live-View-Spalten-Check** (information_schema) — welche der 11 die 3 Views flach exponieren, um Pattern-E (View-Read = kein Code-Change) von echten faelle-Reads zu trennen.

**Live-Fakten (revalidiert 2026-05-22, DB `paizkjajbuxxksdoycev`):** `bucketB_on_claims=8`, `faelle_11=11` (Drop erst Phase 6), `claim_payments` 0 Rows, `status` NOT NULL DEFAULT `'ausstehend'`, CHECK `IN ('ausstehend','teilweise','erhalten','final','abgelehnt')`, FK `claim_payments.claim_id → claims(id) ON DELETE CASCADE` (⇒ Nested-Embed `claims:claim_id(claim_payments(...))` funktioniert).
**View-Exposition der 11:** `v_faelle_mit_aktuellem_termin` = alle 11 (Bucket A als **NULL::typ-Platzhalter**, Bucket B aus `c.`); `faelle_kunde_view` = nur `auszahlung_zahlungsweg` (B→c.); `faelle_sv_view` = nur `auszahlung_gutachter_eingegangen_am` (B→c.). **Kein** View exponiert die 3 Bucket-A-Spalten brauchbar (nur v_faelle als NULL).

**Chunking:** 27 from()-Treffer + 4 Object-Build-Writes + 2 B-Bulk-Writes = **< 80 → 1 PR2.**

---

## Bucket A → `claim_payments` (Reroute + Rename + create-or-update). Mapping: `zahlung_eingegangen_am→zahlungseingang_am`, `zahlung_betrag→erhaltener_betrag`, `zahlungsweg→zahlungsweg`

### A-Reads
| Site | Art | Transform |
|---|---|---|
| `lib/analytics/finance.ts:16` `getUmsatz` | bulk-read `zahlung_eingegangen_am` | Nested-Embed: `claims:claim_id(…, claim_payments(zahlungseingang_am, created_at))`; `getFinanzDatum` nimmt latest claim_payment statt `f.zahlung_eingegangen_am`. |
| `lib/analytics/finance.ts:131` `getCashFlow` „erwartet" | bulk-read + Filter `.is('zahlung_eingegangen_am', null)` | Filter raus, Embed `claim_payments(zahlungseingang_am)`, **JS-Filter** „keine claim_payment mit zahlungseingang_am". |
| `lib/analytics/finance.ts:144` `getCashFlow` „überfällig" | Filter `.lt('zahlung_erwartet_am')` (C) + `.is('zahlung_eingegangen_am', null)` | `zahlung_erwartet_am` = Bucket C (Phase-6-DROP) → Bucket „überfällig" **degradiert** (leer + Kommentar); s.u. Bucket C. |
| `lib/analytics/conversion.ts:36` `getConversionFunnel` | bulk-read `zahlung_eingegangen_am` (Z.49 `mitZahlung`) | Embed `claims:claim_id(gutachten(...), claim_payments(zahlungseingang_am))`; `mitZahlung` filtert auf claim_payment-Existenz. |
| `lib/claims/get-kunde-faelle.ts:413` `getKundeFallDetailRecord` | single-claim-read `zahlungsweg`+`zahlung_eingegangen_am` (Output Z.606/608) | claim_payments-Query in den bestehenden `if(claimId)`-`Promise.all` aufnehmen; Output-Properties `zahlungsweg`/`zahlung_eingegangen_am` (API-Vertrag) aus `cp` befüllen. |
| `lib/finance/fall-finanzen.ts:50` `getFallFinanzen` | single-claim-read `zahlung_betrag`+`zahlung_eingegangen_am` (Z.144/147/175) | claim_payments-Query in den `if(fall.claim_id)`-`Promise.all`; `erhaltener_betrag`/`zahlungseingang_am` mappen. `zahlung_erwartet_am` s. Bucket C. |

### A-Writes
| Site | Art | Transform |
|---|---|---|
| `lib/faelle/state-machine.ts:97-100` `transitionFallStatus('zahlung-eingegangen')` | WRITE `zahlung_eingegangen_am`+`zahlung_betrag` (via `update`-Obj → split) | Zeilen entfernen; nach faelle/claims-Write `upsertCurrentClaimPayment(db, claimId, { zahlungseingang_am, erhaltener_betrag: metadata.betrag, status: 'erhalten' }, metadata.user_id)`. |
| `app/faelle/[id]/_actions/kanzlei-paket.ts:352` `erfasseZahlungseingang` | WRITE `zahlung_eingegangen_am` (+ `regulierung_am` bleibt faelle) | `zahlung_eingegangen_am` aus faelle-Update raus; `upsertCurrentClaimPayment(admin, zeClaimId, { zahlungseingang_am: now, status: 'erhalten' })`. |
| `app/kunde/faelle/[id]/actions.ts:250` `updateZahlungsweg` | WRITE `zahlungsweg` (Zahlungs-**Methode**, vor Zahlung) | claim_id holen; `upsertCurrentClaimPayment(admin, claimId, { zahlungsweg })` **ohne status** → INSERT-Default `'ausstehend'` (semantisch korrekt: Methode ≠ Eingang). |
| `lib/lexdrive/process-event.ts:240-242` Event `zahlung_eingegangen` | WRITE `zahlung_eingegangen_am`/`zahlung_betrag`/`zahlungsweg` (updates-Obj) | A-Keys nach dem split aus `fuFaelle` ziehen (SP-D-Muster), `upsertCurrentClaimPayment(…, { zahlungseingang_am, erhaltener_betrag, zahlungsweg, status: 'erhalten' })`. |
| `lib/lexdrive/process-event.ts:310` Event `auszahlung_split_eingegangen` | WRITE `zahlungsweg` (updates-Obj) | gleiche Pull-Logik; **ohne status** (Payout-Methode, kein Haupt-Eingang). |
| `app/api/seed-testdata/route.ts:498/517` | WRITE `zahlung_eingegangen_am` (claimlose Seed-Faelle) | Zeile **entfernen** (claimlos → kein claim_payments-Target; SP-A-Präzedenz; Phase-6-DROP). Daten-Fixture Z.476 wird damit unbenutzt → mit entfernen. |

### A — False Positives (kein Change)
- `state-machine.ts:59` (select `id,status,claim_id` — Fenster reicht bis Z.97).
- `kanzlei-paket.ts:211` `recordZahlung` (Kommentar Z.226; delegiert an `transitionFallStatus` → oben abgedeckt).
- `kunde/faelle/[id]/actions.ts:213` (`update({updated_at})`-Fenster reicht bis Z.250).
- `analytics/conversion.ts:69` (String-Literal `berechnetAus`; `faelle (…)`-Klammer matcht). String an neue Quelle anpassen, kein DB-Change.

---

## Bucket B → `claims` (8 in `CLAIM_OWNED_DUPLICATE_COLUMNS`; Reads via `claims:claim_id(…)`-Embed bzw. repointete View; Writes via `splitOrKeepFaelleUpdate`/`from('claims')`)

| Site | Art | Transform |
|---|---|---|
| `app/admin/abrechnungen/actions.ts:328` | READ+Filter `.eq('abrechnung_id')` (nur `select('id')` für Timeline) | Quelle → `v_faelle_mit_aktuellem_termin` (exponiert `abrechnung_id` aus claims). |
| `app/admin/abrechnungen/actions.ts:369` `reIssueAbrechnung` | WRITE `sv_nachzahlung_netto` (korrekturen, hat nur `fall_id`) | pro Korrektur claim_id holen → `from('claims').update({sv_nachzahlung_netto}).eq('id',claimId)` (Fallback faelle bei claimlos via `splitOrKeepFaelleUpdate`). |
| `api/cron/abrechnung-erstellen/route.ts:89` | READ `guthaben_verrechnet_netto`/`sv_nachzahlung_netto` + Filter `.is('abrechnung_id', null)` | Quelle → `v_faelle_mit_aktuellem_termin` (exponiert alle 3 + `lead_preis_*`, `gutachten_betrag`=gesamt_schadensbetrag, `claim_id`). Embed-`gutachten`-Lesart auf flache View-Spalten umstellen. |
| `api/cron/abrechnung-erstellen/route.ts:233` | WRITE `abrechnung_id` bulk `.in('id', fallIds)` | claim_ids aus View-Read sammeln → `from('claims').update({abrechnung_id}).in('id', claimIds)`. |
| `api/cron/abrechnung-erstellen/route.ts:322` | WRITE `abrechnung_id` bulk `.in('id', acc.fall_ids)` (Sammelrechnung) | `claim_id` zusätzlich im `orgAccumulator` tracken → `from('claims').update(...).in('id', claimIds)`. |
| `api/cron/fall-abschluss/route.ts:23` | READ+Filter `.not/.lt('schlussabrechnung_am')` | Quelle → `v_faelle_mit_aktuellem_termin` (exponiert `schlussabrechnung_am`+`status`). |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts:97` | READ+Filter `.is('kanzlei_abrechnung_id', null)` | `kanzlei_abrechnung_id` in `claims:claim_id(...)`-Embed; Filter in App-Code (Datei filtert SP-B-Felder schon so). |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts:216` | WRITE `kanzlei_abrechnung_id`+`kanzlei_provision_status` bulk | split: `kanzlei_provision_status` bleibt faelle bulk; `kanzlei_abrechnung_id` → `from('claims').update().in('id', claimIds)` (claim_ids aus Embed-Read sammeln). |
| `lib/abrechnung/process-case-billing.ts:78` | WRITE `guthaben_verrechnet_netto`+`sv_nachzahlung_netto` (+`lead_preis_*` faelle) | `claim_id` in Select (Z.30) ergänzen; Update via `splitOrKeepFaelleUpdate(rest, claimId)`. |
| `lib/abrechnung/reissue-abrechnung.ts:107` | WRITE `abrechnung_id` (loop über `faelle` aus View) | `claim_id` in View-Select (Z.37) ergänzen; pro f `splitOrKeepFaelleUpdate({abrechnung_id}, f.claim_id)`. |
| `lib/abrechnung/revert-case-billing.ts:26` | READ `guthaben_verrechnet_netto`/`sv_nachzahlung_netto`/`abrechnung_id` (hat claim_id) | in `claims:claim_id(...)`-Embed; Z.33/80/87/114 aus normalisiertem claim lesen. |
| `lib/abrechnung/revert-case-billing.ts:48` | WRITE `guthaben_verrechnet_netto`+`sv_nachzahlung_netto` (+`lead_preis_*` faelle) | split via `splitOrKeepFaelleUpdate` (claim_id aus Read). |
| `lib/lexdrive/process-event.ts:308` Event `auszahlung_split_eingegangen` | WRITE `auszahlung_gutachter_eingegangen_am` (updates-Obj) | **kein Site-Change** — nach Set-Aufnahme routet `splitOrKeepFaelleUpdate` automatisch nach claims. |

### B — False Positives (kein Change)
- `api/cron/monatsabrechnung/route.ts:80` — `update({lead_preis_*})`; gematchtes `abrechnung_id` (Z.98) liegt auf `gutachter_abrechnungspositionen`. Read (Z.46) liest schon aus View.
- `lib/lexdrive/process-event.ts:404` — `payload.auszahlung_gutachter_eingegangen_am` (Event-Payload, kein faelle-Select).
- `lib/stripe/kanzlei-checkout.ts:55` — `kanzlei_abrechnung_id` als Stripe-`metadata`-Key.
- `api/cron/abrechnung-kanzlei-reminder/route.ts:167` — INSERT `kanzlei_abrechnung_reminders.kanzlei_abrechnung_id` (FK anderer Tabelle).
- `abrechnung-erstellen` Z.141/180/225 — Object-Build aus dem View-Read (Konsument, kein eigener faelle-Zugriff).

---

## Bucket C → `zahlung_erwartet_am` (NICHT migrieren, Phase-6-DROP)
| Site | Transform |
|---|---|
| `lib/finance/fall-finanzen.ts:51/145` | Aus faelle-Select entfernen; `erwartetDatum`-Zweig auf `null` (Kommentar „CMM-44 SP-J Bucket C — Phase-6-DROP, kein Reroute"). `zahlungStatus` fällt auf `regulierung_am`-Logik zurück. |
| `lib/analytics/finance.ts:144/153` `getCashFlow` „überfällig" | `.lt('zahlung_erwartet_am')`-Query entfernen; „überfällig"-Bucket auf 0/leer + Kommentar (Datenquelle gedroppt; pre-launch 0-cov). `berechnetAus`-String anpassen. |

---

## Pattern-E / Display-only (View- oder Prop-gespeist — KEIN Code-Change, zählt nicht gegen Re-Grep-0)
- **View-Reads** (repointet in PR1): jede `from('v_faelle_mit_aktuellem_termin'|'faelle_sv_view'|'faelle_kunde_view')`-Stelle, die B-Spalten flach liest (z.B. `reissue-abrechnung.ts:36`, `monatsabrechnung:46`).
- `app/gutachter/fall/[id]/FallDetailClient.tsx:221` + `…/_components/KanzleiStatusCard.tsx:52/53/89/147/186…` — Display, fall-Prop kommt aus `faelle_sv_view`, das die **Bucket-A-Spalten gar nicht exponiert** ⇒ `fall.zahlung_eingegangen_am`/`zahlung_betrag` sind bereits `undefined` (SV-Subphase läuft primär über `status='zahlung-eingegangen'`, Z.111). Kein Regress durch SP-J; SV-Payout-Anzeige war nie verdrahtet (Spec §8 Non-Goal). **Phase-6-Hinweis:** wenn faelle dropt, brauchen diese Props eine claim_payments-Quelle, falls SV-Zahlungsanzeige je gewünscht.

### View-/Prop-gespeiste Bucket-A-Reader (vom from()-Grep NICHT erfasst — Review-Nachtrag)
Diese lesen `zahlung_eingegangen_am`/`zahlung_betrag` NICHT via `from('faelle')`, sondern aus der View `v_faelle_mit_aktuellem_termin` (`SELECT *`, Bucket-A = NULL-Platzhalter) bzw. aus einem durchgereichten Record:
- **`lib/autoPhase.ts:51` — REPOINTED (kein Pattern-E).** `checkFallAutoPhase` las `fall.zahlung_eingegangen_am` aus dem View-`SELECT *` → Auto-Abschluss (`anschlussschreiben`/`regulierung` → `abgeschlossen`) wäre nach Launch tot gelaufen. **Fix:** `getCurrentClaimPayment(svc, claim_id)` und `currentPayment?.zahlungseingang_am` als Trigger. (lexdrive `zahlung_eingegangen` legt eine claim_payments-Row OHNE Status-Transition an → autoPhase muss den Eingang aus claim_payments sehen.)
- `lib/fall/section-visibility.ts:163` — reine Funktion; `zahlung_eingegangen_am` ist 1 von 5 OR-Signalen der „auszahlung"-Section. Für das **Kunde-Portal** liefert `getKundeFallDetailRecord` den Wert jetzt aus claim_payments (funktioniert); für View-gespeiste Caller `null`, aber `regulierung_am`/`auszahlung_*` decken die Section ab. Kein Reroute (würde claim_payments-Daten durch alle Caller fädeln — unverhältnismäßig). Akzeptiert.
- `lib/gutachter/subphase.ts:111` — reine Funktion; `|| fall.zahlung_eingegangen_am` ist Sekundär-Trigger hinter `status==='zahlung-eingegangen'` (Primär). Status trägt den Fall. Akzeptiert.
- `lib/fall/queries.ts:56` `FALL_SELECT_KUNDE` — listet `zahlungsweg, zahlung_eingegangen_am` aus der View; einziger Consumer `getFallForKunde` hat **keinen Call-Site mehr** (Kunde-Detail nutzt `getKundeFallDetailRecord`). Toter View-Read (NULL), kein Build-Fehler. Cleanup optional, hier belassen (out-of-scope).

---

## Shared-Helper (AGENTS.md Audit #3 — 4+ A-Write-Consumer)
**Neu:** `src/lib/faelle/claim-payments.ts` → `upsertCurrentClaimPayment(db, claimId, fields, createdByUserId?)`:
- „aktuelle" Row = `order('created_at',{ascending:false}).limit(1).maybeSingle()` (kein UNIQUE → 1:N create-or-update).
- vorhanden → `update(fields)`; sonst → `insert({ claim_id, ...fields, created_by_user_id })`.
- `fields` sind **bereits claim_payments-benannt** (`zahlungseingang_am`/`erhaltener_betrag`/`zahlungsweg`/`status`); status setzt der Caller (Eingang → `'erhalten'`, reine Methode → weglassen → DB-Default `'ausstehend'`).
- `{ ok, error }`-Result; state-machine/lexdrive (throw-basiert) werfen bei `!ok`, Actions geben Result weiter.

## Verify-Endzustand PR2
- Re-Grep (`scripts/cmm44-spj-grep.mjs`, jetzt mit Kommentar- + `splitOrKeepFaelleUpdate(...)`-Strip) = **9 Treffer, alle FP** (keine echten from('faelle')-Zugriffe der 11):
  - `admin/abrechnungen/actions.ts:376/383` — `from('faelle').select('claim_id')`-Lookup bzw. `from('faelle').update(faelleUpdate)` (Split-Rest); gematchtes `abrechnung_id` ist der **Funktions-Parameter** `reIssueAbrechnung(abrechnung_id)`.
  - `cron/monatsabrechnung/route.ts:80` — `update({lead_preis_*})`; `abrechnung_id` (Z.98) liegt auf `gutachter_abrechnungspositionen`.
  - `kunde/faelle/[id]/actions.ts:214` — `update({updated_at})`; `zahlungsweg` ist der Param von `updateZahlungsweg` darunter.
  - `abrechnung/kanzlei/erstelle-abrechnung.ts:101/223` — `kanzlei_abrechnung_id` ist (101) der App-Code-Filter `c.kanzlei_abrechnung_id` auf dem Embed-Ergebnis bzw. (223) der `claims.update`-Reroute neben `faelle.update({kanzlei_provision_status})`.
  - `abrechnung/process-case-billing.ts:94` — `guthaben_verrechnet_netto`/`sv_nachzahlung_netto` im **Return-Objekt** der Funktion neben `faelle.update(pcbFaelle)` (Split-Rest = nur lead_preis_*).
  - `abrechnung/revert-case-billing.ts:29` — `claims:claim_id(...)`-Embed-Select + JS-Normalisierung (`revClaim.guthaben_verrechnet_netto` etc.).
  - `lexdrive/process-event.ts:405` — `payload.auszahlung_gutachter_eingegangen_am` (Event-Payload).
- vitest: 8 Bucket-B routen nach claims; die 3 Bucket-A **nicht** im Set (12 Tests grün).
- `zahlung_erwartet_am` dokumentierte Phase-6-Ausnahme. tsc + Build grün.
