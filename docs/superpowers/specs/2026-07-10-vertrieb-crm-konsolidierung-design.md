# Vertrieb-CRM-Konsolidierung — Design-Spec

- **Datum:** 2026-07-10
- **Branch:** `kitta/vertrieb-konsolidierung` (Worktree, off `origin/release-4024` @ `abfc78f73`)
- **Status:** Design freigegeben (Brainstorming mit Aaron, visueller Companion). Bereit für Implementierungs-Plan.
- **Companion-Mockups:** `.superpowers/brainstorm/17376-1783708305/content/` (layout, funktions-landkarte, cockpit-scraper, lead-cockpit-final)

---

## 1. Kontext & Problem

`/admin/vertrieb` existiert **nur auf `release-4024`** (noch nicht `main`/`staging`) — wir formen die View um, **bevor** sie live geht. Gutes Timing, kein Prod-Risiko.

**Ist-Zustand:** 5 Tabs unter einem „Ein-Dach"-Layout (`VertriebKonsoleTabs.tsx`):

| Tab | Dahinter |
|---|---|
| **Übersicht** | Neuer unifizierter Roster (`VertriebRosterClient`): Typ-Switch (Alle/Leads/Partner), Rollen-Filter (SV/Makler/Werkstatt), Suche, Stufen-Dropdown, Liste/Karte-Toggle, `VertriebDetailDrawer`, 4 KPI-Cards |
| **Sachverständige** | `export { default } from '@/app/admin/sachverstaendige/page'` — **1:1 Re-Export der Alt-Seite** |
| **Partner-Leads** | Re-Export `/admin/partner-leads` — **das Prospect-CRM** (Scraping/CSV/Einstufung/Aktivitäts-Log/Convert/Onboarding-Termine) |
| **Makler** | Re-Export `/admin/makler` (Anlage + Liste) |
| **Werkstätten** | Re-Export `/admin/werkstaetten` (Liste, Detail, QR-Pool) |

**3 Kernprobleme:**

1. **Halbe Zusammenführung.** Die *Daten* sind im Roster vereint, aber die 4 Rollen-Tabs mounten daneben unverändert die Alt-Admin-Seiten → ein Makler erscheint **doppelt** (Roster + Alt-UI), zwei mentale Modelle.
2. **Gemischte Taxonomie.** 3 Tabs sind **Rollen** (SV/Makler/Werkstatt), „Partner-Leads" ist eine **Lifecycle-Phase** (ein Lead kann jede Rolle haben). Inkonsistent → „unaufgeräumt".
3. **Eingesperrte CRM-Tiefe.** Die Vertriebs-Arbeit (scrapen → einstufen → kontaktieren → onboarden → aktivieren) lebt nur im Partner-Leads-Tab, getrennt vom Roster. Der Roster kann Leads nur *anzeigen*, nicht *bearbeiten*.

---

## 2. Ziel

**EINE Übersicht (Cockpit) + Pills.** Die 4 Rubriken lösen sich auf: Rollen werden Pills, die Funktionen erscheinen kontextuell (Aktions-Leiste + Drawer), die CRM-Tiefe wandert in den Detail-Drawer. Kein Funktions-Verlust — jede Alt-Funktion bekommt genau **ein** neues Zuhause.

---

## 3. Getroffene Entscheidungen (Brainstorming)

- **D1 — Pill-Achse:** Rollen-Pills `Alle · Sachverständige · Makler · Werkstätten` + separater **Lead/Partner-Schalter**. Die Rubrik „Partner-Leads" **löst sich auf** (= Lead-Modus über alle Rollen). Saubere Zwei-Achsen-Taxonomie.
- **D2 — Interaktion:** **EIN Drawer/Overlay-System** für alles — leichte Aktionen (Notiz, Einstufung, Convert, Anruf) und schwere Flows (Onboarding-Wizard, QR-Pool, Basis-Freigaben) nutzen dasselbe Panel, das nur größer wird. Die Liste bleibt der ruhende Kontext dahinter.
- **D3 — Layout:** **Cockpit** — Rollen-Pills groß oben, darunter **kontext-abhängige KPIs**, eine **kontextuelle Aktions-Leiste** (ändert sich je Pill + Lead/Partner), dann Suche/Stufe + Liste/Karte-Toggle + Roster.
- **D4 — ★-Punkte:** Basis-Freigaben = **Button mit Badge** unter SV-Pill (öffnet Overlay-Queue) · QR-Pool = **Overlay** unter Werkstatt-Pill · Alt-Routen (`/admin/makler`, `/admin/sachverstaendige`, `/admin/werkstaetten`, `/admin/partner-leads`) = **Redirect** auf die Übersicht (Bookmarks bleiben heil).

