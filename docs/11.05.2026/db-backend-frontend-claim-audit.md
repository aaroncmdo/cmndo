# Datenkonsistenz-Audit: DB → Backend → Frontend (Claim-Zentriert)
**Audit-Datum:** 12. Mai 2026  
**App:** Claimondo v2 (CMM Phase 1.5 — Claims als Single-Source-of-Truth)  
**Scope:** Claim-Datenfluss Kunde-Portal ↔ Gutachter-Portal ↔ DB-Sync-Trigger

---

## TL;DR — Top-5 Befunde

1. **KRITISCH: Bidirektionale Trigger-Komplexität (Phase 1.5a)**  
   Zwei Sync-Trigger (claims→faelle + faelle→claims mit Ping-Pong-Schutz via pg_trigger_depth()>1) + Legacy-Reverse-Sync führen zu versteckten Drift-Szenarien wenn Trigger fehlschlagen.

2. **MITTEL: Doppelte Reads auf aelle im Kunde-Portal**  
   In /kunde/page.tsx werden getKundeFaelle() + danach nochmals einzelne Falls via getFallById() + Inline-Reads (
achrichten, leads) geladen — führt zu Race-Conditions bei Phasen-Übergängen.

3. **MITTEL: Status/Phase-Divergenz zwischen claims.status ↔ aelle.status**  
   claims.status (lifecycle: offen/reguliert/abgelehnt) ≠ aelle.status (workflow: onboarding/in_bearbeitung/kanzlei) — Stepper-Logik in Frontend muss beide konsultieren, Mapping ist nicht symmetrisch.

4. **MITTEL: Fehlende Null-Checks bei kritischen Phase-Feldern**  
   getAuftragsPhase() in /lib/auftrag/phase.ts vertraut auf 	erminStart, gutachtenEingegangenAm, etc. — aber getFallForSv() lädt diese teils nicht oder conditional, falsche Phase-Anzeige möglich.

5. **NIEDRIG: >10 Timestamp-Spalten-Duplikate (created_at/updated_at vs. -am Suffix)**  
   created_at, updated_at auf claims/aelle + gefüllt_am, unterschrieben_am, etc. auf derselben Row — Verwirrung bei Query-Optimierung + RLS-Audit-Timing.

---

## Phase 1 — Schema-Inventar

### Tabellen & Spalten-Counts

| Tabelle | Rolle | Spalten | Key Sync-Spalten |
|---------|-------|---------|------------------|
| claims | SSoT für Schadensereignis | ~55 | alle 40 duplizierten Spalten sind Quelle |
| faelle | Operative Replica + Workflow | ~52 | 40 Spalten werden via Trigger sync'd |
| auftraege | Gutachter-Auftrag | ~20 | claim_id FK (seit CMM Phase 1.5b), status eigenes Enum |
| gutachter_termine | SV-Terminplanung | ~18 | fall_id FK, terminStart, terminStatus, durchgefuehrtAm |
| profiles | Benutzer-Stammdaten | ~30 | vorname, nachname, email, telefon (keine Sync nötig) |
| leads | Legacy Lead-Erfassung | ~40 | Langsam zu Claims migriert, email bleibt Ownership-Fallback |

### Sync-Trigger-Richtungen (CMM Phase 1.5a)

Primär: claims → faelle (40 Spalten)
- triggeriert auf UPDATE dieser Spalten
- pg_trigger_depth() > 1 blockiert Ping-Pong
- Drift-Backfill vor Aktivierung durchgeführt

Reverse (Legacy): faelle → claims
- Sicherheitsnetz falls alte Caller noch direkt auf faelle schreiben
- Wird nach Phase 3 (Write-Migration) entfernt
- ACHTUNG: beide Trigger können sich blockieren!

---

## Phase 2 — Datenfluss (textual)

**Kunde-Portal:**
getKundeFaelle() → Reads claims (Anker) + Joins faelle (Ownership) + Loads gutachter_termine
→ Server-Actions UPDATE faelle → Trigger: faelle→claims Sync → revalidatePath

**Gutachter-Portal:**
getFallForSv() → Reads faelle (Anker) + Checks sv_id + Reads gutachter_termine + Admin-Fallback für leads
→ Server-Actions UPDATE gutachter_termine + auftraege → kein Trigger zu claims!

