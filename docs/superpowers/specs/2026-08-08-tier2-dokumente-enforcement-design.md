# Tier-2-Dokumente-Enforcement — Freischaltung vom Verifizierungs-Status entkoppeln

**Datum:** 2026-08-08
**Entscheid:** Aaron „Option B" (hartes Enforcement mit Grace-Frist) + „denk an die Admin-Seite"
**Berührt Journeys:** J8 (Onboarding je Rolle), J10 (Dispatch/Ranking)

## 1. Problem

**9 aktive Gutachter sind dispatch-fähig, obwohl keiner Berufshaftpflicht oder Gewerbeanmeldung nachgewiesen hat** (prod 08.08.: Remscheid, shakib, unfallsafe, Gall, kfzcheck, Klug, Burak, Daskiran + 1 interner Test-SV). Berufshaftpflicht ist paket-unabhängig haftungskritisch — ein Gutachter ohne Nachweis, der live Fälle bearbeitet, ist ein Haftungsrisiko.

**Root-Cause (ein Feld, zwei Bedeutungen):** `freigebeBasicSvCore` (Auto- + manuelle Admin-Freigabe) setzt `verifizierung_status='geprueft'` als eines seiner 5 Freigabe-Flags — **ohne** dass je ein Tier-2-Dokument geprüft wurde. Damit signalisiert die Freischaltung fälschlich „Tier-2 verifiziert" und

1. **hebelt den Reminder-Cron aus** (`verifizierung-reminder` filtert `verifizierung_status='ausstehend'` — `geprueft`-SVs sind unsichtbar), und
2. **täuscht den Dispatch-Gate** (`svDarfFaelleEmpfangen` blockt nur `frist_ueberschritten`; `geprueft ≠ frist_ueberschritten` → Fälle fließen).

Der Kern-Bug ist die **Kollision zweier Konzepte auf einer Spalte**: „Identität/Onboarding freigeschaltet" (`verifiziert`) und „Tier-2-Dokumente geprüft" (`verifizierung_status`).

## 2. Ist-Architektur (was bereits existiert — NICHT neu bauen)

- **Dispatch-Gate** `src/lib/sv/dispatch-gate.ts` (`svDarfFaelleEmpfangen`, Entscheid FG3-Task-3.0 vom 11.07.): blockt Fall-Empfang wenn `verifizierung_status === 'frist_ueberschritten'` (+ verifiziert/ist_aktiv/portal_zugang/!testaccount/!gesperrt/!geloescht). Als SQL-Mirror in `applyDispatchableFilter` (`src/lib/sv/queries.ts`), die die Engine (`src/lib/termine/engine/matching.ts:141`) nutzt. **→ Das Enforcement-Gate funktioniert bereits; nur der Weg in `frist_ueberschritten` ist kaputt.**
- **Reminder-Cron** `src/app/api/cron/verifizierung-reminder/route.ts`: läuft täglich, filtert `verifizierung_status='ausstehend' AND verifizierung_frist_bis IS NOT NULL`. Tag-7-Halbzeit-Mail; bei Fristablauf → `verifizierung_status='frist_ueberschritten'` + Admin-Task + SV-Mail. Funktioniert — greift nur nie, weil kaum ein SV `ausstehend`+Frist trägt.
- **Doc-Status-Flow** `pflichtdokumente`: `ausstehend → hochgeladen → geprueft`. Tier-2-Slots: `sv_berufshaftpflicht`, `sv_gewerbeanmeldung`.
- **Admin-Actions** `src/app/admin/sachverstaendige/[id]/verifizierung-actions.ts`: `tier2Freigeben` (setzt `geprueft`), `tier2DokumentNachfordern`, `svSperren`/`svEntsperren` (`gesperrt_seit`), `pflichtdokumentFreigeben`/`-Zurueckweisen`. Admin-UI: `VerifizierungsTab.tsx` in der SV-Akte.
- **SV-Upload** `/gutachter/verifizierung/page.tsx`: der SV lädt alle Slots (inkl. Berufshaftpflicht/Gewerbeanmeldung) hoch.

## 3. Ziel

Jeder freigeschaltete SV ohne geprüfte Berufshaftpflicht **und** Gewerbeanmeldung erhält eine 14-Tage-Frist ab Freischaltung; danach `frist_ueberschritten` → automatischer Dispatch-Stopp (bestehendes Gate) bis die Docs geprüft sind. Für Paid **und** Basic. Admin sieht + steuert den Zustand. Interne Test-SVs ausgenommen.

## 4. Design

### 4.1 Freischaltung entkoppeln (Kern-Fix)

