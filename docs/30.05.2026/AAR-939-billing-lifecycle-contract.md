# AAR-939 — Contract: Lifecycle (e00ee6d8) ↔ Billing (98044b6b)

**Datum:** 30.05.2026 · **Status:** Spec/Contract — NICHTS gebaut. Billing wartet bis Lifecycle fertig (Aaron-Reihenfolge).
**Quelle:** Read-only-Audit-Workflow (4 Segmente, gegen baseline_public_schema verifiziert) + Lese der 3 e00ee6d8-Migrationen.

## Geschäftsregel (Aaron 30.05. final)

- Variante B = vollwertiger Claim-Lifecycle: Anfrage → SA → Claim (**ohne Kanzlei**, `service_typ='nur_gutachter'`) → Auftrag → Besichtigung → **Claim abgeschlossen**. KEIN QC, KEIN Gutachten-Workflow, KEINE Kanzlei.
- **€70 fällig sobald SA unterschrieben + Claim erstellt** (= `gfa.konvertiert_zu_fall_id` NULL→non-NULL). Default: **SV zahlt**.
- **Einziger Void-Weg = manueller Team-Storno** (rolle=admin). NICHT SV, NICHT Kunde.
  - SV-Absage → zahlt trotzdem.
  - Kunde-Absage → **kein** Auto-Void, erzeugt Team-Review (`billing_review_status='pending'`).
  - No-Show → Team-Review.
- Anti-Gaming: „Kunde-Absage = kein Pay" wäre dasselbe Schlupfloch wie „SV sagt ab" (SV stiftet Kunde an) → deshalb nur Team voidet.

## Was e00ee6d8 schon gebaut hat (Branch kitta/aar-939-embed-b-to-lead, 3 Migrationen)

`convert_embed_anfrage_zu_lead` — **BEFORE INSERT** auf gfa: Variante-B-Embed-Anfrage spawnt sofort einen **Lead** (`source_channel='monika_embed'`, status='neu', `zugewiesen_an`=SV-profile via embed_sites.sv_id), setzt `gfa.konvertiert_zu_lead_id`+`konvertiert_am`. Fasst `gfa.status` NICHT an. Der Lead läuft danach durch die **bestehende native Lead-Pipeline** (dispatch/leads → Quali → SA → Claim). e00ee6d8 baut NUR den Eintritt; SA→Claim ist (noch) native Pipeline. **Aaron hat e00ee6d8 neue Claim-Anweisungen gegeben — Stand abwarten.**

## ⚠️ Zentrale Pivot-Erkenntnis

Mein heutiger Live-Trigger (`20260530180150`) feuert auf `gfa.status='abgeschlossen'`. Im neuen Modell setzt das **niemand** mehr (Workflow lebt im gespawnten Lead, nicht in der gfa). → Mein Trigger würde **nie auslösen**. Muss umgebaut werden auf `konvertiert_zu_fall_id`.

## Schnittstelle A — Billing-Anker (SA-Abschluss)
- **Lifecycle setzt:** `gfa.konvertiert_zu_fall_id` NULL→`<uuid>` atomar bei SA+Claim (wie `konvertiere-anfrage-zu-fall.ts:296-306`). `embed_site_id`/`source='sv_embed'`/`variante='B'` müssen zu dem Zeitpunkt gesetzt sein (kommen aus Stream-1-Insert).
- **Billing liest:** DB-Trigger an `UPDATE OF konvertiert_zu_fall_id`. Schreibt NICHTS in den Lifecycle.
- **Exklusiv-Regel:** Lifecycle schreibt NIE `abrechnungs_relevant/_betrag_eur/abrechnung_id/abgerechnet_am` — gehören nur Billing. (Heute: 0 App-Schreiber auf abrechnungs_relevant — muss so bleiben.)

## Schnittstelle B — Absage-Signal (Review)
- **Lifecycle ruft:** `markBillingReviewPending(anfrageId, grund)` (grund ∈ kunde_absage|sv_absage|no_show) am Ende jedes Absage-/No-Show-Wegs NACH gesetztem konvertiert_zu_fall_id.
- **Billing besitzt** die Funktion + Spalten + Queue-Lese-Logik. Voidet NICHT automatisch.

## Wer baut was
- **Billing (98044b6b):** Trigger-Umbau, 6 neue gfa-Spalten, `stornoEmbedBilling` (team-only), `markBillingReviewPending`, Cron-Filter, Review-Queue-UI, Types-Regen. `revertCaseBilling` ist NICHT wiederverwendbar (claim/auftrag-gebunden, kennt gfa nicht).
- **Lifecycle (e00ee6d8):** SA→Claim-Pfad, Absage-/No-Show-Wege → ruft Schnittstelle B. Baut KEINE Void-Logik.

## Datenmodell — fehlt (Billing-Migration, NACH Lifecycle)
6 neue gfa-Spalten (live `information_schema` vor Apply prüfen — Parallel-Sessions!):
`abrechnung_storniert_am` (timestamptz), `abrechnung_storno_grund` (text), `abrechnung_storno_durch_user_id` (uuid FK profiles), `billing_review_status` (text CHECK pending|closed), `billing_review_grund` (text CHECK kunde_absage|sv_absage|no_show), `billing_review_erstellt_am` (timestamptz). Optional partieller Index auf review_status='pending'.
Existiert schon: alle gfa-Billing-Spalten, abrechnungen.status='storniert'+storniert_am/_grund, embed_abrechnung_positionen UNIQUE(anfrage_id).

## Build-Reihenfolge (NACH e00ee6d8 fertig + Schnittstelle-A live)
T1 Trigger-Umbau (S, DDL) · T2 6 gfa-Spalten (S, DDL) · T3 stornoEmbedBilling team-only (M) · T4 markBillingReviewPending (S) · T5 Cron-Filter +`abrechnung_storniert_am IS NULL` (S) · T6 Admin-Review-Queue-UI (M) · T7 Types-Regen (S) · T8 VPS-Crontab (S).

## Offene Aaron-Entscheidungen (blockierend)
1. Pre-SA-Abbruch = legitim gratis (kein Claim = keine Vermittlung)? (vermutlich ja)
2. No-Show-Auto-Storno (`storno-actions.ts:144` ruft revertCaseBilling) für Monika-B garantiert tot weil kein Auftrag? (DB-Verifikation: haben Monika-Termine auftrag_id IS NULL?)
3. Soll der Trigger eine `sv_id`-Kopie auf gfa einfrieren? (embed_site_id ist ON DELETE SET NULL → sonst silent-drop im Cron wenn Site gelöscht)
4. Schnittstelle B als Billing-Funktion (Empfehlung) oder direkter Lifecycle-UPDATE?

## Restrisiken (ehrlich)
- Pre-SA-Abbruch gratis (by design, #1 bestätigen).
- No-Show-Auto-Storno-Pfad muss für Monika ausgeschlossen verifiziert werden (#2).
- embed_site_id ON DELETE SET NULL → Cron-silent-drop (#3).
- database.types.ts kennt gfa-Billing-Spalten nicht → bis T7 alles `as any`.