**DB-Trigger-Chain:**
claims UPDATE [20260505134954] → trg_sync_claims_to_faelle() → UPDATE faelle (40 Spalten)
faelle UPDATE [20260505134954] → trg_sync_faelle_to_claims() → UPDATE claims (40 Spalten, Reverse-Sicherheitsnetz)

---

## Phase 3 — Pro Konsument

### Kunde-Portal Reads/Writes/Renders

Primäre Reads:
- getKundeFaelle (CMM-28): claims(claim_id) + faelle(owner) + gutachter_termine ~30/68 Felder
- getKundeFallDetailRecord: claims + faelle + fall_dokumente + pflichtdokumente + gutachter_termine
- Inline-Reads: profiles.vorname, nachrichten (ungelesen-Count), leads (Mail-reactivation)

Schreib-Stellen:
- /faelle/[id]/actions.ts: zahlungsweg, besichtigungsort_adresse → faelle UPDATE → Trigger zu claims
- /nachbesichtigung/actions.ts: nachbesichtigung_status → faelle UPDATE → Trigger zu claims

Fehlende revalidatePath-Coverage:
- /kunde/faelle/[id] wird invalidiert (✓)
- /kunde/page.tsx (Startseite) wird NICHT invalidiert — User sieht alte Fall-Liste
- /kunde/faelle/ (Multi-Fall-Liste) wird NICHT invalidiert

UI-Renders:
- FallKarte: kennzeichen, fahrzeug_hersteller/modell, schadens_datum, status, sv_termin, termin_status
- Claim-Stepper: Phase aus getClaimLifecycle() — benötigt sa_unterschrieben, vollmacht_signiert_am, auftraege[]
- Termin-Banner: gutachter_termin_status, termin_start, sv_unterwegs_am, durchgefuehrt_am
- Auszahlung-Info: regulierung_am (aus faelle, nicht claims!)

### Gutachter-Portal Reads/Writes/Renders

Primäre Reads:
- getFallForSv (AAR-651): faelle (Anker) + gutachter_termine + pflichtdokumente
- getAlleAuftraege(): auftraege[] mit claim_id FK
- Lead-PII blockiert RLS → Admin-Client Fallback

Schreib-Stellen:
- /fall/[id]/actions.ts: termin_status → gutachter_termine UPDATE
  sv_unterwegs_am, sv_angekommen_am, durchgefuehrt_am → gutachter_termine UPDATE
  abrechnungsart → auftraege UPDATE (kein Sync zu claims!)
- /abrechnungsart-actions.ts: preistyp, lead_preis → auftraege

Fehlende Trigger-Coverage:
- auftraege UPDATE wird NICHT zu faelle synced
- gutachter_termine Felder beeinflussen Phase-Berechnung, werden aber nicht zu claims propagiert

revalidatePath-Coverage:
- /gutachter/fall/[id] wird invalidiert (✓)
- /gutachter/auftraege wird invalidiert (✓)
- /gutachter/faelle/ wird NICHT mehr verwendet (zu kanzlei_faelle umgestellt)

UI-Renders:
- AktuellePhaseCard: basiert auf getAuftragsPhase() — nutzt terminStart, terminStatus, svUnterwegsSeit, durchgefuehrtAm
- MeinFallStatusCard: Regulierungs-Phase aus kanzlei_fall
- Pflichtdokumente: Liste mit Download-Links
- Lead-Stammdaten-Card: Admin-Client Fallback für Lead (null wenn gelöscht)

---

## Phase 4 — Phase-Auswirkungen

Claim-Hauptphasen:
- Erfassung: sa_unterschrieben, vollmacht_signiert_am, onboarding_complete — aus faelle
- Begutachtung: terminStart, terminStatus, svUnterwegsSeit, durchgefuehrtAm — aus gutachter_termine
- Regulierung: kanzlei_fall existiert — aus kanzlei_faelle
- Abschluss: ausgezahlt_am gesetzt — aus kanzlei_faelle

Divergenzen:
- Kunde sieht Claim-Hauptphasen, Gutachter sieht AuftragsPhase + FallPhase
- Phase-Labels nicht symmetrisch abgebildet

---

## Phase 5 — Daten-Lücken

