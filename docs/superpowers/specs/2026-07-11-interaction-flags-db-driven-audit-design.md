# Audit: Interaktions-gesetzte Flags → DB-Driven-Zielbild

- **Datum:** 2026-07-11
- **Session/Branch:** aar-956 (read-only Audit)
- **Status:** Spec / Taxonomie — **kein Code in dieser Session**. Jede Fix-Gruppe (§7) wird ein eigener späterer Plan/Session.
- **Methode:** 6 parallele, domänen-partitionierte read-only Audit-Agenten + Selbst-Verifikation der 3 Headline-Funde.

---

## 0. TL;DR — die Kern-Erkenntnis

Das ist **kein Greenfield**. Der Code besitzt bereits eine erstklassige *abgeleitete* Zustands-Schicht:

- `getClaimLifecycle` (`src/lib/claims/lifecycle.ts`) ⟷ SQL-View `v_claim_phase` als **bit-für-bit „Parity-Gate"** (Migration `…083708`),
- `resolveSubphase` (`src/lib/fall/subphase-resolver.ts`), `phase.ts`, `completion-signals.ts`.

Phase/Subphase sind dort schon **berechnet, nicht gespeichert**. Der Drift entsteht ausschließlich, wo **gespeicherte Interaktions-Flags neben dieser Schicht koexistieren, sie duplizieren oder umgehen**.

→ **„Flags DB-driven machen" heißt: eine ~60 % fertige Migration sauber zu Ende führen** — pro Flag-Klasse das passende Ziel-Muster anwenden, alle State-Writes durch *eine* Engine funneln, Gates zentralisieren, und echte Fakten in Ruhe lassen.

Nicht jeder interaktions-gesetzte Flag soll abgeleitet werden: **~die Hälfte des Inventars sind legitime Fakten oder Idempotenz-Marker** (Unterschriften, Consent, Admin-Entscheidungen, `*_sent`/`*_processed`). Diese abzuleiten wäre falsch oder schädlich (Doppel-Versand, Verlust von Rechts-/Audit-Spuren).

---

## 1. Methodik & Vertrauens-Level der Citations

- 6 Agenten, je eine Domäne (Claims-Lifecycle · Termine · Finance · Verifizierung/Branding · Dokumente/Consent · Tasks/SLA). Jeder Flag klassifiziert **D/F/H** + **Drift-Risk**.
- **Citations Stand: Branch `aar-956`, 2026-07-11.** file:line-Referenzen driften — **jeder Fix-Plan muss die Zeilen vor dem Edit re-verifizieren.**
- **Selbst-verifiziert** (mit Beweis, §3): endzustand-Multi-Writer · 2 CHECK-invalide Silent-Fail-Writes · `gutachter_termine`-CHECK-Enum. Rest = Agenten-Fund, hohe Konfidenz.

---

## 2. Die 6-Klassen-Taxonomie

Jeder Flag fällt in **genau eine** Klasse. Die Klasse determiniert das Ziel-Muster.

| # | Klasse | Definition | Ziel-Muster | Ableiten? |
|---|--------|------------|-------------|-----------|
| **1** | ✅ **Fakt / Idempotenz** | Menschliche Entscheidung, externes Ereignis, oder „Seiteneffekt ist passiert" (Mail/SMS raus, Webhook verarbeitet) | **Bleibt gespeichert.** Ggf. Evidenz-Record dazu. | **Nein** — ableiten wäre falsch/schädlich |
| **2** | 🔻 **Ableitbares Duplikat** | Spalte, die einen Zustand speichert, der schon aus anderen Rows/Spalten folgt; heute mit defensivem `OR` gelesen | Flag **droppen** → Quelle lesen (View / Row-Existenz); oder `GENERATED ALWAYS` | **Ja** |
| **3** | 🧬 **Event-backed State** | Ein reales Ereignis, dessen *Bool/Status-Read* aber ableitbar ist | **Event als Timestamp/Record speichern, Read via `IS NOT NULL` / View ableiten.** Doppel-Kopien kollabieren | Read ja, Event nein |
| **4** | 🔴 **Multi-Writer-Drift** | Zustand, den mehrere Pfade schreiben, die sich nicht synchronisieren | **Ein Writer (Engine-Funnel) + CHECK-Constraints.** Direkt-Writes verbieten (Ratchet) | n/a (Konsistenz-Problem) |
| **5** | 🔒 **Gate-Inkonsistenz** | Gate-Komposition inline in N Files dupliziert → Read-Side-Drift, Access-Control-Leck | **Shared-Resolver-Funktion**, alle Call-Sites importieren sie | n/a (DRY-Problem) |
| **6** | 💸 **Timer-statt-Signal** | Geld-/Ops-Zustand auf einer Uhr/Klick statt am Completion-Signal | **Am realen Completion-Signal gaten**, nicht am Timer | n/a (Gating-Problem) |

---

## 3. Selbst-verifizierte Headline-Funde (mit Beweis)

### 3.1 🔴 `claims.status` / `operative_status` / `work_state` — drei Achsen, ein Writer je Pfad (Multi-Writer-Drift)
`src/lib/claims/endzustand-actions.ts:104-119` (`setEndzustandFields`): schreibt `claims.status` **direkt** (Guard nur `.not('status','in',ENDZUSTAENDE)`), setzt die `endzustand_*`-Audit-Felder, **fasst `operative_status` nie an**, und gated auf eine *dritte* Achse `work_state` (`:143`). Alle 7 `markClaimAs…`-Actions laufen hier durch.
**Folge:** Ein per KB „reguliert"-gesetzter Claim behält seinen alten `operative_status` → Billing-/Offen-Filter, die auf `operative_status` keyen (z. B. `convert-lead-to-claim.ts:803`, `case-billing-batch`), sehen ihn **operativ offen**. Die Engine (`state-machine.ts`) schreibt `status` *und* `operative_status`; die endzustand-Actions und `sv-zuweisung/route.ts:265` + beide Creators umgehen sie. **#1-Fund.**

