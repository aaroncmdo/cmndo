# CONTRACT · SV-LevelUp Vertriebsbereich

Jede Funktion als **INPUT → AKTION → ERGEBNIS**. Was hier nicht steht, wird nicht gebaut.

---

## Öffentlicher Teil · `sv-levelup.claimondo.de`

### F-01 · Check anlegen

**INPUT** `{ modus: 'aufbau'|'bestand', websiteUrl?: string, ort?: string, plz?: string }`
**AKTION**
1. Token erzeugen: 32 Zeichen aus `[A-Za-z0-9_-]`, kryptografisch zufällig.
2. Ort auflösen → `standort_lat/lng` (bestehende `plz_geo`-Tabelle oder Geocoding).
3. `levelup_checks` anlegen mit `status='neu'`, `module_gewaehlt='{}'`, IP als SHA-256-Hash.
4. `levelup_events` schreiben: `typ='modus_gewaehlt'`.

**ERGEBNIS** `{ ok: true, token: string }` · Weiterleitung auf `/check/<token>`

**Regeln**
- Kein `sv_leads`-Eintrag. Kein Personenbezug.
- Bei ungültiger URL: Feld bleibt leer, kein Fehler — Weg A funktioniert ohne Website.
- Rate-Limit: 5 Checks je IP-Hash je Stunde (Vorbild `gfa_rate_limit`).

---

### F-02 · Prüfumfang setzen

**INPUT** `{ token: string, moduleGewaehlt: string[] }`
**AKTION**
1. Token auflösen, `status` muss `neu` sein, sonst 409.
2. **Sperrlogik serverseitig erneut prüfen** — der Client ist nicht vertrauenswürdig:
   - Modul nicht für `modus` vorgesehen → verwerfen
   - Modul braucht `url` und `website_url` ist leer → verwerfen
   - Modul braucht Profil und `modus='aufbau'` → verwerfen
3. Bereinigte Liste in `module_gewaehlt` speichern.
4. `levelup_events`: `typ='umfang_bestaetigt'`, `payload={module, verworfen}`.

**ERGEBNIS** `{ ok: true, moduleAkzeptiert: string[], moduleVerworfen: string[], punkteErhebbar: number }`

**Regeln**
- Leere Auswahl → 400 mit `{ error: 'kein_modul' }`.
- `punkte_erhebbar` = Summe der Punkte der akzeptierten Module (Module 11–13 zählen 0).

---

### F-03 · Messung starten

**INPUT** `{ token: string }`
**AKTION**
1. `status` → `laeuft`, `levelup_events`: `messung_gestartet`.
2. Worker anstoßen (Warteschlange über `status`, wie im bestehenden Projekt).
3. Der Worker ruft je Modul die Messmaschine und schreibt inkrementell in `befunde`.

**ERGEBNIS** `{ ok: true, status: 'laeuft' }`

**Regeln**
- Idempotent: zweiter Aufruf bei `status='laeuft'` gibt denselben Zustand zurück, startet nichts neu.
- Zeitgrenze 10 Minuten → `status='fehler'`, `fehler_text` gesetzt.

---

### F-04 · Messfortschritt abfragen

**INPUT** `{ token: string }`
**AKTION** Status und je Modul `wartet|laeuft|fertig|fehler` aus `befunde` ableiten.
**ERGEBNIS**
```json
{ "status":"laeuft", "module":[{"id":"wett","zustand":"fertig"},{"id":"verz","zustand":"laeuft"}] }
```
**Regeln** Höchstens alle 2 Sekunden abfragen. Keine Befunddaten in dieser Antwort.

---

### F-05 · Befund ausliefern — **die Regel-E-Funktion**

**INPUT** `{ token: string }`
**AKTION**
1. Token auflösen, `status` muss `fertig` sein.
2. Aus `befunde` das Antwortobjekt bauen: **je Modul nur Befunde, Punkte und Fehlstellen.**
3. Score berechnen: `score = round(istPunkte / punkteErhebbar * 100)`.
   **Ist `punkte_erhebbar < 60`, wird `kein_score=true` gesetzt und `score` bleibt `NULL`.**