`src/lib/sv-basic/freigabe.ts` (`freigebeBasicSvCore`): **`verifizierung_status` nicht mehr blind auf `geprueft` setzen.** Neue Logik:

- `verifiziert = true` bleibt (Identität/Onboarding freigeschaltet — separates Konzept).
- Prüfe, ob beide Tier-2-Slots (`sv_berufshaftpflicht`, `sv_gewerbeanmeldung`) `status='geprueft'` in `pflichtdokumente` haben.
  - **Ja** → `verifizierung_status='geprueft'` (echt geprüft).
  - **Nein** (Normalfall) → `verifizierung_status='ausstehend'` + `verifizierung_frist_bis = now() + 14 Tage` (nur setzen wenn noch NULL — bestehende Frist nie verlängern/zurücksetzen).
- Idempotenz: ist der SV bereits `frist_ueberschritten` oder `geprueft`, nicht zurücksetzen.

Wirkt für **beide** Freigabe-Wege (finalize-Auto + manuelle Admin-Freigabe), da beide durch den Core laufen. „geprueft" setzt künftig **nur** noch `tier2Freigeben` (Admin nach echter Doc-Prüfung).

### 4.2 Frist-Konsistenz Paid

Der Stripe-Onboarding-Webhook setzt `verifizierung_frist_bis` bereits (Paid-Pfad). Prüfen, dass Paid- und Basic-Pfad denselben Wert/dieselbe Länge (14 Tage) nutzen; die `freigebeBasicSvCore`-Logik ist der gemeinsame Fallback (setzt nur wenn NULL → doppeltes Setzen schadet nicht).

### 4.3 Reminder-Cron

Kein Logik-Change nötig (Filter `ausstehend`+Frist greift jetzt, weil neue SVs korrekt `ausstehend`+Frist tragen). **Robustheit-Tasks:** (a) prüfen dass Basic-SVs nicht anderweitig ausgeschlossen werden; (b) die Mail nutzt aktuell das `sv_monatsabrechnung`-Template mit Custom-HTML — sauberer wäre ein eigenes `tier2_frist`-Template (optionaler Cleanup, kein Blocker).

### 4.4 Admin-Seite (Aarons Hinweis)

- **Übersicht:** In `SvListeContent.tsx` (liest `verifizierung_status` schon) ein **Tier-2-Status-Badge** je Zeile (`ausstehend` / `X Tage` / `überfällig — kein Dispatch`) + ein **Filter** „Tier-2 offen/überfällig". MVP; eine dedizierte Queue-Seite analog `basic-freigaben` ist Option, falls die Liste zu unübersichtlich wird.
- **SV-Akte** `VerifizierungsTab.tsx`: Enforcement-Status-Zeile (Frist, Tage verbleibend, Dispatch-Block ja/nein) + neue Action **`tier2FristVerlaengern(svId, tage)`** (Admin verlängert die Frist). Prüfen/Genehmigen/Nachfordern existiert.
- **Wichtig:** `tier2Freigeben` (setzt `geprueft`) muss künftig verlangen, dass beide Docs `hochgeladen`/vorhanden sind — kein Blind-Freigeben (sonst neuer Bypass). Warnung/Guard einbauen.

### 4.5 SV-Portal-Banner

`GutachterShell` (oder Portal-Layout): wenn `verifizierung_status ∈ (ausstehend, frist_ueberschritten)` und Tier-2-Docs fehlen → Banner „Berufshaftpflicht/Gewerbeanmeldung fehlt — noch X Tage, sonst pausieren wir deine Fälle" (bei `frist_ueberschritten`: „Deine Fälle sind pausiert — bitte Nachweise hochladen") + Link `/gutachter/verifizierung`. Prüfen, ob ein ähnlicher Hinweis schon existiert (Redundanz vermeiden).

### 4.6 Bestandsheilung (9 SVs)

Einmaliges Rollout-Script/SQL: alle aktiven SVs ohne geprüfte Tier-2-Docs und `verifizierung_status != 'frist_ueberschritten'` → `verifizierung_status='ausstehend'`, `verifizierung_frist_bis = now() + 14 Tage`, `verifizierung_reminder_7d_gesendet_am = NULL`. Interne Test-SVs (`ist_testaccount=true` ODER `@claimondo.de`/`@claimondo.test`-Muster) ausnehmen. Kloss (bereits `frist_ueberschritten`) bleibt unberührt (schon geblockt). **Timing = offene Entscheidung (§9).**

## 5. Datenmodell

