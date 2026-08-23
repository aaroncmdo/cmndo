# Gewinnspiel „Tankgutschein" — Design-Spec

**Datum:** 2026-08-23
**Status:** Design abgestimmt (Aaron), Implementierungsplan folgt
**Branch:** `kitta/gewinnspiel-tankgutschein` (aus `origin/staging`)

---

## 1 · Ziel

Taeglich werden **3 Tankgutscheine à 50 €** (= 150 €/Tag) unter Leads mit einem
**Haftpflichtschaden** verlost. Das Gewinnspiel ist kein Selbstzweck, sondern ein
Lead-Magnet: es soll den Zufluss aus Paid Social (TikTok/Meta) und von allen
eigenen Seiten steigern und qualifizierte Erstkontakte in den bestehenden
Dispatch-Prozess spuelen.

**Nicht-Ziel:** ein eigenstaendiges Gewinnspiel-Produkt. Jede Teilnahme ist ein
regulaerer Lead und laeuft durch den bestehenden Funnel.

---

## 2 · Abgestimmte Entscheidungen (Aaron, 2026-08-23)

| # | Entscheidung | Wert |
|---|---|---|
| E1 | Nachweis-Mechanik | **Zweistufig** — niedrige Einstiegshuerde, harter Nachweis erst vom gezogenen Gewinner |
| E2 | Preisstruktur | **3 Gewinner/Tag à 50 € Tankgutschein** (nicht Bargeld → keine Bankdaten noetig) |
| E3 | Funnel | **Teilnahme = Lead im Dispatch**, das Team ruft an |
| E4 | Betrieb | **Admin-getrieben, ein Klick pro Tag** (kein Cron) |
| E5 | Reichweite | **Alle Lead-Quellen**, nicht nur Paid Social |
| E6 | Promotion | Site-weite **Topbar** auf allen Builds + **dedizierte Gewinnspiel-LP** als Social-Ad-Ziel |
| E7 | SV-Embeds | **Phase 1 komplett draussen** — weder Teilnahme noch Bewerbung |
| E8 | Nativer Gutachter-Finder | **Nimmt teil** (groesster Kanal, eigene Domaene) |
| E9 | Topbar-Auslieferung | **Zentrale Kampagnen-API**, Markup lokal je Build |
| E10 | WhatsApp-Verifikation | **Bestehende Baileys-Nummer**, alle Leads (Aaron: „aktuell laeuft nicht viel darueber") |

---

## 3 · Befunde, die das Design formen

Alle gegen `origin/staging` und die Prod-DB (`paizkjajbuxxksdoycev`) gemessen,
nicht angenommen.

### 3.1 Der Haftpflicht-Filter existiert — aber nur in einem Teil der Kanaele

**In `leads` ist er gefuellt und brauchbar:**

| `schuldfrage` | Zeilen | davon mit Telefon |
|---|---|---|
| `gegner` (= Haftpflichtschaden) | 32 | **29** |
| `eigenverantwortung` | 10 | 4 |
| NULL | 36 | 21 |

**In `gutachter_finder_anfragen` ist er komplett leer:**

```
schuldfrage          → NULL in 44 von 44 Zeilen
schuld_einschaetzung → NULL in 44 von 44 Zeilen
unfalltyp            → NULL in 44 von 44 Zeilen
```

Die Spalten sind vorhanden, der Schreibweg (`buildAnfrageColumns`) auch — durch
diese Tabelle laeuft nur nichts hindurch. Dasselbe Muster wie zuvor bei
`page_url` / `utm_*` (siehe `memory/AUDIT-lead-attribution-war-blind.md`).

**Wer fragt heute schon?**

| Erhebt | Feld | Schreibt nach |
|---|---|---|
| Mini-Wizard `/schaden-melden` | `schuldfrage` | `leads` |
| Werkstatt-Finder-Embed | `schuldfrage` | `leads` |
| Flotte-Schadenfortsetzung | `schuldfrage` | `leads` |
| Monika-Embed | `schuld_einschaetzung` | `gutachter_finder_anfragen` |

**Wer nicht fragt:** der native Gutachter-Finder und die Cluster-LPs — also genau
die Kanaele hinter `gutachter_finder_anfragen`, und damit auch die neue
Gewinnspiel-LP, solange sie nichts erhebt.

`schadentyp` ist **kein** Ersatz: die Werte beschreiben den Hergang
(`Auffahrunfall` 37, `Parkschaden` 3, `Rueckruf-Wunsch` 1), nicht die Schuldfrage.
Ein Auffahrunfall kann selbst- oder fremdverschuldet sein.

→ **Konsequenz:** Die Pflichtfrage muss in den Kanaelen ergaenzt werden, die sie
heute nicht stellen. Keine Migration noetig — beide Spalten existieren samt
Schreibweg.

#### ⚠ Falle: die erlaubten Werte divergieren zwischen den Tabellen

| Tabelle | CHECK-Werte fuer `schuldfrage` |
|---|---|
| `gutachter_finder_anfragen` | `gegner`, `unklar`, **`teilschuld`** |
| `leads` | `gegner`, `unklar`, **`eigenverantwortung`** |
| `flow_szenarien` | `gegner`, `unklar`, `eigenverantwortung` |

Der dritte Wert ist **nicht** derselbe. Wer einen Wert unbesehen von der Anfrage
in den Lead uebertraegt, erzeugt bei `teilschuld` einen **stillen CHECK-Reject** —
Postgres verwirft den Write ohne Fehler (genau die Klasse, die das
Flag-Drift-Gate adressiert). Fuer den Lostopf zaehlt ohnehin nur `gegner`, das in
allen drei Tabellen identisch ist; jede Uebertragung der uebrigen Werte braucht
eine explizite Abbildung.

**Feldwahl fuer die Gewinnspiel-LP:** `schuld_einschaetzung`
(`unverschuldet` | `nicht_sicher`) ist die **Laien**-Frage und damit die richtige
fuer ein Kampagnen-Formular — `schuldfrage` ist die fachliche Einordnung. Der
Lostopf akzeptiert `schuld_einschaetzung='unverschuldet'` **oder**
`schuldfrage='gegner'`.

### 3.2 Das heutige Volumen deckt die Preise nicht

Echte Anfragen (Test-/Smoke-Daten abgezogen) in `gutachter_finder_anfragen`:

| Monat | echt | gesamt |
|---|---|---|
| Juli 2026 | 8 | 29 |
| August 2026 (bis 23.) | 3 | 15 |

≈ **0,2 echte Anfragen/Tag** ueber den Marketing-Hauptkanal. Bei 3 Preisen
taeglich gaebe es an nahezu jedem Tag **weniger Teilnehmer als Preise**.

Die Gegenprobe ueber alle Kanaele bestaetigt das: **29 Leads** tragen ueber die
gesamte bisherige Historie `schuldfrage='gegner'` **und** eine Telefonnummer —
das ist die vollstaendige Menge, die unter heutigen Bedingungen ueberhaupt
teilnahmeberechtigt waere. 3 Preise/Tag haetten diesen Bestand in zehn Tagen
aufgebraucht.

→ **Zwei zwingende Konsequenzen:**
1. Die Teilnahmebedingungen formulieren **„bis zu 3 Gewinner taeglich"**. Alles
   andere ist ein Versprechen, das an den meisten Tagen nicht erfuellbar ist.
2. Preisanzahl und Betrag gehoeren in die **Kampagnen-Konfiguration**, nicht in
   den Code — sie werden sich mit dem Volumen aendern.

### 3.3 Mehrere Lead-Kanaele liefern keine Telefonnummer

Von 15 `source_channel`-Werten in `leads`:

| Kanal | mit Telefon |
|---|---|
| `self_service` | 37/37 |
| `mcp` | 6/6 |
| `schaden-karte` | **1/7** |
| `werkstatt_finder` | **0/4** |
| `kunde_portal` | **0/3** |
| (null) | **0/7** |

→ Ohne Telefonnummer ist weder WhatsApp-Verifikation noch Gewinnbenachrichtigung
moeglich. **Telefonnummer ist Teilnahmevoraussetzung**, kein Nice-to-have. Leads
ohne Nummer laufen normal weiter, nehmen aber nicht teil.

### 3.4 Sieben separate Builds ohne geteilten Code

| Build | Domain |
|---|---|
| `src/` | app.claimondo.de |
| `claimondo-marketing/` | claimondo.de |
| `kfz-gutachter-{koeln,bonn,aachen,duesseldorf,wuppertal}/` | 5 Cluster-Domains |
| `autounfall-io/` | autounfall.io |

Jeder Cluster-Build hat **eigene** `Header.tsx`, `Footer.tsx` usw. — kein Shared
Package. Eine hartkodierte Topbar waere 7× Copy-Paste und 7 Deploys pro Aenderung.

→ Deshalb **E9**: Markup lokal, Steuerung zentral. Der ausschlaggebende Grund ist
nicht Bequemlichkeit: eine Topbar, die nach Kampagnenende stehen bleibt, bewirbt
ein beendetes Gewinnspiel — das ist ein Rechtsproblem, kein Schoenheitsfehler.

### 3.5 Kein Meta-/TikTok-Tracking im Code

`fbq` / `fbclid` / `ttclid` → **0 Treffer** repo-weit, waehrend `gtag(` mit
demselben Kommando trifft (das Instrument lebt). In `gutachter_finder_anfragen`
existiert `gclid`, aber kein Pendant fuer Meta/TikTok.

→ Ohne Klick-IDs kann keine Plattform Conversions zurueckrechnen; das Ad-Budget
faehrt blind. Ob ueber den GTM-Container etwas laeuft, ist im Repo nicht sichtbar
— **offener Punkt, kein Befund**.

---

## 4 · Architektur

### 4.1 Bausteine

| # | Baustein | Ort | Zweck |
|---|---|---|---|
| **B1** | Kampagnen-Konfiguration | App: DB + `admin/marketing/gewinnspiel` | Zeitraum, Preise/Tag, Betrag, Topbar-Texte, An/Aus |
| **B2** | Kampagnen-API | App: `GET /api/kampagne/aktiv` | Oeffentlich, cachebar; versorgt alle 7 Builds |
| **B3** | Topbar | 7 Builds, je lokal | Liest B2 server-seitig, rendert eigenes Markup |
| **B4** | Gewinnspiel-LP | `claimondo-marketing/app/[locale]/gewinnspiel` | Social-Ad-Ziel; postet an `/api/anfrage-from-lp` |
| **B5** | Teilnahme-Registrierung | App: Tabelle + Hook im Intake | Quelle-agnostisch: qualifizierender Lead → Teilnahme |
| **B6** | Ziehung/Nachweis/Gutschein | App: `admin/marketing/gewinnspiel` | Ein Klick pro Tag |

### 4.2 Datenmodell

Zwei neue Tabellen. **Keine** Aenderung am bestehenden Lead-Modell.

**`gewinnspiel_kampagnen`**
- `id`, `name`, `start_am`, `ende_am`
- `preise_pro_tag` (int, default 3), `preis_betrag_eur` (numeric, default 50)
- `topbar_text`, `topbar_cta_text`, `topbar_aktiv` (bool)
- `aktiv` (bool), `erstellt_am`

**`gewinnspiel_teilnahmen`**
- `id`, `kampagne_id` (FK)
- `anfrage_id` (FK → `gutachter_finder_anfragen`, nullable)
- `lead_id` (FK → `leads`, nullable) — genau eine der beiden gesetzt
- `telefon_normalisiert` (text) — Dedup-Schluessel
- `whatsapp_verifiziert_am` (timestamptz, nullable)
- `status` — `offen` | `gezogen` | `nachweis_offen` | `bestaetigt` | `abgelehnt`
- `gezogen_am`, `gezogen_von_user_id`, `ziehung_los_nr`
- `nachweis_token`, `nachweis_datei_pfad`, `nachweis_geprueft_am`, `nachweis_geprueft_von`
- `gutschein_code`, `gutschein_versendet_am`
- `erstellt_am`

**Ziehungs-Protokoll:** Zeitpunkt, ausfuehrender Admin und die Lostopf-Groesse
werden festgeschrieben. Ohne das ist die Ziehung im Streitfall nicht belegbar.

⚠ **`source` bleibt unangetastet.** Das Feld ist RLS-Steuerung
(`with_check: source IS NULL` fuer den anonymen Finder), kein Attributionsfeld.
Ein Wert dort wuerde jeden anonymen Finder-Submit abweisen. Die
Gewinnspiel-Kennzeichnung laeuft ueber `utm_campaign` plus die eigene Tabelle.

### 4.3 Ablauf

```
Lead (beliebige Quelle) mit Telefon
     + schuld_einschaetzung='unverschuldet' ODER schuldfrage='gegner'
  → Teilnahme angelegt (Status: offen)
  → WhatsApp-Welcome ueber bestehende Baileys-Nummer, rate-limitiert,
    genau eine Nachricht pro normalisierter Nummer
     → Zustellung/Antwort ⇒ whatsapp_verifiziert_am
  → parallel: Lead laeuft normal in die Dispatch-Queue, Team ruft an
  ──────── taeglich, ein Admin-Klick ────────
  → bis zu 3 Gewinner aus den verifizierten Teilnahmen des Vortags
  → Gewinner erhaelt Nachricht + Upload-Link (Muster: /upload/dokumente/[token])
  → Admin sichtet den Nachweis
     → bestaetigt ⇒ Gutschein-Code wird eingetragen und versendet
     → abgelehnt  ⇒ automatisch nachgezogen
```

### 4.4 Bestehende Infrastruktur, die wiederverwendet wird

| Zweck | Vorhandenes Teil |
|---|---|
| Lead-Eingang von der LP | `/api/anfrage-from-lp` (Zod, Honeypot, Origin-Allowlist, Rate-Limit) |
| Lead-Anlage | **`createCase`** aus `src/lib/intake/create-case.ts` — nie `createLead` direkt (Intake-Funnel-Gate) |
| Anonymer Nachweis-Upload | Muster `src/app/upload/dokumente/[token]` |
| WhatsApp-Versand | `src/lib/communications/send.ts` + `durable-keys.ts` (Idempotenz) |
| WhatsApp-Verfuegbarkeit | `src/lib/whatsapp/availability.ts` |
| Consent-Protokoll | `consent_records` via `/api/consent` (in beiden Builds vorhanden) |

---

## 5 · Frontend-Konzept

Register: **brand** (die Seite ist das Produkt). Die bestehende Claimondo-Identitaet
wird bewahrt — Montserrat (Headings) / Noto Sans (Body), Navy `#0D1B3E`,
`rounded-ios-*`. Innerhalb dieser Identitaet bekommt die Kampagne eigene
Art-Direction.

### 5.1 Die Szene

> Jemand mit frischem Blechschaden sitzt abends auf dem Sofa, scrollt TikTok am
> Handy, ist genervt und unsicher, ob die gegnerische Versicherung zahlt — und
> sieht die Chance auf 50 € Tankgutschein.

Daraus folgt zwingend:

- **Mobil zuerst**, Hochformat, alles Wesentliche in Daumenreichweite.
  Paid-Social-Traffic ist nahezu vollstaendig mobil.
- **Dunkle Flaeche.** Der Nutzer kommt aus einer dunklen App; eine grellweisse
  Seite ist ein Bruch im Message Match. Claimondo besitzt mit `#0D1B3E` die tiefe
  Flaeche bereits.
- **Beruhigen, nicht schreien.** Der Ausgangszustand ist Aerger und Unsicherheit.

### 5.2 Aesthetische Lane

Die naheliegende Wahl waere „Versicherung → Navy + Gold, serioes". Das ist der
Kategorie-Reflex und wird verworfen. Die Lane kommt stattdessen aus dem Preis
selbst:

**Die Preisanzeige einer Tankstelle bei Nacht.**

- Sehr grosse, tabulare Ziffern als traegendes Element (`50,00`), nicht ein
  Icon-plus-Ueberschrift-Block.
- Warmes Leuchten als einziger Akzent auf tiefem Grund — Farbstrategie
  **Drenched** (die Flaeche *ist* die Farbe), ein Akzentton ausschliesslich fuer
  Betrag und CTA.
- Konkret und alltagsnah statt Konfetti-Scam oder Corporate-Serioesitaet.

Der Akzentton wird **nicht** aus den Status-Tokens (`warning`/`success`)
entliehen — die tragen Bedeutung. Die Marketing-Builds liegen ausserhalb des
Status-Ratchets (`src/**`), die Kampagne definiert daher ihren eigenen
Akzent-Token.

### 5.3 Conversion-Mechanik

Die Design-Entscheidungen, die auf die Conversion einzahlen:

1. **Formular above the fold.** Kein Scrollen bis zur ersten Eingabe.
2. **Minimalfelder.** Name, Telefon, „unverschuldet?", Einwilligungen. Jedes
   weitere Feld kostet messbar Abschluesse. Alles Uebrige holt der Anruf.
3. **Keine Navigation.** Die LP hat keinen Header mit Ausgaengen; jeder Link,
   der nicht zum Formular fuehrt, ist ein Leck.
4. **Message Match.** Betrag und Mechanik stehen wortgleich zur Anzeige im
   ersten Bildschirm.
5. **Vertrauen gegen den Scam-Verdacht.** Ein Gewinnspiel mit Bargeldnaehe steht
   unter Generalverdacht. Gegenmittel: sichtbarer Veranstalter mit Anschrift,
   Link auf die Teilnahmebedingungen, echte Zahlen zum Unternehmen — und nach den
   ersten Tagen die Gewinner des Vortags (anonymisiert, z. B. „M. K. aus Koeln").
6. **Ein Ziel pro Bildschirm.** Langer Scroll, ruhige Taktung.

### 5.4 Seitenaufbau der LP

Sieben Abschnitte, ein Gedanke pro Bildschirm. Reihenfolge ist bewusst: alles,
was die Teilnahme kostet (Bedingungen, Kleingedrucktes), kommt **nach** dem
Formular.

| # | Abschnitt | Inhalt | Zweck |
|---|---|---|---|
| 1 | **Preis-Fold** | Die Zahl als Tankstellen-Anzeige, ein Satz Mechanik, direkt darunter das Formular. Kein Header, keine Navigation. | Message Match + Eingabe ohne Scrollen |
| 2 | **Drei Schritte** | „Teilnehmen · Gezogen werden · Nachweis zeigen" — als knappe Zeile, nicht als Icon-Karten-Raster | Erwartung setzen, Scam-Verdacht nehmen |
| 3 | **Wer dahintersteht** | Claimondo in zwei Saetzen, echte Zahlen, Anschrift sichtbar | Der Vertrauensanker; ohne ihn liest sich alles wie Fake |
| 4 | **Gewinner** | Die des Vortags, anonymisiert („M. K. aus Koeln"). Vor dem ersten Gewinner: entfaellt ersatzlos statt Platzhalter | Sozialer Beweis, sobald echt |
| 5 | **Warum wir das machen** | Ehrlich: wir suchen Leute mit unverschuldetem Unfall, weil wir davon leben | Entwaffnet den „Was ist der Haken?"-Reflex |
| 6 | **Zweiter CTA** | Zurueck zum Formular | Faengt die Scroller |
| 7 | **Bedingungen kompakt** | Kurzfassung + Link auf die vollstaendigen Teilnahmebedingungen | Pflicht, aber nicht im Weg |

**Was bewusst fehlt:** Countdown-Timer (Scam-Signal), Konfetti, Stock-Foto
jubelnder Menschen, Sternebewertungs-Karussell, Chat-Bubble.

### 5.5 Topbar

Eine Zeile, ueber allem, auf allen 7 Builds. Sie muss:

- den Betrag und die Mechanik in einem Halbsatz tragen,
- auf Mobil eine Zeile bleiben (kein Umbruch, kein Layout-Shift beim Laden),
- schliessbar sein (Zustand in `localStorage`, nicht serverseitig),
- Kontrast AA gegen ihren Grund halten,
- und **verschwinden**, sobald die Kampagne in B1 auf inaktiv steht.

### 5.6 Offene Asset-Frage

Der Skill fordert echte Bildwelt statt Farbflaechen. Zu klaeren mit Aaron
(→ Abschnitt 9).

---

## 6 · Recht

Drei Punkte, die **vor** dem Launch stehen muessen. Keiner davon ist ein Blocker,
aber alle drei muessen von Anfang an mitgebaut werden.

### 6.1 Telefon-Einwilligung (§ 7 UWG)

„Teilnahme = Lead, Team ruft an" ist ein **Werbeanruf**. Bei Verbrauchern ohne
vorherige ausdrueckliche Einwilligung ist das abmahnfaehig; der Bussgeldrahmen
reicht bis 300.000 €.

**Umsetzung:** eigene Checkbox, **nicht** vorangekreuzt, sprachlich getrennt von
der Teilnahme selbst. Zeitstempel in `dsgvo_zustimmung_am` + Protokollzeile in
`consent_records`.

### 6.2 Teilnahmebedingungen

Pflichtinhalte: Veranstalter mit Anschrift, Zeitraum, Teilnahmeberechtigung
(Mindestalter 18, Wohnsitz), Ablauf der Ziehung, **„bis zu 3 Gewinner taeglich"**
(siehe 3.2), Gewinnbenachrichtigung und Nachweisfrist, Ausschluss des Rechtswegs,
Datenschutzhinweis.

Zusaetzlich verlangen Meta und TikTok fuer Gewinnspiel-Anzeigen eine
**Freistellung der Plattform** („Die Aktion steht in keiner Verbindung zu …").

### 6.3 Automatische Teilnahme aller Leads

Dass ein Lead ueber eine beliebige Quelle automatisch teilnimmt, braucht einen
sichtbaren Hinweis im jeweiligen Formular. Stillschweigend geht das nicht — es
waere eine Verarbeitung zu einem neuen Zweck.

### 6.4 Unkritisch

- **Kein Gluecksspiel** — die Teilnahme ist kostenlos, es fehlt der Einsatz.
- **Steuer** — Sachpreise aus Gewinnspielen sind bei Privatpersonen keiner
  Einkunftsart zuzuordnen.

---

## 7 · Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **P1** | B1 + B2 + B5, Schuldfrage-Verdrahtung, Rechtstexte, Consent-Checkbox | Teilnahmen entstehen, noch ohne Werbung |
| **P2** | B6: Ziehung, Nachweis-Upload, Gutschein-Versand | Betrieb moeglich, Kampagne startbar |
| **P3** | B4 Gewinnspiel-LP + Topbar auf `claimondo.de` | Social-Ads koennen laufen |
| **P4** | Topbar auf die 6 weiteren Builds | Volle Reichweite |
| **P5** | `fbclid`/`ttclid` erfassen + Conversion-Rueckmeldung an Meta/TikTok | Kampagnen-Optimierung |

P5 steht bewusst hinten, ist aber **nicht optional**: ohne Klick-IDs laesst sich
kein Ad-Budget steuern.

---

## 8 · Technische Auflagen aus AGENTS.md

Bindend fuer die Umsetzung, hier festgehalten damit sie im Plan nicht untergehen:

- **Regel 2** — jede DDL ueber `mcp__plugin_supabase_supabase__apply_migration`,
  danach `list_migrations`, Migration-File exakt nach getrackter Version benennen
  und **mitcommitten**. Types regenerieren.
- **Regel 4** — operatives Soll in Prosa **vor** dem Bau, danach vollstaendiger
  Prod-Playwright-Smoke ueber die echte UI. `PLAYWRIGHT_BASE_URL` allein genuegt
  nicht; `_golden-path-lib`-Specs ziehen `GOLDEN_APP_URL`.
- **Intake-Funnel-Gate** — Lead-Anlage ausschliesslich ueber `createCase`.
  In Unit-Tests `createCase` mocken (`server-only` wirft sonst beim Import).
- **Silent-Write-Gate (Baseline 0)** — jeder Write auf `leads`/`claims`/`tasks`
  prueft `error`; unter RLS zusaetzlich `.select()` und die Zeilenzahl.
- **Server-Actions** — Result-Object `{ ok, error? }`, kein `throw`.
  `revalidatePath` fuer jede betroffene Route.
- **Metadata-Merge-Gate** — die LP setzt `openGraph`/`twitter` nur **mit**
  `images`, sonst verliert sie das Vorschaubild des Layouts.
- **i18n** — neue Keys in allen 6 Locales, sonst reisst das Paritaets-Gate.
- **Umlaute** — alle nutzersichtbaren Texte mit echten `ä/ö/ü/ß`.
- **Komponenten-Set** — `primitives/*` und `shared/*` statt handgerolltem Markup;
  Radien `rounded-ios-*`.
- **API-Aufrufe aus dem Marketing-Build** brauchen die **feste App-URL**.
  `NEXT_PUBLIC_APP_URL` zeigt dort auf `claimondo.de`; `/api/*` wird von NGINX
  **nicht** weitergeleitet und liefe in einen 404.
- **Origin-Allowlist** — `clusterAllowlist()` muss die LP-Domain enthalten, sonst
  `403 origin_not_allowed`.

---

## 9 · Offene Punkte

| # | Punkt | Wer |
|---|---|---|
| O1 | **Assets** fuer die LP: Bildwelt, Gutschein-Visual, Anbieter | Aaron |
| O2 | Gutschein-Anbieter und Beschaffungsweg (bestimmt, ob P2 einen Code-Pool braucht) | Aaron |
| O3 | Kampagnen-Laufzeit und Startdatum | Aaron |
| O4 | Laeuft ueber den GTM-Container bereits ein Meta-/TikTok-Pixel? | Aaron / GTM-Zugriff |
| O5 | Rechtstexte final (Teilnahmebedingungen) — Entwurf durch uns, Freigabe extern | Aaron |
| O6 | Schwellwert, ab dem der WhatsApp-Outbound von Baileys auf die offizielle Business-API wechselt | spaeter, mit Volumen |

---

## 10 · Risiken

| Risiko | Bewertung | Gegenmassnahme |
|---|---|---|
| **Baileys-Sperre** trifft die operative Fall-Kommunikation mit | Bei heutigem Volumen gering, waechst mit Erfolg | Rate-Limit, eine Nachricht pro Nummer, Verbindungs-Waechter; O6 |
| **Missbrauch** (Mehrfachteilnahme, fremde Nummern) | Mittel | Dedup ueber normalisierte Telefonnummer, WhatsApp-Verifikation, Nachweispflicht beim Gewinn |
| **Unterdeckung** (weniger Teilnehmer als Preise) | Anfangs sicher (3.2) | „bis zu 3 Gewinner" in den Bedingungen; Preisanzahl konfigurierbar |
| **Topbar bleibt nach Kampagnenende stehen** | Hoch bei hartkodierter Loesung | E9: zentrale Steuerung, ein Schalter |
| **Blindes Ad-Budget** ohne Klick-IDs | Hoch, sobald Geld fliesst | P5 |
| **Scam-Wahrnehmung** druecht die Conversion | Mittel | 5.3 Punkt 5 |

---

## 11 · Bewusst nicht enthalten

- SV-Embeds (E7) — weder Teilnahme noch Bewerbung in Phase 1.
- Automatischer Gutschein-Einkauf ueber eine Anbieter-API.
- Cron-gesteuerte Ziehung (E4: bewusst Admin-getrieben).
- Bargeld-Auszahlung und damit jede Erfassung von Bankdaten.
