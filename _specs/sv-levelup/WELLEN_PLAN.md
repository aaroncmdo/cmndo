# WELLEN_PLAN · SV-LevelUp Vertriebsbereich

Sieben Wellen. Jede einzeln an Claude Code geben, danach testen, dann committen.
**Nie zwei Wellen in einem Prompt.**

Ablage: `_specs/sv-levelup/` mit `CONTEXT.md`, `CONTRACT.md`, `TESTDATA.json`, `CHECKLIST.md`.

---

## Welle 0 · Kontext laden — KEIN CODE

```
Lies diese vier Dateien vollständig, bevor du irgendetwas tust:
_specs/sv-levelup/CONTEXT.md
_specs/sv-levelup/CONTRACT.md
_specs/sv-levelup/TESTDATA.json
_specs/sv-levelup/CHECKLIST.md

Dann analysiere das bestehende Projekt und beantworte mir schriftlich:

1. STACK: Ist das ein Next.js-Projekt (App Router, Server Actions) oder Express? Zeig mir die
   Dateien, aus denen du das schließt. CONTEXT.md §1 sagt, dass die alte Konvention
   (Express/JWT/localStorage) veraltet sein könnte — prüf das.
2. AUTH: Wie läuft die Anmeldung heute? Wo wird profiles.rolle gelesen? Zeig mir die Stelle.
3. TOKEN-FLOWS: Zeig mir, wie flow_links und /flow/[token] aufgebaut sind. Genau so soll
   /check/[token] laufen.
4. SUBDOMAIN: Wie ist gutachter.claimondo.de deployt? Eigenes Projekt oder Route im Hauptprojekt?
5. DATEIEN: Liste auf, welche Dateien du für Welle 1 bis 6 anfassen wirst — und bestätige, dass
   public.leads, faelle, claims und gutachten NICHT dazugehören.
6. RISIKO: Nenne mir die drei Stellen, an denen du am ehesten etwas kaputt machen könntest.

SCHREIB KEINEN CODE. Antworte nur mit dieser Analyse.
```

---

## Welle 1 · Datenbank und Rechte

```
REFERENZ: CONTEXT.md §3 (Datenmodell), CHECKLIST.md Welle 1

Baue in dieser Reihenfolge:

A) Migration supabase/migrations/<datum>_levelup_basis.sql
   - Tabellen levelup_checks, levelup_funnel, levelup_termine, levelup_events
     exakt nach CONTEXT.md §3.3, inklusive aller CHECK-Constraints
   - zwei Spalten auf sv_leads nach §3.2, mit COMMENT
   - Indizes nach §3.3

B) RLS nach CONTEXT.md §3.4
   - alle vier Tabellen: enable row level security
   - SELECT für admin, dispatch, leadbearbeiter, kundenbetreuer
   - UPDATE für admin, dispatch, leadbearbeiter
   - KEINE INSERT-Policy für anon. Schreiben läuft ausschließlich über service_role.

C) TypeScript-Typen in lib/levelup/typen.ts
   - Messwert-Typ als diskriminierte Union:
     { quelle: string; erhoben: string } & (
       | { status:'ok'; wert: T }
       | { status:'nicht_erhebbar'; wert: null; grund: string } )
   - Die Modul-Registry mit den 13 Ids aus CONTEXT.md §6. Ids sind Vertragsbestandteil.

REGELN:
- Nur die in CONTEXT.md §2 erlaubten Dateien anfassen.
- public.leads NICHT anfassen. Das sind Schadenfälle von Endkunden, nicht SV-Leads.
- Bestehende sv_leads-Policies nicht verändern.

TESTS:
- Migration einspielen, zurückrollen, erneut einspielen — dreimal fehlerfrei
- T-18: als anon ein INSERT in levelup_checks versuchen → muss scheitern
- select count(*) from leads → muss weiterhin 165 liefern

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 2 · Öffentlicher Check, Zustände 1 bis 3

```
REFERENZ: CONTRACT.md F-01 bis F-04, mockup-levelup-v2.html, CHECKLIST.md Welle 2

Baue in dieser Reihenfolge:

A) Route app/(levelup)/check/[token]/page.tsx
   - Token server-side auflösen, genau wie flow_links es macht
   - ungültiger Token → 404, kein Hinweis worauf

