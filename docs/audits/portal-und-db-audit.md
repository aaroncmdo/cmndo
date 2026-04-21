# Portal + DB Audit — 2026-04-21

Gründlicher Audit aller Portal-Routes (Gutachter, Kunde, Dispatch, KB,
Admin, Kanzlei) + Code-/Route-Redundanzen + DB-Operationen auf
Legacy-Pfaden. Stand nach AAR-683/684-Phase-1/685/686/687 (PR #164-#170).

---

## TL;DR — was muss sofort gefixt werden

| Priorität | Finding | Impact |
|---|---|---|
| 🔴 URGENT | **37 `revalidatePath`-Calls auf redirected Legacy-URLs** → Cache-Invalidierung läuft ins Leere, UIs zeigen stale Daten | Silent Data-Staleness in 8 Admin-Bereichen |
| 🔴 URGENT | Monolith `faelle/[id]/actions.ts` (1240 Zeilen, 26 Funktionen) noch ungesplittet | Tech-Debt, Code-Splitting-Regression |
| 🟠 HIGH | 2 Orphan-Ordner (`admin/dispatch`, `admin/finance`) ohne `page.tsx` — unklar ob Ordner-Inhalte noch genutzt werden | Konvention + ggf. Dead-Code |
| 🟠 HIGH | 3 Portal-Ordner mit *Kalender*, *Termine*, *Nachrichten* (gutachter, mitarbeiter, admin) — Überlappungs-Check nötig | Code-Duplikat-Risiko |
| 🟡 MEDIUM | `/admin/dispatch/actions.ts` enthält `convertLeadToFall`, `updateFallStatus` etc. — lebt im Ordner der per Redirect-Nur-Route deprecated wurde | Unsauberer Legacy-Container |

---

## Part A — DB-Audit `faelle/[id]/actions.ts` Monolith

**26 Server-Actions**, 1240 Zeilen. Operiert auf folgenden Tabellen:

### Primäre Tables (write)
| Tabelle | Operationen | Zweck |
|---|---|---|
| `faelle` | update (19×) | Fall-Status, filmcheck_*, mandatsnummer, vs_eskalationsstufe, regulierung_betrag, kanzlei_uebergabe_am, anschlussschreiben_*, zahlung_*, abgeschlossen_am |
| `timeline` | insert (12×) | Audit-Log für fast jede Action |
| `tasks` | insert (4×), update (1×) | KB-Tasks (Filmcheck, Kanzlei-Anschluss, Regulierung) |
| `qc_checkliste` | upsert-Pattern (select+insert/update, 4×) | Filmcheck/QC-State |
| `fall_dokumente` | insert (1×) | Gutachten/Anschlussschreiben-Upload |
| `nachrichten` | insert (1×) | sendChatNachricht |
| `pflichtdokumente` | update (1×) | Pflicht-Status (anschlussschreiben) |

### Sekundäre Tables (read)
- `profiles` (für Email-Lookup Kanzlei-User + Admins)
- `sachverstaendige` (SV-Profile-ID → profiles-JOIN)
- `leads` (Telefonnummer für Chat-Benachrichtigung)
- `benachrichtigungen` (insert für SV + Admin-Notifications)

### Problematische Stellen
- **`saveFilmcheck` L56**: `select('email').eq('rolle', 'kanzlei')` — holt ALLE Kanzlei-User, iteriert in for-Schleife + `emailFilmcheckBestanden(k.email, fallNr).catch(() => {})`. Swallows Errors silently.
- **`sendChatNachricht` L451**: `.from('leads').select('telefon').eq('id', fall.lead_id).single()` — hart-gekoppelt an lead_id, schlägt fehl wenn lead gelöscht wurde (single())
- **`upsertQcCheckliste` + `qcBestanden` + `qcNachbesserung` L515-600**: 3× das gleiche upsert-Pattern (select → update OR insert). Sollte eine gemeinsame Helper-Funktion werden.

### Spalten die geschrieben werden (Spot-Check gegen echte DB)
Alle Queries gehen auf existierende `faelle`-Spalten (kennzeichen, sv_id, lead_id, fall_nummer, mandatsnummer, filmcheck_*, vs_eskalationsstufe, regulierung_betrag, kanzlei_uebergabe_am, anschlussschreiben_*, zahlung_*, abgeschlossen_am, vs_regulierung_*, personenschaden_flag, mietwagen_flag, status). **Keine verwaisten Spalten gefunden.**

### Split-Empfehlung (= Phase 2)
| Modul | Funktionen |
|---|---|
| `_actions/filmcheck.ts` | saveFilmcheck, upsertQcCheckliste, qcBestanden, qcNachbesserung |
| `_actions/chat.ts` | sendChatNachricht, addTimelineEntry, sendManualWhatsAppAction |
| `_actions/dokumente.ts` (erweitern) | uploadPflichtdokument, uploadDatei, uploadAnschlussschreiben |
| `_actions/kanzlei-paket.ts` (erweitern) | setAnschlussschreibenDatum, recordZahlung, saveKanzleiAnsprechpartner, erfasseZahlungseingang, saveRegulierungsKlassifizierung |
| `_actions/prozess.ts` (erweitern) | eskalation |
| `_actions/stammdaten.ts` (erweitern) | updateSchadensAdresse, saveFinVin, updateFall |
| `_actions/termine.ts` (erweitern) | createTermin, updateTerminStatus |
| `_actions/tasks.ts` (neu) | createFallTask, updateTaskStatus |
| `_actions/core.ts` (neu) | deleteFall, deactivateFall, reactivateFall |

**+** neuer Shared-Helper `upsertQcCheckliste` als Pure-Function.

---

## Part B — 🔴 Legacy `revalidatePath`-Leaks (37 Calls, akut)

`next.config.ts` leitet 8 alte `/admin/*`-Routes permanent auf neue Pfade
um. Aber im Code werden diese ALTEN Pfade noch bei `revalidatePath`
verwendet — die revalidieren eine URL die per Redirect gar nicht mehr
existiert, **die neue URL bleibt stale.**

| Legacy-URL (redirected) | Neue URL (target) | `revalidatePath`-Calls |
|---|---|---|
| `/admin/tasks` | `/admin/aufgaben/alle` | **8** |
| `/admin/dispatch` | `/dispatch/dashboard` | **8** |
| `/admin/organisationen` | `/admin/partner` | **7** |
| `/admin/abrechnungen` | `/admin/finance/abrechnungen` | **6** |
| `/admin/finance/provisionen-maik` | `/admin/finance/provisionen` | **4** |
| `/admin/communities` | `/admin/partner/communities` | **2** |
| `/admin/reklamationen` | `/admin/faelle/reklamationen` | **1** |
| `/admin/kanzlei-abrechnungen` | `/admin/finance/kanzlei` | **1** |

**Gesamt: 37 tote `revalidatePath`-Calls.** Gleicher Typ Bug wie in AAR-683
für `/admin/sachverstaendige/karte`.

**Fix:** Alle 37 Pfade auf die neuen Target-URLs umstellen. ~1h Arbeit.

---

## Part C — Orphan-Ordner (keine page.tsx, mit Code)

### `/admin/dispatch/` 🟠
- Enthält: `actions.ts` (901 Zeilen!) mit `convertLeadToFall`, `updateFallStatus`, `sendFlowLink`, `createLead`, `updateServiceTyp`, `updateLeadStatus`
- `/admin/dispatch` redirected nach `/dispatch/dashboard` (next.config)
- **Unsauber**: Real-Code in Legacy-Ordner. `convertLeadToFall` wird (noch) aus `flow/[token]/actions.ts` und `upload/dokumente/[token]/actions.ts` referenziert
- `updateFallStatus` wird von `admin/faelle/(hub)/FaelleKanban.tsx` importiert

**Fix-Optionen:**
- A) `admin/dispatch/actions.ts` → `admin/faelle/_actions/` oder `lib/faelle/actions.ts` verschieben (Sauber-Move mit Import-Sweep, 30 Min)
- B) Ordner umbenennen auf `admin/_dispatch-legacy-actions/` (kosmetisch)

