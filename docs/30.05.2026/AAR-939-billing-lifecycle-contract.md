# AAR-939 — Contract: Lifecycle (e00ee6d8) ↔ Billing (98044b6b)

**Datum:** 31.05.2026 (rev. 00:55 — AUTO-FÄLLIG-Modell ersetzt Event-Matrix) · **Status:** Spec/Contract — NICHTS gebaut. Billing-Anker ist jetzt ZEITBASIERT (Cron), nicht mehr Trigger.
**Quelle:** Read-only-Audit + e00ee6d8-Commits 03e7fbca9/30022fde7 + storno-actions.ts-Verifikation. Alle 5 Aaron-Entscheidungen beantwortet (siehe unten).

## ⚑ FLAGS für die nächste Session (koordiniert Lifecycle ↔ Billing) — Stand 31.05. 00:55

1. **Abschluss/Billing = AUTO-FÄLLIG nach Terminzeit (Aaron 31.05., ERSETZT den „durchgefuehrt-Event"-Ansatz).** Der Gutachter lädt KEIN Gutachten hoch, kein QC → es gibt nichts aktiv zu „erkennen". Leitsatz: **„Wir nehmen an der SV war da, außer er sagt aktiv was anderes."** Lifecycle-Auto-Close (claims.status='termin_durchgefuehrt') UND Billing-€70 werden beide **zeitbasiert** fällig, sobald `start_zeit`+Puffer vorbei + Termin nicht in Ausnahme-Status. `durchgefuehrt_am`/`sv_no_show_am` (af25a50f gebaut) = optionale Beschleuniger, nicht mehr Pflicht. (Beantwortet af25a50fs „können wir durchgeführt automatisch via Geo feststellen?" — nein nötig, Default=fällig.)
2. **Naming ENTSCHIEDEN (Aaron 31.05.): claims-Terminal-Status `gutachten_abgeschlossen` → `termin_durchgefuehrt` umbenennen** (es gibt kein Platform-Gutachten). Betrifft af25a50f/e00ee6d8s Domäne: `claims_status_check` + `v_claim_phase` (main_phase 'abschluss' + sub_phase) + `lifecycle.ts` (ClaimSubPhase + SUBPHASE_LABEL + ABSCHLUSS_SUBSTATE) + `endzustand-actions.ts` ENDZUSTAENDE. Migration 20260530210242 ist erst auf staging — Rename als Folge-Migration (CHECK + View + TS-Parity bitgleich). NICHT meine (Billing) Domäne — nur Hinweis.

