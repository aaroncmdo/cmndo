# Kanonische SV-Lead-Quelle (Dead-Pin-Pool) — Design

**Datum:** 2026-06-23 · **Status:** Design (Spec) — Review offen · **Branch:** `kitta/sv-leads-kanonische-quelle`

**Kontext:** Audit (2026-06-23) der `sv_leads` ergab: **keine kanonische Quelle.** Aaron: „wir brauchen
eine kanonische Quelle — allerdings müssen wir auch sv_leads anlegen können, die nicht von der DAT sind."

> **Scope-Entscheidung (Decomposition):** Diese Spec deckt die **QUELLE** ab (Pool-Befüllung, Dedup,
> Anlage, Refresh). Die volle **SV-Onboarding-Vereinheitlichung** (die 6 fragmentierten Anlage-Pfade →
> ein `onboardSv`-Core + Zustandsmaschine) ist die **Phase-2-Schwester-Spec** (§9), gebaut auf der
> [Onboarding-Writer-Kanonisierung](2026-06-22-onboarding-writer-kanonisierung-design.md). Ein `sv_lead`
> ist der SV-Kandidat im `kandidat`-Zustand; diese Spec liefert den Entry-Layer, die Schwester den Rest.

## 1. Kontext & Problem (Audit-Befund)

`sv_leads` = der Pool von Gutachter-Leads, der im Gutachter-Finder als **Dead-Pins** erscheint (Fallback
wenn kein buchbarer Partner-SV den Ort deckt; `lade-deadpin-fallback.ts`) und über `/sv/registrieren`
geclaimt werden kann (`sv-basic/claim-actions.ts:beanspracheSvLead` → `sachverstaendige`).

**Was heute kaputt ist:**
- **Einmal-Schuss, nicht idempotent:** `scripts/sv-import-small.sql` macht `DELETE FROM sv_leads` + INSERT
  (62 Zeilen, `quelle='excel_import_2026-05-11'`). Ein zweiter Lauf löscht alles. Kein Upsert, kein Dedup.
- **Keine DAT-Quelle:** `dat_id`/`dat_url`/`dat_expert_nr` sind **0/62 befüllt**. Das Schema *plant* DAT als
  Schlüssel (`UNIQUE sv_leads_dat_id_key`), aber es ist ungenutzt — keine API, kein Sync, kein `DAT_*`-Env.
  „DAT" existiert nur als vom SV eingetippte Identitätsnummer beim Self-Claim (`registriereSvBasicNeu`).
- **Kein Refresh:** der `isochrone-backfill`-Cron (`api/cron/isochrone-backfill/route.ts`) deckt **nur
  `sachverstaendige`, nicht `sv_leads`** → Umzug/Schließung eines Gutachters = die Karte bleibt für immer falsch.
- **Keine Admin-Anlage:** **keine UI/Route**, um einen einzelnen Lead anzulegen — nur das SQL-Script.
- **Magere Daten:** 0 Quals, 0 Kontakt (Tel/Email), 0 BVSK/öbuv. `zuletzt_aktualisiert == erst_import`.
- **0 Conversion:** 0/62 geclaimt — der Claim-Flow ist verdrahtet, aber niemand wird eingeladen (kein Tool, 0 Kontakt).

## 2. Ziele / Nicht-Ziele

**Ziele:** EIN idempotenter Schreibweg (`sv_lead_upsert`); Dedup auf `dat_id` **ODER** Nicht-DAT-Key
(normalisierter Name+PLZ); **Admin-Anlage** (Einzel-Formular + Bulk-Import-UI) für DAT **und Nicht-DAT**;
ein **Verzeichnis-Sync-Adapter-Interface** (DAT/BVSK); **Geo/Isochrone-Refresh** für `sv_leads`; Datenqualität (Kontakt/Quals).

**Nicht-Ziele:** die volle SV-Onboarding-Vereinheitlichung (Schwester, §9); eine **Live-DAT-API-Anbindung**
(wir designen das Adapter-Interface + einen Stub; das echte DAT-Wiring ist auf DAT-Zugang gegated).

## 3. Architektur

```
  ADAPTER (Quellen)                 KANONISCHER KERN              SENKE + CONSUMER
  ────────────────                  ────────────────             ────────────────
  Admin Einzel-Formular  ─┐
  Admin Bulk-Import (CSV) ─┤                                     sv_leads (Pool)
  Verzeichnis-Sync (DAT/  ─┼──►  sv_lead_upsert(payload)  ──►    ├─ Dead-Pin-Fallback (Finder)
    BVSK/öbuv, Cron)       │     - Dedup-Key (dat_id ODER         ├─ Claim /sv/registrieren
  Self-Register (Basic)   ─┘       normalized_name+plz)           └─ Refresh-Cron (Isochrone)
                                  - geocode wenn keine Coords          │
                                  - idempotenter UPSERT            kandidat ──claim──► onboarding (Schwester §9)
```

## 4. §1 — Dedup-Key (DAT **und** Nicht-DAT) — Kern von Aarons Anforderung