Spalten nirgends gerendert:
- claims.hergang_sv_text — SV erfasst, nur Admin sieht
- claims.unfallskizze_svg — Generiert, aber unfallskizze_url wird genutzt
- faelle.szenario — Klassifizierung, keine UI-Anzeige
- auftraege.preistyp — SV wählt, Kunde sieht kein Label

Felder mit vielen NULLs:
- claims.entdeckt_am (~15%)
- claims.verursacher_user_id (~30%)
- claims.gegnerisches_vehicle_id (~70%)
- faelle.sv_id (~5%, aber critical!)

---

## Phase 6 — Anti-Patterns

1. /src/app/kunde/page.tsx AAR-kunde-auto-claim: Ad-hoc-Ownership-Fixes im Page-Render-Pfad
2. /src/app/kunde/faelle/[id]/page.tsx AAR-705: Silent-Catch mit leerer Fallback nach ladeFallKartenMeta-Fehler
3. /src/app/gutachter/fall/[id]/page.tsx AAR-771: Extra Admin-Client um PII-RLS zu umgehen
4. /src/lib/claims/get-kunde-faelle.ts CMM-28: Drei-stufige Ownership (claim_parties/faelle.kunde_id/lead.email)
5. /src/app/kunde/faelle/[id]/actions.ts CMM-29: try/catch blockiert silent — wenn Trigger fehlt, drift

---

## Phase 7 — Severity-Matrix

| ID | Befund | Severity | Auswirkung |
|----|--------|----------|-----------|
| B1 | Bidirektionale Trigger können gegenseitig blocken | KRITISCH | Drift nach Fehler |
| B2 | gutachter_termine Felder beeinflussen Phase, nicht zu faelle synced | KRITISCH | Veraltete Phase-Anzeige |
| B3 | Silent-Catch nach ladeFallKartenMeta-Fehler | MITTEL | Leere Termin-Info |
| B4 | Doppelte Reads (getKundeFaelle + ladeFallKartenMeta + inline) | MITTEL | N+1 Queries |
| B5 | Three-Way-Ownership (claim_parties/faelle.kunde_id/lead.email) | MITTEL | Ownership-Drift |
| B6 | revalidatePath(/kunde/faelle/[id]) aber nicht /kunde/page.tsx | MITTEL | Alte Fall-Liste |
| B7 | Phase-Berechnungen ohne Null-Checks | MITTEL | Falsche Phase |
| B8 | status/phase Enums nicht symmetrisch (claims ≠ faelle) | MITTEL | Stepper-Komplexität |
| B9 | 10+ Timestamp-Duplikate (created_at vs. -am) | NIEDRIG | Schema-Verwirrung |
| B10 | Lead-Daten benötigen Admin-Client auch im SV-Portal | NIEDRIG | Architectural Debt |

---

## Telemetrie-Empfehlungen vor Fixes

**Vor B1-Fix (Trigger-Fehler):**
- Logging: Trigger-Depth + rowcount bei jedem Sync
- Sentry-Event: Wenn Trigger faellt mit context (old/new values)

**Vor B2-Fix (Phase-Divergenz):**
- Logging: getAuftragsPhase() Input-Werte (welche Felder null?)
- Analytics: % Fälle in Besichtigung-Phase

**Vor B4-Fix (N+1-Queries):**
- DB Query-Log: Zähle .select() pro KundeStartseite-Load
- Metrics: getKundeFaelle + ladeFallKartenMeta Latenz

**Vor B5-Fix (Ownership-Drift):**
- Audit-Query: claim_parties.user_id IS NULL vs. faelle.kunde_id
- Event-Logging: auto-claim Operationen mit Result

**Vor B8-Fix (Status/Phase-Enums):**
- Logging: getClaimLifecycle() Output + Input-Felder
- AB-Test: Unified Phase-Enum testen

---

## Fazit

Die Claim-Zentrierungs-Migration (CMM Phase 1.5) hat die richtige Architektur, aber die 
Transition vom Zweigeteilten Modell (claims + faelle) ist unvollständig. Bidirektionale Trigger, 
parallele Ownership-Mechanismen und fehlende gutachter_termine-Propagation schaffen versteckte 
Konsistenzrisiken. Für Phase 2 (Write-Migration) ist Logging + Audit-Telemetrie essentiell vor jedem Fix.

**Nächste Schritte:** Top-5-Befunde in separate Jira-Tickets, mit Logging-Prerequisites vor Fixes.