4. Tresor-Angaben bauen: nur **Anzahl** der Maßnahmen je Phase und die Aufwandssummen.
5. `levelup_events`: `tresor_gesehen`.

**ERGEBNIS**
```json
{ "modus":"aufbau", "score":null, "keinScore":true, "punkteErhebbar":42,
  "module":[{"id":"wett","punkte":9,"maximum":16,"befunde":[…],"fehlstellen":[…]}],
  "tresor":{"anzahl":27,"phasen":[{"nr":1,"anzahl":9,"aufwand":"14 h"}]} }
```

**Regeln — verbindlich**
- **Das Feld `massnahmen` existiert in dieser Antwort nicht.** Nicht leer, nicht `null`, nicht
  unscharf. Es wird nicht erzeugt. Auch keine Maßnahmen-Überschriften.
- Jeder Befund trägt `quelle` und `erhoben`. Ein Befund ohne beides wird verworfen und als
  Fehlstelle ausgegeben.
- `wert: null` bedeutet „nicht erhoben" und trägt immer ein `grund`. Nie `0` als Ersatz.

---

### F-06 · Termin wählen — **hier entsteht der Lead**

**INPUT** `{ token: string, slotStart: string (ISO), telefon: string, einwilligung: true }`
**AKTION**
1. `einwilligung !== true` → 400. Ohne Einwilligung kein Lead.
2. `consent_records` schreiben: Zweck „SV-LevelUp Beratungstermin", Zeitpunkt, IP-Hash.
3. **Dublettenprüfung** nach CONTEXT §5.
4. Treffer → bestehenden `sv_leads`-Datensatz verknüpfen und `telefon` ergänzen, wenn leer.
   Kein Treffer → `sv_leads` anlegen: `name` aus Firma oder Domain, `quelle='sv-levelup'`,
   `warteliste_status='neu'`, `ist_aktiv=true`, `lat/lng` aus dem Check.
5. `levelup_checks.sv_lead_id` setzen, `sv_leads.levelup_letzter_check_id` und
   `levelup_letzter_score` denormalisiert nachziehen.
6. `levelup_termine` anlegen mit `status='gewuenscht'`.
7. `notification_events` schreiben: `typ='levelup.termin_gewuenscht'` — der bestehende Worker
   verteilt an die Vertriebsrolle.
8. `levelup_events`: `termin_gewaehlt`.

**ERGEBNIS** `{ ok: true, terminId: uuid, leadId: uuid }`

**Regeln**
- Telefonnummer wird normalisiert (E.164) und **nie** im Klartext geloggt.
- Ein Check erzeugt höchstens einen Lead. Zweiter Aufruf aktualisiert den Termin.
- Slot muss in der Zukunft liegen und aus der Slot-Liste stammen (F-07).

---

### F-07 · Freie Slots liefern

**INPUT** `{ token: string }`
**AKTION** Sechs nächste freie Termine aus der bestehenden Terminlogik, Werktage 08:00–18:00.
**ERGEBNIS** `[{ start:"2026-08-14T09:30:00+02:00", label:"Do · 09:30" }]`
**Regeln** Keine Belegung reservieren — erst F-06 bucht.

---

### F-08 · Funnel speichern

**INPUT** `{ token, jahreErfahrung, kiNutzung, marketingPartner }`
**AKTION** `levelup_funnel` upsert; `sv_leads.jahre_erfahrung` nachziehen, wenn dort leer.
`levelup_events`: `funnel_fertig`.
**ERGEBNIS** `{ ok: true }`
**Regeln** Nur zulässig, wenn `sv_lead_id` gesetzt ist — also nach F-06.

---

### F-09 · Maßnahmen freigeben

**INPUT** `{ token: string }`
**AKTION**
1. Prüfen: existiert ein `levelup_termine`-Eintrag zu diesem Check? Sonst 403.
2. Plan aus `befunde` ableiten (F-11) und in `massnahmen` speichern.
3. `levelup_events`: `plan_gesendet`.

**ERGEBNIS** der vollständige Plan, gruppiert nach Phase.
**Regeln** Das ist der **einzige** Endpunkt, der Maßnahmen ausliefert.

---

