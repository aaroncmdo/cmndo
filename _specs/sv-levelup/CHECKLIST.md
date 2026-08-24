# CHECKLIST · SV-LevelUp Vertriebsbereich

Abnahme je Welle. **Eine Welle gilt erst als fertig, wenn jeder Punkt abgehakt ist.**
Nach jeder Welle: Git Commit mit der Wellennummer im Betreff.

---

## Welle 0 · Kontext laden — kein Code

- [ ] `CONTEXT.md`, `CONTRACT.md`, `TESTDATA.json` vollständig gelesen
- [ ] Repo-Struktur geprüft: **Next.js oder Express?** Ergebnis notiert
- [ ] Bestätigt: `public.leads` ≠ `public.sv_leads` — die Verwechslung ist verstanden
- [ ] `gutachter.claimondo.de` und `gutachter_waitlist` als Vorbild angesehen
- [ ] `flow_links` angesehen — so läuft Token-Resolution in diesem Projekt
- [ ] Liste erstellt: welche Dateien werden angefasst, welche nicht
- [ ] **Kein Code geschrieben.** Ergebnis ist eine Zusammenfassung, sonst nichts

**Abbruchkriterium:** Wenn unklar ist, ob Next.js oder Express — nachfragen, nicht raten.

---

## Welle 1 · Datenbank und Rechte

- [ ] Migration angelegt: `levelup_checks`, `levelup_funnel`, `levelup_termine`, `levelup_events`
- [ ] Zwei Spalten auf `sv_leads` ergänzt, mit Kommentar
- [ ] RLS auf allen vier neuen Tabellen **aktiviert**
- [ ] Policies: Lesen nur für `admin`, `dispatch`, `leadbearbeiter`, `kundenbetreuer`
- [ ] **Keine INSERT-Policy für `anon`** — T-18 muss fehlschlagen
- [ ] Indizes: `(status, erstellt_am desc)`, `(sv_lead_id)`, `(check_id, ts)`
- [ ] Migration lokal eingespielt und wieder zurückgerollt — beides fehlerfrei
- [ ] `select` als anon auf `levelup_checks` liefert 0 Zeilen, kein Fehler

**Test:** T-18 · **Regression:** bestehende `sv_leads`-Policies unverändert, `select count(*) from leads` = 165

---

## Welle 2 · Öffentlicher Check — Zustände 1 bis 3

- [ ] Route `/check/[token]` rendert, Token wird server-side aufgelöst
- [ ] F-01 Check anlegen, Token 32 Zeichen, IP als SHA-256
- [ ] F-02 Prüfumfang mit **serverseitiger** Sperrlogik
- [ ] F-03 Messung starten, idempotent
- [ ] F-04 Fortschritt, höchstens alle 2 Sekunden
- [ ] Modus-Auswahl und Modulkacheln aus `mockup-levelup-v2.html` übernommen
- [ ] Fortschrittsleiste zeigt den aktuellen Schritt
- [ ] Sperrgründe stehen im Klartext auf der Kachel

**Tests:** T-01, T-02, T-03, T-05, T-06, T-22
**Der kritische:** T-02 — Module müssen zurückkommen, wenn die URL nachgetragen wird.
**Regression:** kein Zugriff auf `leads`, `faelle`, `claims`

---

## Welle 3 · Befund und Tresor — Zustand 4

- [ ] F-05 Befund ausliefern
- [ ] Score-Berechnung inklusive Teilbefund-Regel unter 60 Punkten
- [ ] **T-07 automatisiert:** `JSON.stringify(antwort).includes('massnahmen') === false`
- [ ] Validator: Befund ohne `quelle` oder `erhoben` wird verworfen und als Fehlstelle ausgegeben
- [ ] `wert: null` wird als „nicht erhoben — <grund>" gerendert, **nie** als 0-Balken
- [ ] Tresor zeigt nur Anzahl und Aufwand, keine Titel
- [ ] Befundansicht unterscheidet sich sichtbar zwischen `aufbau` und `bestand`

**Tests:** T-04, T-07, T-08, T-09
**T-07 ist ein Sicherheitstest.** Er muss im Testlauf mitlaufen, nicht nur einmal von Hand.

---

## Welle 4 · Termin, Lead und Funnel — Zustände 5 bis 7

