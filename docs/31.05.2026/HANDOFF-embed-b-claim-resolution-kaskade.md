# HANDOFF — embed-B Claim-Auflösungs-Kaskade (AAR-939)

**Datum:** 31.05.2026 · **Von:** Session af25a50f · **Für:** die nächste Session, die die Claim-Auflösungs-Kaskade baut.
**TL;DR:** embed-B (Monika Variante B, bezahlt) = `nur_gutachter` Light-Claim ist **fertig + billing-verdrahtet**. Was offen ist: die **Claim-Auflösungs-Kaskade** (entscheidet ob der Termin stattfand → Claim schließen / verlegen / stornieren). Das ist **reine Claim-Hygiene/UX, NICHT billing-kritisch** — der Billing-Loop steht bereits komplett.

---

## 1. Was FERTIG ist (gemergt + verifiziert)

| Teil | PR | Status |
|---|---|---|
| 3b dynamischer ClaimStepper (nur_gutachter ohne Regulierung) | #2079 | **MERGED** staging |
| 3c Terminal-Rename `gutachten_abgeschlossen`→`termin_durchgefuehrt` + Auto-Close + `sv_no_show_am`-Feld | #2081 | **MERGED** staging |
| Billing: Auto-Fällig-Cron + `markBillingReviewPending` + Review/Storno + Admin-Queue (Session 98044b6b) | #2092 | **MERGED** staging |
| SV-Kunde-Grund-Report → Billing-Review | #2096 | **OFFEN** (Branch `kitta/aar-939-embed-b-kunde-grund`) |

DB-Migrationen live + Files gemergt: `20260530221245` (Rename: claims_status_check + v_claim_phase), `20260530222216` (gutachter_termine.sv_no_show_am). Staging-Code == Live-DB (kein Drift).

---

## 2. Das Modell (gelockt, Aaron 31.05.) — UNBEDINGT verstehen

**Billing = „Default-Pay":**
> Termin durch (SA + verbindlicher Termin) → **€70 by default** (zeitbasierter Cron, `end_zeit + 24h` Karenz + `sa_unterschrieben`-Guard). EINZIGE Ausnahme: SV meldet KUNDEN-Grund → **Team-Review, kein Auto-Void** (Anti-Gaming).

Daraus folgt die wichtigste Unterscheidung für die Kaskade — **zwei verschiedene „No-Show"-Richtungen, NICHT verwechseln:**

| Richtung | Wer meldet | Wirkung Billing | Wirkung Claim | Status |
|---|---|---|---|---|
| SV hat begutachtet | SV klickt „durchgeführt" | €70 (default) | Claim schließt (`termin_durchgefuehrt`) | ✅ DONE (3c) |
| **SV** meldet „**Kunde** war nicht da / hat abgesagt" | SV | **€70 unterdrückt** → Admin-Review | Termin fand nicht statt → Verlegung/Storno offen | ✅ Billing DONE (#2096), **Claim-Folge OFFEN** |
| **Kunde** meldet „**SV** war nicht da" (SV-No-Show) | Kunde | **€70 BLEIBT** (default, SV zahlt) | Verlegung nötig + `sv_no_show_am` als Record | ⛔ OFFEN (= Kaskade) |
| Stale (niemand meldet) | — | €70 (default nach Karenz) | unklar → Eskalation | ⛔ OFFEN (= Kaskade) |

**Merke:** Kunde-meldet-SV-No-Show ist **kein** Billing-Storno (der SV zahlt trotzdem). Es ist nur Claim-Hygiene (Verlegung) + Record. Nur **SV-meldet-Kunde-Grund** unterdrückt die €70 — und das ist schon gebaut.

---

## 3. Schnittstellen, die du nutzen kannst (alle auf staging)