Bestand: `UNIQUE sv_leads_dat_id_key (dat_id)`. Fehlt: ein Dedup für **Nicht-DAT**-Leads.

**DDL (Plugin, Regel 2):**
```sql
-- normalisierter Name als stabiler Nicht-DAT-Schlüssel
ALTER TABLE public.sv_leads ADD COLUMN IF NOT EXISTS normalized_name text
  GENERATED ALWAYS AS (lower(regexp_replace(coalesce(name,''), '\s+', ' ', 'g'))) STORED;
-- Nicht-DAT-Dedup: ein Lead pro (Name, PLZ) WENN keine DAT-Id
CREATE UNIQUE INDEX IF NOT EXISTS sv_leads_nondat_dedup
  ON public.sv_leads (normalized_name, plz) WHERE dat_id IS NULL;
```
**Schlüssel-Auflösung in `sv_lead_upsert`:** `dat_id` vorhanden → `ON CONFLICT (dat_id)`; sonst →
`ON CONFLICT (normalized_name, plz) WHERE dat_id IS NULL`. → DAT-Leads deduppen auf `dat_id`, **Nicht-DAT-Leads
auf Name+PLZ** — beide idempotent, beide anlegbar.

## 5. §2 — `sv_lead_upsert` (der einzige Schreibweg)

DB-nativ (Aaron-Prinzip): **RPC `sv_lead_upsert(payload jsonb)`** = der einzige Insert/Update-Pfad in `sv_leads`.
- Resolved den Dedup-Key (§1), setzt `quelle`, `ist_aktiv=true`, `claim_status='offen'`, `aktualisiert_am=now()`.
- **Coords:** erwartet `lat/lng`; fehlen sie + Adresse vorhanden → der Refresh-Cron (§7) geocodet nach (nicht im RPC blockieren).
- **Isochrone:** nicht im RPC (teuer) → der Refresh-Cron (§7) rechnet sie. Bis dahin greift der `paket_umkreis_km`-Haversine-Fallback des Dead-Pin-Pfads.
- Idempotent: zweiter Aufruf mit gleichem Key = Update statt Dublette. **Ersetzt das `DELETE+INSERT`-Script.**
- Re-Verwendung: das Import-Script wird zu N `sv_lead_upsert`-Calls (kein DELETE mehr).

## 6. §3 — Eintritts-Adapter (alle → `sv_lead_upsert`)

- **(a) Admin-Anlage UI** = die Lücke. Route `/admin/sv-leads` (rollen-gegatet admin): **Liste** + **„Neuer
  Dead-Pin"-Formular** (Name, Firma, Adresse via GooglePlaceAutocomplete → lat/lng, optional `dat_expert_nr`/
  Quals/Kontakt) **+ Bulk-Import** (CSV/Excel-Upload → N `sv_lead_upsert`). **Pflichtfeld ist NICHT dat_id** →
  Nicht-DAT-Leads sind voll anlegbar (Dedup auf Name+PLZ). Muster: `admin/sachverstaendige/anlegen` + `shared/DataTable`.
- **(b) Verzeichnis-Sync-Adapter** (Interface-Design + Stub): ein `SvLeadSource`-Contract
  (`fetchCandidates(): SvLeadPayload[]`) + ein Cron/Edge, der upsertet (keyed `dat_id`). Implementierungen:
  **DAT-API** (wenn Zugang da — realisiert die `dat_id`-Schema-Absicht), **BVSK/öbuv/IHK**-Verzeichnisse.
  Das echte Wiring ist gegated; das Interface + ein manueller CSV-Sync (= (a) Bulk) liefern sofort.
- **(c) Self-Register** (`registriereSvBasicNeu`) legt heute direkt `sachverstaendige` an (kein sv_lead).
  Beziehung dokumentieren: Self-Register ist der „Frisch"-Pfad (kein Pool-Eintrag nötig); der Pool ist für
  vor-akquirierte Leads. Kein Zwang, beide zu koppeln.

## 7. §4 — Refresh / Freshness

- **`isochrone-backfill`-Cron auf `sv_leads` ausweiten:** zusätzlich `sv_leads` mit `isochrone_polygon IS NULL`
  (oder stale) + `lat/lng NOT NULL` → `calculateIsochrone(lat, lng, paket_umkreis_km)` (Mapbox, gleiche Logik wie
  sachverstaendige). Limit pro Run beibehalten (Ratelimit).
- **Geocode-Nachzug:** Leads mit Adresse aber ohne Coords → `geocodeAdresse` (Mapbox) im selben Cron, dann Isochrone.
- **Staleness:** `aktualisiert_am`-getrieben; ein Verzeichnis-Sync (b) erkennt Umzug/Schließung; manueller Admin-Edit (a) sonst.

## 8. §5 — Datenqualität (Kontakt/Quals)

- **Kontakt (`telefon`/`email`)** heute 0/62 → speichern (intern, NICHT im leak-safen Dead-Pin-Public-Read).
  Brauchbar für: die **Claim-Einladung** (Mail/WA an Leads mit Kontakt → aktiviert den 0-Conversion-Pool) +
  die Dispatch-Koordination eines gebuchten Dead-Pins (heute muss das Team ohne Kontakt manuell suchen).