- [ ] F-07 Slots, F-06 Termin, F-08 Funnel, F-09 Maßnahmen freigeben
- [ ] **Ohne Einwilligung kein Lead** — 400, kein `sv_leads`-Eintrag
- [ ] `consent_records` wird vor dem Lead geschrieben
- [ ] Dublettenprüfung über `normalized_name` + PLZ
- [ ] Telefonnummer in E.164, **nie** im Klartext geloggt
- [ ] `notification_events` mit `levelup.termin_gewuenscht` geschrieben
- [ ] F-09 liefert 403, solange kein Termin existiert
- [ ] `sv_leads.levelup_letzter_check_id` und `levelup_letzter_score` nachgezogen

**Tests:** T-10, T-11, T-13
**Regression:** `notification_deliveries` bekommt Einträge, bestehende Benachrichtigungen unverändert

---

## Welle 5 · Vertriebsansicht

- [ ] `/vertrieb` hinter der bestehenden Anmeldung, Cookie-Domain `.claimondo.de`
- [ ] F-10 Lead-Liste mit Filtern, anonyme Checks in eigener Ansicht
- [ ] F-11 Plan-Erzeugung, Sortierung Wirkung → Punkte
- [ ] F-12 Gesprächsleitfaden, drei schwächste Module
- [ ] F-13 Status pflegen
- [ ] Modulleiste filtert **alle drei** Ansichten gleichzeitig
- [ ] Kein Preis, keine Umsatzprognose — nirgends
- [ ] Der Block „Was Sie NICHT sagen" ist fest eingebaut
- [ ] Jede Maßnahme zeigt ihre Herkunft

**Tests:** T-14, T-15, T-16, T-17
**Regression:** kein bestehender Nutzer verliert Zugriff auf sein Portal

---

## Welle 6 · Wiederholmessung und Aufräumen

- [ ] F-14 Wiederholmessung mit Vergleich
- [ ] Vergleich nur bei identischer Modulauswahl, sonst Hinweis
- [ ] Cron: Checks ohne Lead nach 90 Tagen vollständig löschen
- [ ] Checks mit Lead auf `abgelaufen`, Befunde bleiben
- [ ] Eintrag in `cron_jobs_audit` (Muster ist im Projekt vorhanden)

**Tests:** T-19, T-20, T-21

---

## Abnahme gesamt

- [ ] Alle 22 Testfälle laufen grün
- [ ] `npm run build` grün, `tsc --noEmit` sauber
- [ ] RLS: als `anon` ist keine der vier neuen Tabellen les- oder schreibbar
- [ ] Als `sachverstaendiger` ist `/vertrieb` nicht erreichbar
- [ ] Ein vollständiger Durchlauf Weg A und einer Weg B von Hand geklickt
- [ ] Rechtlicher Hinweis „Hinweise, keine Rechtsberatung" auf jeder Ausgabe
- [ ] Keine Datei außerhalb der in CONTEXT.md §2 erlaubten Liste geändert

---

## Was ein Abbruch ist

Sofort stoppen und melden, wenn:

1. eine Änderung an `public.leads`, `faelle`, `claims` oder `gutachten` nötig scheint
2. der Test T-07 nicht automatisierbar ist
3. der Stack im Repo weder Next.js noch Express eindeutig ist
4. eine RLS-Policy `anon` Schreibrechte geben würde
5. eine Maßnahme ohne Herkunft ausgegeben werden müsste

---

## Welle 7 · Das Leck schließen, dann anreichern

**Reihenfolge ist Teil der Abnahme. Wer anreichert, bevor die Policy sitzt, hat die Welle nicht
bestanden — auch wenn alles andere funktioniert.**

- [ ] Geprüft, ob eine öffentliche Ansicht heute `sv_leads` mit `ist_aktiv = true` liest
- [ ] Ergebnis dieser Prüfung schriftlich festgehalten
- [ ] `sv_leads__b1sel` ersetzt: kein `anon`, kein `OR ist_aktiv = true`
- [ ] Gegenprobe: `select * from sv_leads` mit dem Publishable Key liefert **0 Zeilen**
- [ ] Gegenprobe: als `admin` angemeldet liefert dieselbe Abfrage 62 Zeilen
- [ ] Fünf neue Spalten auf `sv_leads`, Tabelle `levelup_anreicherung` angelegt, RLS `is_staff()`
- [ ] F-15 über alle 62 Leads gelaufen, Trefferquote notiert
- [ ] F-16 gelaufen, jede Änderung hat eine Zeile in `levelup_anreicherung`
- [ ] Ein Lauf per `lauf_id` vollständig zurückgedreht — und wieder eingespielt
- [ ] Kein bereits gefülltes Feld wurde überschrieben