---

## 4. Informations-Architektur — die 4 „Homes"

Jede Funktion aus den 4 Alt-Rubriken → genau ein Home:

### ① Aktions-Leiste (oben, kontextabhängig je Pill + Lead/Partner)
- **Scrapen (Google Places)** ← Partner-Leads · Lead-Modus, Rolle vorbelegt
- **CSV importieren** ← Partner-Leads · Lead-Modus
- **SV anlegen · Onboarding-Wizard** ← SV · SV-Pill → großer Drawer
- **Makler anlegen** ← Makler-Pill → Drawer
- **Werkstatt anlegen** ← Werkstatt-Pill → Drawer
- **Basis-Freigaben (N)** ← SV · SV-Pill, Badge mit Anzahl → Overlay-Queue
- **QR-Pool verwalten** ← Werkstatt · Werkstatt-Pill → Overlay

### ② Detail-Drawer (pro Kontakt = das CRM-Cockpit)
Siehe §7.

### ③ Pills · Filter · KPIs (die Übersicht selbst)
- Rollen-Pills (← 3 Rollen-Tabs), Lead/Partner-Schalter (← „Partner-Leads" löst sich auf), Stufen-Filter, Suche, kontext-abhängige KPIs (← Rollup)

### ④ Karte (Toggle, folgt den Pills)
- SV-/Werkstatt-/Lead-Karten vereint; Marker-Farbe = Rolle, Filter = aktive Pill

### Löst sich auf
4 Rollen-Tabs (Re-Exports) · „Partner-Leads" als eigene Rubrik · Makler/SV-Doppelanzeige · `VertriebKonsoleTabs.tsx`

---

## 5. Layout (Cockpit)

Zonen der Roster-Seite (`page.tsx` → `VertriebRosterClient`), von oben:

1. **Titel** „Vertrieb" (aus `layout.tsx`, Tab-Nav entfällt)
2. **Rollen-Pills** `Alle · Sachverständige · Makler · Werkstätten` (Pill-Segment, aktive = navy)
3. **Zeile:** Lead/Partner-Schalter (links) · Liste/Karte-Toggle (rechts)
4. **KPI-Cards** — kontext-abhängig je aktiver Pill (§6)
5. **Aktions-Leiste** — kontext-abhängig je Pill + Lead/Partner (§6)
6. **Zeile:** Suche (Name/Ort/E-Mail) · Stufen-Filter · Count „X von Y"
7. **Roster** — `DataTable` (Liste) *oder* `VertriebKarteClient` (Karte)
8. **Detail-Drawer** — Overlay bei Klick (§7)

Pills/Aktionen als `Chip`/`ChipRow` bzw. `primitives.Button` (Component-Set-Policy). Keine handgerollten Tabs mehr.

---

## 6. Kontextuelle KPIs & Aktions-Leiste

Die Aktions-Leiste hängt an **zwei** Dimensionen (aktive Rolle-Pill × Lead/Partner-Schalter):

| Kontext | Aktionen |
|---|---|
| **Lead-Modus** (jede Rolle) | Scrapen · CSV importieren |
| **SV-Pill** | + SV anlegen (Onboarding) · Basis-Freigaben (N) |
| **Makler-Pill** | + Makler anlegen |
| **Werkstatt-Pill** | + Werkstatt anlegen · QR-Pool verwalten |
| **Partner-Modus** | Anlegen-Aktionen der Rolle; Akquise-Aktionen (Scrapen/CSV) ausgeblendet |

**KPIs** je Pill kontextbezogen aus `getVertriebRollup`: bei „Alle" global (Leads/Onboarding/Aktiv/Gesperrt), bei Rolle-Pill rollen-gescopte Zahlen. Rollup-Query ggf. um Rolle-Dimension erweitern (schon `kind`-getaggt → wahrscheinlich vorhanden, verifizieren).

---

## 7. Detail-Drawer = CRM-Cockpit (`VertriebDetailDrawer` Rebuild)

Ein Drawer, adaptiv nach **Lifecycle** (Lead vs. Partner) und **Rolle**.

### Lead-Drawer
- **Header:** Firma + **Ansprechpartner** (§9) + Rolle-Badge + Stufe-Badge
- **Stufen-Stepper:** neu → kontaktiert → onboarding → aktiv (+ „ändern"), aus `vertrieb-workflow`
- **Aktionen:**
  - 📞 **Anruf protokollieren** (§10) — Notiz + Ergebnis + optional Wiedervorlage-Datum
  - ✉️ **Vorstellungs-Mail** (§8) — editierbarer Composer
  - 📅 **Vor-Ort-Termin + Terminbestätigung** (§8, §11-Koordination) — Termin setzen, Bestätigungs-Mail (editierbar)
  - → **Convert zu Partner**
- **Einstufung** (Grading) ← Partner-Leads
- **Aktivitäts-Log** — typisierter Feed: Anruf · Mail · Notiz · Termin · Stufenwechsel
- **Notizen**

### Partner-Drawer
- **Header:** Name + Rolle-Badge + Stufe-Badge (aktiv/…)
- **Profil · Felder** (rollen-spezifisch)
- **Aktionen:**
  - ✉️ **Login-Mail neu senden** — **Makler + Werkstatt** (SV vorerst nicht; deren Login läuft über den Onboarding-Wizard)
  - 🔳 **QR-Codes** — nur Werkstatt
  - **Profil bearbeiten**
- **Aktivitäts-Log** · **Notizen**

### Schwere Flows (selber Drawer, größer)
SV-Onboarding-Wizard, QR-Pool-Overlay, Basis-Freigaben-Queue öffnen im selben Overlay-System.

---

## 8. E-Mail-Vorlagen (editierbar vor Absenden)

**Zwei Vorlagen** im Lead-Composer:

1. **Vorstellungs-Mail** — Erstkontakt/Intro (Claimondo stellt sich vor, Kooperations-Angebot).
2. **Terminbestätigung** (= die „Ansprache-Mail") — bestätigt den **Vor-Ort-Termin**, zieht Datum/Uhrzeit aus dem Termin.

**Composer-Flow:** Vorlage wählen → Merge-Felder gefüllt (`{{Ansprechpartner}}`, `{{Firma}}`, `{{Termin}}`) → **Betreff + Text frei editierbar** → Senden.

- **Empfänger:** Ansprechpartner-E-Mail (Fallback: Lead-E-Mail).
- **Branding:** Claimondo-intern (Akquise an Prospects) — **NICHT** das Whitelabel-Kundenbranding. Umlaute Pflicht (user-facing Mail, AGENTS.md §Sprache).
- **Versand:** über bestehende E-Mail-Infrastruktur (`src/lib/email/**`), `nurExterneEmpfaenger`-Guard beachten (Prospects sind extern). Gesendete Mail → Aktivitäts-Log-Eintrag.

**Umsetzung:** 2 react-email-Templates + Composer-Component (rendert Template → editierbares Betreff/Body → Send-Action). Vorlagen-Text als Ausgangspunkt, nicht hart gesperrt.

---

## 9. Ansprechpartner (neu im Lead)

`partner_leads` bekommt einen **Ansprechpartner** (die Person, mit der man spricht):
- `ansprechpartner_name`, `ansprechpartner_position`, `ansprechpartner_email`, `ansprechpartner_telefon` (Spalten-Namen final beim DDL, DB-verifiziert).
- Im Lead-Drawer-Header sichtbar; treibt den Mail-Empfänger (§8) und die Anruf-Ziel-Anzeige.
- **DDL via Supabase-Plugin** (AGENTS.md Regel 2).

---

## 10. Anruf-Protokoll (neu bei Leads)

„Anrufe mit Notizen" als **erstklassiger Aktivitätstyp**:
- Schnell-Aktion „Anruf protokollieren": Notiz + **Ergebnis** (erreicht / nicht erreicht / Interesse / kein Interesse) + optional **Wiedervorlage-Datum**.
- Landet als typisierter Eintrag (`typ='anruf'`) im Aktivitäts-Log neben Mail/Notiz/Termin.
- **Datenmodell:** bestehende Aktivitäts-/Activity-Tabelle der Partner-Leads-CRM zuerst prüfen; entweder `typ`-Enum um `anruf` erweitern + `ergebnis`/`wiedervorlage_am`, oder dediziertes `lead_anrufe`. Entscheidung beim DDL nach DB-Inspektion. Nicht mit Dispatch-`rueckrufe` (Kunden-Callbacks) verwechseln — das hier ist Partner-Akquise.

---

## 11. Scraper — pro Rubrik, ohne Dupes

- **Pro Rolle-Pill** (SV/Makler/Werkstatt); Region/Umkreis wie bisher.
- **Dedup gegen BEIDES:** ① bestehende Leads (`partner_leads` der Rolle) **und** ② Bestands-Partner (`sachverstaendige`/`makler`/`werkstaetten`).
- **Mehrstufiger Schlüssel:** `google_place_id` → Fallback `Name + PLZ` (normalisiert) → Fallback `Telefon/E-Mail`. Kandidat wird übersprungen, sobald er **irgendeinen** Bestands-Lead ODER -Partner derselben Rolle trifft.
- **Ergebnis-Bericht:** „N neu angelegt · M Dupes übersprungen".
- **Voraussetzung:** `google_place_id` auf Partner-Tabellen backfillen wo möglich (verifizieren welche Tabellen die Spalte haben; einige SV-Datensätze haben keine → Fallback-Matching essenziell).

---

## 12. Betroffene Dateien & Architektur

**Ändern:**
- `VertriebRosterClient.tsx` → Cockpit: Pills statt Typ/Rolle-Buttons, kontextuelle Aktions-Leiste, kontext-KPIs.
- `VertriebDetailDrawer.tsx` → CRM-Cockpit (Lifecycle-/Rollen-adaptiv, §7).
- `layout.tsx` → Tab-Nav raus (Titel bleibt).
- **Entfernen:** `VertriebKonsoleTabs.tsx`; die 4 Sub-Route-Re-Exports (`vertrieb/{makler,partner-leads,sachverstaendige,werkstaetten}/page.tsx`) — durch Overlays/Drawer ersetzt.
- **Redirects:** Alt-Routen `/admin/{makler,sachverstaendige,werkstaetten,partner-leads}` → `/admin/vertrieb` (Bookmarks). Deep-Links `[id]` bleiben erreichbar (Drawer/Deeplink).

**Wiederverwenden (nicht duplizieren):** `get-vertrieb-kontakte`, `get-vertrieb-rollup`, `filter-kontakte`, `collapse-firmen`, `vertrieb-workflow`, `StatusBadge`, `DataTable`, `primitives/*`, `Chip`/`ChipRow`.

**Neu:** kontextuelle Aktions-Leiste-Component, Mail-Composer (+ 2 Templates), Anruf-Log-Component + Action, Ansprechpartner-Form, Scraper-Dedup-Helper, `resendWerkstattWelcome` (analog `resendMaklerWelcome`), Basis-Freigaben-Overlay, QR-Pool-Overlay.

**Konventionen:** Component-Set-Policy (primitives/shared, kein handgerolltes Button/Card/Table), Token-Audit (keine raw hex/status-scales), Server-Action-Result-Pattern (`{ ok, error? }`, kein throw), `revalidatePath`, Umlaute in UI/Mail, Nested-FK-Normalisierung.

---

## 13. Datenmodell / DDL (ausschließlich Supabase-Plugin, Regel 2)

Vor jedem DDL: `list_tables` + `execute_sql` (READ) zur Verifikation der Ist-Spalten. Ablauf strikt nach AGENTS.md Regel 2 (apply_migration → list_migrations → File `<V>_<name>.sql` == recorded version → verify).

1. `partner_leads`: `ansprechpartner_*` (§9).
2. Aktivitäts-Log: `typ='anruf'` + `ergebnis` + `wiedervorlage_am` **oder** `lead_anrufe` (§10) — nach DB-Inspektion.
3. Dedup: `google_place_id` auf Partner-Tabellen sicherstellen/backfillen (§11) — erst prüfen, welche Tabellen sie schon haben.

Types via `generate_typescript_types` regenerieren, sobald ein Consumer die Spalte nutzt.

---

## 14. Implementierungs-Phasen (Input für writing-plans)

Inkrementell, jede Phase eigenständig prüfbar + Post-Task-Audit (7 Punkte):

- **P1 — Shell/Cockpit (UI-only, kein Datenverlust):** Tabs → Pills, Cockpit-Layout, kontextuelle Aktions-Leiste (Skelett/Deep-Links auf Bestand), Alt-Routen-Redirects. *Sofort sichtbarer Aufräum-Effekt, geringes Risiko.*
- **P2 — Drawer-CRM-Tiefe:** Lead-Pipeline im Drawer (Stufe, Einstufung, Convert, Aktivitäts-Log, Notizen) + **Ansprechpartner** (DDL) + **Anruf-Log** (DDL).
- **P3 — E-Mail-Vorlagen:** 2 Templates + editierbarer Composer + Versand + Activity-Log.
- **P4 — Scraper-Dedup:** pro Rubrik + Cross-Table-Dedup + Bericht (+ place_id-Backfill).
- **P5 — Schwere Flows als Overlay:** SV-Onboarding, Basis-Freigaben-Queue, QR-Pool, Anlegen (SV/Makler/Werkstatt), Login-Mail (Makler+Werkstatt inkl. `resendWerkstattWelcome`).

**Vor-Ort-Termin & Terminbestätigung (P2/P3):** an die aktive Lane `kitta/partner-onboarding-termine` (e8aa73d4) **andocken**, nicht neu bauen — Interface abstimmen (§15).

---

## 15. Isolation & Koordination

- **Branch:** `kitta/vertrieb-konsolidierung`, Worktree off `release-4024`. Eigener PR.
- **PR-Target — offen:** Feature liegt nur auf `release-4024` (nicht `main`). Vermutlich PR in `release-4024` (auf dem Feature aufsetzen) **oder** `staging` nach Merge von `release-4024`. Mit Release-Owner klären.
- **⚠ Lane-Overlap `e8aa73d4` (`kitta/partner-onboarding-termine`):** Baut genau die **Onboarding-/Vor-Ort-Termine** + wahrscheinlich Terminbestätigung. Mein Vor-Ort-Termin + Terminbestätigungs-Mail (§7/§8) **konsumiert** deren Modell/Flow, nicht duplizieren. Marker gesetzt, Interface abstimmen bevor P2/P3 startet.
- **⚠ Partner-Leads-CRM (`/admin/partner-leads`, Lane e8aa73d4/e8aa73d4-partnerleads):** wird mitverändert (Convert, Scraper, Ansprechpartner, Anruf-Log). File-Overlap `src/app/admin/partner-leads/**` + `src/lib/vertrieb/**`. Koordinieren.
- **Kollisions-sensible Files:** gesamtes `src/app/admin/vertrieb/**` + `src/lib/vertrieb/**` — aktuell niemand aktiv drauf (Feature ruht auf release-4024), außer der partner-leads-Overlap.

---

## 16. Testing

- **Unit:** Scraper-Dedup (place_id/name+PLZ/phone, Cross-Table), `filterKontakte` (erweitert), Anruf-Log, Mail-Merge, Ansprechpartner-Validierung.
- **Integration:** Server-Actions (Result-Pattern), Redirects der Alt-Routen.
- **E2E-Smoke:** Cockpit lädt, Pill-Wechsel filtert, Drawer öffnet, Mail-Composer editierbar+sendet, Scrape-Dedup gegen Seed (0 Dupes). Gegen isolierten Test-Datensatz (telefon=NULL-Isolation, `--clean`).

---

## 17. Out of Scope (YAGNI)

- Kein eigenes „Vertrieb"-Rollen-Portal — bleibt Admin-intern (staff-guarded, wie Ist).
- Kein Redesign der Landing-/Marketing-Flächen.
- Kein Umbau der SV-Live-Ops-Logik selbst (nur Einbettung als Drawer/Overlay).
- Native-App nicht betroffen.

---

## 18. Offene Punkte (vor/während Umsetzung klären)

1. PR-Target (release-4024 vs staging) — mit Release-Owner.
2. Interface zur `partner-onboarding-termine`-Lane (e8aa73d4) für Vor-Ort-Termin + Terminbestätigung.
3. Anruf-Datenmodell: Enum-Erweiterung vs. eigene Tabelle — nach DB-Inspektion.
4. Welche Partner-Tabellen haben schon `google_place_id`? Backfill-Umfang.
5. KPI-Rollup: reicht die vorhandene `kind`-Dimension für rollen-gescopte KPIs?