3. **Billing-Anker = CRON (zeitbasiert), NICHT Trigger** (Aaron 31.05., final — ersetzt die frühere „dreiteilige Event-Matrix"). Der bestehende Monats-Cron `embed-abrechnung-erstellen` bekommt die zeit-/status-Selektion (siehe Geschäftsregel unten). `sv_no_show_am` (af25a50f gebaut, PR #2081) bleibt als Audit/Beschleuniger, ist aber nicht mehr alleiniger Pay-Auslöser — der Default-fällig deckt SV-No-Show automatisch ab.

## Geschäftsregel (Aaron 30./31.05. — DREITEILIGE BILLING-MATRIX, final)

Variante B = nur-Gutachter-Kurzstrecke (es IST ein Claim, aber kürzer): Anfrage → Lead → SA → Claim (`service_typ='nur_gutachter'`, **ohne Kanzlei, ohne KB**) → **Auftrag für den Gutachter** → Besichtigung/Termin → Terminal. KEIN Gutachten-Upload, KEIN QC, KEINE Kanzlei, KEINE Regulierung.

**€70 ist KEIN reines „durchgeführt"-Event** (Korrektur Aaron 31.05.). Leitprinzip: **Claimondo hat die Vermittlung erbracht (SA + verbindlicher Termin). Der SV zahlt €70, wenn der Termin stattfand ODER wenn er aus SV-eigenem Grund nicht stattfand. Nur wenn der KUNDE der Grund ist, zahlt der SV nicht.** Anti-Gaming: der SV kann das €70 durch eigenes Handeln (No-Show, Ablehnen nach Terminsetzung) NICHT vermeiden.

### Billing-Matrix (3 Pay-Auslöser, 3 Kein-Pay-Fälle)

| Ereignis | €70? | DB-Signal | Status |
|---|---|---|---|
| **Termin durchgeführt** | **JA** | `gutachter_termine.durchgefuehrt_am` NULL→NOT NULL | af25a50fs 3c-Setter |
| **SV nicht erschienen** (SV-No-Show) | **JA** | ⚠️ **FELD FEHLT** — neues `sv_no_show_am` (o.ä.) nötig | siehe Lücke unten |
| **SV lehnt ab NACHDEM Termin gesetzt** (status war `bestaetigt`) | **JA** | `gutachter_termine.sv_ablehnung_am` ✓ existiert | nur wenn vorher bestaetigt |
| Kunde sagt ab / Kunde storniert | **NEIN** | Kunde-Absage-Pfad | Team-Review falls €70 schon entstanden |
| Kunde-No-Show (Kunde nicht erschienen) | **NEIN** | `no_show_gemeldet_am` (= „SV meldet **Kunde** No-Show", storno-actions.ts:68) | — |
| **Termin verschoben/verlegt** | **kein Charge, kein Void** | `verlegt`/`verschoben`/`verlegung_*` | Termin lebt weiter → späteres durchgeführt/SV-Event entscheidet |

**Termin-Verschiebung muss möglich bleiben** (Aaron): ein verlegter Termin ist KEINE Absage — Billing bleibt offen/pending, der neue Termin triggert dann durchgeführt oder einen SV-Fall. Der `verlegt`/`verschoben`-Status existiert im gt-status-CHECK.

### Void / Review (manuell, team-only)
- **Einziger Void-Weg = Admin-Storno** (`rolle='admin'`). NICHT SV, NICHT Kunde.
- Kunde-Absage NACHDEM €70 schon entstanden ist (theoretisch selten, da Kunde-Grund i.d.R. vor durchgeführt) → **kein Auto-Void**, `billing_review_status='pending'` → Admin entscheidet.
- Anti-Gaming voll: „Kunde-Absage = kein Pay" ist nur über Team-Review erreichbar, damit der SV den Kunden nicht zum Absagen anstiften kann.

### ⚠️ DATENMODELL-LÜCKE (an af25a50f für 3c)
**`meldeNoShow` (storno-actions.ts:68) ist KUNDE-No-Show, NICHT SV-No-Show** — es zählt `claims.kunde_no_show_count` und ruft bei ≥2× `revertCaseBilling` (Storno). Für die SV-No-Show-Pay-Regel gibt es **kein Feld**. **Benötigt: neues `gutachter_termine.sv_no_show_am` (timestamptz) + ein team/SV-Pfad der es setzt.** Ohne das fehlt mir der zweite Pay-Auslöser. `sv_ablehnung_am` (Pay-Auslöser 3) existiert bereits ✓. → af25a50f baut den durchgefuehrt_am-Setter (3c) + sollte `sv_no_show_am` gleich mitmodellieren, da beide am selben Termin-Abschluss-UI hängen.

## Was e00ee6d8 gebaut hat (Branch kitta/aar-939-embed-b-nur-gutachter, Stand 23:15)

**Volle Kette verifiziert** (Commits 03e7fbca9 + 30022fde7):
1. `convert_embed_anfrage_zu_lead` (BEFORE INSERT auf gfa): Variante-B-Anfrage spawnt Lead (`source_channel='monika_embed'`, `service_typ='nur_gutachter'`, `zugewiesen_an`=SV-profile via embed_sites.sv_id), setzt `gfa.konvertiert_zu_lead_id`.
2. `convertLeadToClaim` (src/lib/leads/convert-lead-to-claim.ts): claims-Insert `status='dispatch_done'`, `service_typ='nur_gutachter'`, `kundenbetreuer_id=null` (gegated `source_channel='monika_embed'`), `claim.lead_id=leadId`; + claim_parties + faelle-Row (`faelle.claim_id`+`faelle.lead_id`) + `leads.konvertiert_zu_claim_id/_fall_id`.
3. Terminal-Status `claims.status='gutachten_abgeschlossen'` (Migration 20260530210242 + lifecycle.ts). `v_claim_phase` leitet 'abschluss' ab wenn `auftraege.status='abgeschlossen'` (typ=erstgutachten). **Auto-Close (Auftrag→Terminal) = OFFEN (e00ee6d8 „3c") → hängt laut Flag 1 an `durchgefuehrt_am`.**
e00ee6d8 greift NICHT in Billing (kein abrechnungs_*/Trigger — sauber). Naming `gutachten_abgeschlossen` evtl. umbenennen (Flag 2).

## ⚠️ Zentrale Pivot-Erkenntnis (2× revidiert)

Mein Live-Trigger (`20260530180150`) feuert auf `gfa.status='abgeschlossen'` — das setzt im neuen Modell **niemand** mehr (Workflow lebt im gespawnten Lead/Claim, nicht in der gfa). Anker-Historie: erst `gfa.status` (tot) → dann `konvertiert_zu_fall_id` (SA+Claim, zu früh) → **FINAL: `gutachter_termine.durchgefuehrt_am`** (SA+Termin, Aarons Regel + Flag 1). Mein Trigger wird darauf umgebaut.

## Schnittstelle A — Billing-Anker (3 SV-attributable Termin-Events) — FINAL
- **Lifecycle (af25a50f/e00ee6d8) setzt** auf dem `gutachter_termine`-Row des Monika-B-Termins eines von drei Pay-Signalen: `durchgefuehrt_am` (Termin lief, = 3c), `sv_no_show_am` (SV nicht da, **neues Feld**), oder `sv_ablehnung_am` (SV lehnt ab — nur wenn Termin vorher `bestaetigt` war). Verknüpfung zur gfa über den stabilen Lead-Link: `gutachter_termine.lead_id` (bzw. `fall_id`→`faelle.lead_id`) → `gfa.konvertiert_zu_lead_id`.
- **Billing (98044b6b) liest:** EIN DB-Trigger `AFTER UPDATE ON gutachter_termine` der auf alle drei Felder hört: `WHEN (durchgefuehrt_am OR sv_no_show_am OR sv_ablehnung_am wechselt NULL→NOT NULL)` → Reverse-Lookup gfa via `konvertiert_zu_lead_id = COALESCE(NEW.lead_id, (SELECT lead_id FROM faelle WHERE id=NEW.fall_id))` AND `source='sv_embed'` AND `variante='B'` AND `abrechnung_id IS NULL` AND `abrechnungs_relevant IS NOT TRUE` → `abrechnungs_relevant=true` + Betrag + **eingefrorene sv_id-Kopie** (Aaron #2). Schreibt NICHTS in den Lifecycle.
- **Kunde-Events lösen NICHT aus:** Kunde-Absage/Kunde-No-Show (`no_show_gemeldet_am`)/Verschiebung sind NICHT im WHEN → kein €70.
- **Exklusiv-Regel:** Lifecycle schreibt NIE `abrechnungs_relevant/_betrag_eur/abrechnung_id/abgerechnet_am` — gehören nur Billing. (Heute: 0 App-Schreiber auf abrechnungs_relevant — muss so bleiben.)
- **Gemeinsames Event:** dasselbe `durchgefuehrt_am`-Update treibt af25a50fs Auto-Close (→ claims.status `termin_durchgefuehrt`) UND mein €70. Verschiedene Zieltabellen (sie: claims/auftraege; ich: gfa) → kein Race.
- **VERIFIKATION vor T1 (steht aus, hängt an 3c):** (a) erzeugt die Kurzstrecke einen `gutachter_termine`-Row mit `lead_id`/`fall_id`? (b) wo werden `durchgefuehrt_am`/`sv_no_show_am`/`sv_ablehnung_am` für embed-B gesetzt? (c) ist der bestehende No-Show-Auto-Storno (`storno-actions.ts:144`, ruft revertCaseBilling bei `kunde_no_show_count≥2`) für Monika-B tot — er ist auftrag-gebunden, Monika-Kurzstrecke hat evtl. keinen passenden Auftrag.

## Schnittstelle B — Absage-/Storno-Review (Admin) — Aaron #3
- **Review-Owner = Admin** (Aaron 31.05.: „review durch admin"). Der einzige Void-Weg.
- **Lifecycle ruft:** `markBillingReviewPending(anfrageId, grund)` (grund ∈ kunde_absage) wenn ein Kunde-getriebenes Event ein bereits entstandenes €70 in Frage stellt. Admin entscheidet (void oder bleibt).
- **Termin-Verschiebung (Aaron #3): KEIN Review, KEIN Void.** Verlegung (`verlegt`/`verschoben`) ist kein Abschluss — Billing bleibt offen, der Folge-Termin triggert dann durchgeführt/SV-Event. Lifecycle muss Verlegung sauber vom Absage-Pfad trennen (existiert: `verlegung_*`-Felder + Status).
- **Billing besitzt** die Funktion + Spalten + Admin-Queue-Lese-Logik. Voidet NIE automatisch.

## Wer baut was
- **Billing (98044b6b):** Trigger-Umbau (3 Pay-Auslöser), gfa-Void/Review-Spalten + `sv_id`-Freeze, `stornoEmbedBilling` (admin-only), `markBillingReviewPending`, Cron-Filter, Admin-Review-Queue-UI, Types-Regen. `revertCaseBilling` ist NICHT wiederverwendbar (claim/auftrag-gebunden, kennt gfa nicht).
- **Lifecycle (af25a50f/e00ee6d8):** SA→Claim-Pfad, 3c durchgefuehrt_am-Setter, **`sv_no_show_am`-Feld + Setter** (Datenmodell-Lücke), Absage-/Verlegung-Wege → ruft Schnittstelle B bei Kunde-Absage. Rename `gutachten_abgeschlossen`→`termin_durchgefuehrt`. Baut KEINE Void-Logik.

## Datenmodell — fehlt
**Auf gutachter_termine (Lifecycle/af25a50f, für 3 Pay-Auslöser):** `sv_no_show_am` (timestamptz) NEU — `durchgefuehrt_am` + `sv_ablehnung_am` existieren. `no_show_gemeldet_am` ist KUNDE-No-Show (nicht verwenden für SV).
**Auf gfa (Billing/98044b6b-Migration, live `information_schema` vor Apply prüfen):**
- Void/Review: `abrechnung_storniert_am` (timestamptz), `abrechnung_storno_grund` (text), `abrechnung_storno_durch_user_id` (uuid FK profiles), `billing_review_status` (text CHECK pending|closed), `billing_review_grund` (text CHECK kunde_absage), `billing_review_erstellt_am` (timestamptz).
- **`abrechnung_sv_id` (uuid) — eingefrorene SV-Zuordnung (Aaron #2 ✅).** Der Trigger schreibt sie zum Pay-Zeitpunkt aus `embed_sites.sv_id`, damit ein späteres `embed_site_id`→NULL (ON DELETE SET NULL) das Billing nicht still verliert. Cron gruppiert dann über `gfa.abrechnung_sv_id` statt live über embed_sites.
- Optional partieller Index auf review_status='pending'.
Existiert schon: alle gfa-Billing-Spalten, abrechnungen.status='storniert'+storniert_am/_grund, embed_abrechnung_positionen UNIQUE(anfrage_id).

## Build-Reihenfolge (NACH Lifecycle: Monika-B erzeugt verknüpften gutachter_termine + Puffer/Grenzfall-2 entschieden)
- **T1 Cron-Pay-Selektion (M):** den toten gfa.status-Trigger (`embed_anfrage_billing`, Migration 20260530180150) DROPpen (kleine DDL). Im bestehenden `embed-abrechnung-erstellen`-Cron die zeit-/status-basierte Selektion bauen (Schnittstelle A): Monika-B-Termine wo `start_zeit+Puffer` vorbei + status nicht in Ausnahmeliste + nicht abgerechnet/ge-void-et → `abrechnungs_relevant=true` + Betrag + `abrechnung_sv_id`-Freeze + Position. KEIN AFTER-UPDATE-Trigger mehr.
- T2 gfa-Spalten (Void/Review + abrechnung_sv_id, S, DDL) · T3 stornoEmbedBilling admin-only (M) · T4 markBillingReviewPending (Kunde-No-Show→Review, S) · T5 Cron-Void-Filter `abrechnung_storniert_am IS NULL` (S) · T6 Admin-Review-Queue-UI (M) · T7 Types-Regen (S) · T8 VPS-Crontab (S).

## Offene Aaron-Entscheidungen — ALLE BEANTWORTET (31.05.)
1. ✅ €70-Anker = SA + Termin (DREITEILIG): durchgeführt ODER SV-No-Show ODER SV-Ablehnung-nach-Terminsetzung. Kunde-Grund → kein Pay.
2. ✅ `abrechnung_sv_id` auf gfa einfrieren (ja).
3. ✅ Review durch Admin; Termin muss verschiebbar bleiben (Verlegung ≠ Absage).
4. ✅ Naming → `termin_durchgefuehrt` (claims-Terminal-Status). af25a50fs Domäne.
5. ✅ Schnittstelle B = Billing-Funktion `markBillingReviewPending`, von Lifecycle aufgerufen.

## VERIFIKATIONS-PFLICHT vor T1 (hängt an Lifecycle-3c)
- Erzeugt die Kurzstrecke einen `gutachter_termine`-Row mit gesetztem `lead_id` ODER `fall_id`? (sonst kein Reverse-Lookup-Pfad zur gfa)
- WO werden `durchgefuehrt_am` / `sv_no_show_am` / `sv_ablehnung_am` für embed-B gesetzt? (`completeBegutachtung` ist typ='sv_begutachtung'+fall-gebunden — greift evtl. nicht; eigener Kurzstrecken-Setter nötig = 3c)
- No-Show-Auto-Storno (`storno-actions.ts:144`, `meldeNoShow`→`revertCaseBilling` bei `kunde_no_show_count≥2`) für Monika-B tot weil kein Regulierungs-Auftrag? (DB-Verifikation) — wichtig, sonst könnte Kunde-No-Show ungewollt etwas stornieren.

## Restrisiken (ehrlich)
- Pre-Termin-Abbruch durch Kunde = legitim gratis (kein Pay-Event); Pre-Termin-Abbruch durch SV = Pay (sv_ablehnung_am, falls vorher bestaetigt). Sauber getrennt durch 3-Auslöser-WHEN.
- **`sv_no_show_am` muss von af25a50f gebaut werden** — sonst fehlt Pay-Auslöser 2 komplett.
- No-Show-Auto-Storno-Pfad muss für Monika ausgeschlossen verifiziert werden.
- `embed_site_id` ON DELETE SET NULL → durch `abrechnung_sv_id`-Freeze (T2) entschärft.
- database.types.ts kennt gfa-Billing-Spalten nicht → bis T7 alles `as any`.