B) Server Actions in check/[token]/actions.ts: F-01, F-02, F-03, F-04
   - F-02: Sperrlogik SERVERSEITIG erneut prüfen. Der Client ist nicht vertrauenswürdig.
     Ein Modul, das der Client schickt, das aber gesperrt ist, wird verworfen und in
     moduleVerworfen zurückgegeben.
   - Rate-Limit 5 Checks je IP-Hash je Stunde, Muster gfa_rate_limit

C) Oberfläche: Zustände 1 bis 3 aus mockup-levelup-v2.html
   - Modus-Karten, URL-Feld erscheint erst nach der Wahl
   - Modulkacheln mit Kippschalter, Bilanzleiste, Sperrgrund im Klartext auf der Kachel
   - Prüfliste mit wartet → läuft → fertig
   - Das Mockup ist funktionsfähiges HTML mit echter Logik. Übernimm Registry und
     Sperrlogik daraus, erfinde sie nicht neu.

WICHTIG — der Fehler aus der ersten Umsetzung:
Der Wunsch des Nutzers wird GETRENNT vom tatsächlich Messbaren gespeichert. Wer ein Modul
wählt und später die URL nachträgt, bekommt das Modul ZURÜCK. Nicht dauerhaft löschen.

TESTS: T-01, T-02, T-03, T-05, T-06, T-22 aus TESTDATA.json
T-02 ist der kritische. Führ ihn zuerst aus.

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 3 · Befund und Tresor, Zustand 4

```
REFERENZ: CONTRACT.md F-05, CONTEXT.md §8 (eiserne Regeln), CHECKLIST.md Welle 3

Baue in dieser Reihenfolge:

A) Validator lib/levelup/validator.ts
   - Ein Befund ohne quelle ODER ohne erhoben wird verworfen und als Fehlstelle ausgegeben
   - wert:null verlangt immer ein grund
   - wert:0 mit status 'nicht_erhebbar' ist ein Fehler, kein gültiger Zustand

B) F-05 Befund ausliefern
   - Score = round(istPunkte / punkteErhebbar * 100)
   - punkteErhebbar < 60 → keinScore=true, score=null, Anzeige "Teilbefund"
   - Tresor: nur Anzahl je Phase und Aufwandssumme

C) DER SICHERHEITSTEST — automatisiert, nicht von Hand:
   test('R-E: Befund enthält keine Maßnahmen', () => {
     const antwort = await befundLaden(token)
     expect(JSON.stringify(antwort)).not.toContain('massnahmen')
     expect(JSON.stringify(antwort)).not.toContain('massnahme')
   })
   Das Feld wird NICHT ERZEUGT. Nicht leer, nicht null, nicht unscharf. Auch keine
   Maßnahmen-Überschriften.

D) Befundansicht, je Modus unterschiedlich
   - aufbau: "Das Feld, in das Sie eintreten", Position "154. von 154"
   - bestand: "Wo Sie im Feld stehen", Gesamtscore
   - nicht erhobene Werte als "nicht erhoben — <grund>", NIE als Balken auf 0

TESTS: T-04, T-07, T-08, T-09

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 4 · Termin, Lead und Funnel, Zustände 5 bis 7

```
REFERENZ: CONTRACT.md F-06 bis F-09, CONTEXT.md §4 und §5, CHECKLIST.md Welle 4

Baue in dieser Reihenfolge:

A) F-07 Slots, dann F-06 Termin
   Die Reihenfolge in F-06 ist verbindlich:
   1. einwilligung !== true → 400. OHNE EINWILLIGUNG KEIN LEAD.
   2. consent_records schreiben
   3. Dublettenprüfung nach CONTEXT.md §5 (normalized_name + PLZ, 10 km)
   4. sv_leads verknüpfen oder anlegen, quelle='sv-levelup'
   5. levelup_checks.sv_lead_id setzen, sv_leads denormalisiert nachziehen
   6. levelup_termine anlegen
   7. notification_events mit typ='levelup.termin_gewuenscht'

B) F-08 Funnel — nur zulässig, wenn sv_lead_id gesetzt ist

C) F-09 Maßnahmen freigeben — 403, solange kein Termin existiert.
   Das ist der EINZIGE Endpunkt, der Maßnahmen ausliefert.

D) Zustände 5 bis 7 aus dem Mockup