- **Quals/BVSK/öbuv** aus dem Verzeichnis-Sync (b) oder beim Claim nachladen.
- **Claim-Einladungs-Funktion** (`ladeSvLeadEinladung` / Bulk): Mail/WA an offene Leads mit Kontakt → Link auf `/sv/registrieren?lead=<id>`.

## 9. §6 — Kandidat → Onboarding (Handoff) + die Phase-2-Schwester

Ein `sv_lead` = SV-Kandidat im **`kandidat`**-Zustand (ohne Account). Der **Claim** (`beanspracheSvLead`) ist die
Transition `kandidat → onboarding`: legt `sachverstaendige` an + setzt `sv_leads.konvertiert_zu_sv_id`.

**Phase-2-Schwester-Spec „Kanonisches SV-Onboarding"** (eigenes Dokument, referenziert hier): vereinheitlicht die
**6 fragmentierten Anlage-Pfade** (Admin Solo/Büro/Akademie/Community + Basic-Claim + Basic-Neu) auf **EIN
`onboardSv`-Core** + **EIN `sv_onboarding_status`-Enum** (`kandidat → onboarding → wartet_freigabe → aktiv`,
ersetzt die verstreuten Strings + 3 Bool-Flags) + den dynamischen Wizard (`flow_key='sv-onboarding'`, kanonischer
saveStep-Router) + **explizite Aktivierungs-Gate-Transitionen** (Stripe/Vertrag/Admin-P3). Diese Quelle-Spec ist der Entry-Layer dafür.

## 10. Reuse-Map
`calculateIsochrone`/`geocodeAdresse` (Refresh+Anlage) · `isochrone-backfill`-Cron (erweitern) · `lade-deadpin-fallback`
(unveränderter Consumer) · Claim-Flow `sv-basic/claim-actions.ts` (unveränderte Transition) · `admin/sachverstaendige/anlegen`-
+ `shared/DataTable`-Muster (Admin-UI) · der `UNIQUE dat_id`-Index (bestehender DAT-Key).

## 11. Koordination
- **Schwester:** SV-Onboarding-Vereinheitlichung (Phase 2). **Fundament:** Onboarding-Writer-Kanonisierung.
- **Kein Active-Session-Overlap:** `sv_leads`/Dead-Pin/`/admin/sv-leads` werden von keiner laufenden Linie
  (cmm49-*, Merge-Session) angefasst. Marker `COORDINATION-sv-leads-kanonische-quelle.md` setzen.
- **Privacy:** der öffentliche Dead-Pin-Read (`ladeSvLeads`) bleibt leak-safe (nur id/lat/lng) — Kontakt/Quals nur intern.

## 12. Work-Packages
| WP | Inhalt |
|---|---|
| A | DDL: `normalized_name` + Nicht-DAT-Partial-Unique-Index (§1) + RPC `sv_lead_upsert` (§2) (Regel 2). |
| B | Admin-UI `/admin/sv-leads`: Liste + Einzel-Anlage-Formular (DAT **und** Nicht-DAT) + Bulk-CSV-Import. |
| C | Verzeichnis-Sync-Adapter-Interface (`SvLeadSource`) + Cron-Skelett + manueller CSV-Sync (DAT/BVSK-Wiring gegated). |
| D | Refresh: `isochrone-backfill`-Cron auf `sv_leads` ausweiten (Isochrone + Geocode-Nachzug). |
| E | Datenqualität: Kontakt/Quals-Speicherung + Claim-Einladungs-Funktion (Mail/WA → 0-Conversion-Pool aktivieren). |
Reihenfolge: A → B → (C, D, E parallel).

## 13. Risiken
- **DAT-API-Verfügbarkeit:** der Verzeichnis-Sync (C) ist Interface+Stub bis DAT-Zugang da ist; der Bulk-CSV-Import (B) liefert sofort.
- **Dedup-Migration auf Live-Pool:** der Nicht-DAT-Partial-Unique darf nicht an Bestands-Dubletten scheitern → vor dem Index Dubletten-Check/Bereinigung.
- **Schwester-Kopplung:** der `kandidat`-Zustand + die Onboarding-Transition definiert die Phase-2-Schwester final — diese Spec legt nur den Entry-Layer.

## 14. Definition of Done
- Admin legt einen einzelnen `sv_lead` an (DAT **und** Nicht-DAT) via UI; Bulk-Import ist idempotent (Re-Run = Upsert, kein Datenverlust).
- `sv_lead_upsert` ist der **einzige** Schreibweg; das `DELETE+INSERT`-Script ist abgelöst.
- Der Refresh-Cron hält `sv_leads`-Isochronen frisch.
- Kontakt/Quals werden gespeichert; eine Claim-Einladung kann den Pool aktivieren.
- Der `kandidat → onboarding`-Handoff ist dokumentiert (Übergabe an die Phase-2-Schwester).
