# CMM-44 Phase-6 Reader-Sweep-Inventar — direkte `faelle`-Zugriffe auf relocatete Spalten

**Datum:** 2026-05-23 · **Branch:** `kitta/cmm44-phase6-reader-sweep` · **Status:** Audit-Deliverable (NUR Analyse, kein Code-Change)
**Master:** CMM-44 (`faelle`-Drop / Claim-SSoT-Vollmigration) · **Gate fuer:** Phase 6 (`DROP TABLE faelle CASCADE`)
**Quelle RELOCATED-Set:** `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (341-Spalten-Klassifizierung)

---

## 0 · Was dieses Dokument ist (und was es nicht ist)

Phase 6 droppt die `faelle`-Mega-Tabelle. Jede Code-Stelle, die eine **relocatete** Spalte
(SSoT lebt auf einer Sub-Tabelle) **direkt auf `faelle`** liest/schreibt/filtert, ist
ein Phase-6-Hard-Breaker (PostgREST `column does not exist`) — und bei bereits gemergten
Slices schon **jetzt** ein latenter Bug (faelle-Kopie ist fuer neue Faelle null/stale).

**Korrekte Muster (NICHT als Breaker gezaehlt):** Embed `claims:claim_id(...)` /
`kanzlei_faelle(...)` / `gutachter_termine(...)` / `auftraege(...)` / `gutachten(...)` /
`claim_parties(...)`; View `v_faelle_mit_aktuellem_termin`; Split-Helper
`splitOrKeepFaelleUpdate` / `peelAuftraegeColumns` / `upsertKanzleiFall`; faelle-native
Spalten (`id`, `claim_id`, `lead_id`, `sv_id`, `kennzeichen`, `status`).

### Methode (reproduzierbar)
1. RELOCATED-Set aus dem Phase-1-Doc geparst: alle 341 Spalten mit Heimat ≠ `faelle`
   und ≠ `{id, claim_id, lead_id, sv_id, kennzeichen, status}` (Task-Whitelist
   strukturell/heavy-used) → **335 relocatete Spalten**.
2. Alle 460 `.from('faelle')`-Chains in `src/` extrahiert (229 Files; ohne `*.test.*`,
   `database.types.ts`), Chain-Grenze beim **naechsten `.from(...)`** gekappt (verhindert
   Bleed in Nachbar-Queries auf `claims`/`gutachten` etc.).
3. Pro Chain: `.select()`-Top-Level-Spalten (Embed-Inhalt `subtable(...)` herausgestrippt),
   `.update/.insert/.upsert`-Objekt-Keys, Filter-Operatoren
   (`.eq/.neq/.gt/.gte/.lt/.lte/.like/.ilike/.is/.in/.order/.not/.or/.filter`) gegen das
   RELOCATED-Set gematcht.
4. Embed-interne Vorkommen derselben Spalte werden bewusst NICHT geflaggt (verifiziert:
   z.B. `claims:claim_id(schadens_ursache)` ist sauber, `fahrzeug_hersteller` top-level daneben ist Breaker).

> **Grenzen (siehe §6):** statisches Literal-Matching findet **keine** dynamischen
> Property-Writes (`updateData.fin_vin = ...`) und keine `select('*')`-Property-Reads im
> Downstream. Beide manuell nachgetragen (§4.K, §5).

---

## 1 · Zusammenfassung

| Kennzahl | Wert |
|---|---:|
| **Breaker-Fundstellen gesamt** (Datei×Zeile×Spalte×Zugriff) | **417** |
| davon **HARD** (select/update/insert/filter direkt auf faelle-Spalte) | **413** |
| davon **SOFT** (`select('*')` → Property-Read bricht still) | **4** |
| Betroffene Dateien | **133** (von 229 faelle-Files) |
| Geprueft-aber-sauber (faelle-Zugriff, kein relocateter Breaker) | **96** Files |
| Zusaetzliche **dynamische Writes** (statisch nicht gefunden, manuell, §4.K) | **5 Sites** |

### Severity × Ziel-Sub-Tabelle (Slice-Status)

| Ziel-Sub-Tabelle (SSoT) | Breaker | Slice-Status | Bedeutung |
|---|---:|---|---|
| `claim_parties` | **117** | **IN-FLIGHT** (SP-C, PR #1535 offen) | Kunde/Halter/Gegner-Snapshots; dominiert von `kunde_id`-Ownership-Filter (61×) |
| `claims` (Timestamps `created_at`/`updated_at`) | **93** | DONE (SP-A/B) | mechanische Zeitstempel-Filter/-Writes — eigener Bucket §4.TS |
| `kanzlei_faelle` | **64** | **DONE** (SP-I komplett) | **latent buggy JETZT** — Regulierung/Mandat/VS/Ruege/AS |
| `vehicles` | **55** | PENDING (SP-E blockiert) | Fahrzeug-Spec — noch SSoT auf faelle, „nur" Drop-Breaker |
| `claims` (Business, nicht-Timestamp) | **22** | DONE | lead_preis_*, marketing_*, polizei_*, org/dispatch |
| `?` (Vorschaeden/Cardentity) | **20** | PENDING (SP-F blockiert) | Heimat noch offen — noch SSoT auf faelle |
| `gutachter_termine` | **5** | DONE (SP-D/G2) | besichtigungsort-Fallback-Write (§7 Grenzfall!) + re_termin_token |
| `gutachten` | **2** | DONE (SP-G) | nutzungsausfall_tagessatz, wertminderung |
| `abrechnungen` | **2** | MIXED (SP-J) | `zahlungsweg` (BLEIBT faelle laut SP-J-Korrektur — §6 Grenzfall) |
| `(Seed/Test-Routen)` | **33** | gemischt | dev-only Seeder — eigener Bucket §4.SEED |
| `(SOFT select('*'))` | **4** | — | §5 |

### Slice-Status-Interpretation
- **DONE** = Spalte relocatet, faelle-Kopie ist fuer neue Faelle **null/stale** → direkter
  faelle-Read liefert schon heute falsche/leere Werte (latenter Bug) **und** bricht in Phase 6.
- **IN-FLIGHT** = Slice mitten in Umzug (SP-C: PR1 #1535 offen) → wird latent, sobald Backfill-PR gemergt ist.
- **PENDING** = Slice noch nicht gestartet (SP-E vehicles, SP-F vorschaeden) → faelle ist
  noch SSoT, Stelle ist **heute korrekt**, aber zwingend vor Drop umzubauen.

---

## 2 · Die 3–5 riskantesten Fundstellen (Triage-Prioritaet)

1. **`kunde_id`-Ownership-Filter ueberall im Kunde-Portal (61× select/eq/in)** — z.B.
   `app/kunde/layout.tsx:76/91/135/174/221` (`.eq('kunde_id', user.id)`),
   `lib/claims/kunde-ownership.ts:4/55` (Shared-Helper, viele indirekte Consumer),
   `lib/whatsapp.ts:264`, `lib/notifications/fan-out.ts:28`. `kunde_id` → `claim_parties`
   (SSoT real `claims.geschaedigter_user_id`). **Hoechstes Risiko des ganzen Sweeps:** ein
   Drop von `faelle.kunde_id` killt die Kunden-Zugriffskontrolle portalweit. SP-C muss die
   Ownership-Query auf `claims.geschaedigter_user_id` (oder cp) umstellen, BEVOR gedroppt wird.

2. **`app/api/search/route.ts:22` — `.or('mandatsnummer.ilike...')` auf `faelle`** —
   exakt der dokumentierte Latenz-Bug: Datei-Kommentar baut `schadenort`/`claim_nummer`
   bereits ueber claims-Embed, aber `mandatsnummer` filtert weiter faelle direkt. SP-I hat
   `mandatsnummer` → `kanzlei_faelle` verschoben → **Suche findet neue Faelle schon heute nicht.**

3. **`app/kunde/faelle/[id]/_actions/besichtigungsort.ts:69` — faelle-Fallback-Write**
   (`besichtigungsort_*`). Bewusster SP-D-„gt-else-faelle"-Fallback (Kommentar im Code), wenn
   kein Termin existiert. **Wird in Phase 6 zum Hard-Breaker** — der else-Zweig schreibt auf
   eine gedroppte Spalte. Braucht Migration (z.B. Termin-Platzhalter anlegen) statt faelle-Write.

4. **`lib/claims/get-kunde-faelle.ts:419` — 11 relocatete Spalten in EINEM faelle-`select`**
   (`fahrzeug_*`, `regulierung_am`, `anschlussschreiben_am`, `vs_kuerzung_grund`, `kanzlei_id`,
   `gegner_versicherung`, `zahlungsweg`, `bankdaten_hinterlegt_am`, `kunde_id`). Zentrale
   Kunde-Fallakten-Query — Mischung aus DONE (kanzlei_faelle latent) + PENDING (vehicles) Spalten.

5. **`app/faelle/[id]/_actions/kanzlei-paket.ts:357` — `.update({ regulierung_am })` direkt
   auf faelle**, mit **stale Code-Kommentar** „regulierung_am bleibt faelle-only". SP-I3 hat
   `regulierung_am` → `kanzlei_faelle` verschoben (Memory CMM-44 SP-I3). **Kommentar
   widerspricht Phase-1-Doc** — Stelle schreibt seit SP-I3 in eine tote Kopie (Regulierungs-Datum
   geht in Finance-Reports verloren). Selbe Klasse: `vs-timer/route.ts:66`, `prozess.ts:160/242`,
   `stripe/webhook/route.ts:338`, `kanzlei/push-mandat.ts:225`.

---

## 3 · Verteilung nach Zugriffsart & Top-Dateien

**Zugriffsart (HARD):** select 211 · update 67 · order 33 · insert 32 · eq 25 · gte 19 ·
lte 10 · not 5 · lt 4 · is 3 · or 2 · like 1 · in 1.

**Top-Dateien nach Breaker-Anzahl:**

| # | Datei | Breaker |
|--:|---|---:|
| 19 | `app/api/admin/create-test-fall/route.ts` (Seed) | 19 |
| 13 | `app/admin/finance/(hub)/page.tsx` | 13 |
| 13 | `lib/analytics/finance.ts` | 13 |
| 12 | `lib/claims/get-kunde-faelle.ts` | 12 |
| 11 | `app/api/seed-testdata/route.ts` (Seed) | 11 |
| 11 | `lib/kanzlei/push-mandat.ts` | 11 |
|  9 | `app/kunde/layout.tsx` | 9 |
|  9 | `lib/actions/termin-actions.ts` | 9 |
|  8 | `app/faelle/[id]/_actions/prozess.ts` | 8 |
|  8 | `app/kunde/onboarding/actions.ts` | 8 |
|  8 | `lib/kanzlei/email-fallback.ts` | 8 |

---

## 4 · Breaker-Tabellen je Ziel-Sub-Tabelle

### 4.A · → `kanzlei_faelle` (SP-I DONE → latent buggy JETZT) — 64

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/admin/_components/DashboardStats.tsx`:38 | `regulierung_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/DashboardStats.tsx`:38 | `regulierung_am` | kanzlei_faelle | gte | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/DashboardStats.tsx`:38 | `regulierung_am` | kanzlei_faelle | order | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/MonatsUmsatzForecast.tsx`:31 | `regulierung_am` | kanzlei_faelle | gte | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/MonatsUmsatzForecast.tsx`:31 | `regulierung_am` | kanzlei_faelle | lte | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:191 | `regulierung_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:191 | `regulierung_am` | kanzlei_faelle | gte | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:191 | `regulierung_am` | kanzlei_faelle | order | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:191 | `regulierung_am` | kanzlei_faelle | not | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/faelle/(hub)/page.tsx`:108 | `mandatsnummer` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Mandat |
| `app/admin/finance/(hub)/page.tsx`:517 | `regulierung_am` | kanzlei_faelle | gte | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/finance/(hub)/page.tsx`:517 | `regulierung_am` | kanzlei_faelle | lte | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/finance/(hub)/page.tsx`:545 | `regulierung_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Regulierung |
| `app/admin/finance/(hub)/page.tsx`:545 | `regulierung_am` | kanzlei_faelle | order | HARD | DONE | Kanzlei-LC Regulierung |
| `app/api/cron/vs-timer/route.ts`:66 | `vs_eskalationsstufe` | kanzlei_faelle | update | HARD | DONE | VS-Eskalation |
| `app/api/search/route.ts`:22 | `mandatsnummer` | kanzlei_faelle | or | HARD | DONE | Kanzlei-LC Mandat |
| `app/api/stripe/webhook/route.ts`:338 | `kanzlei_provision_ausgezahlt_am` | kanzlei_faelle | update | HARD | DONE | Kanzlei-Provision |
| `app/api/stripe/webhook/route.ts`:338 | `kanzlei_provision_status` | kanzlei_faelle | update | HARD | DONE | Kanzlei-Provision |
| `app/faelle/[id]/_actions/dokumente.ts`:302 | `anschlussschreiben_url` | kanzlei_faelle | update | HARD | DONE | Kanzlei-LC AS |
| `app/faelle/[id]/_actions/dokumente.ts`:336 | `anschlussschreiben_ocr_am` | kanzlei_faelle | update | HARD | DONE | Kanzlei-LC AS |
| `app/faelle/[id]/_actions/dokumente.ts`:336 | `anschlussschreiben_sendedatum` | kanzlei_faelle | update | HARD | DONE | Kanzlei-LC AS |
| `app/faelle/[id]/_actions/dokumente.ts`:336 | `anschlussschreiben_unterschrift` | kanzlei_faelle | update | HARD | DONE | Kanzlei-LC AS |
| `app/faelle/[id]/_actions/filmcheck.ts`:32 | `mandatsnummer` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Mandat |
| `app/faelle/[id]/_actions/filmcheck.ts`:32 | `mandatsnummer` | kanzlei_faelle | like | HARD | DONE | Kanzlei-LC Mandat |
| `app/faelle/[id]/_actions/filmcheck.ts`:32 | `mandatsnummer` | kanzlei_faelle | order | HARD | DONE | Kanzlei-LC Mandat |
| `app/faelle/[id]/_actions/filmcheck.ts`:49 | `mandatsnummer` | kanzlei_faelle | update | HARD | DONE | Kanzlei-LC Mandat |
| `app/faelle/[id]/_actions/kanzlei-paket.ts`:177 | `vs_eskalationsstufe` | kanzlei_faelle | update | HARD | DONE | VS-Eskalation |
| `app/faelle/[id]/_actions/kanzlei-paket.ts`:357 | `regulierung_am` | kanzlei_faelle | update | HARD | DONE | Kanzlei-LC Regulierung |
| `app/faelle/[id]/_actions/prozess.ts`:143 | `ruege_counter` | kanzlei_faelle | select | HARD | DONE | Ruege-Workflow |
| `app/faelle/[id]/_actions/prozess.ts`:160 | `ruege_counter` | kanzlei_faelle | update | HARD | DONE | Ruege-Workflow |
| `app/faelle/[id]/_actions/prozess.ts`:160 | `ruege_gesendet_am` | kanzlei_faelle | update | HARD | DONE | Ruege-Workflow |
| `app/faelle/[id]/_actions/prozess.ts`:242 | `vs_eskalationsstufe` | kanzlei_faelle | update | HARD | DONE | VS-Eskalation |
| `app/gutachter/fall/[id]/stellungnahme/page.tsx`:27 | `kuerzungs_betrag` | kanzlei_faelle | select | HARD | DONE | VS-Kuerzung |
| `app/gutachter/fall/[id]/stellungnahme/page.tsx`:27 | `vs_kuerzung_grund` | kanzlei_faelle | select | HARD | DONE | VS-Kuerzung |
| `app/kanzlei/kanban/page.tsx`:61 | `mandatsnummer` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Mandat |
| `app/kanzlei/mandate/page.tsx`:36 | `mandatsnummer` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Mandat |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts`:101 | `kanzlei_honorar` | kanzlei_faelle | select | HARD | DONE | Kanzlei-Honorar |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts`:101 | `kanzlei_id` | kanzlei_faelle | eq | HARD | DONE | Kanzlei-Zuordnung — kanzlei_faelle? |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts`:101 | `kanzlei_provision_status` | kanzlei_faelle | eq | HARD | DONE | Kanzlei-Provision |
| `lib/abrechnung/kanzlei/erstelle-abrechnung.ts`:223 | `kanzlei_provision_status` | kanzlei_faelle | update | HARD | DONE | Kanzlei-Provision |
| `lib/analytics/finance.ts`:100 | `kanzlei_honorar` | kanzlei_faelle | select | HARD | DONE | Kanzlei-Honorar |
| `lib/analytics/finance.ts`:100 | `kanzlei_honorar` | kanzlei_faelle | not | HARD | DONE | Kanzlei-Honorar |
| `lib/analytics/finance.ts`:143 | `regulierung_am` | kanzlei_faelle | not | HARD | DONE | Kanzlei-LC Regulierung |
| `lib/claims/get-kunde-faelle.ts`:419 | `anschlussschreiben_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC AS |
| `lib/claims/get-kunde-faelle.ts`:419 | `kanzlei_id` | kanzlei_faelle | select | HARD | DONE | Kanzlei-Zuordnung — kanzlei_faelle? |
| `lib/claims/get-kunde-faelle.ts`:419 | `regulierung_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Regulierung |
| `lib/claims/get-kunde-faelle.ts`:419 | `vs_kuerzung_grund` | kanzlei_faelle | select | HARD | DONE | VS-Kuerzung |
| `lib/finance/abrechnungen-generator.ts`:168 | `kanzlei_honorar` | kanzlei_faelle | select | HARD | DONE | Kanzlei-Honorar |
| `lib/finance/abrechnungen-generator.ts`:168 | `regulierung_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Regulierung |
| `lib/finance/abrechnungen-generator.ts`:168 | `regulierung_am` | kanzlei_faelle | gte | HARD | DONE | Kanzlei-LC Regulierung |
| `lib/finance/abrechnungen-generator.ts`:168 | `regulierung_am` | kanzlei_faelle | lte | HARD | DONE | Kanzlei-LC Regulierung |
| `lib/finance/fall-finanzen.ts`:54 | `kanzlei_honorar` | kanzlei_faelle | select | HARD | DONE | Kanzlei-Honorar |
| `lib/finance/fall-finanzen.ts`:54 | `regulierung_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Regulierung |
| `lib/kanzlei-wunsch/actions.ts`:171 | `mandatsnummer` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Mandat |
| `lib/kanzlei/push-mandat.ts`:81 | `mandatsnummer` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC Mandat |
| `lib/kanzlei/push-mandat.ts`:225 | `mandatsnummer` | kanzlei_faelle | update | HARD | DONE | Kanzlei-LC Mandat |
| `lib/sla/blocker-detection.ts`:38 | `anschlussschreiben_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC AS |
| `lib/sla/blocker-detection.ts`:38 | `kuerzungs_betrag` | kanzlei_faelle | select | HARD | DONE | VS-Kuerzung |
| `lib/sla/blocker-detection.ts`:38 | `ruege_gesendet_am` | kanzlei_faelle | select | HARD | DONE | Ruege-Workflow |
| `lib/sla/completion-signals.ts`:29 | `anschlussschreiben_am` | kanzlei_faelle | select | HARD | DONE | Kanzlei-LC AS |
| `lib/sla/completion-signals.ts`:38 | `ruege_gesendet_am` | kanzlei_faelle | select | HARD | DONE | Ruege-Workflow |
| `lib/sla/completion-signals.ts`:47 | `ruege_gesendet_am` | kanzlei_faelle | select | HARD | DONE | Ruege-Workflow |
| `lib/sla/kanzlei-mahnungen.ts`:362 | `kanzlei_id` | kanzlei_faelle | select | HARD | DONE | Kanzlei-Zuordnung — kanzlei_faelle? |
| `lib/sla/kanzlei-mahnungen.ts`:362 | `kuerzungs_betrag` | kanzlei_faelle | select | HARD | DONE | VS-Kuerzung |