REGELN:
- Telefonnummer in E.164 normalisieren, NIE im Klartext loggen
- IP nur als SHA-256-Hash
- notification_events nutzen, kein eigener Mailversand

TESTS: T-10, T-11, T-13

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 5 · Vertriebsansicht

```
REFERENZ: CONTRACT.md F-10 bis F-13, mockup-levelup-auswertung.html, CHECKLIST.md Welle 5

Baue in dieser Reihenfolge:

A) app/(levelup)/vertrieb/page.tsx — Lead-Liste
   - hinter der BESTEHENDEN Anmeldung, kein eigenes Login-System
   - Cookie-Domain .claimondo.de, damit die Sitzung geteilt wird
   - Rollen admin, dispatch, leadbearbeiter, kundenbetreuer
   - anonyme Checks (ohne sv_lead_id) in einer eigenen Ansicht — das ist Trichter-Statistik

B) vertrieb/[checkId]/page.tsx mit drei Reitern aus mockup-levelup-auswertung.html:
   Gesamtauswertung · Maßnahmenplan · Verkaufsgespräch
   - Die Modulleiste oben filtert ALLE DREI gleichzeitig
   - Abgeschaltetes Modul verschwindet überall. Es gibt keine Ansicht, die mehr zeigt
     als gemessen wurde.

C) F-11 Plan-Erzeugung
   - Sortierung innerhalb der Phase: Wirkung absteigend, DANN Punkte absteigend
   - NICHT nach Aufwand sortieren
   - Jede Maßnahme trägt Herkunft "Modul <Name> · <Messung>". Ohne Herkunft nicht ausgeben.
   - Kopfzeile: Maßnahmen, Punkte, Aufwand in Stunden, Zeitraum. KEIN PREIS.

D) F-12 Gesprächsleitfaden
   - drei Module mit schlechtestem ist/maximum, Module ohne Punkte zählen 0,5
   - Minutenplan, Bausteine, Einwände, Phase-1-Kacheln, Nachfassplan
   - der Block "Was Sie NICHT sagen" ist fest eingebaut, nicht optional

E) F-13 Status pflegen

REGELN:
- Kein Preis, keine Umsatzprognose, nirgends (R-D)
- Textfarbe auf dunklen Flächen ausdrücklich setzen — die globale Regel
  b { color: var(--ink) } macht Zahlen auf schwarzen Balken unsichtbar

TESTS: T-14, T-15, T-16, T-17

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 6 · Wiederholmessung und Aufräumen

```
REFERENZ: CONTRACT.md F-14, CHECKLIST.md Welle 6

Baue in dieser Reihenfolge:

A) F-14 Wiederholmessung
   - neuer Check mit identischem modus, module_gewaehlt, website_url, Standort
   - sv_lead_id sofort übernehmen
   - nach fertig: Vergleich je Befund gegen den Vorgänger
   - Vergleich NUR bei identischer Modulauswahl, sonst Hinweis statt Delta

B) Cron: abgelaufene Checks aufräumen
   - ohne sv_lead_id und älter als 90 Tage → vollständig löschen, inklusive befunde
   - mit sv_lead_id → status='abgelaufen', Befunde bleiben als Vorgangshistorie
   - Lauf in cron_jobs_audit protokollieren, Muster ist im Projekt vorhanden

C) In der Vertriebsansicht: Knopf "Erneut messen" plus Verlaufsansicht

TESTS: T-19, T-20, T-21

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Notfall-Prompts

### Wenn Claude Code zu viel ändert
```
STOPP. Du hast Dateien geändert, die nicht in CONTEXT.md §2 stehen.
Zeig mir git diff --stat. Mach alle Änderungen rückgängig außer den erlaubten Dateien.
```

### Wenn public.leads angefasst wurde
```
STOPP SOFORT. public.leads sind Schadenfälle von Endkunden, NICHT SV-Leads.
Mach jede Änderung an dieser Tabelle rückgängig. SV-LevelUp schreibt ausschließlich
in sv_leads und die levelup_*-Tabellen.
```

### Wenn Maßnahmen im Befund auftauchen
```
Regel R-E ist verletzt. Lies CONTRACT.md F-05 nochmal.
Das Feld massnahmen wird im Zustand fertig NICHT ERZEUGT — nicht leer, nicht null,
nicht unscharf. Zeig mir die Stelle, an der es entsteht, und entferne sie.
Dann lass den Test T-07 laufen.
```