## Vertriebsteil · `/vertrieb` (Anmeldung nötig)

### F-10 · Lead-Liste

**INPUT** `{ filter?: {status?, modus?, vonDatum?, bisDatum?, nurMitTermin?} , sort?, seite? }`
**AKTION** `levelup_checks` join `sv_leads` join `levelup_termine`, RLS greift.
**ERGEBNIS**
```json
[{ "checkId":"…","name":"Sachverständigenbüro Musterwerk","ort":"Münster","modus":"bestand",
   "score":31,"keinScore":false,"module":9,"status":"fertig",
   "termin":"2026-08-14T09:30:00+02:00","terminStatus":"gewuenscht",
   "erstelltAm":"2026-08-13T14:22:00+02:00" }]
```
**Regeln**
- Nur Rollen `admin`, `dispatch`, `leadbearbeiter`, `kundenbetreuer`.
- Checks **ohne** `sv_lead_id` erscheinen in einer eigenen Ansicht „anonyme Checks" — sie sind
  Trichter-Statistik, keine Leads.

---

### F-11 · Maßnahmenplan erzeugen

**INPUT** `{ befunde: jsonb, moduleGewaehlt: string[] }`
**AKTION**
1. Für jedes gewählte Modul die hinterlegten Maßnahmen ziehen.
2. Jede Maßnahme trägt: `titel`, `begruendung`, `aufwand`, `wirkung`, `punkte`, `herkunft`, `phase`.
3. Sortierung innerhalb der Phase: **Wirkung absteigend, dann Punkte absteigend.** Nicht nach Aufwand.
4. Summen bilden: Anzahl, Punkte, Aufwand in Stunden, Zeitraum.

**ERGEBNIS**
```json
{ "summe":{"anzahl":27,"punkte":72,"aufwandStunden":89,"zeitraum":"12 Wochen"},
  "phasen":[{"nr":1,"name":"Fundament","zeitraum":"Woche 1 – 4","massnahmen":[…]}] }
```

**Regeln**
- **Kein Preis. Keine Umsatzprognose.** Aufwand in Stunden, damit der Sachverständige selbst rechnet.
- Jede Maßnahme trägt `herkunft` im Format `Modul <Name> · <Messung>`. Ohne Herkunft wird sie
  nicht ausgegeben.
- Abgeschaltetes Modul → seine Maßnahmen erscheinen nicht. Nirgends.

---

### F-12 · Gesprächsleitfaden erzeugen

**INPUT** `{ checkId: uuid }`
**AKTION**
1. Die drei Module mit dem **schlechtesten Verhältnis** `ist/maximum` wählen (Module ohne Punkte
   zählen mit 0,5 als neutral).
2. Je Modul den Gesprächsbaustein bauen: Zahl, Wortlaut, Rückfrage, Einwand mit Antwort.
3. Minutenplan mit den Modul-Zahlen füllen.
4. Phase-1-Maßnahmen als Kachelreihe.

**ERGEBNIS** `{ zahlenImGespraech: n, lage: string, bausteine: [...], phase1: [...], einwaende: [...] }`