### 4.B · → `claim_parties` (SP-C IN-FLIGHT) — 117

> Dominiert von `kunde_id` (Ownership-Filter, 61×). `kunde_*`-Adress-/Namens-Felder + Halter-/
> Gegner-Snapshots. SSoT: `claims.geschaedigter_user_id` bzw. `claim_parties` nach Rolle.

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/admin/sachverstaendige/_karte/actions.ts`:356 | `kunde_nachname` | claim_parties | select | HARD | IN-FLIGHT | cp.nachname |
| `app/admin/sachverstaendige/_karte/actions.ts`:356 | `kunde_vorname` | claim_parties | select | HARD | IN-FLIGHT | cp.vorname |
| `app/api/cron/kb-termin-reminder-1h/route.ts`:46 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/cron/kb-termin-reminder/route.ts`:47 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/cron/termin-erinnerungen/route.ts`:51 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/cron/termin-morgen-erinnerung/route.ts`:82 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/kunde/gutachten/weiterleiten/route.ts`:38 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/kunde/termin/absagen/route.ts`:48 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/kunde/termin/ics/[id]/route.ts`:36 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/kunde/termin/verschieben/route.ts`:49 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/ocr-trigger/route.ts`:131 | `halter_geburtsdatum` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=halter |
| `app/api/ocr-trigger/route.ts`:137 | `halter_geburtsdatum` | claim_parties | update | HARD | IN-FLIGHT | cp rolle=halter |
| `app/dispatch/leads/[id]/_actions/sv-termin.ts`:27 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/faelle/[id]/_actions/chat.ts`:86 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/faelle/[id]/_actions/termine.ts`:38 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/faelle/[id]/_actions/termine.ts`:147 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/faelle/[id]/page.tsx`:521 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/flow/[token]/actions.ts`:290 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/flow/[token]/actions.ts`:390 | `kunde_id` | claim_parties | update | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/flow/[token]/page.tsx`:149 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/flow/[token]/page.tsx`:149 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/gutachter/termine/[id]/actions.ts`:71 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kanzlei/kanban/page.tsx`:61 | `kunde_nachname` | claim_parties | select | HARD | IN-FLIGHT | cp.nachname |
| `app/kanzlei/kanban/page.tsx`:61 | `kunde_vorname` | claim_parties | select | HARD | IN-FLIGHT | cp.vorname |
| `app/kanzlei/mandate/page.tsx`:36 | `kunde_nachname` | claim_parties | select | HARD | IN-FLIGHT | cp.nachname |
| `app/kanzlei/mandate/page.tsx`:36 | `kunde_vorname` | claim_parties | select | HARD | IN-FLIGHT | cp.vorname |
| `app/kunde/_components/kb-chat-actions.ts`:94 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/chat/page.tsx`:37 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:32 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/faelle/[id]/actions.ts`:93 | `bankdaten_hinterlegt_am` | claim_parties | update | HARD | IN-FLIGHT | Bankdaten |
| `app/kunde/faelle/[id]/actions.ts`:93 | `bic` | claim_parties | update | HARD | IN-FLIGHT | Bankdaten |
| `app/kunde/faelle/[id]/actions.ts`:93 | `iban` | claim_parties | update | HARD | IN-FLIGHT | Bankdaten — claim_parties oder profiles |
| `app/kunde/faelle/[id]/actions.ts`:93 | `kontoinhaber` | claim_parties | update | HARD | IN-FLIGHT | Bankdaten |
| `app/kunde/faelle/[id]/beratung-actions.ts`:29 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/faelle/[id]/kalender/page.tsx`:16 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/layout.tsx`:76 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/layout.tsx`:91 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/layout.tsx`:135 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/layout.tsx`:174 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/layout.tsx`:221 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/nachbesichtigung/actions.ts`:21 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/nachbesichtigung/page.tsx`:13 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding-details/zb1-actions.ts`:111 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding/actions.ts`:80 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding/actions.ts`:211 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding/actions.ts`:325 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding/actions.ts`:423 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding/actions.ts`:481 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding/actions.ts`:541 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/onboarding/actions.ts`:598 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/termine/[id]/page.tsx`:43 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/kunde/termine/page.tsx`:26 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `components/kunde/OffeneDatenBanner.tsx`:28 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `components/kunde/PflichtdokumenteBanner.tsx`:28 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-actions.ts`:124 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-actions.ts`:233 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-actions.ts`:411 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-actions.ts`:438 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-actions.ts`:691 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-verlegung-actions.ts`:644 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-verlegung-actions.ts`:740 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/actions/termin-verlegung-actions.ts`:841 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/aircall/bridge.ts`:25 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/branding/kunden-theme.ts`:40 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/chatGruppe.ts`:53 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/claims/get-kunde-faelle.ts`:190 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/claims/get-kunde-faelle.ts`:419 | `bankdaten_hinterlegt_am` | claim_parties | select | HARD | IN-FLIGHT | Bankdaten |
| `lib/claims/get-kunde-faelle.ts`:419 | `gegner_versicherung` | claim_parties | select | HARD | IN-FLIGHT | cp.versicherung_klartext |
| `lib/claims/get-kunde-faelle.ts`:419 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/claims/kunde-ownership.ts`:4 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/claims/kunde-ownership.ts`:55 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/communications/send-fall.ts`:30 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/dokumente/anforderung.ts`:103 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/dokumente/erwartung.ts`:241 | `halter_nachname` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=halter |
| `lib/dokumente/erwartung.ts`:241 | `ist_fahrzeughalter` | claim_parties | select | HARD | IN-FLIGHT | claim_parties.ist_halter |
| `lib/dokumente/konditional-tasks.ts`:80 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/dokumente/zuordnung.ts`:237 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/email/google/flows.ts`:66 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/faelle/kb-assignment.ts`:189 | `kunde_id` | claim_parties | eq | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/google-calendar/sv-termin-sync.ts`:65 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/inbound/match-fall.ts`:75 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/inbound/match-fall.ts`:75 | `kunde_id` | claim_parties | in | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kalender/caldav/sv-termin-sync.ts`:71 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kanzlei-wunsch/actions.ts`:97 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kanzlei-wunsch/actions.ts`:443 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kanzlei-wunsch/actions.ts`:524 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kanzlei/email-fallback.ts`:32 | `firma_name` | claim_parties | select | HARD | IN-FLIGHT | cp.firma (A3) |
| `lib/kanzlei/email-fallback.ts`:32 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kanzlei/email-fallback.ts`:32 | `kunde_nachname` | claim_parties | select | HARD | IN-FLIGHT | cp.nachname |
| `lib/kanzlei/email-fallback.ts`:32 | `kunde_plz` | claim_parties | select | HARD | IN-FLIGHT | cp.adresse_plz |
| `lib/kanzlei/email-fallback.ts`:32 | `kunde_stadt` | claim_parties | select | HARD | IN-FLIGHT | cp.adresse_ort |
| `lib/kanzlei/email-fallback.ts`:32 | `kunde_strasse` | claim_parties | select | HARD | IN-FLIGHT | cp.adresse_strasse |
| `lib/kanzlei/email-fallback.ts`:32 | `kunde_telefon` | claim_parties | select | HARD | IN-FLIGHT | cp.telefon |
| `lib/kanzlei/email-fallback.ts`:32 | `kunde_vorname` | claim_parties | select | HARD | IN-FLIGHT | cp.vorname |
| `lib/kanzlei/push-mandat.ts`:81 | `firma_name` | claim_parties | select | HARD | IN-FLIGHT | cp.firma (A3) |
| `lib/kanzlei/push-mandat.ts`:81 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kanzlei/push-mandat.ts`:81 | `kunde_nachname` | claim_parties | select | HARD | IN-FLIGHT | cp.nachname |
| `lib/kanzlei/push-mandat.ts`:81 | `kunde_plz` | claim_parties | select | HARD | IN-FLIGHT | cp.adresse_plz |
| `lib/kanzlei/push-mandat.ts`:81 | `kunde_stadt` | claim_parties | select | HARD | IN-FLIGHT | cp.adresse_ort |
| `lib/kanzlei/push-mandat.ts`:81 | `kunde_strasse` | claim_parties | select | HARD | IN-FLIGHT | cp.adresse_strasse |
| `lib/kanzlei/push-mandat.ts`:81 | `kunde_telefon` | claim_parties | select | HARD | IN-FLIGHT | cp.telefon |
| `lib/kanzlei/push-mandat.ts`:81 | `kunde_vorname` | claim_parties | select | HARD | IN-FLIGHT | cp.vorname |
| `lib/kunde/auto-claim.ts`:39 | `kunde_id` | claim_parties | update | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/kunde/auto-claim.ts`:39 | `kunde_id` | claim_parties | is | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/lexdrive/email-sender.ts`:38 | `gegner_kennzeichen` | claim_parties | select | HARD | IN-FLIGHT | cp.kennzeichen |
| `lib/lexdrive/email-sender.ts`:38 | `gegner_name` | claim_parties | select | HARD | IN-FLIGHT | claim_parties rolle=verursacher |
| `lib/lexdrive/email-sender.ts`:38 | `gegner_versicherung` | claim_parties | select | HARD | IN-FLIGHT | cp.versicherung_klartext |
| `lib/lexdrive/process-event.ts`:350 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/lexdrive/process-event.ts`:405 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/lexdrive/process-event.ts`:561 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/makler/copilot-prompt.ts`:250 | `gegner_versicherung` | claim_parties | select | HARD | IN-FLIGHT | cp.versicherung_klartext |
| `lib/notifications/fan-out.ts`:28 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/sla/kanzlei-mahnungen.ts`:252 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/tasks/entity-loader.ts`:26 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/termine/kb-booking.ts`:31 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/termine/kb-booking.ts`:244 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `lib/whatsapp.ts`:264 | `kunde_id` | claim_parties | select | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |

### 4.C · → `vehicles` (SP-E PENDING — noch SSoT auf faelle) — 55

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/api/sv/upload-with-ocr/route.ts`:81 | `fin_vin` | vehicles | select | HARD | PENDING | vehicles.fin |
| `app/api/sv/upload-with-ocr/route.ts`:103 | `fin_vin` | vehicles | select | HARD | PENDING | vehicles.fin |
| `app/faelle/[id]/_actions/stammdaten.ts`:344 | `fin_extrahiert_am` | vehicles | update | HARD | PENDING | vehicles.cardentity_letzter_pull |
| `app/faelle/[id]/_actions/stammdaten.ts`:344 | `fin_quelle` | vehicles | update | HARD | PENDING | Diagnose — vehicles trackt Pull selbst |
| `app/faelle/[id]/_actions/stammdaten.ts`:344 | `fin_vin` | vehicles | update | HARD | PENDING | vehicles.fin |
| `app/gutachter/auftraege/export-action.ts`:136 | `fahrzeug_baujahr` | vehicles | select | HARD | PENDING | vehicles.baujahr_monat |
| `app/gutachter/auftraege/export-action.ts`:136 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/auftraege/export-action.ts`:136 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/gutachter/auftraege/export-action.ts`:136 | `fin_vin` | vehicles | select | HARD | PENDING | vehicles.fin |
| `app/gutachter/auftraege/export-action.ts`:136 | `lackfarbe_code` | vehicles | select | HARD | PENDING | vehicles.farbcode |
| `app/gutachter/auftraege/page.tsx`:80 | `fahrzeug_baujahr` | vehicles | select | HARD | PENDING | vehicles.baujahr_monat |
| `app/gutachter/auftraege/page.tsx`:80 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/auftraege/page.tsx`:80 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/gutachter/auftraege/page.tsx`:80 | `lackfarbe_code` | vehicles | select | HARD | PENDING | vehicles.farbcode |
| `app/gutachter/fall/[id]/actions.ts`:416 | `fin_extrahiert_am` | vehicles | update | HARD | PENDING | vehicles.cardentity_letzter_pull |
| `app/gutachter/fall/[id]/actions.ts`:416 | `fin_quelle` | vehicles | update | HARD | PENDING | Diagnose — vehicles trackt Pull selbst |
| `app/gutachter/fall/[id]/actions.ts`:416 | `fin_vin` | vehicles | update | HARD | PENDING | vehicles.fin |
| `app/gutachter/feldmodus/_fallakte/actions.ts`:89 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/feldmodus/_fallakte/actions.ts`:89 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/gutachter/feldmodus/page.tsx`:147 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/feldmodus/page.tsx`:147 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/gutachter/heute/page.tsx`:162 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/heute/page.tsx`:162 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/gutachter/team/page.tsx`:95 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/team/page.tsx`:95 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/gutachter/termine/[id]/page.tsx`:77 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/termine/[id]/page.tsx`:77 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/gutachter/termine/[id]/vor-ort/page.tsx`:33 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/gutachter/termine/[id]/vor-ort/page.tsx`:33 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/kunde/termine/[id]/page.tsx`:43 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/kunde/termine/[id]/page.tsx`:43 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `app/kunde/termine/page.tsx`:26 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `app/kunde/termine/page.tsx`:26 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/cardentity/typ-b.ts`:136 | `erstzulassung` | vehicles | select | HARD | PENDING | vehicles.erstzulassung |
| `lib/cardentity/typ-b.ts`:136 | `fin_vin` | vehicles | select | HARD | PENDING | vehicles.fin |
| `lib/cardentity/typ-b.ts`:136 | `kilometerstand` | vehicles | select | HARD | PENDING | vehicles.aktueller_kilometerstand |
| `lib/claims/get-kunde-faelle.ts`:419 | `fahrzeug_baujahr` | vehicles | select | HARD | PENDING | vehicles.baujahr_monat |
| `lib/claims/get-kunde-faelle.ts`:419 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/claims/get-kunde-faelle.ts`:419 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/email/google/flows.ts`:66 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/email/google/flows.ts`:66 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/email/google/flows.ts`:332 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/email/google/flows.ts`:332 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/google-calendar/sv-event-sync.ts`:123 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/google-calendar/sv-event-sync.ts`:123 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/google-calendar/sv-termin-sync.ts`:65 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/google-calendar/sv-termin-sync.ts`:65 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/inbound/match-fall.ts`:75 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/inbound/match-fall.ts`:75 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/kalender/caldav/sv-termin-sync.ts`:71 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/kalender/caldav/sv-termin-sync.ts`:71 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/kanzlei-wunsch/actions.ts`:627 | `fahrzeug_hersteller` | vehicles | update | HARD | PENDING | vehicles.hersteller |
| `lib/kanzlei-wunsch/actions.ts`:627 | `fahrzeug_modell` | vehicles | update | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/termine/get-by-token.ts`:80 | `fahrzeug_hersteller` | vehicles | select | HARD | PENDING | vehicles.hersteller |
| `lib/termine/get-by-token.ts`:80 | `fahrzeug_modell` | vehicles | select | HARD | PENDING | vehicles.modell_haupttyp |

### 4.D · → `gutachter_termine` (SP-D/G2 DONE) — 5

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:69 | `besichtigungsort_adresse` | gutachter_termine | update | HARD | DONE | Termin-Ort |
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:69 | `besichtigungsort_lat` | gutachter_termine | update | HARD | DONE | Termin-Ort |
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:69 | `besichtigungsort_lng` | gutachter_termine | update | HARD | DONE | Termin-Ort |
| `app/kunde/re-termin/[token]/actions.ts`:46 | `re_termin_token` | gutachter_termine | eq | HARD | DONE | Re-Termin-Flow |
| `app/kunde/re-termin/[token]/page.tsx`:32 | `re_termin_token` | gutachter_termine | eq | HARD | DONE | Re-Termin-Flow |

### 4.E · → `gutachten` (SP-G DONE) — 2

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `lib/finance/fall-finanzen.ts`:54 | `nutzungsausfall_tagessatz` | gutachten | select | HARD | DONE | gutachten.gutachten_nutzungsausfall_tagessatz_eur |
| `lib/finance/fall-finanzen.ts`:54 | `wertminderung` | gutachten | select | HARD | DONE | gutachten.minderwert |

### 4.F · → `abrechnungen` (SP-J MIXED) — 2

> **Grenzfall:** `zahlungsweg` BLEIBT laut SP-J-Verdikt-Korrektur (#1551) auf `faelle`
> (Auszahlungs-ZIEL ≠ `claim_payments.zahlungsweg`-Methode), proper Heimat = eigene
> `claims.zahlungsweg`-Spalte = **Phase-6-Entscheidung**. Bis dahin sind diese 2 Stellen
> evtl. KEIN Breaker — menschliche Klaerung noetig (§6).

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/kunde/faelle/[id]/actions.ts`:256 | `zahlungsweg` | abrechnungen | update | HARD | MIXED | Zahlungsweg |
| `lib/claims/get-kunde-faelle.ts`:419 | `zahlungsweg` | abrechnungen | select | HARD | MIXED | Zahlungsweg |