### Wenn eine Zahl ohne Quelle auftaucht
```
Regel R-A ist verletzt. Jede Zahl trägt quelle und erhoben.
Zeig mir alle Stellen, an denen ein Befund ohne diese beiden Felder entsteht.
Der Validator aus Welle 3 muss sie abfangen.
```

### Wenn RLS zu offen ist
```
Prüfe: Kann anon eine der levelup_*-Tabellen lesen oder schreiben?
Wenn ja, ist die Policy falsch. Schreiben läuft ausschließlich über service_role
in Server Actions. Zeig mir alle Policies mit \\dp und korrigiere.
```

### Wenn der Stack unklar ist
```
Antworte mir mit den fünf Dateien, aus denen du den Stack ableitest, und deiner
Einschätzung. Baue nichts, bevor ich bestätigt habe.
```

---

## Reihenfolge in einem Satz

Datenbank → öffentlicher Check → Befund mit Tresor → Termin und Lead → Vertriebsansicht →
Wiederholmessung. **Der Lead entsteht in Welle 4, nicht früher** — und das ist keine technische,
sondern eine datenschutzrechtliche Entscheidung.

---
---

# Teil 2 · Bestandsleads · Wellen 7 bis 10

**Neu in Fassung 3.0.** Diese vier Wellen bauen auf Teil 1 auf und setzen voraus, dass die Wellen 1
bis 6 abgenommen sind.

> **Eine Warnung vorweg, die für alle vier Wellen gilt:** In `public.sv_leads` stehen **62 echte
> Datensätze**. Das ist kein leerer Tisch mehr. Jeder `update` ohne `where` trifft echte
> Vertriebsdaten. Vor jedem Schreibpfad: Zähler notieren, danach gegenprüfen.

---

## Welle 7 · Das Leck schließen, dann anreichern

```
Lies CONTEXT.md Kapitel 9 und 10 sowie CONTRACT.md F-15 und F-16 vollständig, bevor du anfängst.

REFERENZ: F-15, F-16 · CONTEXT §9, §10 · CHECKLIST Welle 7

REIHENFOLGE — die ist nicht verhandelbar:

A) ZUERST PRÜFEN, NICHT ÄNDERN.
   Durchsuche das Repo nach jedem Lesezugriff auf sv_leads. Finde heraus, ob irgendeine
   öffentliche Seite (Gutachtersuche, Karte, Landingpage) auf sv_leads mit ist_aktiv = true
   liest — mit dem anon-Key, ohne Anmeldung.
   Schreib das Ergebnis als Liste auf. Wenn du eine solche Stelle findest: STOPP und melde dich.
   Baue sie nicht um.

B) Erst wenn A sauber ist: Policy sv_leads__b1sel ersetzen.
   Neu: nur to authenticated, nur is_staff() oder rolle = 'admin'.
   Das OR ist_aktiv = true fällt weg. anon fällt weg.
   Gegenprobe beide Richtungen: mit anon-Key 0 Zeilen, als admin 62 Zeilen.

C) Migration: fünf Spalten auf sv_leads (website_url, website_gefunden, website_sicherheit,
   kontakt_quelle, angereichert_am) und die Tabelle levelup_anreicherung.
   RLS auf levelup_anreicherung mit is_staff(). Keine anon-Policy.

D) F-15 bauen: Website zu einem Lead finden. robots.txt vor jedem Abruf. Höchstens 5 Kandidaten.
   Kein Treffer ist ein gültiges Ergebnis — null mit Grund, niemals geraten.

E) F-16 bauen: Impressum lesen, direkt in sv_leads schreiben, jede Änderung als Zeile in
   levelup_anreicherung mit quelle_url und sicherheit.
   Ein bereits gefülltes Feld wird NICHT überschrieben. Nur Leerstellen.

F) Rückwärtsgang bauen: eine Funktion, die alle Änderungen einer lauf_id zurückdreht.

REGELN:
- Du darfst schreiben: sv_leads (nur die leeren Felder), levelup_anreicherung
- Du darfst NICHT schreiben: partner_leads, leads, faelle, claims, gutachten
- robots.txt gilt. Kein Captcha-Umgehen. Keine Proxys. Keine gekauften Listen.
- Nur die Pfade /impressum, /kontakt, /imprint, /legal-notice. Kein Vollcrawl.

TESTS: T-23, T-24, T-25, T-26
Der wichtigste ist T-23: mit dem Publishable Key muss select auf sv_leads 0 Zeilen liefern.
Wenn dieser Test rot ist, ist die Welle nicht fertig, egal wie gut die Anreicherung läuft.

REGRESSION: select count(*) from partner_leads = 125. leads unverändert.

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
Ausnahme: Schritt A. Wenn dort eine öffentliche Ansicht auftaucht, melde dich sofort.
```