### `/admin/finance/` 🟡
- Enthält: `(hub)/` (Route-Group, OK!), `actions.ts`, `abrechnungen-actions.ts`, plus `provisionen-maik/page.tsx`
- `/admin/finance` wird via `(hub)/page.tsx` zur URL (das ist legitimes Next.js-Route-Group-Pattern)
- `provisionen-maik/` hat eigene page.tsx + actions.ts — **ABER** next.config redirected `/admin/finance/provisionen-maik → /admin/finance/provisionen`. Die Ziel-URL `/admin/finance/provisionen` hat eine eigene page.tsx im selben Verzeichnis? Nein! → Bookmark-Bruch.

**Fix:**
- `admin/finance/provisionen-maik/` → `admin/finance/provisionen/` umbenennen + Redirect anpassen

---

## Part D — Portal-Vergleich

### Gutachter (31 pages)
Umfangreichster Portal. Untergliederungen gesund:
- /heute, /termine, /kalender, /route, /feldmodus, /faelle, /fall/[id]
- /auftraege, /leadpreise, /abrechnung, /statistiken
- /profil, /verifizierung, /vertrag
- /onboarding (akademie, buero) + /willkommen
- /team, /community, /posteingang, /nachrichten, /mitteilungen
- /tasks, /reklamationen

**Mögliche Redundanz**: `/posteingang` + `/nachrichten` + `/mitteilungen` — Posteingang-artige Views parallel. Worauf tippen Hotkeys / URLs? Klärung in Folge-Ticket.