### 4.G · → `claims` (Business-Spalten, nicht-Timestamp; SP-A/B DONE) — 22

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/admin/faelle/anlegen/actions.ts`:103 | `dispatch_id` | claims | insert | HARD | DONE | 0-cov — Dispatcher-Zuordnung, evtl DROP |
| `app/admin/faelle/anlegen/actions.ts`:103 | `konvertiert_am` | claims | insert | HARD | DONE | Lead-Konversion — leads.konvertiert_* SSoT |
| `app/admin/finance/(hub)/offene-faelle/page.tsx`:45 | `lead_preis_netto` | claims | is | HARD | DONE | Lead-Preis — leads? |
| `app/admin/finance/(hub)/page.tsx`:633 | `lead_preis_netto` | claims | select | HARD | DONE | Lead-Preis — leads? |
| `app/admin/finance/(hub)/page.tsx`:633 | `lead_preis_netto` | claims | not | HARD | DONE | Lead-Preis — leads? |
| `app/api/cron/case-billing-batch/route.ts`:49 | `lead_preis_netto` | claims | is | HARD | DONE | Lead-Preis — leads? |
| `app/api/cron/community-leaderboard-update/route.ts`:62 | `lead_preis_netto` | claims | select | HARD | DONE | Lead-Preis — leads? |
| `app/api/cron/monatsabrechnung/route.ts`:80 | `lead_preis_berechnet_am` | claims | update | HARD | DONE | Lead-Preis — leads? |
| `app/api/cron/monatsabrechnung/route.ts`:80 | `lead_preis_netto` | claims | update | HARD | DONE | Lead-Preis — leads? |
| `app/api/cron/monatsabrechnung/route.ts`:80 | `lead_preis_typ` | claims | update | HARD | DONE | Lead-Preis — leads? |
| `app/gutachter/team/actions.ts`:45 | `organisation_id` | claims | select | HARD | DONE | Org-Zuordnung — Reader pruefen |
| `app/gutachter/team/page.tsx`:95 | `organisation_id` | claims | eq | HARD | DONE | Org-Zuordnung — Reader pruefen |
| `app/gutachter/termine/[id]/actions.ts`:387 | `polizei_aktenzeichen` | claims | update | HARD | DONE | auf claims |
| `lib/abrechnung/process-case-billing.ts`:30 | `lead_preis_netto` | claims | select | HARD | DONE | Lead-Preis — leads? |
| `lib/abrechnung/revert-case-billing.ts`:29 | `lead_preis_netto` | claims | select | HARD | DONE | Lead-Preis — leads? |
| `lib/actions/sv-lead-ablehn-actions.ts`:55 | `lead_preis_netto` | claims | select | HARD | DONE | Lead-Preis — leads? |
| `lib/analytics/finance.ts`:107 | `marketing_provision` | claims | select | HARD | DONE | Marketing-Provision |
| `lib/analytics/finance.ts`:107 | `marketing_provision` | claims | not | HARD | DONE | Marketing-Provision |
| `lib/finance/abrechnungen-generator.ts`:100 | `marketing_quelle` | claims | select | HARD | DONE | Marketing-Herkunft — leads? |
| `lib/finance/fall-finanzen.ts`:54 | `marketing_provision` | claims | select | HARD | DONE | Marketing-Provision |
| `lib/finance/fall-finanzen.ts`:54 | `marketing_quelle` | claims | select | HARD | DONE | Marketing-Herkunft — leads? |
| `lib/leads/convert-lead-to-claim.ts`:510 | `kundenbetreuer_id` | claims | eq | HARD | DONE | auf claims |

### 4.TS · → `claims` (Timestamps `created_at` / `updated_at`; SP-A/B DONE) — 93

> **Eigener Bucket.** `faelle.created_at`/`updated_at` sind laut Phase-1-Doc DUP→claims und
> sterben mit `DROP TABLE faelle`. Es sind mechanische Filter (`.gte('created_at', …)` in
> Analytics/Finance), `.order('created_at')`-Sortierungen und `.update({ updated_at })`-
> Begleit-Writes. Niedrigere fachliche Prioritaet (kein Daten-Verlust solange faelle lebt),
> aber **gleicher Hard-Breaker beim Drop**. Sortier-/Filter-Logik muss dann auf
> `claims.created_at`/`claims.updated_at` (bzw. Embed) umziehen.

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/admin/_components/DashboardStats.tsx`:24 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `app/admin/_components/KpiCards.tsx`:64 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `app/admin/_components/KritischeUpdatesWidget.tsx`:58 | `created_at` | claims | lt | HARD | DONE | auf claims |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:144 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:144 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `app/admin/_components/WichtigeUpdatesWidget.tsx`:144 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/offene-faelle/page.tsx`:45 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/offene-faelle/page.tsx`:45 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/page.tsx`:507 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/page.tsx`:507 | `created_at` | claims | lte | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/page.tsx`:535 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/page.tsx`:535 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/page.tsx`:535 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/page.tsx`:633 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `app/admin/finance/(hub)/page.tsx`:633 | `created_at` | claims | lt | HARD | DONE | auf claims |
| `app/admin/tasks/page.tsx`:19 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/api/admin/create-test-fall/route.ts`:121 | `created_at` | claims | insert | HARD | DONE | auf claims |
| `app/api/admin/create-test-fall/route.ts`:121 | `updated_at` | claims | insert | HARD | DONE | auf claims |
| `app/api/baileys/inbound/route.ts`:72 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/api/cron/community-leaderboard-update/route.ts`:62 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/api/cron/community-leaderboard-update/route.ts`:62 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `app/api/cron/community-leaderboard-update/route.ts`:62 | `created_at` | claims | lt | HARD | DONE | auf claims |
| `app/api/termin/ablehnen/route.ts`:52 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/api/twilio/inbound-kb-whatsapp/route.ts`:82 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/api/twilio/inbound-kb-whatsapp/route.ts`:94 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/api/twilio/inbound-kb-whatsapp/route.ts`:125 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/dispatch/leads/[id]/_actions/sv-termin.ts`:27 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/dispatch/leads/[id]/_actions/sv-termin.ts`:66 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/dispatch/leads/[id]/_actions/sv-termin.ts`:66 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/faelle/[id]/_actions/briefing.ts`:83 | `updated_at` | claims | select | HARD | DONE | auf claims |
| `app/faelle/[id]/_actions/dokumente.ts`:302 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/faelle/[id]/_actions/prozess.ts`:72 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/faelle/[id]/_actions/prozess.ts`:109 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/faelle/[id]/_actions/prozess.ts`:160 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/faelle/[id]/_actions/prozess.ts`:214 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/faelle/[id]/page.tsx`:521 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/flow/[token]/actions.ts`:1200 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/gutachter/abrechnung/page.tsx`:80 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/gutachter/abrechnung/page.tsx`:80 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/gutachter/fall/[id]/actions.ts`:574 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/gutachter/posteingang/page.tsx`:34 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/gutachter/reklamationen/page.tsx`:31 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/gutachter/team/page.tsx`:95 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/gutachter/team/page.tsx`:95 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kanzlei/kanban/page.tsx`:61 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/kanzlei/kanban/page.tsx`:61 | `updated_at` | claims | select | HARD | DONE | auf claims |
| `app/kanzlei/kanban/page.tsx`:61 | `updated_at` | claims | order | HARD | DONE | auf claims |
| `app/kanzlei/mandate/page.tsx`:36 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/kanzlei/mandate/page.tsx`:36 | `updated_at` | claims | select | HARD | DONE | auf claims |
| `app/kanzlei/mandate/page.tsx`:36 | `updated_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/_components/kb-chat-actions.ts`:94 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/chat/page.tsx`:37 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/kunde/chat/page.tsx`:37 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/chat/page.tsx`:53 | `created_at` | claims | select | HARD | DONE | auf claims |
| `app/kunde/chat/page.tsx`:53 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/faelle/[id]/_actions/besichtigungsort.ts`:69 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/kunde/faelle/[id]/actions.ts`:213 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `app/kunde/layout.tsx`:91 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/layout.tsx`:135 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/layout.tsx`:174 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/layout.tsx`:221 | `created_at` | claims | order | HARD | DONE | auf claims |
| `app/kunde/onboarding/actions.ts`:541 | `created_at` | claims | order | HARD | DONE | auf claims |
| `components/kunde/OffeneDatenBanner.tsx`:28 | `created_at` | claims | order | HARD | DONE | auf claims |
| `lib/abrechnung/calculate-lead-price.ts`:58 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `lib/abrechnung/calculate-lead-price.ts`:58 | `created_at` | claims | lt | HARD | DONE | auf claims |
| `lib/abrechnung/process-case-billing.ts`:30 | `created_at` | claims | select | HARD | DONE | auf claims |
| `lib/actions/termin-actions.ts`:207 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/actions/termin-actions.ts`:377 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/actions/termin-actions.ts`:675 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/actions/termin-actions.ts`:850 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/actions/termin-verlegung-actions.ts`:329 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/ai/briefing-structured.ts`:140 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/ai/briefing.ts`:143 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/analytics/conversion.ts`:38 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `lib/analytics/conversion.ts`:38 | `created_at` | claims | lte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:17 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:17 | `created_at` | claims | lte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:100 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:100 | `created_at` | claims | lte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:107 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:107 | `created_at` | claims | lte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:143 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `lib/analytics/finance.ts`:143 | `created_at` | claims | lte | HARD | DONE | auf claims |
| `lib/analytics/sv-performance.ts`:55 | `created_at` | claims | gte | HARD | DONE | auf claims |
| `lib/analytics/sv-performance.ts`:55 | `created_at` | claims | lte | HARD | DONE | auf claims |
| `lib/branding/kunden-theme.ts`:40 | `created_at` | claims | order | HARD | DONE | auf claims |
| `lib/branding/token-theme.ts`:51 | `created_at` | claims | order | HARD | DONE | auf claims |
| `lib/faelle/kb-assignment.ts`:71 | `updated_at` | claims | update | HARD | DONE | auf claims |
| `lib/faelle/kb-assignment.ts`:189 | `created_at` | claims | order | HARD | DONE | auf claims |
| `lib/fall/communication-timeline.ts`:52 | `created_at` | claims | select | HARD | DONE | auf claims |
| `lib/inbound/match-fall.ts`:75 | `created_at` | claims | select | HARD | DONE | auf claims |
| `lib/inbound/match-fall.ts`:75 | `created_at` | claims | order | HARD | DONE | auf claims |
| `lib/kanzlei/push-mandat.ts`:225 | `updated_at` | claims | update | HARD | DONE | auf claims |

### 4.K · Dynamische Property-Writes (statisch NICHT gefunden — manuell ergaenzt)

> Diese Sites bauen ein `Record<string,unknown>`-Update-Objekt mit **dynamischer
> Key-Zuweisung** (`updateData.fin_vin = …`) und schreiben es ohne Split-Helper auf `faelle`.
> Das Literal-Matching findet sie nicht — sie sind echte Breaker (mehrere relocatete Spalten je Site).

| Datei:Zeile | Geschriebene relocatete Spalten | Ziel | Severity | Notiz |
|---|---|---|---|---|
| `app/api/ocr-fahrzeugschein/route.ts`:80 | `ocr_rohdaten,ocr_extrahiert_am`(→gutachten); `fin_vin,fin_quelle,fin_extrahiert_am,erstzulassung,fahrzeug_baujahr,fahrzeug_hersteller,fahrzeug_modell,fahrzeug_farbe,hsn,tsn`(→vehicles); `halter_*`(→claim_parties) | mehrere | HARD | groesster dynamischer Breaker-Cluster; `.update(updateData)` |
| `app/api/ocr-gutachten/route.ts`:155 | `ocr_extrahiert_am,ocr_rohdaten,nutzungsausfall_tagessatz,reparaturdauer_tage,gutachter_honorar`(→gutachten); `fin_vin`(→vehicles) | gutachten/vehicles | HARD | `.update(faelleUpdate)`, Helper NICHT im File |
| `lib/cardentity/typ-b.ts`:189 | `vorschaden_typ_b_bericht,vorschaden_geprueft,hat_vorschaeden,vorschaden_anzahl,cardentity_abfrage_am,vorschaden_letzter_datum` | ? (SP-F) | HARD | `.update(updates)` dynamisch; PENDING |
| `components/VorOrtPanel.tsx`:65 | `fin_vin,kilometerstand` (→vehicles) | vehicles | HARD | `.update(updates)`; PENDING |
| `app/api/ocr-trigger/route.ts`:137 | `halter_geburtsdatum` (→claim_parties) | claim_parties | HARD | auch statisch gefunden — hier zur Vollstaendigkeit |

### 4.SEED · Seed-/Test-Routen (dev-only) — 33

> Keine `*.test.ts` (daher im Scan), aber Daten-Seeder / Smoke-Fixtures. Brechen ebenfalls in
> Phase 6, aber kein Produktions-Pfad. Niedrigste Prioritaet; sollten beim Drop trotzdem
> auf Sub-Tabellen-Inserts umgestellt oder entfernt werden.

| Datei:Zeile | Spalte | SSoT-Ziel | Zugriff | Sev | Slice | Notiz |
|---|---|---|---|---|---|---|
| `app/api/admin/create-test-fall/route.ts`:26 | `mandatsnummer` | kanzlei_faelle | eq | HARD | DONE | Kanzlei-LC Mandat |
| `app/api/admin/create-test-fall/route.ts`:121 | `besichtigungsort_lat` | gutachter_termine | insert | HARD | DONE | Termin-Ort |
| `app/api/admin/create-test-fall/route.ts`:121 | `besichtigungsort_lng` | gutachter_termine | insert | HARD | DONE | Termin-Ort |
| `app/api/admin/create-test-fall/route.ts`:121 | `datenschutz_akzeptiert` | claims | insert | HARD | DONE | DSGVO-Zustimmung |
| `app/api/admin/create-test-fall/route.ts`:121 | `datenschutz_akzeptiert_am` | claims | insert | HARD | DONE | DSGVO-Zeitstempel |
| `app/api/admin/create-test-fall/route.ts`:121 | `fahrzeug_baujahr` | vehicles | insert | HARD | PENDING | vehicles.baujahr_monat |
| `app/api/admin/create-test-fall/route.ts`:121 | `fahrzeug_hersteller` | vehicles | insert | HARD | PENDING | vehicles.hersteller |
| `app/api/admin/create-test-fall/route.ts`:121 | `fahrzeug_modell` | vehicles | insert | HARD | PENDING | vehicles.modell_haupttyp |
| `app/api/admin/create-test-fall/route.ts`:121 | `gegner_kennzeichen` | claim_parties | insert | HARD | IN-FLIGHT | cp.kennzeichen |
| `app/api/admin/create-test-fall/route.ts`:121 | `gegner_name` | claim_parties | insert | HARD | IN-FLIGHT | claim_parties rolle=verursacher |
| `app/api/admin/create-test-fall/route.ts`:121 | `gegner_versicherung` | claim_parties | insert | HARD | IN-FLIGHT | cp.versicherung_klartext |
| `app/api/admin/create-test-fall/route.ts`:121 | `ist_aktiv` | claims | insert | HARD | DONE | Aktiv-Flag |
| `app/api/admin/create-test-fall/route.ts`:121 | `prioritaet` | claims | insert | HARD | DONE | Bearbeitungsprio |
| `app/api/admin/create-test-fall/route.ts`:121 | `sa_unterschrieben` | claims | insert | HARD | DONE | SA-Signatur |
| `app/api/admin/create-test-fall/route.ts`:121 | `sa_unterschrieben_am` | claims | insert | HARD | DONE | SA-Signatur |
| `app/api/admin/create-test-fall/route.ts`:121 | `schadens_ursache` | claims | insert | HARD | DONE | Schadensursache-Freitext |
| `app/api/admin/create-test-fall/route.ts`:121 | `sv_zugewiesen_am` | claims | insert | HARD | DONE | SV-Zuweisungszeit |
| `app/api/admin/test/cmm48-smoke/route.ts`:137 | `besichtigungsort_adresse` | gutachter_termine | select | HARD | DONE | Termin-Ort |
| `app/api/seed-testdata/route.ts`:78 | `kunde_id` | claim_parties | or | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/seed-testdata/route.ts`:497 | `anschlussschreiben_am` | kanzlei_faelle | insert | HARD | DONE | Kanzlei-LC AS |
| `app/api/seed-testdata/route.ts`:497 | `fahrzeug_baujahr` | vehicles | insert | HARD | PENDING | vehicles.baujahr_monat |
| `app/api/seed-testdata/route.ts`:497 | `fahrzeug_hersteller` | vehicles | insert | HARD | PENDING | vehicles.hersteller |
| `app/api/seed-testdata/route.ts`:497 | `fahrzeug_modell` | vehicles | insert | HARD | PENDING | vehicles.modell_haupttyp |
| `app/api/seed-testdata/route.ts`:497 | `gutachten_eingegangen_am` | gutachten | insert | HARD | DONE | gutachten.fertiggestellt_am |
| `app/api/seed-testdata/route.ts`:497 | `kunde_id` | claim_parties | insert | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |
| `app/api/seed-testdata/route.ts`:497 | `regulierung_am` | kanzlei_faelle | insert | HARD | DONE | Kanzlei-LC Regulierung |
| `app/api/seed-testdata/route.ts`:497 | `regulierung_angekuendigt_am` | kanzlei_faelle | insert | HARD | DONE | Kanzlei-LC Regulierung |
| `app/api/seed-testdata/route.ts`:895 | `gegner_anzahl_beteiligte` | claims | update | HARD | DONE | KEIN echtes DUP (≠ anzahl_beteiligte_total) — Count über claim_parties |
| `app/api/seed-testdata/route.ts`:895 | `gegner_fahrzeugtyp` | claim_parties | update | HARD | IN-FLIGHT | cp.fahrzeugtyp_klartext |
| `lib/smoke/lifecycle-seed.ts`:165 | `besichtigungsort_adresse` | gutachter_termine | insert | HARD | DONE | Termin-Ort |
| `lib/smoke/lifecycle-seed.ts`:165 | `fahrzeug_hersteller` | vehicles | insert | HARD | PENDING | vehicles.hersteller |
| `lib/smoke/lifecycle-seed.ts`:165 | `fahrzeug_modell` | vehicles | insert | HARD | PENDING | vehicles.modell_haupttyp |
| `lib/smoke/lifecycle-seed.ts`:165 | `kunde_id` | claim_parties | insert | HARD | IN-FLIGHT | cp rolle=geschaedigter / claims.geschaedigter_user_id |

