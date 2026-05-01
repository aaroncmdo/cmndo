# CMM-32 SV-Walkthrough — Status & Open TODOs

**Stand:** 2026-04-30 02:14 (Aaron-Session, Branch `kitta/cmm-32-walkthrough-p2`)

Lebende Notiz für den SV-Fallakte-Walkthrough. Verschmilzt CMM-32 (Sub-Entity `auftraege`) mit dem visuellen Walkthrough-Polish den wir gerade auf `kitta/cmm-32-walkthrough-p2` fahren. Stand wird beim nächsten Sync hier nachgezogen.

---

## Was heute live auf der Branch ist

Branch: `kitta/cmm-32-walkthrough-p2` (basiert auf `main` nach Merge von PRs #410 + #411).

Commits (neueste zuerst):
- `4d57434f` Window-weite Dropzone für SV-Fallakte (uploadDatei kategorie='sonstiges')
- `6f618d0f` WeitereDokumenteCard `inline`-Mode (kein Card-in-Card im Dokumente-Tab)
- `b066844d` Tabs verteilen sich gleichmäßig (`flex-1`, kein Scroll)
- `70fd0de6` Stammdaten-Block größer skalieren (Fahrzeug-Panel 300px, Render 260px, Tabs `text-sm py-4`)
- `00496510` Stammdaten-Block über volle Seitenbreite (2-Spalten-Grid raus)
- `1d6871f4` Volle Breite + Dokumente konsolidiert
- `a8ba8bc5` Stammdaten-Block — Fahrzeug links, Tabs rechts (Aaron-Layout)
- `660e5e63` Stammdaten-Accordion als Inline-Tab

In Main bereits:
- `cb3ac870` View-Fix — `v_faelle_mit_aktuellem_termin` auf `SELECT f.*` (PR #411)
- `6af09111` Fahrzeug-Render + Hersteller-Logo-Fallback + NeuLeadDrawer (PR #410)

---

## Was funktioniert (verifiziert oder logisch klar)

**Daten-Pipeline Dispatch → Lead → Fall → Auftrag**
- `convertLeadToFall` mappt `lead.lackfarbe_code`, `kennzeichen`, `fahrzeug_hersteller`, `fahrzeug_modell` 1:1 in `faelle.*`
- `v_faelle_mit_aktuellem_termin` liefert seit View-Fix alle 57 vorher fehlenden Spalten via `SELECT f.*`
- `getFallForSv` (über die View) sieht jetzt `lackfarbe_code` etc. korrekt

**SV-Fallakte UI (visuell)**
- Stammdaten-Block: links Fahrzeug-Render + Modell + Kennzeichen + Farbe + Baujahr/FIN/Fahrbereit
- Rechts: 5 Tabs (Historie | Dokumente | Kunde | Gegner | Schaden), Standard-Tab Historie
- Dokumente-Tab enthält die volle WeitereDokumenteCard-Funktionalität (Kategorisierung Gutachten / Nachbesserung / Anlagen / Pflichtdokumente / Weitere + Upload-Button) ohne Card-Wrapper
- Volle Seitenbreite (max-w-7xl), nicht mehr im 400px-Sidebar

**Drop-Upload**
- `FallWindowDropzone` hört auf window-`dragover`/`drop`
- Drop irgendwo im Fenster → `uploadDatei(fallId, formData mit kategorie='sonstiges')` → `router.refresh()`
- Multi-File-Drop wird sequentiell hochgeladen, kein UI-Hinweis (Aaron-Spec)

**Auftrags-Cards (`/gutachter/auftraege`)**
- Fahrzeug-Render in Karte, Kennzeichen prominent, Lackfarbe wird durchgereicht
- Imagin → Clearbit-Logo → CarIcon Fallback-Kette

---

## Offene TODOs für CMM-32-Walkthrough

Stand der Linear-Tickets in der CMM-32-Strecke:

| Ticket | Status | Notiz |
|---|---|---|
| CMM-32a Schema (`auftraege` + `kanzlei_faelle`) | ✅ done | Migration live |
| CMM-32b Backfill | ✅ done | Bestehende Fälle in Sub-Entities |
| CMM-32c Loader-Lib + Claim-Resolver | ✅ done | |
| CMM-32d SV-Portal + Dispatch auf `auftraege` | ✅ done | |
| CMM-32e KB/Admin/Kanzlei auf `kanzlei_faelle` | ✅ done | inkl. Vollständigkeits-Check + Kanzleipaket-Freigabe |
| CMM-32f Kunde Claim-Stepper | ✅ done | |
| CMM-32g Routenverkettung in `findBestSV` | ⏳ pending | offen — Dispatch-Optimierung |
| CMM-32h Cleanup: alte Felder auf `faelle` deprecaten | ⏳ pending | für Phase 6 / `faelle` abspecken |
| CMM-32i Kanzlei-Fall-Lifecycle aktivieren | ✅ done | |
| CMM-32 Cron-Fallback `durchgefuehrt_am` | ✅ done | |

---

## Offene Walkthrough-Punkte (heute aufgekommen, noch nicht gelöst)

1. **CardEntity-Check für Vollständigkeits-Check** — pending in Linear (#47), bezieht sich auf KB-Vollständigkeits-Check für Kanzleipaket
2. **Routenverkettung in `findBestSV` (CMM-32g)** — Dispatch-Algorithmus soll bestehende Termine als Routen-Anker nehmen
3. **Geotracking auch beim Kunden** — Banner „Begutachtung läuft" erst wenn beide vor Ort sind
4. **Werden alle Daten in den `claim` geschrieben?** — Stand jetzt: nein, SV-View liest weiter aus `faelle`. Migration auf `claims`-as-SSoT ist Phase 3 + Phase 6 der CMM-Strecke und nicht Teil des Walkthroughs

---

## Nicht-CMM-32-Tickets, die im Hintergrund laufen

Auswahl der pending Tickets aus der Task-Liste, die den Walkthrough kreuzen können:

- CMM-16 — Kunden-Onboarding + Pflichtdaten-Banner-System
- CMM-30 — Kunde-Portal Phase 1c (Kalender, Nachbesichtigung, Chat, Profil)
- CMM-31 + CMM-31a–d — Self-Service-Lead-Anlage
- CMM-34 — Storage-Architektur: Dokumente am Claim statt am Fall
- CMM-35 — Onboarding-Wizard auf zentrale `PflichtdokumenteSection` migrieren

---

## Bekannte harte Regeln (siehe AGENTS.md)

1. Nie direkt auf `main` pushen — alles über PR
2. DDL nur über `npx supabase migration new` + `db push`, nicht über Management-API
3. Kein unbegleiteter Stash am Session-Ende

---

## Nächste sinnvolle Schritte

- Walkthrough-Feedback einsammeln und visuelle Punkte hier dokumentieren
- Dann PR `kitta/cmm-32-walkthrough-p2` → `main` aufmachen (Reviewer wählen)
- Danach CMM-32g (Routenverkettung) als nächste eigenständige Branch beginnen