### 3.2 🔴 Zwei CHECK-invalide Silent-Fail-Writes (echte Bugs)
- `src/lib/onboarding/slots.ts:190` schreibt `status:'geplant'` (`.eq('status','reserviert')`-gated).
- `src/lib/termine/kb-booking.ts:268` schreibt `status:'kunde_storniert', cancelled_at` (KB-Beratungstermin-Storno).

**Beweis:** `gutachter_termine_status_check` (baseline `:6606` + `20260612011809`) erlaubt nur `reserviert, bestaetigt, abgelehnt, abgesagt, storniert, abgeschlossen, sv_gesucht, gegenvorschlag, verschoben, verlegt, verlegung_pending, dispatch_pending`. **Weder `geplant` noch `kunde_storniert` sind gültig** → UPDATE wird vom Constraint verworfen → Fehler versickert (Wizard fire-and-forget bzw. „Stornierung fehlgeschlagen"). Der KB-Storno-Pfad ist effektiv kaputt.
→ Ein **Status-vs-CHECK-Ratchet** (§8) hätte beide gefangen.

### 3.3 Bestätigte Enum-Wahrheit
`claims.status` gültige Werte (baseline `:4712`): `dispatch_done, in_bearbeitung, in_kommunikation_vs, reguliert, abgelehnt, an_externe_kanzlei_uebergeben, storniert, reguliert_vollstaendig, klage_rechtsstreit, verjaehrt, abgelehnt_final`. (`operative_status` ist eine separate 19-Wert-Achse.)

---

## 4. Vollständiges Flag-Inventar (nach Domäne)

> Spalten: `table.column` · repräsentiert · Klasse (D/F/H) · Drift-Risk · Write-Site (file:line) · Read-as-State?
> Kompakt gehalten; volle Write/Read-Details im jeweiligen Agenten-Kontext.

### 4.1 Claims & Fall-Lifecycle

| table.column | repräsentiert | Kl. | Risk | Write-Site | Read-State |
|---|---|---|---|---|---|
| `claims.operative_status` | 19-Wert Operativ-Cursor (SSoT der state-machine) | F | **High** | `state-machine.ts:197` (Engine) + **Bypässe** `sv-zuweisung/route.ts:265`, `convert-lead-to-claim.ts:414`, `create-for-fall.ts:137` | ja (offen/closed-Filter, ~15 Reader) |
| `claims.status` | Lifecycle/Terminal-Zustand | F | Med | `endzustand-actions.ts:106` (**direkt, bypass**), `state-machine.ts:192` (Engine) | ja (`lifecycle.ts:171`, `v_claim_phase`) |
| `claims.work_state` | Dispatch/Processing-Achse (parallel zu operative_status) | H | Med | `convert-lead-to-claim.ts:370`, `kanzlei-wunsch/actions.ts:575` | ja (VS-Entry-Gate `endzustand-actions.ts:143`) |
| `claims.abgeschlossen_am` | „Claim geschlossen"-Timestamp | **D** | **High** | `state-machine.ts:121` | ja — `KundeAktivStatusHero.tsx:37`, `FallKarte.tsx:76`, `mitarbeiter/performance:27`; **gelesen als `abgeschlossen_am OR status='abgeschlossen'`** |
| `claims.storniert_am` + `storno_grund` | Storno-Zeit/Grund | H | Med | `state-machine.ts:116` → **auf `auftraege` gepeelt** (`:164`); ohne Auftrag-Row **skip** (`:257`) | ja (re-termin-Gate) |
| `claims.endzustand_gesetzt_am/_durch_user_id/_grund` | Wer/wann/warum Terminal | F | Low | `endzustand-actions.ts:108-110` | nein (Audit) |
| `claims.sa_unterschrieben` + `_am` | SA/Abtretung signiert | H | Med | `convert-lead-to-claim.ts:388` (auch auf `leads`) | ja (`subphase-resolver.ts:419`) — **3-fach kopiert** |
| `claims.vollmacht_status` + `vollmacht_geprueft_am` | Vollmacht-Prüfstand | F | Med | Vollmacht-Flow | ja — Resolver liest **beide** als ein Signal (`:413`) |
| `claims.service_typ` | `komplett` vs `nur_gutachter` | F | Low | `convert-lead-to-claim.ts:380` | ja (blendet Regulierungs-Phase aus) |
| `claims.kunde_no_show_count` | No-Show-Zähler (Auto-Storno ≥2) | F | Med | `storno-actions.ts:148` (**non-atomic RMW**) | ja (`:155`) |
| `claims.kanzlei_uebergeben_am` | An Kanzlei übergeben | H | Med | `state-machine.ts:124` | ja — 1 von ≥3 „Handover"-Signalen |
| `claims.google_review_gesendet` | Review-Request raus | F | Low | Post-Close-Flow | ja (`subphase-resolver.ts:219`) |
| `claims.kanzlei_provision_status` | Kanzlei-Provision `berechtigt/abgerechnet/ausgezahlt` | D/H | Med | `erstelle-abrechnung.ts:234`, Webhook `:347` | ja (Eligibility-Gate `:98`) |
| `leads.status` / `qualifizierungs_phase` | Lead-Lifecycle (2 parallele Achsen) | F/H | Med | `convert-lead-to-claim.ts:757`, `dispatch-fall-actions.ts:366` | ja |
| `leads.sa_unterschrieben` + `vollmacht_signiert_am` | Lead-Seite Signing (feeds erfassung) | H | **High** | Flow | ja (`lifecycle.ts:257`) — **dieselbe Wahrheit auf `leads` UND `claims`** |
| `leads.konvertiert_zu_claim_id/_fall_id` | Konversions-Link (Idempotenz) | F | Low | `convert-lead-to-claim.ts:761` | ja (`:93`) |
| `auftraege.status` | Erstgutachten-Progress | F/H | Med | Auftrag-Flow | ja (begutachtung-Subphase) |
| `auftraege.filmcheck_ok` | QC-Filmcheck bestanden | F | Med | QC-Flow | ja (`lifecycle.ts:243`) |
| `gutachter_termine.durchgefuehrt_am` / `sv_angekommen_am` / `sv_unterwegs_seit` | Termin-Progress-Marker | H | **High** | Termin-Flow | ja — **stale nach Verlegung**, Resolver muss `verlegt/verschoben/storniert` hart ausschließen (`:209`) |
| `kanzlei_faelle.vs_reaktion_typ/vs_kuerzungs_typ/ruege_counter/anschlussschreiben_am/lexdrive_case_id` | Regulierungs-Sub-States | F/H | Med | Engine-Peel `state-machine.ts:158` + Kanzlei-Flow | ja (heftiges Subphase-Gating) |

### 4.2 Termine & Scheduling
> Physische Tabelle = `gutachter_termine` (kein `termine`). Slots leben hier (`status='reserviert'` + `reserviert_bis`-TTL). `reparatur_termine` **existiert noch nicht** (WS6-geplant) — Live-Analogon ist die SV-Termin→Workstate-Lücke.

| table.column | repräsentiert | Kl. | Risk | Write-Site | Notiz |
|---|---|---|---|---|---|
| `gutachter_termine.status` | Termin/Slot-Lifecycle | H | **High** | multiple Direkt-Writer (bypass Engine) | Kern-Achse; siehe Drift-Traps |
| `…status='geplant'` | (ungültig!) | — | **BUG** | `slots.ts:190` | 🔴 CHECK-invalid → Silent-Fail (§3.2) |
| `…status='kunde_storniert'` | (ungültig!) | — | **BUG** | `kb-booking.ts:268` | 🔴 CHECK-invalid → Storno kaputt (§3.2) |
| `…status='abgeschlossen'` | Termin fertig | **D** | Med | `actions.ts:446`, `close-nur-gutachter-termin.ts:57` | ableitbar aus `durchgefuehrt_am` |
| `…status='abgesagt'` | Kunde storniert | F | **High** | `api/kunde/termin/absagen/route.ts:89` | Resolver **ignoriert** `abgesagt` → Claim hängt |
| `…status='abgelehnt'` | SV lehnt ab | F | Med | `sv-ablehnung.ts:35` | kein Workstate-Pfad |
| `…status='dispatch_pending'` | Dead-Pin „immer buchbar" | F | Med | Dead-Pin-Flow | Exclusion-Constraint-Exemption |
| `gutachter_termine.durchgefuehrt_am` | **Completion-Anker** (Billing+Close) | F | **High** | `actions.ts:401/447`, `close-nur-gutachter-termin.ts:57` | authoritative; mehrere Writer |
| `sv_unterwegs_seit` / `sv_angekommen_am` | SV unterwegs/angekommen (GPS) | H | Low | `actions.ts:64/270` | Geofence-Event |
| `losgefahren_am` | SV „losgefahren" (manuell) | H | Med | `trigger-losgefahren.ts:77` | **dupliziert** `sv_unterwegs_seit` |
| `sv_no_show_am` / `sv_ablehnung_am` | Team/SV-Marker | F | Med | `actions.ts:637`, `sv-ablehnung.ts:35` | Anti-Gaming-Guards |
| `no_show_gemeldet_am` | Kunde-No-Show (SV meldet) | F | Med | `storno-actions.ts:141` | + `claims.kunde_no_show_count` |
| `reserviert_bis` | Reservierungs-TTL | F | Med | `writes.ts:55` | Cron `expire_geblockte_termine…` self-heilt |
| `final_verbindlich_ab` | 24h-Binding-Lock | H | Low | `bestaetige.ts:36` | = `bestaetigt_at+24h` (ableitbar) |
| `re_termin_token` + `…_eingelaufen_am` | Magic-Link Re-Pick | F | Med | `verlege-nach-no-show.ts:102`, `re-termin/[token]/actions.ts:157` | Issue+Consume-Event |
| `reminder_15min_sent_at` / `reminder_5min_sent_at` / `notification_*_gesendet_am` | Notif-Dedup | F | Low | `actions.ts:197/221`, `notify-kunde-angekommen.ts:49` | 🔒 Idempotenz |
| `verlegung_initiator_kunde` + `verlegung_grund/quelle_id` | Reschedule-Provenance | F | Low | `state-transitions.ts:75` | — |
| `gutachter_finder_anfragen.reservierter_slot_von/bis` + `reservierter_sv_id` | GFA-Wizard-Soft-Hold | F | Med | `slots.ts:138` | **außerhalb `v_belegung`** → paralleler Reservierungs-Quell |

### 4.3 Finance / Provisionen / Abrechnung / Billing

| table.column | repräsentiert | Kl. | Risk | Write-Site | Notiz |
|---|---|---|---|---|---|
| `makler_provisionen.status` | Makler-Provision `pending→freigegeben` | **D** | **High** | `release-makler-provisionen/route.ts:161` (Cron, **blind hold_until-Timer**) | 💸 kein Completion-Gate; `NULL operative_status` → Release-Default. Dormant (0 Rows), Modell = inbound-Haftpflicht-only |
| `makler_provisionen.hold_until` | Freigabe-Gate-TS | D | **High** | App (dormant) | reiner Timer |
| `abrechnungen.status` | Rechnungsstatus | H | Med | `abrechnung-einzug/route.ts:167`, `abrechnungen-actions.ts:19`, Generator `:136` … | **Crons filtern auf `bezahlt_am`/`storniert_am`, nicht `status`** → Duplikat der Timestamps |
| `abrechnungen.bezahlt_am` | Zahlungseingang (Stripe) | F | Med | `abrechnung-einzug:162`, Webhook `:155/280` | 🔒 Fakt; stripe-reconcile prüft Drift |
| `abrechnungen.einzug_versucht_am` | Lastschrift-Versuch-Gate | F | Med | `abrechnung-einzug:165` | Doppel-Charge-Guard; wenn gesetzt aber nicht `bezahlt` → stuck |
| `abrechnungen.storniert_am` / `stripe_payment_intent_id` / `ersetzt_durch_…` | Void/Stripe-Ref/Korrektur | F | Low | revert/einzug/reissue | — |
| `abrechnungen.reminder_gesendet_am` | „zuletzt erinnert" (legacy) | **D** | Low | `abrechnung-reminder:130` | **admitted Duplikat** von `abrechnung_reminders` |
| `abrechnung_reminders.reminder_typ` | welche Stufe raus | D | Low | reminder/mahnung-Crons | Audit-Table, korrekt derived |
| `kanzlei_abrechnungen.status` + `bezahlt_am` | Kanzlei-Rechnung | H/F | Low | `erstelle-abrechnung:157`, Webhook `:325` | — |
| `provisionen_maik.status` | Maik/Ads-Provision | H | Med | `actions.ts:32/56`, maik-cron `:39` | Bulk `markMonthAsPaid` = Monats-Klick, kein Transfer-Beweis |
| `gutachter_monatsabrechnungen.status='ueberfaellig'` | Legacy SV-Rechnung überfällig | H | **High** | `zahlungspruefung/route.ts:20` (Cron, **Datum**) | 💸 **deprecatete Tabelle** |
| `sachverstaendige.ist_aktiv=false` | SV deaktiviert | H | **High** | `zahlungspruefung/route.ts:21` (Cron, bei überfällig) | 💸 Ops-Lockout aus deprecateter Billing-Tabelle, kein Re-Aktivierungs-Pfad |
| `sachverstaendige.onboarding_status/anzahlung_status` | Onboarding/Anzahlung | H/F | Med/Low | sv-payment-reminders `:96`, Webhook | `blockiert` auf Tag-21-Timer |
| `sachverstaendige.werbebudget_guthaben_netto` | Werbe-Guthaben (Ledger-Balance) | F | Med | process-case-billing `:78`, revert `:53` | **in-place mutiert, keine Ledger-Rows**; Race |
| `gutachter_finder_anfragen.billing_review_status` / `abrechnung_storniert_am` / `abgerechnet_am` | Monika-B Review/Void/abgerechnet | H/F/D | Med/Low | `billing-actions.ts:114/184`, embed-cron `:212` | Review-Pause-Gate |
| `claims.lead_preis_netto` / `guthaben_verrechnet_netto` / `abrechnung_id` | SV-Lead-Bepreisung / „schon fakturiert" | D | Med | process-case-billing `:97`, monatsabrechnung `:247` | Presence = Idempotenz-Flag; dupliziert positionen-Tabelle |
| `finance_eintraege.status` / `gutschriften.status` | Kanzlei-Provision-Ledger / SV-Gutschrift | D/F | Low | DB-Trigger `trigger_kanzlei_provision()` / revert `:138` | — |
| `claims.mietwagen_rechnung_vorhanden` | Mietwagen-Rechnung da | F | Low | (extern) | Cron-Gate `cron.ts:121` |

### 4.4 Verifizierung / Onboarding / Partner-Status / Branding-Gates

| table.column | repräsentiert | Kl. | Risk | Write-Site | Notiz |
|---|---|---|---|---|---|
| `sachverstaendige.verifiziert` | Admin bestätigt Pflichtdoks → „trusted" | F | Med | `verifizierung-actions.ts:426/467`; Reset `:352` | Gate für **anon-RLS Map-Visibility** + Kunden-Branding; **Reset nur bei expliziter Doc-Ablehnung** (nie wenn Doks später weg) |
| `sachverstaendige.use_custom_branding` | White-Label opt-in | F | **High** | `branding-actions.ts:125…`, `api/branding/save:78` | 🔒 **Gate `verifiziert && use_custom_branding` in ≥5 Files inline dupliziert** (§5) |
| `sachverstaendige.ist_aktiv` | Operativ live (post-payment) | H | **High** | Stripe-Webhook `:91/227/424`, willkommen `:120`, verifizierung `:267` | muss mit `portal_zugang_freigeschaltet` **zusammen** wandern, kein Constraint |
| `sachverstaendige.portal_zugang_freigeschaltet` | Hard-Gate Portal-Entry | H | Med | Stripe-Webhook `:89/225/419`, willkommen `:117` | Redirect `gutachter/layout.tsx:71` |
| `sachverstaendige.verifizierung_status='frist_ueberschritten'` | Tier-2-Frist abgelaufen | F/Cron | Med | `verifizierung-reminder/route.ts:62` (Cron) | 🔒 **nur Banner** (`layout.tsx:42`), **blockt real KEINE Fall-Zuweisung** — Intent≠Enforcement |
| `sachverstaendige.sa_vorlage_status` | Tier-1-Doc-Review | F | Low | `verifizierung-actions.ts:60/91` | Legacy |
| `sachverstaendige.vertrag_unterschrieben` | Vertrag signiert | H | Med | onboarding `:162`, finalize `:87`, Webhook `:92` (**„defensiv"**) | ableitbar aus `vertraege_unterzeichnet`-Row; Webhook schreibt defensiv wegen **früherem Drift** |
| `sachverstaendige.gesperrt_seit` | Admin-Block (separate Achse!) | F | Low | `_karte/actions.ts:54`, `verifizierung-actions.ts:245` | „aktiv" ist auf ist_aktiv/portal_zugang **UND** gesperrt_seit gesplittet |
| `sachverstaendige.basic_onboarding_abgeschlossen_am` | Wizard fertig | **D** | Med | `sv-onboarding/finalize.ts:88` | Completeness-Flag, ableitbar aus Record-Existenz |
| `organisationen.use_custom_branding` / `onboarding_status` / `community_leaderboard_aktiv` | Org-Branding/Onboarding/Leaderboard-optin | F/H | Med/Low | `api/branding/save:86`, onboarding `:150` | Sub-SV erben Branding |
| `makler.status` | Makler-Account-State | F/H | Med | Vertrieb-Lane (`anlegeMaklerKern`) | **Hard-Gate** `makler/(shell)/layout.tsx:26` — free-text, kein Enum-Constraint sichtbar |
| `community_leaderboard.rang` | Monats-Rang | **D** | Low | `community-leaderboard-update:114` (Cron) | ✅ **Vorbild-Muster**: voll derived, täglich neu, nie ein Gate |
| `werkstaetten.verifiziert` / `.status` | Werkstatt-Verifikation | ? | Med | **kein App-Write/Read gefunden** | Schema-Flags ohne aktives Gating — klären |
| `promotion_codes.aktiv` | Promo aktiv | F | Low | (Vertrieb) | read-only Filter |

### 4.5 Dokumente / Vollmacht / Consent / DSGVO / Signatures

| table.column | repräsentiert | Kl. | Risk | Write-Site | Notiz |
|---|---|---|---|---|---|
| `claims.sa_unterschrieben` + `_am` | SA signiert | F | Low | `flow/[token]/actions.ts:911` | Bool+TS+Evidenz atomar co-written |
| `claims.vollmacht_signiert_am` (**kein Bool**) | Vollmacht signiert | H | Low | `flow/[token]/actions.ts:1546`, `unterschrift-upload.ts:134` | ✅ **Exemplarisch**: „Bool-Semantik aus `IS NOT NULL` abgeleitet" (`:1535`) |
| `leads.vollmacht_datum` | Vollmacht-Datum (CPA-Billing) | F | Med | `flow/[token]/actions.ts:1552` | **dupliziert** `claims.vollmacht_signiert_am`; Kommentar dokumentiert **früheren Landmine** (schrieb auf nicht-existente `faelle.vollmacht_datum`) |
| `leads.sa_unterschrieben` + `sa_datum` | Lead-Seite SA | F | Med | `flow/[token]/actions.ts:865` | Mirror von `claims.sa_unterschrieben` — **2 SSoT** |
| `claims.abtretung_signiert_am` / `abtretung_pdf` / `vollmacht_pdf` | Signatur-Evidenz | F | Low | `unterschrift-upload.ts:131`, `actions.ts:152` | Twin-`faelle.*`-Spalten tot (Drop Phase 6) |
| `leads.zb1_status` | ZB1/Fahrzeugschein-OCR-Ergebnis | H | Med | `self-service-actions.ts:366`, `upload/zb1/[token]/actions.ts:48…` (**3 Sites**) | `fehlgeschlagen` echt; `hochgeladen` ableitbar aus `zb1_url` |
| `leads.polizeibericht_status` / `zeugenaussage_status` (+`_url`+`_am`) | Upload-Presence | **D** | Med | `self-service-actions.ts:450/521` | **Presence-Triade dupliziert `fall_dokumente`-Row** (legacy Twilio-compat) |
| `pflichtdokumente.status` | Required-Doc-Lifecycle | F | Low-Med | `zuordnung.ts:104…`, `upload/dokumente/[token]/actions.ts:307` | `geprueft/abgelehnt` = QC-Entscheid |
| `dokument_upload_anfragen.status` (+`slots[].hochgeladen`) | Multi-Slot-Request-State | H | Med | `ad-hoc-anforderung.ts:119…` | `komplett` = **cached Derivation** von `slots.every()`; **zwei Enum-Vokabulare** auf einer Spalte |
| `fall_dokumente.ocr_status` + `ocr_extracted_data` | Doc-OCR-Ergebnis | H | Low | `api/ocr-trigger/route.ts:37…` | — |
| `fall_dokumente` **Row-Existenz** (typ=…) | „Dokument X existiert" | F | Low | `actions.ts:156`, `upload/dokumente:324`, `api/sv/upload-gutachten:65` | ✅ **die SSoT, die die Presence-Bools duplizieren** |
| `gutachten.status='final'` + `ocr_status` + `pdf_uploaded_at` | SV-Gutachten-State | H | Low | `gutachten/ocr-actions.ts:81…` | — |
| `auftraege.status='gutachten'` + `gutachten_url` | SV hat Gutachten abgegeben | H | Med | `api/sv/upload-gutachten:82` | Split-Write-Path (finalize gated jetzt) |
| `faelle.gutachten_vorhanden` | „ein Gutachten existiert" | **D** | **High** | **nur** `api/seed-testdata:796` — **kein Live-Write** | 🔻 Waisen-Presence-Bool; bleibt `false` während echtes Gutachten existiert → jeder Reader falsch |
| `qc_checkliste.gutachten_vorhanden` | KB-QC-Häkchen (manuell) | F | Low | `QcChecklisteBlock.tsx:40` | legit Checklist-Item |
| `dsgvo_loeschauftraege.status` (+audit_payload) | Art.17-Deletion-Workflow | F | Low | `dsgvo-loeschung.ts:47…` | ✅ sauberer State-Machine + Audit-Snapshot |

**Consent-Sonderfall:** Es gibt **keinen** diskreten `einwilligung`/consent-Bool. DSGVO-Datenverarbeitungs-Consent steckt **implizit in der SA-Unterschrift** (SA-PDF-Text `actions.ts:107`). Audit-Spur = signiertes PDF + Signatur-Bild + `fall_dokumente`-Row. Rechtlich vermutlich tragfähig, aber **kein separat abfragbares „Consent zu Zeit T"-Feld** → §10 Legal-Klärung.

### 4.6 Tasks / Reminders / Notifications / SLA / Inbound / Leads

| table.column | repräsentiert | Kl. | Risk | Write-Site | Notiz |
|---|---|---|---|---|---|
| `tasks.status` (+`erledigt_am`) | Task-Lifecycle | H | Med | `create-task.ts:81`, `tasking.ts:75…`, `resolve-tasks.ts:63` | Human-worked = F; Auto-Chase = D |
| `tasks.auto_resolved_am/_grund` | Entity fertig, Task bleibt offen+Banner | **D** | Med | `resolve-tasks.ts:65` | **kopierter Hint** einer anderen Completion; stale wenn Entity re-opens |
| `tasks.eskaliert_am` | Escalation schon gespawnt | F | Low | `eskalation-cron.ts:125` | 🔒 Dedup |
| `task_reminders.status='sent'` (+`versendet_am/versuche`) | Reminder raus | F | Low | `reminder-sender.ts:116…` | 🔒 Idempotenz |
| `termin_reminders.status` (+`versuche/fehler`) | Termin-Reminder raus | F | Low | `reminders/generate.ts:79`, `send-reminders:69` | 🔒 Idempotenz |
| `sla_tracking.status` | SLA `pending/breached/completed` | H | **High** | `tracker.ts:41/112`, `kanzlei-mahnungen.ts:423` | `completed`=F; **`breached`=D** (Cron-Flip aus `breach_at<now`) |
| `sla_tracking.breach_at` | Deadline | F | Low | `tracker.ts:39` | legit gespeicherte Deadline |
| `sla_tracking.blocker_rolle/_grund` | Wer blockt | **D** | Med | `kanzlei-mahnungen.ts:425` (**Stufe-1-Snapshot**) | via `detectBlocker()` live rechenbar; eingefroren → mahnt falsche Partei |
| `sla_tracking.n_mahnungen/letzte_mahnung_am` | Dunning-Stufe | F | Low | `kanzlei-mahnungen.ts:465` | 🔒 je = echte Mail/WA |
| `leads.status` | Lead-Lifecycle | H | Med | `create-lead.ts:71`, `mark_expired_leads` RPC | Human-Qual=F; 7d-Auto-Disqual=D |
| `leads.reminder_1/2/3_sent_at` | Nurture-Cascade raus | F | Low | `send-lead-reminders:126` | 🔒 Idempotenz |
| `leads.disqualifiziert` | Lead tot | **D** | Med | `send-lead-reminders:155` (RPC) | 7d elapsed vs created_at |
| `notification_events.status` (+`retry_count/next_retry_at`) | Event-Fan-out | F | Low | `notifications/process:74…` | 🔒 Idempotenz+Backoff |
| `notification_deliveries.status='sent'` | Per-Kanal-Delivery | F | Low | `notifications/process:98…` | 🔒 Idempotenz |
| `webhook_events.status='processed'` | LexDrive-Event verarbeitet | F | Low | `lexdrive/process-event.ts:725…` | 🔒 Dedup |
| `reklamationen.status='auto_abgelehnt_frist'` | Complaint-Frist | H | Med | `reklamation-frist-check:27` (Cron) | `auto_abgelehnt`=D (frist_bis vs now) |
| `calls.status` (+`bridge.leg_*`) | Call-Lifecycle | F | Low | `call-actions.ts:60`, `aircall/webhook:37…` | echte Telefonie-Events |
| `nachrichten.gelesen` / `external_message_id` | Msg gelesen / Inbound-Dedup | F | Low | `baileys/inbound:88` | 🔒 Dedup |
| **Inbound-Match-State** | — | **D** | — | *(nicht persistiert)* | ✅ `matchInboundToFall` rechnet live — Vorbild |

---

## 5. Cross-Domain Drift-Traps (nach Risiko×Blast-Radius geordnet)

1. **🔴 `operative_status` ⟷ `status` ⟷ `work_state` Multi-Writer** — endzustand-Actions + sv-zuweisung + Creators umgehen die Engine (§3.1). Silent open/closed-Divergenz trifft Billing-Crons.
2. **🔴 `gutachter_termine.status` hat keinen Pfad in den Claim-Workstate** — nur Trigger `termin_sync_auftrag_status` (keyt auf Timestamps, forward-only). `abgesagt`/`abgelehnt`/`dispatch_pending` lassen Claim hängen; Resolver filtert nur `storniert/verlegt/verschoben` (`:208`).
3. **🔴 2 CHECK-invalide Silent-Fail-Writes** — `geplant` (`slots.ts:190`), `kunde_storniert` (`kb-booking.ts:268`) (§3.2). Echte Bugs.
4. **🔒 Branding-Gate `verifiziert && use_custom_branding` in ≥5 Files inline** — `kunden-theme.ts:65`, `token-theme.ts:34`, `email/…/layout.tsx`, `kunde/termin/[token]/page.tsx:153`, `kunde/layout.tsx:280`; SV-Portal gated bewusst nur auf halb → **eine vergessene Hälfte leakt unverifiziertes Branding an Kunden** (Access-Control/Legal).
5. **💸 `makler_provisionen` Release auf blindem `hold_until`-Timer** — kein Completion-Gate; `NULL operative_status` → Release-Default. Dormant (0 Rows), aber wired-dangerous.
6. **💸 `zahlungspruefung` deaktiviert SV aus deprecateter `gutachter_monatsabrechnungen`** auf reinem Datumsvergleich, kein Re-Aktivierungs-Pfad.
7. **🔻 `claims.abgeschlossen_am`** — Duplikat des Terminal-`status`, defensiv `OR`-gelesen; andere Terminals (`storniert`/`verjaehrt`) setzen es **nicht** → „closed" laut `status`, „offen" laut `abgeschlossen_am`.
8. **🔻 `faelle.gutachten_vorhanden`** — Waisen-Presence-Bool, nur von `seed-testdata` gesetzt.
9. **🔒 `verifizierung_status='frist_ueberschritten'`** — nur Banner, blockt real keine Fall-Zuweisung (Intent≠Enforcement).
10. **🔒 `sla_tracking.status='breached'` + `blocker_rolle`** — Cron-Snapshots, driften von elapsed-vs-completion; SV-SLA-`sla-check` hat **keinen** Completion-Re-Check → permanent falscher Breach + Spurious `kritisch`-Task.
11. **🧬 Dual-SSoT Signing** — `sa_unterschrieben`/`vollmacht` auf `claims` **und** `leads`; `lifecycle.ts` liest Lead-Copy, Resolver liest Claim-Copy.
12. **🔻 Stale Termin-Tracking-TS als Phase-Gates** — `sv_unterwegs_seit`/`durchgefuehrt_am` stale nach Verlegung (Resolver muss hart ausschließen).
13. **CMM-49-Landminen** — `ocr-trigger` schreibt noch `faelle`; tote `faelle.*`-Signatur-Spalten referenziert (Break bei Drop).

---

## 6. Ziel-Muster im Detail (pro Klasse)

**K1 — Fakt/Idempotenz → bleibt.** Regel: *Wenn Ableiten einen Doppel-Seiteneffekt ermöglichen (Doppel-Versand/-Charge) oder eine menschliche/rechtliche Entscheidung löschen würde → speichern.* Alle `*_sent`/`*_processed`/`bezahlt_am`/`verifiziert`/`gesperrt_seit`/Consent/Signaturen. **Nicht anfassen.**

**K2 — Ableitbares Duplikat → droppen + Quelle lesen.** Zwei Werkzeuge: (a) **View/Row-Existenz-Read** (`abgeschlossen_am` → `v_claim_phase.main_phase='abschluss'`; Presence-Bools → `EXISTS fall_dokumente`); (b) **`GENERATED ALWAYS AS (…) STORED`** wo die Query-Shape die Spalte braucht. Reader mit defensivem `OR` sind die Sollbruchstellen — die zuerst.

**K3 — Event-backed → Event speichern, Read ableiten.** Das `vollmacht_signiert_am`-Vorbild generalisieren: **Timestamp/Record** als Wahrheit, **Bool/Status als abgeleiteter Read** (`IS NOT NULL` / View / generated). Doppel-Kopien (`sa_unterschrieben` bool + `_am` + PDF; claims↔leads) auf **eine** Wahrheit kollabieren.

**K4 — Multi-Writer → Single-Writer-Funnel + Constraints.** Alle Status-Writes durch **eine** Engine (`state-machine.ts` für claims, `state-transitions.ts` für Termine). Direkt-`.update({status})` außerhalb der Engine per **Ratchet verbieten** (§8). CHECK-Constraints als Backstop (hätten `geplant`/`kunde_storniert` gefangen). Für claims: entweder endzustand-Actions durch die Engine routen, **oder** ein Trigger, der `operative_status` bei `status`-Terminal-Write mitzieht.

**K5 — Gate-Inkonsistenz → Shared-Resolver.** Eine Funktion `kundenBrandingErlaubt(sv)` = `verifiziert && use_custom_branding`; **alle** kundensichtbaren Call-Sites importieren sie. Analog `svDarfFaelleEmpfangen(sv)` (schließt `frist_ueberschritten`/`gesperrt_seit`/`ist_aktiv` ein) — und **real im Dispatch/Matching anwenden**, nicht nur als Banner.

**K6 — Timer→Signal.** Geld/Ops-Übergänge am **realen Completion-Signal** gaten: Makler-Release erst wenn Claim/Reparatur nachweislich fertig (nicht `hold_until` allein); SV-Deaktivierung an die **aktive** Billing-Tabelle (`abrechnungen`) + Re-Aktivierungs-Pfad koppeln.

---

## 7. Priorisierte Fix-Gruppen (jede = eigener späterer Plan)

| FG | Titel | Klasse | Risk | Kern-Files | Aktive Nachbar-Lane |
|----|-------|--------|------|-----------|---------------------|
| **FG1** | claims Single-Writer-Funnel (status/operative_status/work_state) | K4 | **HIGH** | `endzustand-actions.ts`, `state-machine.ts`, `sv-zuweisung/route.ts`, `create-for-fall.ts` | 470d55c9 (state-machine/ops) |
| **FG2** | Termin→Workstate-Mirror + 2 Silent-Fail-Bugs + CHECK-Backstop | K4 | **HIGH** | `slots.ts`, `kb-booking.ts`, `api/kunde/termin/absagen`, `subphase-resolver.ts`, Trigger | 6c630247 (Termin-Lifecycle) |
| **FG3** | Branding-Gate Shared-Resolver + verifiziert-clear + frist-Enforcement | K5 | **HIGH** (Access) | `kunden-theme.ts`, `token-theme.ts`, `email/…/layout.tsx`, `kunde/*`, Dispatch-Matching | — |
| **FG4** | makler-Release Timer→Signal + zahlungspruefung→aktive Tabelle | K6 | **HIGH** (€) | `release-makler-provisionen/route.ts`, `zahlungspruefung/route.ts` | 457ab612 (Provision) |
| **FG5** | Derivable-Duplikat-Demotions | K2 | MED | `abgeschlossen_am`, `faelle.gutachten_vorhanden`, `gutachter_termine.status='abgeschlossen'`, Upload-Triaden, `abrechnungen.status`, `reminder_gesendet_am`, `tasks.auto_resolved` | mehrere |
| **FG6** | Dual-SSoT-Kollaps (claims↔leads Signing) + work_state/operative_status-Konsolidierung | K3 | MED | `convert-lead-to-claim.ts`, `lifecycle.ts`, `subphase-resolver.ts` | — |
| **FG7** | SLA `breached`/`blocker` derive-at-read + SV-SLA Completion-Re-Check | K2 | MED | `sla/tracker.ts`, `kanzlei-mahnungen.ts` | — |
| **FG8** | CMM-49-Housekeeping (faelle-Drop-Landminen) | K2 | Housekeeping | `ocr-trigger/route.ts`, tote `faelle.*`-Reader | CMM-49-Lane |

**Reihenfolge-Empfehlung:** FG1 → FG2 (beide K4, gleiche Engine-Denke) → FG3/FG4 (parallel, unabhängig) → FG5–FG8 (Boy-Scout).

---

## 8. Ratchet-Konzept — neue Drift verhindern

Analog zu `check:knip` / `check:component-set` / `check:token-audit`: ein **`check:flag-drift`**-Script mit Baseline + Boy-Scout. Erkennt (statisch/AST):

1. **Direkt-`.update({ status|operative_status|work_state: … })` auf Engine-Tabellen außerhalb einer Allowlist** (die Engine-Module). → fängt K4.
2. **Neue defensive-`OR`-Reads** (`X_am || status === '…'`). → fängt K2-Neuzugänge.
3. **Neue Presence-Booleans** (`*_vorhanden`/`*_hochgeladen` als bool-Spalte statt Row-Existenz).
4. **Inline-Branding-Gate-Kompositionen** (`verifiziert && use_custom_branding`) außerhalb des Shared-Resolvers. → fängt K5.
5. **Status-Literale, die nicht im CHECK der Spalte stehen** — hätte `geplant`/`kunde_storniert` gefangen. (Höchster Sofort-Wert; evtl. eigenes kleines Script.)

Baseline = aktuelle Verletzer (grandfathered), Boy-Scout senkt. Lokal `--warn` (exit 0), CI `--ratchet`.

---

## 9. Cross-Session-Boundaries & Nicht-Ziele

- **Aktive Nachbar-Lanes** (koordinieren, nicht trampeln): `6c630247` (Termin-Lifecycle/Kalender), `457ab612` (Provision), `470d55c9` (ops-state/state-machine), Werkstatt-Lanes (`38ffe1c4`, `62dd5486`, Repair-Loop), Fälle-Hub. Jeder FG-Plan stimmt sich mit der ownenden Lane ab (Marker unter `…/memory/`).
- **Provisions-Modell-Korrektur (Aaron, 11.07.):** Provision nur **inbound** (Werkstatt vermittelt uns Haftpflichtschaden, `claims.werkstatt_id`). Outbound (Claimondo→Werkstatt) = keine Provision. FG4 betrifft das **Release-Mechanismus**-Muster (Timer vs. Signal), nicht das Modell.
- **Nicht auf diesem Branch:** `freie_werkstattwahl` / `abrechnungsweg` (nur andere Lanes/Memory). `reparatur_termine` existiert noch nicht (WS6).
- **Bewusst unangetastet:** alle K1-Fakten/Idempotenz-Flags; die gesunde Derived-Schicht (`getClaimLifecycle`/`v_claim_phase`/`resolveSubphase`); `community_leaderboard.rang` + Inbound-Match (Vorbilder).

---

## 10. Offene Design-Fragen (vor den FG-Plänen zu klären)

1. **Consent-Record (Legal):** Reicht SA-Signatur-Abdeckung, oder braucht es ein diskretes „Consent zu Zeit T"-Feld (DSGVO-Auditierbarkeit)? → Legal.
2. **`work_state` vs `operative_status`:** Zu einer Achse konsolidieren, oder beide formalisieren (mit Trigger-Kopplung)? (Betrifft FG1+FG6.)
3. **Pro Fall: View vs `GENERATED`-Spalte vs Trigger** — Entscheidungs-Kriterium? (Faustregel-Vorschlag: Query-Shape braucht Spalte → generated; sonst View-Read.)
4. **`abgeschlossen_am`:** Ganz droppen (Reader auf `v_claim_phase` umziehen) oder `GENERATED` aus `status`?
5. **Engine-Ownership:** Sollen **alle** claims-Status-Writes durch die Engine, oder audited Direkt-Writes + Trigger-Sync für `operative_status`? (K4-Grundsatzentscheid.)

---

## Anhang — Vorbild-Muster im Code (nachahmen)

- `claims.vollmacht_signiert_am` — Timestamp + `IS NOT NULL`-Read (`actions.ts:1535`).
- `getClaimLifecycle` ⟷ `v_claim_phase` — TS/SQL-Parity-Gate.
- `community_leaderboard.rang` — voll Cron-derived, nie Gate.
- `matchInboundToFall` — Zustand live gerechnet, nichts persistiert.
