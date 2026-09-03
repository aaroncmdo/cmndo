# Werkstattbindung in Kasko-Tarifen — Scan der App und Marketing-Seiten

**Datum:** 03.09.2026 · **Auftrag Aaron:** Die Wissensbasis „Werkstattbindung in Kasko-/Teilkasko-Tarifen"
(CHECK24-Tarifliste 20.07.2026, 71 Versicherer-Marken, 538 Tarifvarianten) in die Datenbank bringen. Im
Selbstverschuldet-Fall soll der Kunde Versicherer und Tarif wählen; daraus ergibt sich, ob wir eine
Werkstatt vermitteln dürfen (freie Werkstattwahl) oder nicht (Werkstattbindung). Das muss der FlowLink
für Selbstverschuldete, die Werkstatt-Vermittlung und die Anspruchsprüfung berücksichtigen.

**Quelle:** `C:\Users\Aaron Sprafke\Downloads\werkstattbindung-kasko-tarife-2026.md` (Stand 03.09.2026).
**Code-Stand:** Worktree `.claude/worktrees/werkstattbindung-kasko-tarife`, Branch
`kitta/werkstattbindung-kasko-tarife`, Basis `origin/staging` @ `37dc558c2`. Der Haupt-Checkout
(`kitta/aar-956-…`, HEAD vom 11.07.) ist 963 Commits stale und wurde bewusst NICHT gescannt.
**Prod-Messungen:** Supabase `paizkjajbuxxksdoycev`, READ-Queries am 03.09.2026, 22:00–23:00.
**Methode:** 5 parallele READ-ONLY-Scans (Versicherer-Modell · Schuldfrage/Flow · Anspruchsprüfung ·
Werkstatt-Vermittlung · Marketing) plus eigene Prod-Abfragen und Gegenlesen der Kernfiles.

---

## 1 · Kernbefunde in zehn Zeilen