---

## Welle 8 · Massenlauf und Lead-Detail

```
REFERENZ: F-17, F-18 · CONTRACT „Der Massenlauf kann nicht alle Module" · CHECKLIST Welle 8

REIHENFOLGE:

A) F-17: Massenlauf. Je Lead ein levelup_checks mit modus='bestand' und sv_lead_id SOFORT gesetzt.
   Der Lead existiert bereits — hier gilt die Regel „Lead entsteht erst bei F-06" NICHT.
   Das ist der einzige Weg, auf dem ein Check mit gesetztem sv_lead_id beginnt.

B) Die Modulsperre: Nur web, seo, ux, verz, volumen laufen automatisiert.
   gbp, wett, ads, kwg, kwm werden als „nicht erhoben" mit Grund eingetragen.
   NIEMALS als 0. Das ist Regel B, und sie ist der häufigste Fehler in diesem Projekt.

C) Drosselung: höchstens 5 Checks gleichzeitig, mindestens 2 Sekunden zwischen zwei Abrufen
   derselben Domain. Ein Fehler stoppt den Lauf nicht.

D) F-18: Lead-Detail. Lead, Anreicherungs-Historie, alle Checks, Mailverlauf, Präsentationslinks.
   Der Maßnahmenplan wird über F-11 LIVE gerechnet.
   Lies ihn NICHT aus levelup_checks.massnahmen — die Spalte ist bis F-09 leer,
   und genau vor dem Verkaufsgespräch brauchst du den Plan.

REGELN:
- Kein Zugriff auf Google-Endpunkte im Serverprozess. R-F1 gilt unverändert.
- Jeder Befund trägt quelle und erhoben. Ohne beides wird er verworfen.
- kein_score = true, sobald weniger als 60 Punkte erhebbar waren.

TESTS: T-27, T-28, T-29
REGRESSION: T-07 muss weiter grün sein. Die öffentliche Route hast du nicht angefasst.

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 9 · Präsentationslink

```
REFERENZ: F-19, F-20 · CONTEXT §12 · CHECKLIST Welle 9

REIHENFOLGE:

A) Tabelle levelup_praesentationen. gueltig_bis ist not null mit Vorgabe 30 Tage.
   Ein Link ohne Ablaufdatum darf nicht entstehen können — das ist R-P.

B) F-19: Link erzeugen. Nur is_staff(). Token 32 Zeichen aus crypto.randomBytes,
   nicht aus Math.random, nicht aus der checkId abgeleitet.
   Existiert schon ein gültiger Link zu diesem Check, gib ihn zurück statt einen zweiten zu bauen.

C) F-20: Route /plan/[token]. Kein Login. noindex und nofollow im Kopf.
   Abgelaufen oder widerrufen → Status 410 mit einer sachlichen Seite.
   Keine Fehlermeldung, keine Fehlerseite — der Empfänger hat nichts falsch gemacht.

D) Gestaltung: SV-LevelUp-Design aus mockup-levelup-auswertung.html, Ansicht „Maßnahmenplan".
   Phasen, Wirkung, Aufwand in Stunden, Herkunft je Maßnahme.
   Kein Preis. Keine Umsatzprognose. Kein Wettbewerber mit Namen.
   Der Hinweis „Hinweise, keine Rechtsberatung" steht auf der Seite.

E) Widerruf und Zähler im Lead-Detail sichtbar machen. aufrufe ist ein Kaufsignal.

REGELN:
- Der Plan-Token kommt aus levelup_praesentationen, NIE aus levelup_checks.token.
- Aus dem einen darf sich der andere nicht ableiten lassen. In keine Richtung.
- T-07 bleibt unverändert scharf. Diese Route ist eine bewusste Ausnahme von Regel E,
  die öffentliche Check-Route ist es weiterhin nicht.