### Kunde (13 pages)
Kompakt und fokussiert: `/faelle`, `/faelle/[id]`, `/faelle/[id]/kalender`, `/termin`, `/termin/[token]`, `/nachbesichtigung`, `/nachbesichtigung/[fall_id]`, `/onboarding`, `/chat`, `/einstellungen`, `/profil`.
**Keine Redundanzen erkannt.**

### Dispatch (8 pages)
- `/dashboard`, `/leads`, `/leads/[id]`, `/rueckrufe`, `/sachverstaendige`, `/karte`, `/isochrone`
- Klein, fokussiert. Keine Duplikate.

### Mitarbeiter (KB, 8 pages)
- `/faelle`, `/tasks`, `/nachrichten`, `/termine`, `/performance`, `/reklamationen`, `/profil`
- Notion-Doc §4 erwähnt fehlende `/isochrone` + `/kundentermine` — Folge-Tickets.

### Cross-Portal-Duplikate-Hotspots
Mehr als 1 Portal hat **gleich benannte Pages**:
| Route | In Portalen | Status |
|---|---|---|
| `/reklamationen` | admin/faelle, gutachter, (mitarbeiter?) | OK (jede Rolle eigene Sicht) |
| `/termine` | admin/faelle/(hub), gutachter, mitarbeiter | OK (rollenspezifisch) |
| `/tasks` | admin/aufgaben, gutachter, mitarbeiter | OK |
| `/statistiken` | admin/faelle/(hub), gutachter | OK |
| `/profil` | admin, gutachter, mitarbeiter | OK |
| `/onboarding` | kunde, gutachter, schaden-melden | OK |
| `/nachrichten` | admin, gutachter, mitarbeiter | OK |
| `/kanzlei` | admin/faelle/(hub), kanzlei (Portal) | OK |
| `/kalender` | gutachter, (admin/kalender?) | OK |
| `/faelle` | admin, gutachter, mitarbeiter, kunde | OK |
| `/einstellungen` | admin, kunde, (kanzlei?) | OK |
| `/abrechnungen` | admin/finance (redirected), gutachter | OK |
| `/termin` | kunde, sv | OK (SV-Bestätigung Token-Route) |

**Keine echten Cross-Portal-Duplikate gefunden** — jede Route ist rollenspezifisch und legitim.

---

## Part E — Dubiose Redirects im next.config

- **`/admin/faelle/:id/:path* → /faelle/:id/:path*`** mit UUID-Regex — OK, saubere Portal-Konsolidierung
- **`/admin/sla → /admin/faelle/sla`** — gut
- **`/admin/statistiken → /admin/faelle/statistiken`** — gut
- **`/admin/finance/provisionen-maik → /admin/finance/provisionen`** — **Target-Page existiert nicht!** Scan zeigt `admin/finance/provisionen-maik/page.tsx` existiert, `admin/finance/provisionen/page.tsx` fehlt → Bookmark führt ins 404.

---

## Part F — Code-Duplikat-Kandidaten (gleicher Dateiname, verschiedene Portale)

Stichprobenartig geprüft — meistens legitim (eigene Client-Components pro Rolle):
- `actions.ts` existiert 43× im Repo
- `page.tsx` 150× (jede Route)
- `layout.tsx` 16× (pro Portal-Ordner)

Keine echten Code-Duplikate mit identischer Logic gefunden.

---

## Empfohlener Ablauf (Fix-Sprints)

1. **PR A — Legacy-revalidatePath-Sweep** (1-2h)
   Alle 37 Calls auf Target-URLs mappen. 8 Betroffene Bereiche. Mit AAR-683-Pattern.

2. **PR B — Monolith-Split** (3-4h, AAR-684 Phase 2)
   `faelle/[id]/actions.ts` in 9 thematische `_actions/*`-Module aufteilen.

3. **PR C — admin/dispatch/actions.ts umziehen** (30-60 Min)
   `admin/dispatch/actions.ts` (901 Zeilen) aus dem Redirect-Zombie raus
   nach `lib/faelle/actions-legacy.ts` oder domain-split in kleinere Module.

4. **PR D — `admin/finance/provisionen-maik` → `provisionen`** (15 Min)
   Umbenennen + Redirect prüfen.

5. **Folge-Tickets** (Backlog):
   - Gutachter-Posteingang vs Nachrichten vs Mitteilungen — Klärung nötig
   - Mitarbeiter `/isochrone` + `/kundentermine` fehlen (Notion-Doc §4)

---

## Anhang: Tools / Erkenntnisse

- Git ordner-move hilft History zu erhalten (`git mv`)
- Orphan-Scan: `find ... -type d ! -path '*/node_modules/*'` + folgender
  Check auf page.tsx/layout.tsx/route.ts/error.tsx — Präfix `_` für
  private folders ist konventionell korrekt (seit AAR-686)
- `revalidatePath`-Audits: `grep -rhE "revalidatePath\(['\"]"` → alle
  Targets extrahieren, gegen next.config-Redirects abgleichen