1. **Ein Werkstattbindungs-Gate existiert seit 21.07.2026 produktiv** — als binäre Selbstauskunft
   („Dürfen Sie die Werkstatt frei wählen?") im FlowLink, Feld `leads.freie_werkstattwahl` /
   `claims.freie_werkstattwahl` (boolean). Es kennt weder Versicherer noch Tarif.
2. **Der Name der eigenen Versicherung des Kunden wird nirgends erfasst.** `eigene_versicherung` ist ein
   `ja`/`nein`-Flag („über eigene Kasko regulieren?"), `eigene_policennr` hat keinen Schreiber (0/95).
3. **Die Flow-Weiche ist DB-getrieben** (`flow_szenarien` + `flow_szenario_steps`). Das Kasko-Szenario hat
   an Position 3 den Step `werkstattbindung_check` mit Bedingung `{"freie_werkstattwahl": null}` — genau
   dort docken Versicherer + Tarif an. Ein neuer Step braucht eine Config-Zeile und einen Render-Block.
4. **Die Abbruch-Seite bei Werkstattbindung zeigt den falschen Text.** `KaskoEndansicht` spricht von
   „Gutachterkosten … nicht über die gegnerische Haftpflicht … kein kostenfreier Termin" — das ist der
   Eigenverschulden-Text. Für „Ihre Versicherung schreibt die Werkstatt vor" gibt es keinen eigenen Text.
5. **`versicherungen` (97 Zeilen) sind Rechtsträger, CHECK24 nennt Vertriebsmarken.** 50 Marken passen
   1:1, 5 treffen zwei Rechtsträger (HUK, BGV, Provinzial, BarmeniaGothaer, Helvetia Baloise), 3 sind
   Aliase, **13 fehlen ganz** (AdmiralDirekt, Autosan, AvD, BavariaDirekt, BavariaProtect, Dialog,
   Inshared, Janitos, Neodigital, Prokundo, VÖDAG, Volkswagen Autoversicherung; dazu Barmenia Direkt,
   EUROPA-go, rhion.digital als Marken mit vorhandenem Rechtsträger).
6. **Der `versicherungen`-Seed ist nicht replay-fähig:** nur 55 der 97 Zeilen stehen in der Git-Historie
   (Migration `20260407_kfz133_versicherungen.sql`, beim Drift-Aufräumen `ddd5f7c2a` gelöscht, in
   `schema_migrations` nie getrackt). BaFin-Nummern und ~40 Zeilen existieren nur auf prod.
7. **Drei getrennte Anspruchsprüfungen** ohne gemeinsames Regelwerk: Marketing-Quiz `/check` (4 Tiers),
   Foto-Tool `/embed/anspruch-pruefen` (Vision + Regeln), Berater-API `/api/v1/pruefe-anspruch`.
   **Keine kennt Werkstattbindung.** Der Check verspricht Kasko-Kunden bedingungslos „Koordination mit
   der Partnerwerkstatt".
8. **`selbst` fällt in `convert_anfrage_zu_lead` auf NULL** (prod-verifiziert): Jeder Kasko-Kunde aus
   `/check` kommt ohne `schuldfrage` im Lead an; das `tier` landet in `auswertung_unverbindlich`, das
   **null Code-Consumer** hat.
9. **Der Dispatcher sieht den Abbruchgrund nicht** (`disqualifiziert_grund_key` wird nirgends
   gerendert) und der Gesprächsleitfaden führt Kasko weiterhin als Disqualifikationsgrund — im
   Widerspruch zum produktiven Flow, der Kasko-frei seit 08.07. durchlässt.
10. **Das Gate hat drei Umgehungen.** Embed-Werkstatt-Finder, Kunden-Schadenmeldung und Werkstatt-QR
    weisen einem Kasko-Kunden eine Werkstatt zu, **ohne** die Bindung je zu erheben; nachgelagert wird
    `istWerkstattReparaturWeg` an 7 von 8 Stellen ohne das Bindungs-Argument aufgerufen. Kasko-Vermittlung
    ist zudem nicht monetarisiert (Provision nur inbound, Aaron 11.07.). Siehe Abschnitt 6.

---

## 2 · Bestand Datenbank (prod, 03.09.2026)

### 2.1 Versicherer-Stammdaten `public.versicherungen`

| Merkmal | Wert |
|---|---|
| Zeilen | 97 (alle `ist_aktiv=true`; 88 mit `bafin_nummer`, 86 mit `schaden_email`) |
| Spalten | `id, name, normalized_name, adresse, plz, stadt, bafin_nummer, hotline_telefon, schaden_email, schaden_telefon, webseite, logo_url, ist_aktiv, erstellt_am, aktualisiert_am` |
| Constraints | `UNIQUE(name)`, kein Unique auf `normalized_name` |
| RLS | SELECT authenticated faktisch offen, INSERT authenticated, UPDATE/DELETE admin; anonyme Leser (`/flow`) via Service-Role |
| FKs auf `versicherungen(id)` | `leads.gegner_versicherung_id` (0/95 gesetzt), `claims.gegner_versicherung_id` (2/85), `claim_parties.versicherung_id`, `vs_korrespondenz.versicherung_id`, `makler.versicherung_id` |
| Find-or-create | `src/lib/versicherungen/ensure-versicherung.ts:11` (exakter `normalized_name`-Match, kein Fuzzy) |
| Fuzzy | einmalig `src/lib/lead-fall-mapping.ts:294-310` (ILIKE `%…%`, `.limit(1).maybeSingle()` ohne `order` → bei Mehrfachtreffern unbestimmt) |
| Picker | `src/components/shared/VersichererSelect.tsx` (Liste vom Aufrufer) · `src/components/VersicherungAutocomplete.tsx` (Server-Suche `searchVersicherungen`, Admin-Client, Freitext-Fallback; läuft bereits anonym im `/flow`) |

Zwei Namensebenen sind zu unterscheiden: `versicherungen.name` = BaFin-Rechtsträger
(„HUK-COBURG-Allgemeine Versicherung AG"), CHECK24 = Vertriebsmarke („HUK-COBURG", „HUK24").
Beide Richtungen kommen vor: 1 Marke → 2 Rechtsträger (HUK-COBURG Allgemeine + VVaG) und
1 Rechtsträger → n Marken (RheinLand ↔ rhion.digital, EUROPA ↔ EUROPA-go, Itzehoer ↔ AdmiralDirekt).
Vollständiges Mapping in Abschnitt 8.

### 2.2 Eigene Versicherung / Kasko-Felder auf `leads` und `claims`

| Spalte | Typ | Bedeutung | Prod-Belegung |
|---|---|---|---|
| `leads.eigene_versicherung` | text (kein CHECK) | `ja`/`nein` = „über eigene Kasko regulieren?" | 85 null · 6 nein · 4 ja |
| `claims.eigene_versicherung` | text (kein CHECK, für authenticated revoked) | dito, Capture bei Konversion | 70 null · 9 nein · 6 ja |
| `leads.eigene_policennr` | text | **kein Schreiber im Code** | 0/95 |
| `leads.freie_werkstattwahl` | boolean | null = nicht gefragt · true = frei (wir vermitteln) · false = gebunden | 91 null · 4 true · **0 false** |
| `claims.freie_werkstattwahl` | boolean | dito | 78 null · 7 true · 0 false |
| `leads.schuldfrage` | text CHECK `gegner\|unklar\|eigenverantwortung` | Haftungsweiche | 44 gegner · 10 eigenverantwortung · 41 null |
| `claims.schuldfrage` | text **ohne CHECK** | Roh-Kopie | 39 gegner · 14 eigenverantwortung · 32 null |
| `abrechnungsweg` (leads/claims/gfa) | CHECK `haftpflicht\|kasko\|selbstzahler` | abgeleitet (TS `deriveAbrechnungsweg` + SQL `derive_abrechnungsweg`, **müssen logikgleich bleiben**) | claims: 53 haftpflicht · 13 selbstzahler · 9 kasko · 10 null |
| `claims.schadenart` | CHECK `haftpflicht\|vollkasko\|teilkasko\|eigenverschulden\|unbekannt` | Versicherungs-Klassifikation | 75 unbekannt · 7 haftpflicht · 2 eigenverschulden · 1 vollkasko |

Historie: `eigene_versicherung` war im April ein Versicherername (Commit `1c5b7c5f9`, VersicherungCombobox),
wurde später zum Flag umgewidmet; die Combobox ist gelöscht. Im gesamten Schema gibt es keine Spalte
mit `kasko`, `tarif`, `werkstattbindung` oder `versicherungsschein` im Namen (Vollscan
`information_schema.columns`). Das Dokument `versicherungsschein_eigener` (OCR-Schema
`src/lib/ocr/claude-extract.ts:60`) extrahiert zwar einen Versicherernamen, schreibt ihn aber nirgends.

**`schuldfrage`-CHECK divergiert** (bestätigt): `gutachter_finder_anfragen` erlaubt `gegner|unklar|teilschuld`,
`leads`/`flow_szenarien` erlauben `gegner|unklar|eigenverantwortung`. Der Code fängt das ab
(`clampSchuldfrage` in `src/lib/start-link/issue-canonical-flowlink.ts:71`); Folge: ein Selbstverschuldeter
über den Gutachter-Finder kommt mit `schuldfrage=null` an und wird im Flow erneut gefragt (bewusst).

### 2.3 Die DB-getriebene Flow-Weiche

`flow_szenarien` (5 Zeilen, NULL = Wildcard, höchste `prioritaet` gewinnt):

| id | schuldfrage | eigene_versicherung | feststellung_zweig | prio |
|---|---|---|---|---|
| `haftpflicht` | gegner | * | unfall | 10 |
| `teilschuld` | unklar | * | unfall (→ Rückruf Dispatch) | 10 |
| `kasko` | eigenverantwortung | ja | schaden | 10 |
| `selbstzahler` | eigenverantwortung | nein | schaden | 10 |
| `unqualifiziert` | * | * | unfall (→ Quali-Step) | 0 |

`flow_szenario_steps` für `kasko` (prod): `zusammenfassung` → `feststellung` (erhebt kennzeichen,
schadentyp, unfallhergang) → **`werkstattbindung_check`** `{"freie_werkstattwahl": null}` → `ort_fahrzeug`
→ `werkstatt` → `werkstatt_anzeige` → `account`. `selbstzahler` ist identisch **ohne** den WB-Step.
Haftpflicht-Steps (`sa`/`gutachter`/`termin`) werden bei Kasko/Selbstzahler zusätzlich im Code hart
herausgefiltert (`FlowWizardKfz.tsx:440-447`).

Engine: `src/lib/self-service/lade-flow-szenarien.ts` (einziger DB-Leser) → `flow-kontext.ts`
(`bauFlowKontext`, abgeleitete Felder) → `flow-szenarien.ts` (`matcheSzenario`, `erfuelltBedingung`,
`erhebtNoch`) → `flow-weichen.ts`. Regel aus `flow-kontext.ts:72`: **Eine Step-Bedingung darf nur Felder
nutzen, die beim Betreten des Flows ihren Endwert haben** (der Wizard friert die Sequenz beim Mount ein).

### 2.4 Weitere Referenztabellen mit Vorbildcharakter

* `anspruch_config` (20 numerische Keys, `key/wert`, anon lesbar, Admin-Editor
  `admin/einstellungen/anspruch-saetze`) — Muster „fachliche Konstanten in der DB, Code-Fallback".
* `fahrzeugklassen` (22 EU-Klassen → 8 Reparaturgruppen) — bewusst Tabelle statt CASE im Code.
* `autounfall-io/lib/tools/sf-versicherer.ts` — 11 Versicherer mit SF-Klassen-Tabellen als TS-Konstante:
  der einzige Präzedenzfall für „strukturierte Tarifdaten je Versicherer" (Marketing-Build, ohne DB).

---

## 3 · Bestand Selbstverschuldet-Pfad im FlowLink

### 3.1 Die Fragen, die der Kunde heute sieht

Quali-Step (`src/app/flow/[token]/FlowQualiStep.tsx`), nach „Ich selbst":

> **Können Sie den Schaden über eine eigene Kaskoversicherung regulieren?** — Voll- oder Teilkasko …
> · Ja, ich habe eine Kaskoversicherung (→ Rückfrage Werkstattwahl) · Nein, ich zahle die Reparatur selbst

> **Sind Sie an eine Werkstatt Ihrer Versicherung gebunden?** — Manche Kasko-Tarife schreiben eine
> Partnerwerkstatt vor. · Nein, ich kann die Werkstatt frei wählen · Ja, meine Versicherung schreibt die
> Werkstatt vor (→ „Dann wende dich bitte direkt an deine Kaskoversicherung.")

Dieselbe Frage existiert ein zweites Mal als eigener Step für vorklassifizierte Kasko-Leads,
**umgekehrt gepolt** (`FlowWerkstattbindungStep.tsx:52`: „Dürfen Sie die Werkstatt frei wählen?").
Beide rufen `speichereQualiFlow(token, 'eigenverantwortung', true, freieWerkstattwahl)` auf.

### 3.2 Die Entscheidungslogik (drei Ausgänge)

`src/lib/self-service/quali-flow-outcome.ts`:

| Ausgang | Bedingung | Wirkung |
|---|---|---|
| A · durchlassen | kasko + `freieWerkstattwahl !== false` (true **oder null**) · oder selbstzahler | `reparaturwunsch='reparatur'`, Werkstatt-Strecke, Gutachtertermin wird aktiv gelöst (`loeseGutachterZuordnung`), Claim via `erzeugeSelbstzahlerClaim` |
| B · abfangen | kasko + `freieWerkstattwahl === false` | `disqualifiziert=true`, `disqualifiziert_grund_key='werkstattbindung'`, `status='disqualifiziert'`, UI `KaskoEndansicht` |
| C · stille Falle | eigenverantwortung **ohne** Versicherungsantwort | fällt auf `bewerteSchuldfrage` → `abbruch` mit Grund `eigenverschulden`; an vier Stellen im Code einzeln abgesichert (`quali_offen`, Makler-Guard, Werkstatt-Finder-Guard, Migration `20260714190546`) |

Downstream-Leser von `freie_werkstattwahl`: `istWerkstattReparaturWeg()` (`abrechnungsweg.ts:113`,
„alles außer explizitem false" = Werkstatt-Strecke), `convert-lead-to-claim.ts:554` (Lead→Claim),
`spiegle-quali-auf-claim.ts:37` (Nachzug nach Konversion, nur leere Felder),
`api/cron/repair-reminders/route.ts:98` (liest vom **Lead**, nicht vom Claim), Trigger-Bedingung in
`20260713161645` (`NEW.freie_werkstattwahl IS NOT TRUE`).

### 3.3 Was bei Ausgang B schiefgeht

* `KaskoEndansicht` (`src/i18n/messages/de.json` `selfService.kasko`): „Danke für deine Angaben / Bei
  selbstverschuldeten Unfällen lassen sich die Gutachterkosten leider nicht über die gegnerische
  Haftpflichtversicherung regulieren – daher können wir dir hier keinen kostenfreien Termin anbieten."
  → Für den Werkstattbindungs-Kunden fachlich falsch (es geht um Werkstattwahl, nicht Gutachter).
* Keine Email, keine WhatsApp, keine SMS nach Abbruch. Der Kunde hört nichts mehr.
* Dispatch zeigt nur den Phase-Chip „Disqualifiziert", nie den Grund; kein Kasko-/Selbstzahler-Badge;
  `gespraech-content.ts:130-137` behandelt Kasko als „nicht unser Zuständigkeitsbereich … sauber abschließen".
* Kunde-Portal ruft `istWerkstattReparaturWeg(abrechnungsweg)` **ohne** zweites Argument auf
  (`kunde-claim-view.ts:703`, `StatusZone.tsx:78`) und verlässt sich darauf, dass gebundene Fälle nie
  konvertieren.

### 3.4 Eingänge, die Selbstverschulden erfassen

| Eingang | Datei | erfasst |
|---|---|---|
| Werkstatt-Finder-Embed | `src/app/embed/werkstatt-finder/_components/AbrechnungStep.tsx` | 3 Karten haftpflicht/kasko/selbstzahler → `schuldfrage` + `eigene_versicherung`; **WB nicht gefragt** (holt der Flow-Step nach) |
| Makler-Drawer | `src/app/makler/(shell)/leads/NeueAnfrageDrawer.tsx:152` | „Hat der Kunde eine Kaskoversicherung?" ja/nein |
| Kunde „Schaden melden" / Admin-Fallanlage | `qualiAusSchadensart()` | aus `schadens_art` (vollkasko/teilkasko → eigenverantwortung + ja) |
| Gutachter-Finder-Embed / Berater-API `melde-schaden` | gfa | nur `gegner`/`unklar` — Selbstverschulden strukturell nicht erfassbar |
| Marketing `/check` | `anfragen.payload.check.schuld='selbst'` | → `leads.schuldfrage=NULL` (Befund 4, Abschnitt 5) |

---

## 4 · Bestand Anspruchsprüfung

Drei unabhängige Implementierungen, kein gemeinsamer Code, Typ oder Tabelle:

| # | Name | Build | Art | Kasko-Behandlung heute |
|---|---|---|---|---|
| A | `/check`-Quiz | `claimondo-marketing/` | 3 Klickfragen (`schuld`, `unfall_her`, `gutachten`), Tier `voll\|quote\|pruefen\|kasko` (`lib/check/result-model.ts:31`), keine Rechnung | `schuld='selbst'` → Tier `kasko`: „Wir helfen auch bei eigener Schuld … über Ihre Kaskoversicherung regeln wir Gutachten, **Werkstatt** und Abwicklung", Position „Werkstatt & Reparatur – **Koordination mit der Partnerwerkstatt**", Hinweis „Auch im Kasko-Fall lohnt sich ein unabhängiges Gutachten" — **unbedingt**, ohne Tarifwissen |
| B | Foto-Tool | `src/app/embed/anspruch-pruefen/**`, `src/lib/anspruch/**` | Anthropic-Vision (Bild) + regelbasierte Positionen aus 5 DB-Tabellen (`anspruch_config` u. a.) | `schuld='selbst'` → Darstellung „Fahrzeugschaden über Ihre Vollkasko, abzüglich Selbstbeteiligung", Rest „entfällt"; Empfehlung „Regulierung über Ihre Kasko"; CTA bleibt „Gutachter beauftragen" |
| C | Berater-API `GET /api/v1/pruefe-anspruch` | `src/app/api/v1/pruefe-anspruch/route.ts` | statischer Katalog für LLM-Assistenten (llms.txt) | einzige Prüfung mit `vollkasko=ja\|nein\|unbekannt`: „Erster Schritt ist die Werkstatt … Partner-Werkstätten finden: claimondo.de/werkstatt-finden" — **unbedingt** |

Befunde (alle im Worktree/prod verifiziert):

1. **Werkstattbindung kommt in keiner der drei Prüfungen vor** (0 Treffer `werkstattbindung`,
   `freie_werkstattwahl`, `tarif`, `kürzung`, `servicebaustein`; auch in keinem der 9 Design-Dokumente).
2. **`convert_anfrage_zu_lead` kennt `selbst` nicht** (prod-Funktionstext geprüft): Whitelist
   `gegner|unklar|teils→unklar|eigenverantwortung`; das Formular sendet `selbst` → `leads.schuldfrage=NULL`.
   Das Tier `kasko` landet korrekt in `auswertung_unverbindlich` — **die Spalte hat null Code-Consumer**,
   obwohl sie per Grant (`20260901182708:15`) kundensichtbar ist. Der Migrationskommentar „wird bei der
   Lead→Claim-Konversion durchgereicht" trifft nicht zu.
3. Beträge sind über alle Schuldformen identisch (bewusste Entscheidung 05.07., Test hält es fest);
   Schuldform ändert nur Darstellung. Keine Selbstbeteiligung als Betrag.
4. Foto-CTA erreicht Kasko-Kunden nie (`showRanges`-Gate); `promoteSessionAufLead` ist toter Code;
   Carry-over auf den Lead überträgt Fotos/Fahrbereitschaft/EZ, **nicht** `schuld`/`positionen`.
5. Die Anspruchsprüfung läuft **vor** der Werkstattbindungs-Frage im Flow: Der Kunde liest im Check
   „Koordination mit der Partnerwerkstatt" und wird Schritte später wegen Werkstattbindung disqualifiziert.

Detailbericht: Scratchpad `scan-anspruchspruefung.md` (979 Zeilen, Session 363abccc).

---

## 5 · Lücken für „Versicherer + Tarif wählen lassen"

1. Keine Tarif-Tabelle, keine Marken-Ebene, keine WB-Spalte (`versicherungen` hat 15 Stammdaten-Spalten).
2. Kein Feld für Name/FK der **eigenen** Versicherung und des Tarifs auf `leads`/`claims`.
3. `freie_werkstattwahl` ohne Herkunft (Kunde? Tarif? Dokument? Dispatcher?).
4. WB-Frage doppelt und umgekehrt gepolt; Abbruchtext falsch; keine Kommunikation nach Abbruch.
5. Dispatch sieht weder Grund noch Kasko-Status; Leitfaden widerspricht dem Flow.
6. Anspruchsprüfung (A/B/C) verspricht Partnerwerkstatt ohne Tarifwissen; `selbst` verliert die Schuldfrage.
7. `versicherungen`-Seed nicht replay-fähig → ein neuer Seed darf **nicht** auf `versicherungen.id`
   (UUIDs) verweisen, sondern muss über Namen/Slugs koppeln.
8. Marketing-Build hat eigene, unverbundene Versicherer-Daten (`data/versicherer-detail.ts` mit Feld
   `werkstattnetz`, 11 Einträge; `data/versicherer-mapping.ts`, 15 Einträge).
9. Drei Eingänge (Embed-Werkstatt-Finder, Kunden-Schadenmeldung, Werkstatt-QR) vermitteln im Kasko-Fall
   ohne Bindungsfrage; `istWerkstattReparaturWeg` an 7/8 Stellen ohne Bindungs-Argument.
10. Kein Text im Produkt oder Marketing erklärt die Kürzung bei Missachtung der Bindung; 173 Stadtseiten
    und `llms.txt` behaupten absolut „freie Werkstattwahl", eine autounfall-io-FAQ ist fachlich falsch.

---

## 6 · Bestand Werkstatt-Vermittlung

### 6.1 Datenmodell und Matching

* `werkstaetten`: Baseline 11 Spalten + Vermittler-Erweiterung (`user_id`, `provision_betrag_netto`
  default 150, `provision_aktiv`, `status aktiv|gesperrt`) + Matching-Achsen (`marken text[]`,
  `ist_freie_werkstatt`, `fahrzeug_gruppen` = harter Filter) + `verifiziert`, `google_rating`, `isochrone`.
  `faehigkeiten` ist eine Type-Lag-Spalte. Beide Matching-Loader nutzen den **ungetypten** Admin-Client.
* **Zwei Engines nebeneinander.** A (`src/lib/werkstatt/matching/rank-vorschlaege.ts` +
  `lade-vorschlaege.ts`; FlowLink + Embed): Distanz dominiert (ganze km), `MAX_UMKREIS_KM = 50` **nur mit
  Geo-Anker** (Anker = Fahrzeugstandort → Besichtigungsort → Unfallort; Claim nur `schadenort_lat/lng`),
  Gewerke-Fit hart ab `bedarfConfidence >= 60`, leere Fähigkeiten = „unbekannt". B
  (`src/lib/werkstatt/finder.ts` via `vermittlung-server.ts`; Dispatch + Kunde-Portal): ohne Koordinaten
  alphabetisch (prod 73/81 Claims, seit 31.08. einmaliges Geocoding persistiert), leere Fähigkeiten =
  „kann alles". Die Engines bewerten eine ungepflegte Werkstatt **gegensätzlich**.
* Zwei Zuweisungsachsen: `werkstatt_id` = **inbound** (werbende Werkstatt, QR) ·
  `reparatur_werkstatt_id` = **outbound** (Claimondo steuert), Quelle-CHECK
  `dispatcher|kunde|embed|gutachter|kb|qr_referral`. Ein Schreibkern `buildZuweisungPatch`
  (`vermittlung-core.ts:70`), zwei Aufrufer (`vermittlung-server.ts:211`, `embed-finder-core.ts:67`).
  `assignReparaturWerkstatt` hat ein SA-Gate **nur** bei Haftpflicht und **keinen Guard auf
  `freie_werkstattwahl`**.
* **Kasko-Vermittlung ist nicht monetarisiert:** Provision nur inbound (`claims.werkstatt_id`,
  Entscheidung Aaron 11.07. „definitiv", Migration `20260711141617`). Das Trigger-SQL prüft dabei
  keinen Schadentyp — ein Kasko-Lead über Werkstatt-QR löst dieselbe Provision aus wie Haftpflicht.

### 6.2 Wo Werkstätten vermittelt werden (sechs Einstiege, ein Schreibkern)

FlowLink-Steps `werkstatt`/`werkstatt_anzeige` (Text „Die nächstgelegenen Partner-Werkstätten …") ·
Kunde-Portal `WerkstattFinderCard` (Gate `brauchtVermittlung && reparaturPhaseErreicht`; bei
Kasko/Selbstzahler sofort, Haftpflicht erst nach Gutachten) · Embed `/embed/werkstatt-finder`
(4-Schritt-Wizard, Zuweisung **beim Lead-INSERT**) · QR `/start/werkstatt/[id]` und
`/start/werkstatt-qr/[token]` (DB-Trigger setzt die werbende Werkstatt als Reparateur, außer
`freie_werkstattwahl=true`) · SV-Portal „Partner-Werkstatt vermitteln" (Lead → Sofort-Claim → FlowLink;
die SV-Vorauswahl ist abgelöst) · Dispatch/KB `WerkstattVermittlungPanel`. Kommunikation:
„Deine Reparatur-Werkstatt steht fest" (WA + Email + In-App).

### 6.3 Das Gate und seine drei Umgehungen

Werkstattbindung verhindert eine Vermittlung an **genau einer Stelle** (G1,
`quali-flow-outcome.ts:40-48`): nur im FlowLink-Quali, nur `abrechnungsweg='kasko'`, nur bei explizitem
`freie_werkstattwahl=false`. Drei Eingänge umgehen G1 vollständig — sie erheben die Bindung nie und
weisen trotzdem zu:

| Weg | Datei | Was passiert |
|---|---|---|
| (a) Embed-Werkstatt-Finder | `src/app/embed/werkstatt-finder/_components/AbrechnungStep.tsx:20-22`, `src/lib/werkstatt/embed-finder-core.ts:60-70` | Karte „Über meine Kaskoversicherung" → sofort Werkstattauswahl → `buildZuweisungPatch` beim INSERT, **ohne `freie_werkstattwahl`**. Der spätere `werkstattbindung_check` im Flow kommt zu spät. |
| (b) Kunde-Portal „Schaden melden" | `src/lib/kunde/schaden-melden.ts:58-81` | `schadens_art` vollkasko/teilkasko → `reparaturwunsch='reparatur'` armiert den Finder; `freie_werkstattwahl` nicht im Input. |
| (c) Werkstatt-QR | Trigger `20260707151251`, Bedingung `20260713161645:8` | Auto-Zuweisung der werbenden Werkstatt; unterbleibt nur bei explizitem `freie_werkstattwahl=true`, das auf diesem Weg nie gesetzt wird. |

`istWerkstattReparaturWeg(abrechnungsweg, freieWerkstattwahl?)` wird an **7 von 8 Stellen ohne zweites
Argument** aufgerufen (Convert, Kunde-Claim-View, StatusZone, Flow-Page, Onboarding-Steps, SA-Gate,
Auftrag-Segment); nur der Reminder-Cron übergibt es. Da `undefined !== false`, gilt dort **jeder**
Kasko-Fall als Werkstatt-Strecke — auch ein gebundener, sobald er über (a)–(c) konvertiert wurde. Der
Code verlässt sich darauf, dass gebundene Fälle „nie konvertieren" (`abrechnungsweg.ts:109-111`).

### 6.4 Reparaturwunsch und fiktive Abrechnung

`reparaturwunsch` CHECK `reparatur|fiktiv|unentschieden` (leads + claims); bei `fiktiv` wird bewusst
trotzdem eine Werkstatt angeboten (Relabel `20260724143028`: „Fiktive Abrechnung (Auszahlung,
Reparatur optional)"). **Kein nutzersichtbarer Text** erklärt die finanzielle Folge einer
Werkstattbindung (Kürzung 80/85 %, Sonder-SB, Wegfall Servicebausteine, Kürzung auch bei fiktiver
Abrechnung) — weder im Bindungs-Step noch bei der Abrechnungsart-Frage.

Detailbericht: Scratchpad `scan-werkstatt.md` (1.315 Zeilen), inkl. Liste aller 14 Gates G1–G14.

---

## 7 · Marketing-Landkarte

Vier Builds gescannt: `claimondo-marketing` (marketing), `autounfall-io`, die fünf `kfz-gutachter-*`
(cluster-LP, ein Template: `components/` und Routen byte-identisch, stadtspezifisch nur `lib/cluster.ts`,
`lib/site.ts`, `lib/lokaldaten.ts`) und `marketing-strategy` (Redaktionsablage ohne Laufzeit-Consumer).

### 7.1 Kernbefund

Es gibt genau **eine** Kasko-Seite und genau **eine** Werkstattwahl-Seite. Sie kennen einander nicht:

| Seite | Datei | „Werkstatt" | „Kasko" | verlinkt die andere |
|---|---|---|---|---|
| `/haftpflicht/kasko-versicherung` | `claimondo-marketing/content/claimondo/haftpflicht/kasko-versicherung.md` | **0** | 42 | nein |
| `/decoder/werkstatt-netz` | `claimondo-marketing/content/claimondo/decoder/werkstatt-netz.md` (20+ Inbound-Links) | 28 | **0** | nein |

Werkstattwahl wird durchgängig als Haftpflicht-Thema behandelt („freie Werkstattwahl nach BGH"), Kasko
als Schadenfreiheitsklassen-Thema. Der Schnittpunkt „Werkstattbindung im Kaskotarif" kommt im gesamten
Marketing **an einer einzigen Stelle** vor: `kfz-gutachter-koeln/lib/cluster.ts:317` („anders als bei
manchen Kaskotarifen mit vereinbarter Werkstattbindung"). Der einzige echte WB-Tarifname im Repo ist
„WerkstattservicePLUS" (CosmosDirekt/Generali, 5 Stellen). Kein „SELECT", kein „WerkstattBonus".

### 7.2 Absolute Aussagen ohne Kasko-Vorbehalt (widersprechen einer WB-Wissensbasis)

| Reichweite | Datei:Zeile | Zitat |
|---|---|---|
| **173 Stadtseiten** `/kfz-gutachter/[stadt]`, hardcodiert + JSON-LD FAQPage **und** zweite Fassung via i18n (6 Sprachen) | `app/[locale]/kfz-gutachter/[stadt]/page.tsx:192-193`, `:302` + `i18n/messages/de.json:4059-4060` | „Ja, die freie Werkstattwahl bleibt bestehen." |
| 173 Stadtseiten | `components/gutachter-finden/WerkstattAbdeckungHinweis.tsx:47-51` | „bei selbstverschuldetem Schaden ist die Werkstatt der erste Schritt – mit Vollkasko reguliert Ihre eigene Versicherung" |
| `/kfz-haftpflicht-schaden` (JSON-LD) | `cornerstones/kfz-haftpflicht-schaden.md:345,510` | „Nein. Freie Werkstattwahl." |
| `/decoder/werkstatt-netz` (JSON-LD) | `decoder/werkstatt-netz.md:188,258` | „Nein. Du hast nach ständiger BGH-Rechtsprechung freie Werkstattwahl." |
| Startseite | `i18n/messages/de.json:187` | „Freie Werkstattwahl ist gesetzlich geschützt – auch gegen den Willen der Versicherung." |
| `/llms.txt`, `/llms-full.txt` | `app/llms.txt/route.ts:147`, `llms-full.txt/route.ts:448` | „Darf ich meine eigene Werkstatt behalten? — Ja." |
| autounfall-io `/werkstattwahl-recht` | `content/articles.generated.ts:4538-4539` | **fachlich falsch:** „Muss ich zur Marken-Werkstatt, wenn ich nur Vollkasko habe? — Nein … Versicherer dürfen empfehlen, nicht zwingen." |
| autounfall-io `/versicherer-decoder/partnerwerkstatt` | `content/decoder-data.generated.ts:742` | **einzige saubere Einschränkung:** „Nein. Bei Fremdverschulden gilt grundsätzlich die freie Werkstattwahl" |

Doppelpflege-Falle (im Code dokumentiert, `lib/faq/faqs.ts:16-21`): FAQ-Antworten existieren zweimal —
sichtbar aus `i18n/messages/*.json`, für FAQPage-Schema und `llms-full.txt` aus `lib/faq/faqs.ts`.

### 7.3 Versicherer-Seiten

`/versicherer/[slug]` — 12 Live-Seiten (allianz, axa, cosmosdirekt, da-direkt, ergo, generali, huk24,
huk-coburg-allgemeine, lvm, r-plus-v, vhv, zurich). Faktenbasis `data/versicherer-mapping.ts` (15 Einträge,
kein Tarif-Feld), Detail `data/versicherer-detail.ts` mit `werkstattnetz?: string` (10/12 belegt, beschreibt
die **Drittschaden-Steuerung**, nicht Kasko-Tarife; gerendert in `components/content/SchadensNetzwerk.tsx`).
10 der 12 Seiten haben 0 Treffer zu Werkstattbindung **und** 0 zu Kasko. Die 5 Cluster-LPs nennen keinen
einzigen Versicherer; autounfall-io nur Prüfdienstleister.

### 7.4 Formulare und Einstiege

Kein Marketing-Formular erhebt Versicherer oder Tarif. Zwei erheben die Schuldfrage: `/schaden-melden`
(MiniWizard, `schuldfrage` gegner/unklar/eigenverantwortung → `leads` + FlowLink; Selbstschuld-Leads laufen
seit 03.08. den normalen Magic-Link-Pfad) und `/check` (`schuld` gegner/teils/unklar/selbst → `anfragen`).
`/schaden-melden/selbstverschulden` ist ein **noindex**-Sackgassen-Screen mit CTA auf den Werkstatt-Finder.
`/werkstatt-finden` ist embed-only ohne Content. Embed-Bridge `EmbedFinderSection.tsx:88-91` dokumentiert
für `schuldfrage` nur `gegner | unklar`.

### 7.5 Wo die Wissensbasis wirken sollte (nach Hebel)

**claimondo-marketing:** (1) `/haftpflicht/kasko-versicherung` — Kasko-Seite ohne Werkstatt-Wort ·
(2) `/decoder/werkstatt-netz` — Werkstatt-Seite ohne Kasko-Wort · (3) `/kfz-gutachter/[stadt]` — 173×
absolute Aussage, zweifach gepflegt · (4) `/versicherer/[slug]` — Feld `werkstattnetz` als Andockpunkt ·
(5) `/check` — Tier `kasko` verspricht Partnerwerkstatt · (6) `/schaden-melden(/selbstverschulden)` ·
(7) `/faq` (doppelt gepflegt) · (8) `/kfz-haftpflicht-schaden` JSON-LD · (9) `/unverschuldeter-unfall-rechte` ·
(10) `/wissen/<slug>` (DB-getrieben, ohne Deploy befüllbar) · (11) `/llms.txt`, `/llms-full.txt` ·
(12) `/werkstatt-finden` (embed-only, ohne Content). **Keine** passende Route existiert
(`/ratgeber/werkstattbindung`, `/kasko`, `/tools/*` fehlen); Navigation hat keinen Kasko-Eintrag.

**autounfall-io:** `/werkstattwahl-recht` (falsche Vollkasko-FAQ) · `/versicherer-decoder/partnerwerkstatt`
(Vorbild) · `/reparatur`, `/verweisrecht-versicherung`, `/werkstatt-direkt-vs-spaeter` · Kaskofall-Artikel
(`/parkschaden`, `/vandalismus`, `/hagel-sturmschaden`, `/marderschaden`, `/wildunfall`,
`/steinschlag-glasbruch`, `/spezialfaelle`) · `/unfall-assistance` (Kasko-Ergebnispfad) ·
`/gutachter-wer-beauftragt` (kennt den SV-Pool in Kaskobedingungen) · `/kuerzungs-checker`.

**Cluster-LPs:** Köln `lib/cluster.ts:317` als Vorlage für die anderen vier; `lib/content.ts:342-343`
wirkt fünffach; `faqLokal` in `lib/lokaldaten.ts` ungenutzt; Supabase `stadt_lokalinhalte` ohne Deploy
befüllbar. ⚠ Gleichlautender WB-Text über alle Städte verschärft das Near-Duplicate-Problem
(Bonn 72,8 %, Aachen 75–88 %, Köln nach Fix 36 %).

Bestehende Tools als Muster: Wertminderungs-/Nutzungsausfall-Rechner, `/check`, `/ersteinschaetzung`
(marketing); Unfall-Assistance-Wizard, Kürzungs-Checker, SF-Rechner, Versicherer-Decoder (autounfall-io).

Detailbericht: Scratchpad `scan-marketing.md` (526 Zeilen).

---

## 8 · Marken-Mapping CHECK24 (71) → `versicherungen` (97)

Legende: ✓ Rechtsträger vorhanden · ✓² zwei Rechtsträger passen · ~ Alias/Altname/Holding · ✗ fehlt

| Nr | Marke (CHECK24) | `versicherungen.name` | Match |
|---|---|---|---|
| 1 | ADAC Autoversicherung | ADAC Autoversicherung AG | ✓ |
| 2 | AdmiralDirekt | – (Vertriebsmarke, Risikoträger Itzehoer) | ✗ |
| 3 | AIG Europe | Chartis Europe S.A. (AIG-Altname bis 2012) | ~ |
| 4 | Allianz | Allianz Versicherungs-AG | ✓ |
| 5 | Allianz Direct | Allianz Direct | ✓ |
| 6 | Alte Leipziger | Alte Leipziger Versicherung AG | ✓ |
| 7 | Autosan | – | ✗ |
| 8 | AvD | – | ✗ |
| 9 | AXA | AXA Versicherung AG | ✓ |
| 10 | Barmenia Direkt | – (Marke; Rechtsträger Barmenia Allgemeine ✓) | ✗ Marke |
| 11 | BarmeniaGothaer | Barmenia Allgemeine Versicherungs-AG / Gothaer Allgemeine Versicherung AG | ✓² |
| 12 | BavariaDirekt | – | ✗ |
| 13 | BavariaProtect | – | ✗ |
| 14 | BGV / Badische Versicherungen | Badischer Gemeinde-Versicherungs-Verband / Badische Allgemeine Versicherung AG | ✓² |
| 15 | Concordia | Concordia Versicherungs-Gesellschaft a.G. | ✓ |
| 16 | CosmosDirekt | Cosmos Versicherung AG | ✓ |
| 17 | DA Direkt | DA Deutsche Allgemeine Versicherung AG | ✓ |
| 18 | DBV | DBV Deutsche Beamten-Versicherung AG | ✓ |
| 19 | Debeka | Debeka Allgemeine Versicherung AG | ✓ |
| 20 | DEVK | DEVK Allgemeine Versicherungs-AG | ✓ |
| 21 | Dialog | – (Generali-Gruppe) | ✗ |
| 22 | Die Bayerische | Bayerische Beamten Versicherung AG | ✓ |
| 23 | Die Continentale | Continentale Sachversicherung AG | ✓ |
| 24 | Die Lippische | Lippische Landesbrandversicherung AG | ✓ |
| 25 | ERGO | ERGO Versicherung AG | ✓ |
| 26 | Europa | EUROPA Sachversicherung AG | ✓ |
| 27 | EUROPA-go | – (Marke; Rechtsträger EUROPA ✓) | ✗ Marke |
| 28 | Fahrlehrerversicherung | Fahrlehrerversicherung VaG | ✓ |
| 29 | Feuersozietät | Feuersozietät Berlin Brandenburg Versicherung AG | ✓ |
| 30 | Generali | Generali Deutschland Versicherung AG | ✓ |
| 31 | GVV Direkt | GVV-Privatversicherung AG | ✓ |
| 32 | HanseMerkur | HanseMerkur Allgemeine Versicherung AG | ✓ |
| 33 | Helvetia Baloise | Helvetia Schweizerische Versicherungsgesellschaft AG / Baloise Sachversicherung AG Deutschland | ✓² |
| 34 | HUK-COBURG | HUK-COBURG-Allgemeine Versicherung AG / HUK-COBURG Haftpflicht-Unterstützungs-Kasse … a.G. | ✓² |
| 35 | HUK24 | HUK24 AG | ✓ |
| 36 | Inshared | – (Achmea) | ✗ |
| 37 | Itzehoer | Itzehoer Versicherung Brandgilde von 1691 VVaG | ✓ |
| 38 | Janitos | – (HDI-Gruppe) | ✗ |
| 39 | KRAVAG | KRAVAG-ALLGEMEINE Versicherungs-AG (+ LOGISTIC, SACH) | ✓ |
| 40 | LVM | LVM Landwirtschaftlicher Versicherungsverein Münster a.G. | ✓ |
| 41 | Mannheimer | Mannheimer Versicherung AG | ✓ |
| 42 | Mecklenburgische | Mecklenburgische Versicherungs-Gesellschaft a.G. | ✓ |
| 43 | Münchener Verein | Münchener Verein Allgemeine Versicherungs-AG | ✓ |
| 44 | Neodigital | – | ✗ |
| 45 | Öffentliche Braunschweig | Öffentliche Versicherung Braunschweig | ✓ |
| 46 | Öffentliche Oldenburg | Öffentliche Versicherung Oldenburg | ✓ |
| 47 | ÖSA | Öffentliche Feuerversicherung Sachsen-Anhalt | ✓ |
| 48 | Prokundo | – | ✗ |
| 49 | Provinzial | Provinzial Rheinland Versicherung AG / Westfälische Provinzial Versicherung AG | ✓² |
| 50 | Provinzial Nord | Provinzial Nord Brandkasse AG | ✓ |
| 51 | R+V | R+V Allgemeine Versicherung AG (+ R+V Direktversicherung AG) | ✓ |
| 52 | RheinLand | Rheinland Versicherungs AG | ✓ |
| 53 | rhion.digital | – (Marke der RheinLand ✓) | ✗ Marke |
| 54 | Saarland | Saarland Feuerversicherung AG | ✓ |
| 55 | Signal Iduna | Signal Iduna Allgemeine Versicherung AG | ✓ |
| 56 | Sparkassen Direkt | Sparkassen DirektVersicherung AG | ✓ |
| 57 | SV Sachsen | Sparkassen-Versicherung Sachsen | ✓ |
| 58 | SV SparkassenVersicherung | SV Sparkassen-Versicherung Holding AG (Holding) | ~ |
| 59 | uniVersa | UniVersa Allgemeine Versicherung AG | ✓ |
| 60 | Versicherungskammer Bayern | Versicherungskammer Bayern | ✓ |
| 61 | Verti | Verti Versicherung AG | ✓ |
| 62 | VGH | VGH Landschaftliche Brandkasse Hannover | ✓ |
| 63 | VHV | VHV Allgemeine Versicherung AG | ✓ |
| 64 | VÖDAG | – | ✗ |
| 65 | Volkswagen Autoversicherung AG | – | ✗ |
| 66 | Volkswohl-Bund | VOLKSWOHL-BUND Sachversicherung AG | ✓ |
| 67 | VRK | Bruderhilfe Sachversicherung AG im Raum der Kirchen | ~ |
| 68 | WGV | WGV-Versicherung AG | ✓ |
| 69 | Württembergische | Württembergische Versicherung AG | ✓ |
| 70 | WWK | WWK Allgemeine Versicherung AG | ✓ |
| 71 | Zurich | Zurich Insurance plc | ✓ |

**Bilanz:** 50 ✓ · 5 ✓² · 3 ~ · 13 ✗ (davon 3 Marken mit vorhandenem Rechtsträger).
**Schluss:** Eine eigene Marken-Ebene ist nötig; die Tarif-Wissensbasis darf nicht 1:1 an `versicherungen`
hängen. Der Link Marke → Rechtsträger ist optional und dient dem Zugriff auf Schaden-Hotline/-Email.

---

## 9 · Design-Optionen (Vorschlag zur Diskussion — noch nichts gebaut)

### 9.1 Datenmodell

**Option A (Empfehlung): normalisierte Wissensbasis, gekoppelt über Slug, nicht über UUID.**

* `kasko_versicherer_marken` — je CHECK24-Marke: `slug` (unique), `marke`, `versicherung_id` (FK
  `versicherungen`, **nullable**, per Namensabgleich nachgefüllt), `wb_status` CHECK
  `optional|standard|keine`, `wb_marker text[]` (exakte Namenszusätze wie „SELECT", „mit Werkstattbonus"),
  `nicht_wb_marker text[]` (Verwechsler wie „Kasko Spezial", „Nix-Passiert"), `wb_hinweis`
  (z. B. „Bindungscharakter aus Bezeichnung abgeleitet – AKB prüfen"), `check24_vertrieb` (`P|L`),
  `quelle`, `stand` (Datum), `aktiv`.
* `kasko_tarife` — je Tariflinie: `marke_id`, `tarifname` (exakte CHECK24-Schreibweise),
  `hat_werkstattbindung` bool, `bindungsumfang` CHECK `voll|nur_glas|unklar`, `verlaesslichkeit` CHECK
  `belegt|abgeleitet|nicht_belegt`, `reihenfolge`, `aktiv`. Unique `(marke_id, tarifname)`.
* `kasko_wb_konditionen` — je Marke (Tabelle B): `nachlass_text`, `sanktion_modell` CHECK
  `kuerzung_80|kuerzung_85|sonder_sb|deckelung|vollverweigerung|unbekannt`, `sanktion_text`,
  `gilt_fuer`, `ausnahmen`, `partnernetz`, `akb_fundstelle`, `quelle`; plus eine Default-Zeile
  „GDV-Muster" für alle nicht belegten Anbieter.
* Seed aus einer versionierten Strukturdatei im Repo (`data/kasko-werkstattbindung-2026-07-20.json`)
  über ein Generator-Script → Migration ohne harte UUIDs (Marken per `slug`, `versicherung_id` per
  `UPDATE … WHERE name = …`). RLS: anon/authenticated SELECT (Referenzdaten wie `anspruch_config`),
  Schreiben nur Admin/Service-Role.
* Auf `leads` und `claims`: `eigene_versicherung_marke_id` (FK), `eigene_versicherung_name` (Freitext-
  Fallback), `eigene_kasko_tarif_id` (FK), `eigene_kasko_tarif_name` (Freitext), `werkstattbindung_quelle`
  CHECK `tarif|kunde|dispatcher|dokument`. **`freie_werkstattwahl` bleibt das Entscheidungsfeld** und wird
  aus dem Tarif abgeleitet (`hat_werkstattbindung=false` → true; `nur_glas` bei Karosserieschaden → true
  mit Hinweis). Alle Downstream-Leser bleiben unverändert. Konversion (`convert-lead-to-claim.ts`) und
  Spiegel-Allowlist (`spiegle-quali-auf-claim.ts:32`) um die neuen Felder erweitern.

**Option B: eine Config-Tabelle mit JSONB je Marke.** Weniger DDL, aber keine FK-Integrität für den
gewählten Tarif, schwer abfragbar, Admin-Pflege umständlich. Nicht empfohlen.

**Option C: TS-Konstante im Repo** (wie `sf-versicherer.ts`). Schnell, aber gegen die Vorgabe „in die
Datenbank", nicht admin-pflegbar, und App + Marketing sind getrennte Builds → zwei Kopien. Abgelehnt.

### 9.2 Kundenweg im Kasko-Szenario (ersetzt `werkstattbindung_check`)

Neuer DB-Step `kasko_tarif_check` (Bedingung `{"freie_werkstattwahl": null}`) in drei Schritten:

1. **„Bei welcher Versicherung ist Ihr Auto kaskoversichert?"** — Combobox über die 71 Marken (Suche,
   Logo optional), Option „Andere / nicht dabei" (Freitext). Wiederverwendung des Musters
   `VersicherungAutocomplete` mit neuer Datenquelle.
2. **Je `wb_status`:** `keine` (LVM, Mannheimer, Münchener Verein, AIG) → kein Tarif nötig, sofort „freie
   Werkstattwahl" · `standard` (Volkswagen Autoversicherung) → sofort „Werkstattbindung" · `optional` →
   **„Welchen Tarif haben Sie?"** Liste der Tariflinien der Marke, jede Zeile mit Badge „freie
   Werkstattwahl" / „Werkstattbindung" (z. B. HUK: Basis · Basis SELECT · Classic · Classic SELECT …).
   Option „Ich weiß es nicht / steht nicht dabei" → Fallback: „Schauen Sie auf Ihren Versicherungsschein:
   Steht dort **‚SELECT'**?" (Marker der Marke) → Ja / Nein / Kann ich gerade nicht prüfen.
3. **Ergebnis:** frei → weiter zur Werkstatt-Strecke (heutiger Weg) · gebunden → **neue, ehrliche
   Endseite** mit Marke, Marker, Sanktion (Tabelle B), Schaden-Hotline/-Email aus `versicherungen`,
   nächsten Schritten (Schaden melden, Partnerwerkstatt benennen lassen) und Ausnahmen (Totalschaden,
   Ausland, keine erreichbare Partnerwerkstatt) — statt der Gutachter-Textseite · unbekannt →
   **Entscheidung Aaron** (siehe 9.5).

Immer mit Disclaimer: „Maßgeblich ist Ihr Versicherungsschein / Ihre AKB." Einträge mit
`verlaesslichkeit ≠ belegt` (BGV, Württembergische, KRAVAG Glas, CosmosDirekt Basis) tragen den Hinweis
sichtbar.

**Die drei Umgehungen schließen** (sonst bleibt das Gate Kosmetik): Embed-Werkstatt-Finder bekommt bei
Karte „Über meine Kaskoversicherung" dieselbe Versicherer-/Tarif-Frage **vor** der Werkstattauswahl
(gleiche Komponente); Kunden-Schadenmeldung bei `schadens_art` vollkasko/teilkasko ebenso; der
QR-Trigger unterbleibt zusätzlich bei `freie_werkstattwahl=false`. `istWerkstattReparaturWeg` erhält an
den 7 Stellen das Bindungs-Argument (oder liest es zentral aus dem Claim), damit ein gebundener Fall,
der doch konvertiert, nicht als Werkstatt-Strecke läuft. Die Abrechnungsart-Frage („Fiktive Abrechnung")
erhält bei Bindung den Hinweis „Kürzung greift auch bei fiktiver Abrechnung".

### 9.3 Dispatch / Admin

Lead-Detail: Versicherer, Tarif, WB-Badge mit Herkunft; Override durch Dispatcher (`quelle='dispatcher'`);
Abbruchgrund sichtbar machen; Gesprächsleitfaden Kasko aktualisieren. Admin: Liste der Marken/Tarife
(Phase 1 read-only, Pflege später — die Liste ändert sich ein- bis zweimal pro Jahr).

### 9.4 Anspruchsprüfung

* **A `/check`:** bei `schuld='selbst'` optionale Folgefragen Versicherer → Tarif; Tier `kasko` teilt
  sich in `kasko_frei` / `kasko_gebunden` / `kasko` (unbekannt) mit passenden Positionen (Partnerwerkstatt
  nur bei frei). Fix Befund 4: `selbst → eigenverantwortung` in `convert_anfrage_zu_lead` (Regel 2;
  die Kante „eigenverantwortung ohne Versicherungsantwort" fängt der `unqualifiziert`-Quali-Step).
  Versicherer/Tarif/WB in `auswertung_unverbindlich.antworten` und die neuen Lead-Spalten.
* **C API:** Parameter `werkstattbindung=ja|nein|unbekannt` (+ optional `versicherer`, `tarif`),
  Texte bedingt; neue öffentliche Lookup-Route `GET /api/v1/kasko-werkstattbindung?versicherer=&tarif=`
  für KI-Assistenten (llms.txt).
* **B Foto-Tool:** Hinweis bei `selbst` mit Link zum Tarif-Check; keine eigene Erhebung.

### 9.5 Entscheidungen, die Aaron treffen muss

| # | Frage | Empfehlung |
|---|---|---|
| E1 | Marken-Ebene (Option A) oder fehlende Marken als `versicherungen`-Zeilen? | Option A — `versicherungen` bleibt Rechtsträger/Schaden-Adressat |
| E2 | WB = ja: nur ehrliche Endseite ohne Vermittlung, oder zusätzlich Rückruf-Angebot / Dispatch-Aufgabe? | Endseite mit konkreten nächsten Schritten + optionaler Rückruf-Button; keine Werkstatt-Vermittlung |
| E3 | WB unbekannt („kann ich nicht prüfen"): durchlassen mit Warnhinweis (heutiges `null`-Verhalten), Rückruf, oder Stopp? | Durchlassen mit Hinweis **und** Dispatch-Aufgabe „Werkstattbindung klären" |
| E4 | Umfang Phase 1: nur KB + FlowLink, oder auch `/check` und Marketing? | Phase 1 = KB + Flow + Dispatch-Sichtbarkeit; Phase 2 = Anspruchsprüfung (inkl. Befund-4-Fix); Phase 3 = Marketing/GEO |
| E5 | Admin-Pflege der Tarife in Phase 1 (nur Liste) oder später (Edit)? | Phase 1 read-only Liste, Edit später |
| E6 | Kundenkanäle nach Abbruch (Email/WA mit Zusammenfassung „so geht es weiter")? | Ja, eine Zusammenfassungs-Mail mit Versicherer-Kontakt — kleiner Aufwand, großer Vertrauensgewinn |
| E7 | Teilkasko-/Glas-Fälle: Bindungsumfang `nur_glas` (Signal Iduna/VÖDAG) bei Karosserieschaden als frei behandeln? | Ja, mit Hinweis |

Annahmen ohne Rückfrage: Die Tariffrage wird **nur** im Kasko-Szenario gestellt (Haftpflicht: freie
Wahl kraft BGH, Selbstzahler: keine Police). `unklar`/Teilschuld bleibt beim Dispatch-Rückruf.