**Regeln**
- Reihenfolge im Gespräch: **erst das Feld, dann seine Position.** Nie umgekehrt.
- Es werden **nur Phase-1-Maßnahmen** gezeigt. Der Rest geht per PDF.
- Die drei verbotenen Sätze (Auftragsprognose, „Konkurrenz macht das schon", Ranking-Garantie)
  stehen als fester Textblock in der Ansicht.

---

### F-13 · Lead-Status pflegen

**INPUT** `{ checkId, terminStatus?, notiz?, betreuerId? }`
**AKTION** `levelup_termine` und `sv_leads.notizen` aktualisieren, `levelup_events` schreiben.
**ERGEBNIS** `{ ok: true }`
**Regeln** Nur `admin`, `dispatch`, `leadbearbeiter`. Jede Änderung erzeugt ein Event.

---

### F-14 · Wiederholmessung

**INPUT** `{ checkId: uuid }`
**AKTION**
1. Neuen Check anlegen mit **identischem** `modus`, `module_gewaehlt`, `website_url`, Standort.
2. `sv_lead_id` sofort übernehmen — der Lead existiert ja schon.
3. Nach `fertig`: Vergleich gegen den Vorgänger je Befund bilden.

**ERGEBNIS** `{ neuerCheckId: uuid, veraenderungen: [{modul, feld, vorher, nachher, delta}] }`

**Regeln**
- Vergleich nur zwischen Checks mit **derselben Modulauswahl**. Sonst kein Delta, sondern Hinweis.
- Das ist der stärkste Nachfassgrund: Wer nichts getan hat, sieht es schwarz auf weiß.

---

## Zustandsautomat `levelup_checks.status`

```
        F-01                F-03              Worker fertig
  ──────────────► neu ──────────────► laeuft ──────────────► fertig
                   │                    │                       │
                   │ F-02 (bleibt neu)  │ Zeitgrenze/Abbruch    │ 90 Tage
                   ▼                    ▼                       ▼
                  neu                 fehler                abgelaufen
```

**Erlaubte Übergänge:** `neu→laeuft`, `laeuft→fertig`, `laeuft→fehler`, `fehler→laeuft` (Neuversuch),
`fertig→abgelaufen`.
**Verbotene Übergänge:** alles andere. `fertig→laeuft` ist **nicht** erlaubt — dafür gibt es F-14.

---

## Bestandsleads · Anreicherung, Massenlauf, Ansprache

> Alles in diesem Abschnitt läuft **hinter der Anmeldung** und wird von einem Menschen ausgelöst.
> Nichts davon ist über die öffentliche Check-Route erreichbar.

### F-15 · Website zu einem Lead finden

**INPUT** `{ svLeadId: uuid }`
**AKTION**
1. Kandidaten bilden aus `firma` + `ort` (Domainraten) und aus Verzeichnistreffern.
2. Je Kandidat: robots.txt lesen und befolgen (R-G), Startseite abrufen, `<title>`, Impressum-Link
   und Ortsnennung vergleichen.
3. Sicherheit 0..100 vergeben:
   - 90+ Firmenname im Impressum wörtlich und PLZ stimmt
   - 70–89 Firmenname sinngemäß oder nur Ort stimmt
   - unter 70 nur Namensähnlichkeit
4. Bester Treffer → `website_url`, `website_gefunden`, `website_sicherheit`, Zeile in
   `levelup_anreicherung`.

**ERGEBNIS** `{ url: string|null, sicherheit: number, quelle: string, kandidaten: [...] }`
**Regeln**
- Kein Treffer ist ein gültiges Ergebnis: `url: null`, `grund` gesetzt. **Nicht raten** (R-B).
- Bei Sicherheit unter 70 wird geschrieben, aber in der Vertriebsliste als unsicher markiert.
- Höchstens 5 Kandidaten je Lead. Kein Vollcrawl.

---

### F-16 · Kontaktdaten aus dem Impressum ziehen

**INPUT** `{ svLeadId: uuid, laufId: uuid }`
**AKTION**
1. Nur `/impressum`, `/kontakt`, `/imprint`, `/legal-notice` unter der bekannten `website_url`.
2. E-Mail, Telefon, vertretungsberechtigte Person auslesen.
3. Telefon auf E.164 normalisieren. E-Mail kleinschreiben und syntaktisch prüfen.
4. **Direkt** in `sv_leads` schreiben (Entscheidung Aaron, CONTEXT §10), je Feld eine Zeile in
   `levelup_anreicherung` mit `wert_vorher`, `wert_nachher`, `quelle_url`, `sicherheit`, `laufId`.
5. `angereichert_am` setzen.

**ERGEBNIS** `{ email: string|null, telefon: string|null, person: string|null, sicherheit: number }`
**Regeln**
- Ein **bereits gefülltes** Feld wird nicht überschrieben. Nur Leerstellen werden gefüllt.
- Rollenadressen (`info@`, `kontakt@`, `office@`) sind zulässig, bekommen aber `sicherheit ≤ 60`.
- Findet sich keine E-Mail: `null` mit Grund. Keine Adresse aus dem Domainnamen konstruieren.
- Steht die Adresse in `cold_mail_suppression`, wird sie **gar nicht erst** in `sv_leads` geschrieben.

---

### F-17 · Massenlauf

**INPUT** `{ svLeadIds: uuid[], module: string[], maxParallel?: number }`
**AKTION** Je Lead einen `levelup_checks`-Datensatz mit `modus='bestand'`, `sv_lead_id` **sofort
gesetzt** (der Lead existiert ja bereits), Standort aus `plz`/`ort`/`lat`/`lng`, `website_url` aus
dem Lead. Danach die Messung wie F-03.

**ERGEBNIS** `{ laufId: uuid, angelegt: number, uebersprungen: [{svLeadId, grund}] }`

**Regeln**
- Übersprungen wird, wer keine `website_url` hat — mit Grund, nicht stillschweigend.
- Höchstens 5 Checks gleichzeitig. Zwischen zwei Abrufen derselben Domain mindestens 2 Sekunden.
- Ein fehlgeschlagener Check setzt `status='fehler'` und stoppt **nicht** den Lauf.

> **Der Massenlauf kann nicht alle Module.** Regel R-F1 verbietet automatisierten serverseitigen
> Abruf von Google-Ergebnissen. Ein Lauf über 62 Leads lässt sich nicht von Hand im Browser
> auslösen. Solange kein Places-Schlüssel und keine Ads-/Meta-Konten vorliegen, gilt:

| Modul | im Massenlauf | Grund |
|---|---|---|
| `web` Website-Technik | **ja** | eigener Crawler, robots.txt-konform |
| `seo` Inhalte und Struktur | **ja** | derselbe Abruf |
| `ux` Bedienbarkeit | **ja** | derselbe Abruf |
| `verz` Verzeichnisse | **ja** | robots.txt-konform |
| `volumen` Nachfrage | **ja** | Autocomplete-Abfrage |
| `gbp` Google-Profil | **nein** | R-F1 — braucht Places-Schlüssel |
| `wett` Wettbewerb im Umkreis | **nein** | R-F1 — Kartenabruf |
| `ads` Anzeigen | **nein** | nur über den Browser auslösbar |
| `kwg` Keyword-Planer | **nein** | braucht Google-Ads-Konto |
| `kwm` Meta-Reichweite | **nein** | braucht Meta-Business-Konto |

**Folge:** Jeder Check aus dem Massenlauf ist ein **Teilbefund**. Unter 60 erhebbaren Punkten gilt
`kein_score = true`. Die Mailvorlagen dürfen deshalb **keinen Score nennen** — nur das, was
tatsächlich gemessen wurde. Wer „Ihr Sichtbarkeits-Score liegt bei 31" schreibt, während zehn
Module nicht erhoben wurden, verletzt R-A und R-B in einer Mail an einen Fremden.

---

### F-18 · Lead-Detail mit Maßnahmen

**INPUT** `{ svLeadId: uuid }`
**AKTION** Lead laden, alle Checks dazu, den jüngsten mit `status='fertig'` auswählen, F-11 darauf
rechnen, Anreicherungs-Historie und Mailverlauf dazuholen.
**ERGEBNIS**
```json
{ "lead": {…}, "anreicherung": [{feld, wertVorher, wertNachher, quelleUrl, sicherheit, ts}],
  "checks": [{checkId, erhobenAm, score, keinScore, module}],
  "plan": { "summe": {…}, "phasen": [...] },
  "mails": [{gesendetAm, betreff, status, geoeffnetAm, geklicktAm}],
  "praesentationen": [{token, gueltigBis, aufrufe, widerrufenAm}] }
```
**Regeln**
- `plan` wird **live über F-11 gerechnet**, nicht aus `levelup_checks.massnahmen` gelesen. Die
  Spalte ist bis F-09 leer — genau dann, wenn der Vertrieb den Plan braucht.
- Gibt es keinen fertigen Check: `plan: null` mit Hinweis „noch nicht gemessen". Kein leerer Plan.
- Die Anreicherungs-Historie ist sichtbar, damit erkennbar bleibt, woher eine Adresse stammt.

---

### F-19 · Präsentationslink erzeugen

**INPUT** `{ checkId: uuid, gueltigTage?: number }`
**AKTION** Token erzeugen (32 Zeichen, kryptografisch zufällig), Zeile in
`levelup_praesentationen`, `erstellt_von = auth.uid()`, Event `praesentation_erstellt`.
**ERGEBNIS** `{ token, url, gueltigBis }`
**Regeln**
- Nur `is_staff()`. Der Sachverständige selbst kann keinen Link erzeugen.
- `gueltigTage` höchstens 90, Vorgabe 30. **Kein unbegrenzter Link** (R-P).
- Ein bestehender, gültiger Link zu demselben Check wird zurückgegeben statt ein zweiter erzeugt.

---

### F-20 · Präsentationsseite ausliefern

**INPUT** `{ token: string }`
**AKTION** Token auflösen. Abgelaufen oder widerrufen → sachliche Ablaufseite, Status 410. Sonst
Plan über F-11 rechnen, `aufrufe` erhöhen, `letzter_aufruf` setzen.
**ERGEBNIS** die gerenderte Seite.
**Regeln**
- `noindex, nofollow` im Kopf. Kein Sitemap-Eintrag.
- Kein Preis, keine Umsatzprognose, kein namentlicher Wettbewerbervergleich.
- Der Hinweis „Hinweise, keine Rechtsberatung" steht auf der Seite (R-J).
- Jede Maßnahme trägt ihre Herkunft, wie in F-11.

---

### F-21 · Sequenz-Aufnahme

**INPUT** `{ svLeadIds: uuid[], sequenzId: uuid }`
**AKTION** Je Lead ein `cold_mail_enrollments` mit **`sv_lead_id`** (nicht `lead_id`),
`aktueller_step = 0`, `next_send_at = now()`.
**ERGEBNIS** `{ aufgenommen: number, abgelehnt: [{svLeadId, grund}] }`
**Regeln — jede einzelne führt zur Ablehnung, nicht zu einer Warnung:**
- keine `email` am Lead
- Adresse steht in `cold_mail_suppression`
- bereits ein aktives Enrollment in derselben Sequenz
- die Sequenz hat `aktiv = false`
- die Sequenz hat keinen `absender_email`

---

### F-22 · Versand-Tick

**INPUT** `{}` — läuft als geplanter Job.
**AKTION**
1. Fällige Enrollments holen (`status='aktiv'`, `next_send_at <= now()`).
2. Bedingung des Steps prüfen (`wenn_nicht_geoeffnet` und so weiter) gegen `cold_mail_sends`.
3. **Vor jedem einzelnen Send** `cold_mail_suppression` prüfen (R-O).
4. Vorlage füllen, Validator: Herkunftsangabe und Abmeldelink vorhanden (R-N), sonst verwerfen und
   protokollieren.
5. Über Resend senden, `cold_mail_sends` mit `body_snapshot` und `resend_message_id` schreiben.
6. `aktueller_step` erhöhen, `next_send_at` aus `delay_tage` des nächsten Steps.

**ERGEBNIS** `{ gesendet: number, uebersprungen: number, fehler: number }`
**Regeln**
- Höchstens 20 Mails je Lauf und höchstens 40 am Tag, solange die Domain neu ist.
- Versandfenster werktags 9 bis 17 Uhr Europe/Berlin.
- `body_snapshot` wird immer gespeichert — sonst ist später nicht belegbar, was jemand bekommen hat.
- Eine Antwort setzt das Enrollment auf `geantwortet`. Kein weiterer Schritt.

---

### F-23 · Abmeldung

**INPUT** `{ token: string }` — aus dem Abmeldelink der Mail.
**AKTION** Zeile in `cold_mail_suppression` (`grund='opt_out'`), alle Enrollments dieser Adresse auf
`opt_out`, Bestätigungsseite.
**ERGEBNIS** die Bestätigungsseite.
**Regeln**
- **Ein Klick. Keine Rückfrage, keine Anmeldung, kein Formular.**
- Wirkt sofort und dauerhaft, auch für künftige Sequenzen.
- Die Adresse bleibt in `sv_leads` stehen — abgemeldet heißt nicht gelöscht. Für Löschung gilt
  `dsgvo_loeschauftraege`.