**Tests:** T-23, T-24, T-25, T-26
**Regression:** `select count(*) from partner_leads` = 125, `leads` unverändert

---

## Welle 8 · Massenlauf

- [ ] F-17 legt Checks mit `sv_lead_id` sofort gesetzt an
- [ ] Leads ohne `website_url` werden mit Grund übersprungen, nicht stillschweigend
- [ ] Höchstens 5 gleichzeitig, mindestens 2 Sekunden je Domain
- [ ] Nur die fünf im Massenlauf zulässigen Module laufen — `gbp`, `wett`, `ads`, `kwg`, `kwm`
      erscheinen als **nicht erhoben mit Grund**, nicht als 0
- [ ] `kein_score = true` bei jedem Teilbefund unter 60 erhebbaren Punkten
- [ ] Ein fehlgeschlagener Check stoppt den Lauf nicht
- [ ] F-18 Lead-Detail zeigt Plan, Anreicherungs-Historie und Mailverlauf
- [ ] Der Plan im Lead-Detail wird **live gerechnet**, nicht aus `massnahmen` gelesen —
      nachgewiesen an einem Check ohne Termin

**Tests:** T-27, T-28, T-29
**Regression:** T-07 läuft weiter grün — die öffentliche Route hat sich nicht verändert

---

## Welle 9 · Präsentationslink

- [ ] Tabelle `levelup_praesentationen`, RLS `is_staff()` zum Schreiben
- [ ] F-19 nur für `is_staff()`, `gueltigTage` höchstens 90
- [ ] Zweiter Aufruf zu demselben Check gibt den bestehenden Link zurück
- [ ] `/plan/[token]` rendert ohne Anmeldung, `noindex` im Kopf
- [ ] Abgelaufener Link → Status 410 und sachliche Seite, keine Fehlermeldung
- [ ] Widerruf wirkt sofort
- [ ] `aufrufe` zählt hoch und ist im Lead-Detail sichtbar
- [ ] Kein Preis, keine Umsatzprognose, kein namentlicher Wettbewerber auf der Seite
- [ ] Der Check-Token lässt sich nicht in einen Plan-Token umrechnen und umgekehrt

**Tests:** T-30, T-31, T-32

---

## Welle 10 · Cold-Mail-Mechanik — gebaut, nicht scharf

- [ ] `sv_lead_id` auf `cold_mail_enrollments`, `-sends`, `-suppression`
- [ ] `lead_id` nullable, Constraint `num_nonnulls(lead_id, sv_lead_id) = 1` auf beiden Tabellen
- [ ] Bestandszeilen (1 Enrollment, 3 Sends) erfüllen den Constraint weiterhin
- [ ] Migration auf einem Branch eingespielt und zurückgerollt — beides fehlerfrei
- [ ] Drei Absenderspalten auf `cold_mail_sequenzen`
- [ ] Sequenz `SV-LevelUp Sichtbarkeit` angelegt, Rolle `sachverstaendiger`
- [ ] **`aktiv = false` und `auto_enroll = false`** — beide unverändert
- [ ] Vier Steps mit den Verzögerungen 0 / 4 / 7 / 14 Tagen
- [ ] Vorlagen als **Platzhalter** angelegt, Inhalt ausdrücklich offen
- [ ] Validator R-N: Vorlage ohne Herkunftsangabe oder Abmeldelink wird abgelehnt
- [ ] R-O: Suppression-Prüfung vor **jedem** Send, nicht nur beim Enrollment
- [ ] F-23 Abmeldung mit **einem Klick**, ohne Rückfrage
- [ ] Testlauf gegen eine eigene Adresse — nicht gegen einen echten Lead
- [ ] `DURCHSPRACHE.md` liegt dem Abnehmenden vor

**Tests:** T-33, T-34, T-35, T-36
**Abnahme dieser Welle heißt ausdrücklich nicht, dass gesendet werden darf.**

---

## Was in Welle 7 bis 10 ein Abbruch ist

Zusätzlich zu den bestehenden Abbruchgründen:

6. eine öffentliche Ansicht hängt an `sv_leads` mit `ist_aktiv = true` — melden, nicht umbauen
7. der `num_nonnulls`-Constraint scheitert an Bestandszeilen
8. eine Anreicherung müsste in `partner_leads` oder `leads` schreiben
9. `aktiv = true` oder `auto_enroll = true` steht auf der SV-Sequenz, ohne dass ein Mensch es
   gesetzt hat
10. eine Mailvorlage soll einen Score nennen, obwohl der Check ein Teilbefund ist
