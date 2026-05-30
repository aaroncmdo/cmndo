# AAR-939 — Contract: Lifecycle (e00ee6d8) ↔ Billing (98044b6b)

**Datum:** 30.05.2026 (rev. 23:30) · **Status:** Spec/Contract — NICHTS gebaut. Billing wartet bis Lifecycle fertig (Aaron-Reihenfolge).
**Quelle:** Read-only-Audit-Workflow + volle Lese der e00ee6d8-Commits 03e7fbca9 + 30022fde7.

## ⚑ ZWEI FLAGS für die nächste Session (Aaron 30.05. ~23:25, koordiniert e00ee6d8 ↔ 98044b6b)

1. **3c Auto-Close hängt an `durchgefuehrt_am` (Termin durchgeführt), NICHT an einem Gutachten-Upload.** Der Gutachter lädt bei der nur-Gutachter-Strecke KEIN Gutachten auf die Plattform, es gibt KEINEN QC. Also kann nichts den Auftrag per Upload/QC abschließen — der einzige reale Abschluss-Marker ist der durchgeführte Termin. **e00ee6d8s Auto-Close (Auftrag→Terminal-Status) UND 98044b6bs €70-Billing hängen am SELBEN Event: `gutachter_termine.durchgefuehrt_am` NULL→NOT NULL.** Ein Wahrheitspunkt. (Beantwortet e00ee6d8s offene Frage „Gutachter wird nicht zum Hochladen gebeten — wie schließen wir ab".)
2. **Naming: `gutachten_abgeschlossen` ist leicht schief** — es gibt gar kein Platform-Gutachten. End-State-Semantik stimmt, Name überdenkbar → z.B. `vermittlung_abgeschlossen` oder `termin_durchgefuehrt`. Nicht blockierend, aber vor Verfestigung entscheiden (claims_status_check + v_claim_phase + lifecycle.ts ABSCHLUSS_SUBSTATE + SUBPHASE_LABEL müssten dann mitgezogen werden).

## Geschäftsregel (Aaron 30.05. final)

- Variante B = nur-Gutachter-Kurzstrecke (es IST ein Claim, aber kürzer): Anfrage → Lead → SA → Claim (`service_typ='nur_gutachter'`, **ohne Kanzlei, ohne KB**) → **Auftrag für den Gutachter** → Besichtigung/Termin → **Terminal-Status nach durchgeführtem Termin**. KEIN Gutachten-Upload, KEIN QC, KEINE Kanzlei, KEINE Regulierung.
- **€70 fällig = SA vorhanden UND Termin durchgeführt.** Anker = `gutachter_termine.durchgefuehrt_am` NULL→NOT NULL (SA ist dann garantiert da — ohne SA kein Claim/Auftrag/Termin; die UND-Bedingung ist automatisch erfüllt). Default: **SV zahlt**. No-Show setzt durchgefuehrt_am nie → kein Geld (deckt No-Show-Regel automatisch).
- **Einziger Void-Weg = manueller Team-Storno** (rolle=admin). NICHT SV, NICHT Kunde.
  - SV-Absage → zahlt trotzdem.
  - Kunde-Absage → **kein** Auto-Void, erzeugt Team-Review (`billing_review_status='pending'`).
  - No-Show → durchgefuehrt_am nie gesetzt → €70 entsteht gar nicht erst (kein Void nötig).
- Anti-Gaming: „Kunde-Absage = kein Pay" wäre dasselbe Schlupfloch wie „SV sagt ab" (SV stiftet Kunde an) → deshalb nur Team voidet. Zusätzlich: da €70 erst bei durchgefuehrt_am entsteht, ist das Gaming-Fenster kleiner (Absage vor Termin = nie €70, by design).

## Was e00ee6d8 gebaut hat (Branch kitta/aar-939-embed-b-nur-gutachter, Stand 23:15)

**Volle Kette verifiziert** (Commits 03e7fbca9 + 30022fde7):
1. `convert_embed_anfrage_zu_lead` (BEFORE INSERT auf gfa): Variante-B-Anfrage spawnt Lead (`source_channel='monika_embed'`, `service_typ='nur_gutachter'`, `zugewiesen_an`=SV-profile via embed_sites.sv_id), setzt `gfa.konvertiert_zu_lead_id`.
2. `convertLeadToClaim` (src/lib/leads/convert-lead-to-claim.ts): claims-Insert `status='dispatch_done'`, `service_typ='nur_gutachter'`, `kundenbetreuer_id=null` (gegated `source_channel='monika_embed'`), `claim.lead_id=leadId`; + claim_parties + faelle-Row (`faelle.claim_id`+`faelle.lead_id`) + `leads.konvertiert_zu_claim_id/_fall_id`.
3. Terminal-Status `claims.status='gutachten_abgeschlossen'` (Migration 20260530210242 + lifecycle.ts). `v_claim_phase` leitet 'abschluss' ab wenn `auftraege.status='abgeschlossen'` (typ=erstgutachten). **Auto-Close (Auftrag→Terminal) = OFFEN (e00ee6d8 „3c") → hängt laut Flag 1 an `durchgefuehrt_am`.**
e00ee6d8 greift NICHT in Billing (kein abrechnungs_*/Trigger — sauber). Naming `gutachten_abgeschlossen` evtl. umbenennen (Flag 2).

## ⚠️ Zentrale Pivot-Erkenntnis (2× revidiert)

Mein Live-Trigger (`20260530180150`) feuert auf `gfa.status='abgeschlossen'` — das setzt im neuen Modell **niemand** mehr (Workflow lebt im gespawnten Lead/Claim, nicht in der gfa). Anker-Historie: erst `gfa.status` (tot) → dann `konvertiert_zu_fall_id` (SA+Claim, zu früh) → **FINAL: `gutachter_termine.durchgefuehrt_am`** (SA+Termin, Aarons Regel + Flag 1). Mein Trigger wird darauf umgebaut.

## Schnittstelle A — Billing-Anker (Termin durchgeführt) — FINAL
- **Lifecycle (e00ee6d8) setzt `durchgefuehrt_am`** auf dem `gutachter_termine`-Row des Monika-B-Termins, wenn die Besichtigung beendet ist (= 3c, Flag 1). Verknüpfung zur gfa läuft über den stabilen Lead-Link: `gutachter_termine.lead_id` (bzw. `fall_id`→`faelle.lead_id`) → `gfa.konvertiert_zu_lead_id`. **OFFEN/Lifecycle-Aufgabe:** WO genau wird `durchgefuehrt_am` für embed-B gesetzt? `completeBegutachtung` ist `typ='sv_begutachtung'`+fall-gebunden — prüfen ob das für die Kurzstrecke greift oder ein eigener Setter/`markTerminDurchgefuehrt`-Pfad nötig ist. Außerdem: erzeugt die Kurzstrecke überhaupt einen `gutachter_termine` mit gesetztem `lead_id`/`fall_id`?
- **Billing (98044b6b) liest:** DB-Trigger `AFTER UPDATE OF durchgefuehrt_am ON gutachter_termine WHEN NEW.durchgefuehrt_am IS NOT NULL AND OLD IS NULL` → Reverse-Lookup gfa via `konvertiert_zu_lead_id = COALESCE(NEW.lead_id, (SELECT lead_id FROM faelle WHERE id=NEW.fall_id))` AND `source='sv_embed'` AND `variante='B'` AND `abrechnung_id IS NULL` → `abrechnungs_relevant=true` + Betrag. Schreibt NICHTS in den Lifecycle. Entkoppelt — e00ee6d8 muss für Billing nichts Extra tun (sie setzen `durchgefuehrt_am` ohnehin für ihren 3c-Auto-Close).
- **Exklusiv-Regel:** Lifecycle schreibt NIE `abrechnungs_relevant/_betrag_eur/abrechnung_id/abgerechnet_am` — gehören nur Billing. (Heute: 0 App-Schreiber auf abrechnungs_relevant — muss so bleiben.)
- **Gemeinsames Event:** dasselbe `durchgefuehrt_am`-Update treibt e00ee6d8s Auto-Close (Auftrag→Terminal-Status) UND mein €70. Beide Trigger hängen am selben Row-Update — kein Race, weil verschiedene Zieltabellen (e00ee6d8: claims/auftraege; ich: gfa).

## Schnittstelle B — Absage-Signal (Review)
- **Lifecycle ruft:** `markBillingReviewPending(anfrageId, grund)` (grund ∈ kunde_absage|sv_absage) am Ende jedes Absage-Wegs NACH durchgeführtem Termin (= €70 existiert bereits). No-Show vor Termin braucht KEINE Review (€70 entsteht gar nicht).
- **Billing besitzt** die Funktion + Spalten + Queue-Lese-Logik. Voidet NICHT automatisch.

## Wer baut was
- **Billing (98044b6b):** Trigger-Umbau, 6 neue gfa-Spalten, `stornoEmbedBilling` (team-only), `markBillingReviewPending`, Cron-Filter, Review-Queue-UI, Types-Regen. `revertCaseBilling` ist NICHT wiederverwendbar (claim/auftrag-gebunden, kennt gfa nicht).
- **Lifecycle (e00ee6d8):** SA→Claim-Pfad, Absage-/No-Show-Wege → ruft Schnittstelle B. Baut KEINE Void-Logik.

## Datenmodell — fehlt (Billing-Migration, NACH Lifecycle)
6 neue gfa-Spalten (live `information_schema` vor Apply prüfen — Parallel-Sessions!):
`abrechnung_storniert_am` (timestamptz), `abrechnung_storno_grund` (text), `abrechnung_storno_durch_user_id` (uuid FK profiles), `billing_review_status` (text CHECK pending|closed), `billing_review_grund` (text CHECK kunde_absage|sv_absage|no_show), `billing_review_erstellt_am` (timestamptz). Optional partieller Index auf review_status='pending'.
Existiert schon: alle gfa-Billing-Spalten, abrechnungen.status='storniert'+storniert_am/_grund, embed_abrechnung_positionen UNIQUE(anfrage_id).

## Build-Reihenfolge (NACH e00ee6d8 fertig + Schnittstelle-A live = durchgefuehrt_am wird für embed-B gesetzt)
- **T1 Trigger-Umbau (S, DDL):** Live-Trigger `embed_anfrage_billing` (auf gfa.status) DROPpen, neu `AFTER UPDATE OF durchgefuehrt_am ON gutachter_termine` → Reverse-Lookup gfa via konvertiert_zu_lead_id (Schnittstelle A). Twin-Drift-Disziplin (File==recorded version).
- T2 6 gfa-Void/Review-Spalten (S, DDL) · T3 stornoEmbedBilling team-only (M) · T4 markBillingReviewPending (S) · T5 Cron-Filter +`abrechnung_storniert_am IS NULL` (S) · T6 Admin-Review-Queue-UI (M) · T7 Types-Regen (S) · T8 VPS-Crontab (S).

## Offene Aaron-Entscheidungen
1. ✅ €70-Anker = SA + Termin durchgeführt (`durchgefuehrt_am`) — ENTSCHIEDEN 30.05. 23:25.
2. Pre-SA-/Pre-Termin-Abbruch = legitim gratis (kein durchgeführter Termin = keine Vermittlung)? (vermutlich ja, by design)
3. Naming `gutachten_abgeschlossen` → `vermittlung_abgeschlossen`/`termin_durchgefuehrt`? (Flag 2, e00ee6d8s Domäne, nicht blockierend)
4. Soll der Trigger eine `sv_id`-Kopie auf gfa einfrieren? (embed_site_id ist ON DELETE SET NULL → sonst silent-drop im Cron wenn Site gelöscht)
5. Schnittstelle B als Billing-Funktion (Empfehlung) oder direkter Lifecycle-UPDATE?

## VERIFIKATIONS-PFLICHT vor T1 (Schnittstelle A live?)
- Erzeugt die Kurzstrecke einen `gutachter_termine`-Row mit gesetztem `lead_id` ODER `fall_id`? (sonst kein Reverse-Lookup-Pfad zur gfa)
- WO wird `durchgefuehrt_am` für embed-B gesetzt? (`completeBegutachtung` typ='sv_begutachtung'+fall-gebunden — greift das, oder eigener Setter nötig? = e00ee6d8s 3c)
- No-Show-Auto-Storno (`storno-actions.ts:144`) für Monika-B tot weil kein Regulierungs-Auftrag? (DB-Verifikation)

## Restrisiken (ehrlich)
- Pre-SA-Abbruch gratis (by design, #1 bestätigen).
- No-Show-Auto-Storno-Pfad muss für Monika ausgeschlossen verifiziert werden (#2).
- embed_site_id ON DELETE SET NULL → Cron-silent-drop (#3).
- database.types.ts kennt gfa-Billing-Spalten nicht → bis T7 alles `as any`.