---

## 5 · SOFT-Breaker — `select('*')` + Downstream-Property-Read

> `.from('faelle').select('*')` bricht beim Drop **nicht am Query** (PostgREST liefert die
> dann noch existierenden Spalten), aber jeder Downstream-`fall.<relocatedCol>`-Zugriff ist
> nach dem Drop `undefined` → stiller Logik-Fehler. Manuelle Pruefung der Consumer noetig.

| Datei:Zeile | Zugriff | Downstream-Risiko |
|---|---|---|
| `lib/onboarding/load-needed-phases.ts`:44 | `select('*')` → `fall` als Wizard-Prefill-Quelle | Wizard-Felder aus relocateten faelle-Spalten werden `undefined` (Onboarding-Prefill leer) |
| `lib/kanzlei-wunsch/actions.ts`:705 | `select('*')` → `fallRow` an `createPflichtdokumenteFromKatalog` | Katalog-Logik liest evtl. relocatete faelle-Felder |
| `lib/makler/copilot-prompt.ts`:79 | `select('*', leads(...), kunde:profiles!...)` | Copilot-Prompt-Kontext aus faelle-`*` |
| `app/api/pdf/kanzlei-paket/[id]/route.tsx`:21 | `select('*', lead_id, sv_id, claims:claim_id(...))` | PDF-Generierung liest faelle-`*` Felder |

