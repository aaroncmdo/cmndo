# Routen-Cleanup über alle Rollen — Groß-Audit → Detail-View-Migrationsplan

**Datum:** 2026-07-17 · **Basis:** origin/staging `a81ddcdde` · **Methode:** 7 parallele Read-only-Audit-Agenten (worktree-gepinnt), ~250 `page.tsx`-Routen über alle Portale, jede Route gelesen + Konsumenten gegrept (Nav, Links, router.push, Emails/WA-Templates, Crons, revalidatePath).

**Auftrag (Aaron):** Routen-Cleanup, indem Funktions- UND Informations-Routen in echte Detail-Views migrieren — **keine Knopf-Verstecke** (Route hinter Button verlinken zählt nicht; die Funktion/Information wandert als Tab/Section/Drawer IN die View). Danach Rest-Cleanup (Route löschen + 308-Redirect).

---

## 1 · Verbindliche Prinzipien für alle Wellen

1. **Funktion+Information migrieren, nicht verlinken.** Ein Header-Link auf die alte Route ist das dokumentierte Anti-Muster (Praxisbeleg: `/gutachter/leadpreise` — Nav-Kommentar behauptet „als Tab integriert", real ist es ein Link).
2. **Kanonisches Muster:** `EntityDetailShell`/`DrawerShell` + 4-File-Skelett (`docs/superpowers/detail-view-recipe.md`); fallgebundene Ziele = die jeweilige Fallakte-Shell der Rolle (`/faelle/[id]` FallakteShell · `/kunde/faelle/[id]` Zonen · `/gutachter/fall/[id]` FallDetailClient · `/werkstatt/auftraege/[id]` · `/makler/akten/[id]`).
3. **Redirects ausschließlich via `next.config.ts redirects()` (308)** — nie `redirect()`-Stub-Pages (Redirect-Stub-Ratchet).
4. **Extern verlinkte Surfaces sind unantastbar:** Magic-Links (`/flow`, `/upload/*`, `/schaden`, `/unfallmeldung`, `/beratung`, `/re-termin`, `/kunde-termin`, `/sv/termin`, Abmelde-Links), gedruckte QR/NFC-Ziele (`/start/werkstatt*`, Schadenkarten), iframes (`/embed/*`), Auth-Flows, per Email/WA versendete Detail-URLs.
5. **Rollen-Scoping bleibt Architektur:** dispatch-SV read-only ≠ admin-SV (Billing/Verif-Doks); Kanzlei ohne eigene Fallakte (In-House-Modell, shared `/faelle/[id]`).
6. **Jede Migration zieht nach:** Nav-Einträge, revalidatePaths, Email-/Mitteilungs-`route_url`s, Bookmarks (308), Twilio-Template-Check wo WA im Spiel.

## 2 · Gesamtbild

| Portal | Routen | Detail-View-Stand | MIGRATE | CLEANUP | Kern-Befund |
|---|---|---|---|---|---|
| admin (86) | 43+43 | SV/Org/VS/Team/Embed-Sites auf Shell (P0-P2), finance in Umbau (portal-header-Lane) | 4 (+1 später) | 2 URLs + 5 File-Moves + Dead-Code | wissen-artikel rendert jeden Draft als Inline-Volleditor |
| gutachter (34) | 34 | Fallakte = bespoke FallDetailClient (CMM-23) | 3 (+1 Zusatz-Action) | 3 (+3 nach Migration) | leadpreise = dokumentiertes Knopf-Versteck; statistiken = Stub |
| kunde (16+3) | 19 | Zonen-Detail-View stark; 3 Termin-/NB-Routen drumherum | 3 | 2 (+3 nach Migration) | Termin-Detail dupliziert TeamZone; NB-Alt-Flow mit `faelle[0]`-Falle |
| dispatch (12) | 12 | leads/[id] = custom Maske; SV+Finder auf Shell (P2) | 1 (isochrone) | 2 | konto byte-identisch ×3 |
| mitarbeiter/KB (12) | 12 | nutzt shared `/faelle/[id]` | 3 | 3 | faelle-Liste = echtes Duplikat; 2 Guard-Bounce-Bugs |
| makler (13) / kanzlei (5) / flotte (4) | 22 | Makler-Akte vollwertig (custom); Flotte jung | 2 (+2 Ausbau) | 1 nach Merge | kanzlei mandate↔kanban = 60 Zeilen RLS-heikler Doppel-Query |
| werkstatt (11) + One-offs (27) | 38 | Detail-View-zentrisch; One-offs = Magic-Link/Auth | 0 Routen (2 Link-Anreicherungen) | 1-2 optional | Email-Deeplinks zielen auf Liste statt Detail |

**Σ ~250 Routen · 16 echte Migrationen · ~15 Cleanups · 12 Nebenfund-Bugs · 7 Aaron-Entscheide.**

## 3 · Migrations-Wellen

### Welle 1 — Quick-Wins (klein, sofort, kein Design nötig)
| # | Migration | Ziel | Aufwand |
|---|---|---|---|
| W1.1 | `/gutachter/leadpreise` (INFO) | Section/Tab in `/gutachter/abrechnung` + 308 | S |
| W1.2 | `/gutachter/einstellungen/embed/[id]/tracking-anleitung` (INFO) | Accordion/Tab im Embed-Editor + 308 | S |
| W1.3 | `/gutachter/statistiken` (Stub) | löschen + 308 → abrechnung, Nav-Item raus | XS |
| W1.4 | `/admin/team/leaderboard` + `/admin/team/incentives` | Link-Tabs im Team-Hub; Auszahlungs-Historie zusätzlich als Section in `/admin/team/[id]` | S-M |
| W1.5 | `/kunde/faelle` (Doppel-UI) | 308 → `/kunde` | XS |
| W1.6 | `/gutachter/onboarding/buero` (verwaist) | 308 → willkommen; **actions.ts behalten** (WillkommenClient-Import) | XS |
| W1.7 | Werkstatt-Anreicherungen: Provision→Auftrag-Link (`WerkstattAbrechnungen.tsx:192`) + 3 Email-/Cron-Deeplinks auf `/werkstatt/auftraege/${claimId}` statt Liste | — | XS |
| W1.8 | Dead-Code: stale revalidatePaths (`/admin/tasks`×2, `/admin/meine-tasks`×2, `/admin/versicherungen`, waitlist-`[id]`), next.config-Doppel-Redirect `/admin/aufgaben` (Z. 403) | — | XS |

### Welle 2 — Kern-Migrationen (Funktion+Information in die Detail-Views)
| # | Migration | Ziel | Hinweise |
|---|---|---|---|
| W2.1 | **`/admin/wissen-artikel` Draft-Volleditor** | neue Detail-View `/admin/wissen-artikel/[id]` (EntityDetailShell, Tabs Inhalt/SEO-Meta, optional Drawer-Intercept); Liste behält Triage+Crawl | 8 revalidatePaths nachziehen |
| W2.2 | **`/gutachter/fall/[id]/stellungnahme`** | Drawer/Panel in FallDetailClient; Status-Gates (`beauftragt`/`hochgeladen`) → Panel-Sichtbarkeit | ⚠ Smoke-Lane meldet die Seite als evtl. client-tot — Migration ist zugleich der Fix-Pfad; koordinieren |
| W2.3 | **`/kunde/termine/[id]`** | Termin-Aktionen (absagen/verschieben/ICS/Tracking/Gegenvorschlag) in den SV-Termin-Block der StatusZone; 308 → `/kunde/faelle/[claimId]#zone-status`; Termine-Hub linkt direkt in die Fallakte | dupliziert heute TeamZone-Inhalte |
| W2.4 | **`/kunde/nachbesichtigung/[fall_id]`** (neuer Picker) | Inline-Picker/Sheet in StatusZone; danach 308 | vorher Twilio-Template-Body extern prüfen |
| W2.5 | **`/kunde/nachbesichtigung`** (Alt-Flow, `faelle[0]`-Falle) | löschen + Nav-Item raus; 308 → `/kunde` | divergenter Alt-Datenpfad stirbt |
| W2.6 | `/kunde/faelle/[id]/kalender` | Slot-Picker-Sheet in der Detail-View (shared TerminPicker existiert); 308 | 188 LOC |
| W2.7 | **isochrone ×2** (`/dispatch/isochrone`, `/mitarbeiter/isochrone`) | „Geeignete SVs im Umkreis"-Section im Lead-Detail (dispatch) bzw. Fallakte (KB) — Action wird dort schon konsumiert; 308 → leads bzw. karte | Cross-Portal-Import + SachverstaendigeList-Link umhängen |
| W2.8 | `/mitarbeiter/kundentermine` | Toggle „Meine/Kundentermine" in `/mitarbeiter/termine`; 308 | Layout 1:1 identisch |
| W2.9 | Reklamation-einreichen zusätzlich als Fallakte-Action (SV) | FallakteDrawer-Action; Liste bleibt Hub | kein Routen-Cleanup |

### Welle 3 — Struktur-Konsolidierung (je 1 Entscheid/Koordination nötig)
| # | Migration | Ziel | Abhängigkeit |
|---|---|---|---|
| W3.1 | `/admin/firmen-flotte` | echter Partner-Hub-Tab `/admin/partner/firmen-flotte` (Tab-Leiste bleibt stehen) + 308 | CRM-Lane-Umfeld — koordinieren |
| W3.2 | kanzlei `mandate`+`kanban` | eine Route `?view=kanban` + 308; mind. shared Data-Loader (RLS-heikler Doppel-Query) | klein, aber RLS-Gotcha respektieren |
| W3.3 | 2FA-Konsolidierung `dispatch/konto`+`admin/konto` | mitarbeiter-Layout-Guard um dispatch erweitern → 308 auf `/mitarbeiter/profil` | fixt zugleich DispatchNav-Bounce-Bug; NICHT vor Guard-Fix |
| W3.4 | Fälle-Listen-Kanonisierung | **Aaron-Entscheid E1** (s.u.): `/faelle` (rollen-adaptiv) als Kanon + `/mitarbeiter/faelle` 308 — ODER umgekehrt | Agenten uneins (bewusst eskaliert) |
| W3.5 | admin File-Moves (URLs schon tot): organisationen→partner/, makler→vertrieb/, communities→partner/, abrechnungen+kanzlei-abrechnungen→finance/_views | Re-Export-Indirektion auflösen | finance-Teile NUR mit Geldlogik-Handoff + NACH portal-header-Lane-Merge |
| W3.6 | `/admin/partner-leads` → 308 aufs Vertrieb-Dach + `/admin/versicherungen`-Liste → 308 `/admin/partner/versicherer` | Alt-URL-Konsolidierung | partner-leads = CRM-Lane (läuft, PR #4480 B1); backHref vorher umbiegen |

### Welle 4 — Shell-Harmonisierung (optional, lane-gebunden)
Werkstatt-Akte (810 LOC SectionCards) → EntityDetailShell-Tabs · Makler-Akte → 4-File-Skelett (Drawer gratis) · dispatch/leads/[id]-Header · Flotten-Schaden-Detail ausbauen (3 Felder → Phase/Termin/Doks) · `/admin/chat/[claimId]`-Pilot → Chat-Tab in `/faelle/[id]` (**Chat-Lane-Hoheit**). CRM-Lane B2–B4 (Werkstatt-Intercept, Makler-[id], vorlagen-Drawer) läuft bereits separat (PR #4480 ff.).

## 4 · Cleanup-Liste (Rest, nach/neben den Wellen)
- 308s aus W1/W2/W3 (Tabelle oben) — alle via next.config.ts.
- `/faelle` Top-Level-**Liste**: je nach E1 rollen-aware 308 oder Kanon (Detail `/faelle/[id]` bleibt IMMER).
- `/start/makler/[maklerId]`: erst Traffic-/Analytics-Check, dann 308 → `/gutachter-finden` (E4).
- `/dev/phases`: prod-sicher gegatet — optional löschen, kostet nichts (behalten ok).
- Makler-Kleinst: toten `?consent=minimal&fall=`-Redirect-Hint konsumieren oder droppen; stale 5-Tab-Kommentar.
- `/gutachter/gebiet`: E2 (dormant CMM-17 vs. 308 → einstellungen).

## 5 · Nicht anfassen (verifiziert bewusst)
Magic-Link-/QR-/NFC-/iframe-/Auth-Surfaces (§1.4) · vertrieb-Doppel-Mounts (Master-Routen tragen `@drawer`-Slots, ~20 Konsumenten; Alias-Mounts sind P3-Design) · `/admin/sachverstaendige` nie redirecten (einziger Karten-Drawer-Ort) · dispatch-SV read-only-Trennung · `/dispatch/rueckrufe` (≥7 externe route_url-Producer, `?open=`-Contract) · SV-Termine-Trio `termine/[id]`+navigation+vor-ort (pre-FlowLink-Termine ohne Fall, WA-Deep-Link, Mobile-Full-Screen) · `/kunde/chat`, `posteingang`, `nachrichten`-Flächen (Chat-Lane) · finance/(hub) (portal-header-Lane in-flight) · `admin/partner`+`admin/vertraege` (keine Entitäten) · alle makler/kanzlei/flotte-BLEIBTs (22/22 haben Einstieg/Systemrolle).

## 6 · Nebenfunde → Lane-Routing
| Schwere | Fund | Lane |
|---|---|---|
| 🔴 | **Dispatch→Mitarbeiter-Bounce** (code-sicher): `DispatchNav.tsx:76` profilHref + `create-mitteilung.ts:56` dispatch→`/mitarbeiter/nachrichten`, aber mitarbeiter-Layout sperrt dispatch aus → W3.3 fixt | dispatch/KB |
| 🟡 | KB→`/dispatch/leads/[id]`-Bounce bei Lead-Rückrufen (mitarbeiter/page:138, termine:188) | dispatch/KB |
| 🟡 | Mitteilungen `termin` (kunde) → `/kunde/termin` ohne Token = 404 (gemeint `/kunde/termine`) | kunde/comms |
| 🟡 | `/kunde`-Hub Onboarding-Redirect nutzt `find(!complete)` statt `every` (Multi-Claim-Fix 15.07. nur im Layout) | kunde |
| 🟡 | mitarbeiter/reklamationen badged `offen/erledigt`, DB-Enum `eingereicht/pruefung` → Badge immer Fallback | KB |
| 🟡 | SV Doppel-UI Termin-Aktionen (termine/[id] vs Fallakte) — Konsistenz-Folge-Ticket | SV |
| 🟡 | flotte: 4 Pages auf `createAdminClient()` (RLS-Bypass), firmen_id-RLS offen (matrix.ts:198) | Security |
| ⚪ | admin/support lädt antwort/status ohne Bearbeiten-UI (Halbbaustelle?) · vertraege-Doppel (PDF vs HTML) · kunde/faelle-EmptyState-CTA auf public `/schaden-melden` · tasks ohne fall_id linken `#` | div. |

## 7 · Offene Aaron-Entscheidungen
- **E1** Fälle-Listen-Kanon: `/faelle` (rollen-adaptiv, konsistent zum Detail) als Kanon + `/mitarbeiter/faelle`-308 — oder Portal-Route als Kanon + `/faelle`-Liste rollen-aware 308? *(Empfehlung: `/faelle` als Kanon — eine Liste statt zwei, Detail ist dort schon kanonisch.)*
- **E2** `/gutachter/gebiet`: CMM-17-Feature reaktivieren (dormant lassen) oder 308 → einstellungen? (Paket-Upgrade-Anfrage verlöre sonst die Surface.)
- **E3** `/mitarbeiter/reklamationen`: eigenständige Frist-Queue behalten oder Dashboard-Panel?
- **E4** `/start/makler`: nach Traffic-Check 308?
- **E5** gutachter_waitlist mittelfristig ins partner_leads-CRM aufgehen lassen? (Produktfrage)
- **E6** vertraege-Doppel (PDF-Editor vs HTML-Vorlagen): gewollte Koexistenz?
- **E7** Kunde-Detail-View um Chat-Zone ergänzen (Route `/kunde/chat` bleibt eh Inbox)?

## 8 · Anhang — Referenzen
Vollständige Routen-Tabellen (inkl. aller BLEIBT-Begründungen, Einstiege, file:line) liegen in den 7 Agenten-Reports der Audit-Session (b28f5568, 17.07.). Verwandt: `docs/superpowers/detail-view-recipe.md` · `coordination-detail-view-konsistenz-programm` · `REFERENCE-claim-detail-view-per-role-routes-and-gates` · `AUDIT-crm-detail-drawer-phase-a-befund` (CRM-Interaktions-Ebene, Phase B läuft: PR #4480) · Geldlogik: `docs/superpowers/2026-07-14-HANDOFF-abrechnungen-konsolidierung.md`.