TESTS: T-30, T-31, T-32

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist.
```

---

## Welle 10 · Cold-Mail — bauen, nicht scharfschalten

```
Lies DURCHSPRACHE.md, bevor du anfängst. Diese Welle endet bewusst vor dem ersten Versand.

REFERENZ: F-21, F-22, F-23 · CONTEXT §11 · CHECKLIST Welle 10

REIHENFOLGE:

A) Migration auf die drei bestehenden cold_mail-Tabellen:
   sv_lead_id ergänzen, lead_id nullable machen,
   check (num_nonnulls(lead_id, sv_lead_id) = 1) auf enrollments und sends.
   ACHTUNG: Das sind BESTEHENDE Tabellen mit Daten (1 Enrollment, 3 Sends aus der SMOKE-Demo).
   Erst auf einem Branch. Prüfe, dass die Bestandszeilen den Constraint erfüllen,
   BEVOR du ihn produktiv setzt. Wenn nicht: STOPP und melde dich.

B) Drei Absenderspalten auf cold_mail_sequenzen.
   Werte: absender_email = 'aaron@sv-levelup.claimondo.de',
          absender_name = 'Aaron Sprafke', antwort_an = gleich.

C) Sequenz anlegen: rolle='sachverstaendiger', name='SV-LevelUp Sichtbarkeit',
   aktiv=false, auto_enroll=false.
   DU SETZT DIESE BEIDEN FLAGS NICHT AUF TRUE. Nicht am Ende, nicht zum Testen, nie.

D) Vier Steps: delay_tage 0, 4, 7, 14 mit den Bedingungen aus CONTEXT §11.3.
   Vier Vorlagen als PLATZHALTER. Schreib keine fertigen Verkaufstexte —
   die Inhalte werden in der Durchsprache festgelegt.
   Jede Platzhalter-Vorlage enthält aber bereits Herkunftsangabe und Abmeldelink,
   damit der Validator geprüft werden kann.

E) F-21 Aufnahme, F-22 Versand-Tick, F-23 Abmeldung.
   Validator R-N vor jedem Send: Herkunftsangabe und Abmeldelink vorhanden, sonst verwerfen.
   Prüfung R-O gegen cold_mail_suppression vor JEDEM Send, nicht nur beim Enrollment.
   F-23 ist EIN Klick. Keine Rückfrage, kein Formular, keine Anmeldung.

F) Testlauf ausschließlich gegen eine eigene Adresse. Niemals gegen einen der 62 Leads.

REGELN:
- Keine Mail an eine echte Lead-Adresse in dieser Welle.
- body_snapshot wird immer gespeichert.
- Versandfenster werktags 9–17 Uhr Europe/Berlin, höchstens 20 je Lauf, 40 am Tag.
- Eine Antwort setzt das Enrollment auf 'geantwortet' und stoppt die Sequenz.

TESTS: T-33, T-34, T-35, T-36
T-36 ist die Abnahme dieser Welle: aktiv=false, auto_enroll=false, gesendete Mails an Leads = 0.

Arbeite autonom. Wenn ein Fehler auftritt, fixe ihn selbst.
Melde dich erst wenn alles implementiert und getestet ist —
und melde ausdrücklich, dass die Sequenz kalt ist.
```

---

## Notfall-Prompts für Teil 2

```
### Wenn die Anreicherung falsche Adressen geschrieben hat:
Dreh den Lauf über die lauf_id zurück. Alle Zeilen aus levelup_anreicherung mit dieser
lauf_id, Feld für Feld auf wert_vorher. Lösche nichts aus dem Log.

### Wenn der Constraint an Bestandszeilen scheitert:
STOPP. Setz den Constraint nicht mit NOT VALID durch. Zeig mir die Zeilen,
die ihn verletzen, und warte.

### Wenn eine Mail rausgegangen ist, die nicht rausgehen sollte:
Setz die Sequenz sofort auf aktiv=false. Trag die betroffenen Adressen in
cold_mail_suppression ein. Zeig mir alle cold_mail_sends der letzten 24 Stunden
mit body_snapshot.

### Wenn du versucht bist, aktiv=true zu setzen, weil sonst nichts passiert:
Das ist beabsichtigt. Die Sequenz soll kalt bleiben. Melde dich stattdessen.
```
