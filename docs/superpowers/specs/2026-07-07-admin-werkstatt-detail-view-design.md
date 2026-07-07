# Admin Werkstatt-Verwaltung — per-Werkstatt Detailseite (CRM-Record)

**Datum:** 2026-07-07 · **Status:** Design (P1 Build gestartet) · **Session:** admin-werkstatt-detail-view

## Kontext / Bestandsaufnahme

Das „Werkstatt-CRM für Admins" zerfällt in zwei Hälften:

1. **Akquise-CRM (Partner-Vertriebsdashboard)** — gut unterwegs in offenen PRs: `partner_leads`-Fundament (#3670 ✅ gemergt: Tabelle + `convertPartnerLead` + `anlegePartnerKern`), `/admin/partner-leads` CRM-Queue (#3678 offen), Lead-Scraping (#3717), Convert-Mail (#3725), Recruiting (#3728). Das ist der **Prospect→Partner-Trichter**.
2. **Betriebs-Verwaltung aktiver Werkstätten** — **die Lücke.** Live existiert nur `/admin/werkstaetten` = eine flache Liste (10 Spalten) + 5 Modals/Drawer (Anlegen, QR, Staffel, Fähigkeiten, Abrechnung). **Keine Detail-/Record-Seite pro Werkstatt** — man kann eine Werkstatt nicht öffnen und „alles über sie" sehen/verwalten.

**Entscheidung:** Diese Spec baut die **fehlende zweite Hälfte** — eine per-Werkstatt **Admin-Detailseite `/admin/werkstaetten/[id]`** (die CRM-Record-Ansicht). Abgegrenzt von: `/admin/partner-leads` (Prospects, nicht aktive Partner) und dem Werkstatt-EIGENEN Portal `/werkstatt/*` (die `werkstatt-auftrag-ansicht`-Session).

## Zielbild (was der Admin bekommt)

„Werkstatt X öffnen → auf einer Seite: Stammdaten, Zugang/Onboarding-Status, Aktivität (welche Aufträge/Vermittlungen gingen an sie), Abrechnung, Fähigkeiten/Staffel, QR — plus die gängigen Aktionen." Ersetzt das „Liste + 5 Modals raten".

## Dekomposition

- **P1 (diese PR) — READ-fokussierte Detailseite, KEIN DDL:**
  - Route `/admin/werkstaetten/[id]` (Staff-Guard), erreichbar per Klick aus der Liste.
  - Sektionen (Anzeige): **Header** (Name/Status/aktiviert) · **Stammdaten** (Adresse/Ansprechpartner/Telefon/Email/Provision/Bank) · **Zugang & Onboarding** (hat Login · `force_password_change` = Passwort noch nicht gesetzt · letzter Login) + Aktion **„Login-Mail senden"** (reuse `sendWerkstattLoginMail`) · **Aktivität/Aufträge** (aus `v_werkstatt_auftrag WHERE werkstatt_id=?`, Admin `is_staff()`-Gate — Anzahl + kompakte Liste) · **Abrechnung** (Reuse `ladePartnerBilling`-Aggregat: Forderungen/Auszahlungen-Summen) · **Fähigkeiten + Staffel** (read) · **QR** (zugewiesene Pool-Codes + Kunden-QR-Link).
  - Reuse: `v_werkstatt_auftrag` (is_staff), `ladePartnerBilling`, `werkstatt-auftrag-phase.ts` (Phase-Label), `sendWerkstattLoginMail`, `PoolQrScanner`.
  - Ein Link in `WerkstaettenClient.tsx` (Name der Zeile → Detailseite). ⚠ geteilte Datei mit 1069c2a2 (trivialer 1-Zeilen-Merge).
- **P2 (später) — WRITE-Verwaltung:** Stammdaten bearbeiten · Status ändern/sperren (mit Grund) · Fähigkeiten/Staffel/Provision inline editieren (Modals aus WerkstaettenClient extrahieren). Braucht Entscheidungen (welche Felder editierbar, Status-Workflow).
- **P3 (später) — CRM-Extras:** interne Notizen/Kommunikations-Log (**neue Tabelle = DDL**) · Besichtigungstermine · Kontakt-Personen · Karte/Isochrone · Performance-Metriken.

## Architektur (P1)

- `src/app/admin/werkstaetten/[id]/page.tsx` — Server-Component, Staff-Guard (wie `/admin`-Layout + explizit), lädt via Loader, rendert Client.
- `src/app/admin/werkstaetten/[id]/detail-data.ts` — Server-Loader `ladeWerkstattDetail(id)`: werkstatt-Row (alle Spalten) + `auth.users`-Login-Meta via `createAdminClient().auth.admin.getUserById(user_id)` (last_sign_in) + `profiles.force_password_change` + `werkstatt_staffel_stufen` + `ladePartnerBilling('werkstatt', id)`-Aggregat + `v_werkstatt_auftrag`-Zeilen (werkstatt_id gefiltert). Result-Object.
- `src/app/admin/werkstaetten/[id]/WerkstattDetailClient.tsx` — Sektionen als `SectionCard`s; nutzt Tokens/DataTable/StatusBadge; Login-Mail-Aktion inline.
- `src/lib/werkstatt/onboarding-status.ts` — reine `leiteOnboardingStatus({force_password_change, last_sign_in_at})→{key,label,ton}` (unit-testbar).

## Fehlerbehandlung / Sicherheit

- Staff-Guard auf der Page (nur admin/dispatch/kb/kanzlei per RLS — wie Geschwister). Unbekannte `id` → `notFound()`.
- `v_werkstatt_auftrag` ist RLS-`is_staff()`-gegated → Admin liest legitim; keine neue Leak-Fläche.
- Reine Reads, kein DDL, keine neue Tabelle (P1).

## Testing

- `onboarding-status.ts` (pure) → Unit-Test (RED→GREEN).
- Loader = dünne DB-Reads (Integration/CI). Anzeige-Komponente = Props-gerendert.
- tsc + 4 Ratchets 0-neu. Post-Deploy: authentifizierter Admin-Smoke (Detailseite lädt für eine echte Werkstatt-id).

## Koordination

- Neue Files unter `[id]/**` = kollisionsfrei. Einziger geteilter Touch: 1 Link in `WerkstaettenClient.tsx` (1069c2a2 editiert die Datei ebenfalls — 1-Zeilen-Merge). Kein DDL → kein Migrations-Race. Distinkt von partner-leads (#3678) + werkstatt-Portal (auftrag-ansicht).