---

## 6 · Unsicherheiten / Grenzfaelle (menschliche Entscheidung)

1. **`created_at` / `updated_at` (93 Stellen):** Klar DUP→claims laut Doc, aber universelle
   Timestamp-Spalten. Frage: Wird Phase 6 wirklich die ganze Tabelle droppen (dann Breaker)
   oder nur die Business-Spalten? Falls Letzteres, koennten faelle.created_at/updated_at
   bewusst stehenbleiben. **Entscheidung beeinflusst, ob diese 93 in den Sweep gehoeren.**

2. **`zahlungsweg` (abrechnungen-Bucket, 2 Stellen):** SP-J-Korrektur (#1551) sagt explizit
   „BLEIBT auf faelle" bis eigene `claims.zahlungsweg`-Spalte angelegt ist (Phase-6-Entscheidung).
   → Aktuell wahrscheinlich **KEIN** Breaker. Aus dem Sweep nehmen oder als „blockiert auf
   claims.zahlungsweg-Migration" markieren.

3. **`kunde_id` als Ownership-Filter (61×):** Doc mappt `kunde_id`→claim_parties, SSoT aber
   `claims.geschaedigter_user_id`. Der Task-Whitelist (`sv_id`,`claim_id`,…) enthaelt `kunde_id`
   NICHT — daher als Breaker gewertet. Falls `faelle.kunde_id` aus Ownership-Gruenden faktisch
   doch bis zuletzt bleibt (oder ueber `claims.geschaedigter_user_id` ersetzt wird), ist die
   Umbau-Strategie (nicht die Existenz des Breakers) die Frage. **Hoechste Prioritaet zu klaeren.**

4. **`fahrzeug_*` / `fin_*` / Vorschaeden (PENDING, ~75 Stellen):** SP-E/SP-F sind noch nicht
   gestartet → faelle ist HEUTE noch SSoT, diese Stellen sind **korrekt** und werden erst beim
   jeweiligen Slice umgebaut. Sie gehoeren ins Phase-6-Gate, aber NICHT in „latent buggy jetzt".

5. **Stale Code-Kommentare vs. Doc:** `kanzlei-paket.ts:357` („regulierung_am bleibt
   faelle-only"), `prozess.ts`, `ocr-gutachten.ts` enthalten Kommentare, die einzelne Spalten
   als faelle-only deklarieren — im Widerspruch zum Phase-1-Doc + SP-I/SP-G-Status. Hier
   entscheidet die **DB-Realitaet** (vor Drop `information_schema` live pruefen), nicht der Kommentar.

6. **`source_channel` (cov=27, TBD→claims):** Im Doc TBD, evtl. leads-SSoT. Keine direkten
   faelle-Treffer im Sweep, aber bei SP-Marketing zu pruefen.

7. **Dynamische `fall[feld]`-Zugriffe:** Wie das Phase-1-Doc (§6) warnt, greppt man indizierte
   Property-Zugriffe nicht. §4.K deckt die gefundenen Update-Objekt-Builder ab, aber ein
   vollstaendiger Schutz braucht Portal-Smoke nach jedem Slice (`feedback_post_drop_smoke`).

---

## 7 · Geprueft-aber-sauber (96 faelle-Zugriffs-Dateien ohne relocateten Breaker)

Diese Files greifen auf `faelle` zu, aber nur auf faelle-native Spalten
(`id`/`claim_id`/`lead_id`/`sv_id`/`kennzeichen`/`status`/`fall_nr`), via Embed, via View
oder via Split-Helper (`splitOrKeepFaelleUpdate`/`peelAuftraegeColumns`):

```
admin/abrechnungen/actions.ts · admin/kalender/page.tsx · admin/meine-tasks/page.tsx ·
admin/nachrichten/page.tsx · admin/reklamationen/page.tsx · api/chat/fall-lookup/route.ts ·
api/chat/inbox-threads/route.ts · api/cron/pflichtdokumente-reminder/route.ts ·
api/cron/re-termin-eskalation/route.ts · api/cron/release-makler-provisionen/route.ts ·
api/cron/send-lead-reminders/route.ts · api/cron/send-reminders/route.ts ·
api/cron/sv-termin-dokument-reminder/route.ts · api/email/send/route.ts ·
api/gutachter/search/route.ts · api/kunde-5min-notification/route.ts ·
api/lexdrive/bot-callback/route.ts · api/lexdrive/vollmacht-confirm/route.ts ·
api/ocr-beleg/route.ts · api/schadenkalkulation/route.ts · api/webhooks/lexdrive/route.ts ·
api/webhooks/twilio/inbound/route.ts · api/webhooks/twilio/status/route.ts ·
dispatch/dashboard/page.tsx · faelle/[id]/_actions/core.ts (Split-Helper) ·
faelle/[id]/_actions/manual-phase-override.ts · faelle/[id]/_actions/manual-status-override.ts ·
faelle/[id]/_sidebar/eskalation-actions.ts (Split-Helper) · faelle/[id]/_sidebar/rueckruf-actions.ts ·
faelle/[id]/lexdrive-actions.ts · gutachter/faelle/page.tsx ·
gutachter/fall/[id]/_actions/konfrontation.ts · gutachter/fall/[id]/abrechnungsart-actions.ts ·
gutachter/fall/[id]/cardentity-actions.ts · gutachter/fall/[id]/page.tsx ·
gutachter/fall/[id]/stellungnahme/actions.ts · gutachter/kalender/actions.ts ·
gutachter/profil/page.tsx · gutachter/reklamationen/actions.ts · gutachter/tasks/page.tsx ·
gutachter/termine/[id]/navigation/page.tsx · kunde-termin/[token]/actions.ts ·
kunde/faelle/[id]/google-review-actions.ts · kunde/faelle/[id]/page.tsx ·
kunde/onboarding-details/page.tsx · kunde/page.tsx · kunde/termin/[token]/actions.ts ·
kunde/termin/[token]/page.tsx · upload/dokumente/[token]/actions.ts ·
components/faelle/OcrAutoFillModal.tsx (Split-Helper) · components/tasks/UeberfaelligeTasks.tsx ·
lib/abrechnung/reissue-abrechnung.ts (Split-Helper) · lib/actions/admin-kalender.ts ·
lib/actions/dispatch-fall-actions.ts · lib/actions/konvertiere-anfrage-zu-fall.ts ·
lib/actions/stellungnahme-upload.ts · lib/actions/storno-actions.ts ·
lib/actions/unterschrift-upload.ts · lib/auftrag/aktiver-auftrag.ts · lib/auftrag/create.ts ·
lib/auftrag/qc.ts · lib/auftrag/side-quest.ts · lib/beleg-review/actions.ts ·
lib/claims/create-for-fall.ts · lib/claims/endzustand-actions.ts · lib/claims/get-claim-for-role.ts ·
lib/communications/channel-router.ts · lib/communications/send-chat.ts · lib/copilot/post-call.ts ·
lib/dispatch/konfrontations-dispatch-lite.ts · lib/dokumente/ad-hoc-anforderung.ts ·
lib/faelle/state-machine.ts (peelAuftraegeColumns+Split) · lib/faelle/sv-assignment.ts ·
lib/faq-bot/analyse.ts · lib/faq-bot/ask.ts · lib/gutachten/ocr-actions.ts · lib/kanzlei/actions.ts ·
lib/lead-fall-mapping.ts · lib/makler/queries.ts · lib/mietwagen/actions.ts · lib/mietwagen/cron.ts ·
lib/resolver/eskalation-cron.ts · lib/resolver/resolve-tasks-from-event.ts ·
lib/sa-tool/generate-gutachter-sa.ts · lib/sla/tracker.ts · lib/termine/actions.ts ·
lib/termine/baseline-fahrtzeit.ts · lib/termine/bestaetigung.ts · lib/termine/notify-kunde-angekommen.ts ·
lib/termine/sv-ablehnung.ts · lib/termine/trigger-losgefahren.ts · scripts/seed-test-data.ts
```

> ⚠️ **ACHTUNG — 4 dieser „sauberen" Files haben dynamische Writes (§4.K):**
> `api/ocr-fahrzeugschein/route.ts`, `api/ocr-gutachten/route.ts`, `api/sv-zuweisung/route.ts`,
> `components/VorOrtPanel.tsx` erschienen statisch sauber, schreiben aber via dynamischer
> Key-Zuweisung relocatete Spalten. Sie sind in §4.K als echte Breaker gefuehrt.
> `lib/cardentity/typ-b.ts` ist sowohl in §4.UNKNOWN (Zeile 136 select) als auch §4.K (Zeile 189 write).

---

## 8 · Empfehlung fuer die Umsetzung

1. **Reihenfolge nach Slice-Status:** Zuerst die **DONE**-Buckets fixen (kanzlei_faelle 64,
   claims-Business 22) — die bluten schon jetzt. Dann **IN-FLIGHT** (claim_parties/`kunde_id`)
   im Rahmen von SP-C. Zuletzt **PENDING** (vehicles, vorschaeden) jeweils mit ihrem Slice (SP-E/F).
2. **`kunde_id`-Ownership zuerst zentral loesen** — `lib/claims/kunde-ownership.ts` ist der
   Shared-Entrypoint; ein Umbau dort + `app/kunde/layout.tsx` deckt die Mehrzahl ab.
3. **Stale Kommentare bereinigen** (kanzlei-paket.ts etc.) — sie verschleiern aktive Breaker.
4. **Vor jedem Drop `information_schema` live pruefen** (`feedback_information_schema_check`)
   und **nach jedem Slice Portal-Smoke** (`feedback_post_drop_smoke`) — der statische Sweep
   findet keine dynamischen `fall[feld]`-Zugriffe.

🤖 Audit erstellt mit Claude Opus 4.7 (1M context) — CMM-44 Phase-6 Reader-Sweep