Keine neue Spalte nötig — `verifizierung_status`, `verifizierung_frist_bis`, `verifizierung_frist_ueberschritten_am`, `verifizierung_reminder_7d_gesendet_am`, `verifiziert`, `verifiziert_am`, `verifiziert_von`, `verifizierung_admin_notiz` existieren alle. `verifizierung_status`-Werte-Kanon (Semantik geschärft): `NULL` (kein Tier-2-Prozess) · `ausstehend` (Docs offen, Frist läuft) · `geprueft` (Admin genehmigt) · `frist_ueberschritten` (Frist um → Dispatch-Stopp). Kein CHECK-Constraint-Change (Werte existieren).

## 6. Soll-Delta (J8 / J10)

- **J8 (Onboarding):** neuer Absatz „Nach Freischaltung: 14-Tage-Tier-2-Frist (Berufshaftpflicht + Gewerbeanmeldung); Nichterfüllung → Fall-Pause statt Zugangsentzug." Korrigiert das bisherige (implizite) „freigeschaltet = fertig".
- **J10 (Dispatch):** Klarstellung, dass `frist_ueberschritten` ein regulärer Nicht-Empfangs-Grund ist (bereits FG3, jetzt real erreichbar).

## 7. Fehlerfälle

- **Docs hochgeladen, aber nicht geprüft** (`status='hochgeladen'`): Frist läuft weiter bis Admin prüft. → Der Reminder/das Banner müssen „in Prüfung" berücksichtigen (nicht „fehlt"), und der Admin-Task „prüfen" ist der Trigger. Frist ggf. beim Upload pausieren? **Entscheidung: Frist läuft weiter, aber Admin bekommt beim Upload einen Prüf-Task (existiert via `pflichtdokumente`-Flow); Banner zeigt „in Prüfung".**
- **Frist läuft an Wochenende/Feiertag ab:** akzeptiert (14 Tage sind großzügig).
- **Auto-Freigabe-Geo-Guard blockt:** unverändert (der SV wird gar nicht erst frei → kein Tier-2-Status).

## 8. Regression

- **9 `verifizierung_status`-Consumer** (`SvListeContent`, `BasicFreigabenContent`, `verifizierung-actions`, SV-Akte-Tabs, `gutachter/verifizierung/page`, `kunde/get-kontakt`, `admin/vertrieb/basis-freigaben-daten`): fast alle Anzeige. Umstellung Freischaltung `geprueft→ausstehend` **korrigiert** die Anzeige (zeigt echten Doc-Status). `kunde/get-kontakt.ts` prüfen (warum liest die Kunden-Kontakt-Sicht den Status — evtl. „verifizierter Gutachter"-Badge; darf nicht kaputtgehen).
- **Dispatch:** neue `frist_ueberschritten`-SVs fallen aus dem Pool — gewollt. Sicherstellen, dass genug SVs im Pool bleiben (nach Nachfrist, nicht sofort).
- **Bestehende `geprueft`-SVs mit echten Docs** (14 Rows haben `geprueft`-Docs): NICHT anfassen (Bestandsheilung schließt sie via `NOT EXISTS geprueft` aus).

## 9. Offene Entscheidung (Aaron)

**Bestands-Nachfrist-Timing:** (a) sofortige 14-Tage-Frist für die 9 SVs beim Deploy (System-Mail vom Cron), ODER (b) erst Aarons persönliche Vorab-Mail, Frist startet danach. Empfehlung: **(b)** — persönliche Ansprache vor Fall-Pause bei aktiven Partnern; ich setze die Frist erst auf Aarons Signal.

## 10. Testing / Regel-4

- **Unit:** `svDarfFaelleEmpfangen` (existiert), neue `freigebeBasicSvCore`-Verzweigung (Docs geprüft ja/nein → status), `tier2FristVerlaengern`.
- **Prod-Smoke (Regel 4):** Wegwerf-SV → freischalten → `verifizierung_status='ausstehend'`+Frist statt `geprueft` (DB-Assert) → Portal-Banner sichtbar → Admin-Liste zeigt Badge → `tier2Freigeben` nach Doc-Upload → `geprueft` → Banner weg. Frist-Ablauf via DB-Zeitmanipulation am Wegwerf-SV → Cron-Trigger → `frist_ueberschritten` → `svDarfFaelleEmpfangen=false` (DB-Assert). 0-Residue.
- **Journey-Smoke:** J8-Onboarding-Spec um den Tier-2-Frist-Schritt ergänzen.

## 11. Nicht in Scope (YAGNI)

- Eigenes `tier2_frist`-Mail-Template (optionaler Cleanup).
- Dedizierte Admin-Queue-Seite (erst wenn Liste-Filter nicht reicht).
- Getrennte Fristen pro Doc (Berufshaftpflicht vs. Gewerbe) — ein gemeinsamer Tier-2-Status genügt.