- **`markBillingReviewPending(anfrageId /* = gfa.id */, grund: 'kunde_absage'|'kunde_no_show')`** — `src/lib/embed/billing-actions.ts` (Billing/98044b6b). Macht Auth selbst (Team admin/dispatch ODER zugeordneter SV), validiert `source='sv_embed' && variante='B'`, setzt `billing_review_status='pending'` → Cron skippt. Nur für SV-meldet-Kunde-Grund.
- **`reportKundeGrundEmbedB(terminId, grund)`** — `src/lib/termine/actions.ts` (von mir, #2096). SV-Wrapper: löst `termin → lead_id → gfa` auf und ruft `markBillingReviewPending`. **Vorlage für die termin→gfa-Auflösung** (kopierbar).
- **`markSvNoShowEmbedB(terminId)`** — `src/lib/termine/actions.ts` (von mir). Team-only. Setzt `gutachter_termine.sv_no_show_am` rein als **Records-/Claim-Signal** (KEIN Pay-Auslöser — SV-No-Show zahlt per Default-Cron). Für die Kunde-meldet-SV-No-Show-Richtung wiederverwendbar (Team/Auto setzt das Feld + triggert Verlegung).
- **`markNurGutachterTerminDurchgefuehrt(terminId)`** — `src/lib/termine/actions.ts` (von mir, 3c). SV-Action: schließt den nur_gutachter-Claim (`termin_durchgefuehrt`).
- **termin→gfa-Auflösung** (in `reportKundeGrundEmbedB`): `gutachter_termine.lead_id` (Fallback `fall_id→faelle.lead_id`) → `gutachter_finder_anfragen WHERE konvertiert_zu_lead_id = leadId` (Fallback `konvertiert_zu_fall_id`) `AND source='sv_embed' AND variante='B'`.

---

## 4. WAS DU BAUST — die Claim-Auflösungs-Kaskade

Ziel: für embed-B-Termine feststellen, ob der Termin stattfand, und den Claim entsprechend schließen / verlegen / stornieren. Reihenfolge der Auflösung (von „löst sich selbst" zu „Mensch entscheidet"):

### 4.1 Geo bleibt (kein Bau)
SVs die die App-Navigation nutzen, lösen `durchgefuehrt_am` per Geofence-Out automatisch aus (`src/hooks/useGeoPosition.ts:117 → markTerminDurchgefuehrt`). embed-B-SVs nutzen i.d.R. den „Begutachtung durchgeführt"-Button (3c). Nichts zu tun — nur nicht kaputt machen.

### 4.2 Cron: stale embed-B-Termine flaggen
Neuer Cron (VPS-crontab, **kein** vercel.json — siehe Memory `feedback_vps_crons`): Route `src/app/api/cron/embed-b-termin-resolution/route.ts` (o.ä.).
Bedingung: nur_gutachter/embed-B-Termin wo `end_zeit + Karenz` vorbei UND `durchgefuehrt_am IS NULL` UND `sv_ablehnung_am IS NULL` UND `sv_no_show_am IS NULL` UND keine offene Billing-Review.
→ Aktion: Kunde-Ping anstoßen (4.3) und/oder Dispatcher-Task (4.5). **Kein Auto-Charge** (das macht Billings Cron eh nach Default-Regel).
Vorlage: bestehende Crons `src/app/api/cron/no-show-timeout/route.ts`, `re-termin-eskalation`. Karenz mit Billings `end_zeit + 24h` abstimmen (nicht früher pingen als billing rechnet).

### 4.3 Kunde-Ping „Kam dein Gutachter?" — WhatsApp + Portal-Banner
Aaron-Entscheidung: **WhatsApp** (embed-B-Kunden kamen über die Monika-Widget rein → WA höchste Antwortrate) **+ Portal-Banner** als Fallback.
- **WhatsApp:** via Baileys-Worker (Memory `project_baileys_whatsapp`, VPS PM2 Port 4001) bzw. `sendCommunication`. WA-Sender-Nummer (laut 98044b6b): **+49 1515 3608515**. Template: „Kam dein Gutachter zum Termin? Antworte JA / NEIN". **Inbound JA/NEIN verarbeiten** (Webhook → Aktion). Das ist das größte Teilstück (Inbound-Handling).
- **Portal-Banner:** im Kunde-Fall-Detail `src/app/kunde/faelle/[id]/page.tsx` ein Banner „Kam dein Gutachter?" mit JA/NEIN (analog `FallMitteilungenBanner` / `KundeSvLiveBanner`). Gegate auf embed-B + stale-Termin.
- **Auflösung der Antwort:**
  - **JA** → Termin fand statt → `markNurGutachterTerminDurchgefuehrt` (Claim schließt). (Achtung: das ist ein Kunde-getriggerter Close — überlegen ob direkt oder mit SV/Team-Bestätigung; sauber wäre: Kunde bestätigt → durchgeführt.)
  - **NEIN** → SV-No-Show → `markSvNoShowEmbedB` (Record) + **Verlegung anstoßen** (4.4). €70 BLEIBT (default).

### 4.4 Verlegung (Reschedule) für embed-B
Wenn der Termin nicht stattfand (SV-No-Show oder Kunde-Grund), muss ein neuer Termin gebucht werden. Bestehende Re-Termin-Infra prüfen: `src/app/kunde/re-termin/[token]/actions.ts` (`waehleReTerminSlot`) + `re-termin-eskalation`-Cron + `faelle.re_termin_token`. Für embed-B/nur_gutachter ggf. anpassen (kürzerer Pfad, Dispatch-Lite). **Hier liegt Design-Arbeit** — mit Dispatch-Flow abstimmen.

### 4.5 Dispatcher-Fallback
Für Schweigen/Konflikt (Kunde antwortet nicht, oder widersprüchlich): Dispatcher-Review-Task (`tasks`-Tabelle, `typ`-Wert passend, an Dispatch zugewiesen) → Dispatcher entscheidet manuell: durchgeführt / SV-No-Show / verlegen / stornieren. Vorlage: `src/lib/termine/sv-ablehnung.ts` erzeugt Dispatcher-Tasks.

---

## 5. Verifikation / Smoke

- **Aktuell 0 echte Monika-B-Anfragen in der DB** (`gutachter_finder_anfragen WHERE source='sv_embed' AND variante='B'` = 0) — das Feature ist noch nicht live. Daher ist der Billing- + Report-Flow **logisch + schema- + interface-verifiziert**, aber noch nicht end-to-end geklickt.
- **Zum Smoken brauchst du einen Monika-B-Datensatz**: entweder echten Lead über die Monika-Widget (Variante B, bezahlt) oder einen staging-Seed (gfa mit source='sv_embed', variante='B', konvertiert_zu_lead_id gesetzt → Lead → Claim → gutachter_termine mit lead_id/fall_id). Dann: SV-Portal `/gutachter/termine/[id]` → „Begutachtung durchgeführt" bzw. „Kunde war nicht da" klicken + Screenshot + DB-Check (`claims.status`, `gutachter_finder_anfragen.billing_review_status`).
- Nach jedem Schritt verifizieren (Memory `feedback_immer_testen_nach_fix`, `feedback_smoke_screenshot_pflicht`).

---

## 6. Koordination / Gotchas

- **Billing (98044b6b) ist fertig** (#2092). Du brauchst sie nur, falls du die Review-Queue-UI berührst — tust du für die Kaskade NICHT. Schreibe NIE in `abrechnungs_*`/`billing_review_*` außer über ihre Funktionen.
- **`v_claim_phase` ist contended** (CMM-50 / claims-SSoT-Sessions, z.B. f46021fd). Falls du es anfasst: `termin_durchgefuehrt` im Terminal-Array beibehalten. Live-Def vor Edit lesen (`feedback_information_schema_check`).
- **DDL nur über Supabase-Plugin** (`apply_migration`), File == recorded version (AGENTS.md Regel 2, Twin-Drift).
- **WhatsApp-Inbound** ist das aufwändigste Teil (Worker + Webhook + JA/NEIN-Parsing). Wenn Zeitdruck: Portal-Banner zuerst (kleiner), WA als zweiter Schritt.
- **Kein Auto-Charge / kein Auto-Void aus der Kaskade** — Billing rechnet selbst (default), die Kaskade entscheidet nur den CLAIM-Ausgang.
- PRs immer `--base staging`. Nicht selbst mergen (Merge-Session `kitta/merge-session-rel`).

---

## 7. Referenzen
- Modell-Doc: `docs/31.05.2026/AAR-939-billing-modell-default-pay.md`
- Billing-Contract (98044b6b): `docs/30.05.2026/AAR-939-billing-lifecycle-contract.md` (auf Branch `kitta/aar-939-monika-billing`)
- Ursprüngliches embed-B-Handoff: `docs/30.05.2026/HANDOFF-embed-b-nur-gutachter-claim.md` (Branch `kitta/aar-939-embed-b-nur-gutachter`)
- Memory: `project_aar939_embed_b_claim_mechanik` (Vollstatus + alle Interfaces)
- Schlüssel-Files: `src/lib/termine/actions.ts` (alle SV-Actions), `src/app/gutachter/termine/[id]/TerminDetailActions.tsx` (SV-UI), `src/lib/embed/billing-actions.ts` (Billing), `src/app/kunde/faelle/[id]/page.tsx` (Kunde-Portal-Banner-Ort), `src/app/api/cron/*` (Cron-Vorlagen).

*Erstellt von af25a50f, 31.05.2026. Billing-Loop komplett (#2079/#2081/#2092 merged, #2096 offen). Offen = Claim-Auflösungs-Kaskade (4.x).*
