# Vertrieb-Konsole „Ein Dach" — Design-Spec

**Datum:** 2026-07-08 · **Owner:** Session 0db72344 (vollständig übernommen, Aaron 08.07.: „übernimm du jetzt vollständig … alles was mit Partnerverwaltung und Vertrieb zu tun hat soll unter ein Dach").

**Ziel (ein Satz):** `/admin/vertrieb` wird die **eine** Konsole, über die das gesamte Partner-Geschäft läuft — von der Akquise (Lead) über das Onboarding bis zur Verwaltung des aktiven Partners — für alle 5 Partner-Typen, mit Karte und (Admin-)Feldmodus, unter **einem** Nav-Punkt.

## 1. Aaron-Entscheidungen (verbindlich)

- **Struktur:** Sektion mit **Unter-Navigation** (`/admin/vertrieb` + Unter-Routen `/admin/vertrieb/karte`, `/admin/vertrieb/akquise`, …), nicht Tabs-auf-einer-Seite. Echte Management-Konsole.
- **Scope „unter dem Dach":**
  - ✅ Die **5 Partner-Typen** (SV, SV-Leads, Partner-Leads, Makler, Werkstätten) — Roster-Kern.
  - ✅ **Akquise-Tooling** (Lead-Scraping, CSV-Import, Einstufung, Aktivitäts-Log, Convert, Onboarding-Termine) — das bestehende partner-leads-CRM (Session e8aa73d4).
  - ✅ **Karte + Feldmodus** (LiveOpsMap über alle Typen + Admin-Besuchsrouten).
  - ❌ **Nicht** dabei: `/admin/partner` (Versicherer) und `/admin/team` (interne Mitarbeiter) — bleiben eigene Nav-Punkte.

## 2. Kern-Prinzip: Housen, nicht neu bauen

Der **Datenrücken existiert schon** (P0): `v_vertrieb_kontakt` (security_invoker UNION der 5 Silos) + `deriveVertriebState` vereinen Leads **und** aktive Partner über **eine Lebenszyklus-Stufe** (`neu→kontaktiert→onboarding→aktiv→pausiert→gesperrt→verloren`). Das „Dach" ist die **UI/Navigation darüber**, die die verstreuten Flächen einsammelt.

**Drei Housing-Regeln:**
1. **Bestehende Routes bleiben.** `/admin/sachverstaendige`, `/admin/partner-leads`, `/admin/makler`, `/admin/werkstaetten` + Sub-Routen leben weiter (Bookmarks, andere Lanes, Deep-Links). Nur der **Nav-Einstieg** wandert unter „Vertrieb".
2. **partner-leads-CRM wird absorbiert, nicht dupliziert.** Das prod-live CRM von e8aa73d4 (`/admin/partner-leads` + Server-Actions + Components + `partner_leads`/`partner_lead_aktivitaeten`-Tabellen) wird unter „Vertrieb › Akquise" **eingehängt** (Route bleibt bzw. wird gemountet/verlinkt). Seine Feature-Layer (Geocoding/CSV/Scraping/Termine) sind orthogonal und laufen weiter.
3. **Karte + Feldmodus werden wiederverwendet.** `LiveOpsMap` (bestehend, Rollen admin/dispatch/mitarbeiter) treibt die Vertrieb-Karte; der SV-Feldmodus (6c630247, `/gutachter/feldmodus`) ist die Basis für den Admin-Feldmodus.

## 3. Architektur — `/admin/vertrieb` als Sektion

```
Vertrieb  (EIN Nav-Punkt; Sachverständige/Partner-Leads/Makler/Werkstätten verschwinden aus der Top-Nav)
│
├─ Übersicht     /admin/vertrieb            Roster über alle 5 Typen, KPIs, Filter (Typ/Stufe/Suche)   [P1 ✅]
├─ Karte         /admin/vertrieb/karte      LiveOpsMap über alle geocodierten Partner/Leads
├─ Akquise       /admin/vertrieb/akquise    das partner-leads-CRM (Scraping/CSV/Einstufung/Aktivitäten/Convert/Termine)
├─ Detail        /admin/vertrieb/[kind]/[id]  Cockpit je Partner: Stufe + Notizen + Aktivitäten + Deep-Link Voll-Akte
└─ Feldmodus     /admin/vertrieb/feldmodus  Admin-Besuchsrouten (später; 6c630247-Feldmodus wiederverwendet)
```

**Unter-Navigation:** eine schlanke Sub-Nav (Tabs/Segmente oben ODER Sub-Sidebar) innerhalb des Vertrieb-Layouts (`/admin/vertrieb/layout.tsx`), die zwischen Übersicht/Karte/Akquise/Feldmodus wechselt. Rollen-Gate wie P1 (`requireRole(['admin','dispatch'])`).

## 4. Datenrücken

- **Lese-Spine:** `v_vertrieb_kontakt` (P0, prod-live) — die 5 Silos vereint, `notizen` einheitlich (P2.1). Loader `getVertriebKontakte` + `getVertriebRollup` (P0/P1).
- **Akquise-Daten:** `partner_leads` + `partner_lead_aktivitaeten` + `einstufung` (e8aa73d4, prod-live). Das Detail-Cockpit liest die Aktivitäten-Timeline aus `partner_lead_aktivitaeten` (für `partner-lead`-kind; für andere Typen später analog).
- **Write:** `updateVertriebFeld` (P0, Whitelist-gegated) — in P2.1 auf alle 5 kinds erweitert (notizen). Weitere operative Felder (Einstufung, Betreuer) additiv über dieselbe gegatete Action.

## 5. „Umzug" der Funktionen = Mount per Re-Export (nicht Deep-Link, nicht Kopie)

Aaron 08.07.: „partner leads muss auch mit umgezogen werden. und denk daran dass du **alle funktionen von den seiten sauber mit umziehst**." → Nicht nur Nav umbiegen — die **Verwaltungs-Flächen leben unter dem Vertrieb-Dach**, mit allen Funktionen, ohne Duplikation.

**Mechanismus je Fläche (nach Struktur-Analyse):**
- **makler, partner-leads, werkstaetten** = je eine einzelne `page.tsx` (Guard + Load + Client, kein eigenes Layout, keine dynamischen Params) → **Mount per Re-Export**: `/admin/vertrieb/<fläche>/page.tsx` = `export { default } from '@/app/admin/<fläche>/page'` (+ `export const dynamic = 'force-dynamic'`). Identische Funktionen, **null Duplikation, EINE Quelle** — Änderungen an der Ursprungs-Page (z.B. e8aa73d4 baut partner-leads weiter) greifen automatisch. **Kein Trampeln** (ich importiere nur).
- **sachverstaendige** = full-bleed `LiveOpsMap`-Konsole mit eigenem `layout.tsx` (`@drawer`-Parallel-Slot) + Selbst-Escape → ebenfalls Re-Export; der `@drawer`-Intercept entfällt unter der neuen Route (Pin-Klick fällt auf die Full-Page-`[id]` zurück, deep-link-kompatibel wie im SV-Layout dokumentiert). **Wichtig:** das Konsolen-`layout.tsx` escapet NICHT (sonst doppelter PageContainer-Escape → Overflow); jede Seite bringt ihren eigenen Full-Bleed-Escape mit.
- Alte Routes (`/admin/sachverstaendige` etc.) **bleiben erreichbar** (Deep-Links, Bookmarks, `@drawer`-Intercept dort) — nur aus der Top-Nav raus. 308-Redirects auf die Vertrieb-Route = späterer Schritt, sobald die Nachbar-Lanes (e8aa73d4 partner-leads offen) gemergt sind.

## 5b. Nav-Konsolidierung (der „ein Nav-Punkt"-Schritt)

- `src/app/admin/_components/AdminNav.tsx`: **Sachverständige, Partner-Leads, Werkstätten, Makler** aus `NAV_ITEMS` entfernt; **Vertrieb** = einziger Partner-Einstieg. `MOBILE_HREFS` `/admin/sachverstaendige` → `/admin/vertrieb`.
- **Koordination:** AdminNav-Items = **mein** Ownership (Vertrieb-Konsole). Die Nav-**Shell** (schwebendes Panel, `PortalNav`-Styling) bleibt `eb3e46ca` (andere Files — `src/components/shared/portal-nav/*`). Kein Doppel-Edit. e8aa73d4 hat den partner-leads-Nav-Umzug mir überlassen ([[coordination-an-vertrieb-umbrella-partner-leads-komponente]]).

## 6. Phasen-Bauordnung

Jede Phase = eigener PR gegen staging, additiv, bestehende Routes intakt.

- **Phase A — Konsolen-Shell + Nav-Konsolidierung + Mounts [✅ GEBAUT]:** `/admin/vertrieb/layout.tsx` mit Sub-Nav (`VertriebKonsoleTabs`: Übersicht · Karte · Sachverständige · Partner-Leads · Makler · Werkstätten); Roster = „Übersicht"; **Karte** (`VertriebKarteClient`, full-bleed Mapbox, alle Typen, token-konsistente `primitives.Card`-Legende); **4 Mounts per Re-Export**; AdminNav-Konsolidierung (4 Einträge raus). Der sichtbare „ein Dach"-Schritt.
- **Phase B — Karte:** `/admin/vertrieb/karte` mit `LiveOpsMap` (alle Typen, geocodiert). **Full-bleed** (etabliertes PageContainer-Escape-Muster `md:w-[104.17%] md:-ml-[2.08%]` aus SV-Karte #3793 — PageContainer selbst unangetastet) + **token-konsistent** (`claimondo-*`/`rounded-ios-*`/semantische Status-Tokens; Mapbox-Paint-Hex nur mit `// Token-Audit-Skip`-Header wie in `LiveOpsMap`). Koordination `6c630247` (mapbox) + `LiveOpsMap`-Daten-Adapter.
- **Phase C — Akquise eingehängt:** `/admin/vertrieb/akquise` mountet/verlinkt das partner-leads-CRM (e8aa73d4). Kein Rebuild — Wiring/Einhängen.
- **Phase D — Detail-Cockpit vertieft:** `/admin/vertrieb/[kind]/[id]` — Stufe + Notizen (P2.1) + Aktivitäten-Timeline (`partner_lead_aktivitaeten`) + Einstufung + Deep-Link. Löst den Read-only-Drawer schrittweise ab.
- **Phase E — Admin-Feldmodus:** `/admin/vertrieb/feldmodus` — Besuchsrouten über Partner-Standorte, auf Basis von 6c630247-Feldmodus. Koordination Pflicht.

**Reihenfolge-Logik:** A (sofort sichtbar, mein Lane) → B (Karte, Aarons „mit Karte") → C (Akquise housen) → D (Cockpit) → E (Feldmodus, größte Koordination zuletzt).

## 7. Ownership + Lane-Koordination

- **0db72344 (ich) = Owner der Vertrieb-Konsole** (`src/app/admin/vertrieb/*`, `src/lib/vertrieb/*`, `src/lib/status/domains/vertrieb-workflow*`, `v_vertrieb_kontakt`, AdminNav-**Items**).
- **e8aa73d4 (partner-leads-CRM):** BESTAND, prod-live. Wird gehoused (Phase C). Feature-Layer laufen orthogonal weiter. Ihr Housing-Request (`COORDINATION-AN-vertrieb-umbrella-partner-leads-komponente`) = hiermit **bestätigt**: (1) housen statt neu bauen ✅, (2) AdminNav-Koordination ✅ (ich besitze die Items, entferne den partner-leads-Eintrag im Rahmen der Konsolidierung).
- **eb3e46ca (Nav-Shell):** `PortalNav`-Panel-Styling — orthogonal zu meinen NAV_ITEMS. Kein File-Overlap.
- **6c630247 (Feldmodus/Map):** `LiveOpsMap` + `/gutachter/feldmodus` + `lib/mapbox` — wird in Phase B/E wiederverwendet, nicht dupliziert. Koordination via [[broadcast-feldmodus-lanes]].

## 8. Invarianten (nicht brechen)

- `v_vertrieb_kontakt` bleibt `security_invoker` + `revoke anon/authenticated` → beide RLS-Audits = 0.
- Bestehende Routes bleiben erreichbar (keine Redirect-Stubs — Config-Redirect wenn eine Route wirklich wegfällt; hier bleiben sie alle).
- Kein Rebuild prod-live Tooling (partner-leads-CRM, LiveOpsMap, Feldmodus).
- Staff-Guard (`requireRole(['admin','dispatch'])`) auf allen Vertrieb-Routen; adminClient nur NACH Guard.
- Server-Actions = Result-Object; keine const/type-Exporte aus `'use server'` (AAR-664).
- Design-Tokens (`claimondo-*`, `rounded-ios-*`, semantische Status-Tokens), echte Umlaute, Komponenten-Set; alle Ratchets 0-neu.

## 9. Was schon steht

- **P0** (gemergt #3960): Registry-Domain `vertrieb-workflow` + `deriveVertriebState` + `v_vertrieb_kontakt` + Loader + Rollup + `updateVertriebFeld`.
- **P1** (gemergt #3983): Roster-Seite + Suche/Filter/Sortierung + Read-only Detail-Drawer + Deep-Links + AdminNav-Eintrag „Vertrieb".
- **P2.1** (PR #4003, offen): einheitliches `notizen` (Migration `20260708195052`) + editierbare Notizen im Drawer + `updateVertriebFeld` auf alle kinds.

## 10. Offene Fragen (nächste Iteration)

- Sub-Nav als **Tabs oben** vs. **Sub-Sidebar** links — beim Bau von Phase A entscheiden (visueller Preview).
- Akquise (Phase C): partner-leads-CRM **in-place verlinken** (Route bleibt `/admin/partner-leads`, nur Nav zeigt drauf) vs. **unter `/admin/vertrieb/akquise` mounten** (Component-Reuse) — mit e8aa73d4 final abstimmen.
- Detail-Cockpit (Phase D): eigene **Voll-Seite** `[kind]/[id]` vs. erweiterter **Drawer** — hängt an gewünschter Tiefe je Typ.
