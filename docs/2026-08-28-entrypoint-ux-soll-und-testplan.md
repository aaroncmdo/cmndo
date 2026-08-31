# Entry-Points der Webseite → Claim-Abschluss (Variante „nur Gutachter")

> ## ⚠ Bilanz zuerst — vier von zehn „Befunden" waren Messfehler
>
> Nach Gegenprüfung jedes einzelnen Punkts bleibt:
>
> | Nr | Befund | Verdikt |
> |---|---|---|
> | **1** | Mini-Wizard speichert die falsche Stadt | **echt — Ursache bewiesen, GEFIXT** (§5.2) |
> | 2 | Interner Test-Lead wird echtem Gutachter zugewiesen | echt, offen (§5.3) |
> | 3 | „Auswählen" bei der Werkstattwahl schreibt nichts | ❌ **Messfehler** — Reparatur-Intent fehlte; der Nebenbefund (Step erscheint ohne Intent) ist **GEFIXT** (§5.4.1) |
> | 4 | Kundenbetreuer trotz `nur_gutachter` | echt, Produktentscheid (§5.5) |
> | 5 | Unfallskizze entsteht nicht | unklar — Anthropic-Guthaben prüfen (§5.6) |
> | 6 | Telefon Pflicht trotz „WhatsApp **oder** E-Mail" | echt, UX (§5.7) |
> | 7 | „Drei kurze Fragen" → 18 Schritte | echt, UX (§5.8) |
> | 8 | Finder bestätigt Termin, den es nicht gibt | ❌ **Messfehler** — Guard griff korrekt (§5.11) |
> | 9 | Absende-Button unter Overlays | **echt, und grösser als gedacht.** #5717 fixte nur den Fall „Feld beim Laden vorbefüllt". Der Fall „Nutzer **wählt** einen Vorschlag" blieb offen — auf `/check` damit **kein Lead möglich** — und ist erst jetzt gefixt (§5.19) |
> | 10 | Stadtseiten-Anfrage „sieht niemand" | ❌ **Messfehler** — eigene Dispatch-Ansicht (§5.12) |
> | — | Ort geht am Lead verloren | ❌ **Messfehler** — landet in `kunde_plz` (§5.17). Die Nachprüfung fand daneben einen **echten**: das Server-Geocoding warf PLZ und Ort weg → **GEFIXT** (#5720) |
> | — | Abschluss ohne Termin unerreichbar | ⚠ **halb** — Ursache war der Guard, die fehlende Dispatch-Aktion bleibt (§5.16) |
>
> **Was die Fehlbefunde gemeinsam haben:** Meine Test-Identität war intern (`@claimondo.de`).
> Der Test-SV-Guard und die Send-Isolation greifen dort **absichtlich** — und ein blockierter
> Schutzmechanismus sieht in der Datenbank genauso aus wie ein kaputtes Feature. Dazu kamen zu
> enge Abfragen (falsche Spalte, Suche über eine E-Mail, die das Formular nie erhebt).
>
> ⭐ **Die Gegenprobe war jedes Mal billiger als der Fehlbefund:** ein Screenshot öffnen, eine
> Vorbedingung setzen, die zweite Ansicht aufrufen, die richtige Spalte lesen.


> **Phase 1 von 2.** Auftrag Aaron 28.08.2026: „spiele alle entry points von der webseite anonym
> durch bis zum abschluss des claims (immer in der variante nur gutachter) … am anfang schaust du
> welche entry points wir haben, wie der operative ux ablauf logisch wäre und optimal wäre — immer
> mit dem ziel, dass wir keine abbrüche haben und der kunde in einem fluss in die app kommt und
> auch durch die app geleitet wird und mitteilungen als whatsapps bekommt. und danach machen wir
> die tests und eine bestandsaufnahme."
>
> Dieses Dokument ist **Phase 1**: Entry-Point-Karte (Ist) + operatives Soll (Prosa, nach Regel 4
> Schritt 1: *hergeleitet aus der Fachlogik, nicht aus dem Code gelesen*) + Testplan.
> Die Testergebnisse kommen als Phase 2 in dieses Dokument.
>
> Erhebung im frischen Worktree auf `origin/staging` (`05d0c0d09`), DB-Zahlen READ-only gegen
> prod (`paizkjajbuxxksdoycev`), Stand 28.08.2026.

---

## 0 · Was „nur Gutachter" technisch ist — und wo die Wahl fällt

| | |
|---|---|
| **Feld** | `leads.service_typ` / `claims.service_typ`, CHECK `('komplett','nur_gutachter')` |
| **UI** | `onboarding_felder.service_typ`, Typ `toggle-cards`: „Komplettservice (empfohlen) — Anwalt + Vollmacht inkl., 0 EUR" vs. **„Nur Gutachten — Sie regulieren selbst mit der gegnerischen Versicherung"** |
| **Folge-Feld** | `kanzlei_wunsch` ist `conditional_on: {service_typ: komplett}` → bei „Nur Gutachten" **entfällt die Anwalt-Frage** |
| **Wo gewählt** | **Ausschließlich im `sa`-Step des `/flow`-Wizards** (Sektion `service_kanzlei`). Kein Meldeweg erhebt sie vorher. |
| **Weg im Claim** | kein KB, keine Kanzlei, **keine Regulierungs-Phase** (`getVisibleMainPhases` blendet sie aus): Erfassung → Begutachtung → Abschluss |
| **Terminal** | `operative_status = 'termin_durchgefuehrt'` via `closeNurGutachterTerminAlsDurchgefuehrt` (`src/lib/termine/close-nur-gutachter-termin.ts`) |
| **Wer schließt ab** | drei Caller: **SV** (`markNurGutachterTerminDurchgefuehrt`), **Kunde** (`bestaetigeTerminAlsKunde`), **WhatsApp-Inbound** (Phone-Match, kein Login) |
| **Prod-Bestand** | 23 Claims `nur_gutachter` / 56 `komplett`; Leads 120 Tage: 16× `self_service`, je 2× `makler-anfrage-flowlink` / `schaden-karte`, 1× `chatgpt.com` |

**⚠ Befund 0-A (vor jedem Test, aus der DB):** `gutachter_finder_anfragen.regulierungs_modus` ist
**50 von 50 NULL**. Das Feld existiert (`onboarding_felder` mit `db_target` darauf,
`gutachter-finder-actions.ts:390` schreibt es), wird aber nie befüllt — **der Embed-Finder erhebt
die Service-Wahl nicht.** Zusätzlich divergieren die Werte: der TS-Typ dort kennt
`'vollstaendig' | 'nur_gutachten'`, die Feld-Definition und der CHECK kennen
`'komplett' | 'nur_gutachter'`. Selbst wenn jemand das Feld befüllte, käme der Wert nicht an.

**Konsequenz für den Auftrag:** Die Variante „nur Gutachter" ist **kein Entry-Point-Merkmal**,
sondern eine Weiche **im Flow**. Alle Einstiege münden erst zusammen, dann wird gewählt. Das
vereinfacht den Testplan (§4) erheblich und ist gleichzeitig der wichtigste UX-Befund (§3).

---

## 1 · Entry-Point-Karte — was ein anonymer Besucher findet

Zwei Bauten: **claimondo.de** (Marketing-Build `claimondo-marketing/`) und **app.claimondo.de**
(App `src/`, anon-Zugang über die `publicPaths`-Allowlist in `src/lib/supabase/middleware.ts`).
Der Finder auf den Marketing-Seiten ist ein **iframe auf die App** — eine Kette, zwei Hosts.

### 1.1 Marketing (claimondo.de) — Einstiege mit Schreib-Wirkung

| # | Seite | Mechanik | Erzeugt | Kanal an den Kunden |
|---|---|---|---|---|
| **E1** | `/schaden-melden` | Mini-Wizard → `createLeadFromMiniWizard` | Lead (`mini_wizard`) + FlowLink | Magic-Link **per E-Mail** |
| **E2** | `/schaden-melden` „Rückruf anfordern" | Modal → `erstelleOeffentlichenRueckruf` | Lead (`schaden-melden-rueckruf`) + `admin_termine` | telefonisch (bewusst) |
| **E3** | `/schaden-melden/link-versendet` | `RueckrufBuchenCard` → `bucheRueckrufFuerLead` | Rückruf am **bestehenden** Lead | telefonisch |
| **E4** | `/gutachter-finden` | **iframe** → `app/embed/gutachter-finder` | `gfa` + Lead (`self_service`) + FlowLink + Termin | mehrkanalig (WA→SMS→Mail) |
| **E5** | `/werkstatt-finden` | **iframe** → `app/embed/werkstatt-finder` | Lead (`werkstatt_finder`) + FlowLink | **keiner** (nur Client-Redirect) |
| **E6** | `/kfz-gutachter/[stadt]` | **iframe** → `embed/gutachter-finder` (≫300 Stadtseiten) | wie E4 | wie E4 |
| **E7** | `/kfzgutachter-lp` | eigene `actions.ts` + iframe (Ads-Landing, noindex) | Lead | zu prüfen |
| **E8** | `/check` | `CheckFunnelClient` → `check-lead-action` | Lead / `anspruch_schaetzungen` | zu prüfen |
| **E9** | `/` Startseite | `home-lead-action` + `StickyCallBar` (Rückruf) | Lead / Rückruf | zu prüfen |
| **E10** | `BeratungModal` (glass, mehrere Seiten) | `erstelleOeffentlichenRueckruf` | Rückruf-Lead | telefonisch |
| **E11** | `/schaden-melden/selbstverschulden` | iframe | Lead | zu prüfen |
| **E12** | `/beratung-anfragen` | statisch, Widget = E10 | — | — |

Rein statisch (CTA-Router auf E1/E4, **kein** eigener Anlage-Pfad): `/ersteinschaetzung`,
`/wie-es-funktioniert`, `/vorteile`, `/kosten-kfz-gutachten`, die Wissens-/Decoder-/Versicherer-
Cluster. Nicht Kunden-gerichtet: `/gutachter-partner`, `/werkstatt/partner-werden`,
`/makler/partner-werden`, `/flotte/partner-werden`, `/gewinnspiel`.

### 1.2 App (app.claimondo.de) — anon erreichbar

| # | Route | Rolle | Funktion |
|---|---|---|---|
| **A1** | `/embed/gutachter-finder` | Kunde | Karte + 3-Step-Wizard + Termin-Engine (Ziel von E4/E6) |
| **A2** | `/embed/werkstatt-finder` | Kunde | Werkstatt-Suche (Ziel von E5) |
| **A3** | `/g/[slug]` | Kunde | Claimondo-gehostete SV-Widget-Seite (SV ohne eigene Website) |
| **A4** | **`/flow/[token]`** | Kunde | **der Konvergenzpunkt** — hier fällt die Service-Wahl, hier entsteht der Claim |
| **A5** | `/start/[anfrageId]?exp=&sig=` | Kunde | HMAC-Einstieg → Lead + FlowLink → `/flow` |
| **A6** | `/schaden-melden/fortsetzen/[token]` | Kunde | Brücke Marketing-Lead → `/flow` (Reuse, kein Doppel-Mint) |
| **A7** | `/schaden/[token]` | **Gegner** | NFC-/QR-Schadenkarte — meldet der *Verursacher*, nicht der Geschädigte |
| **A8** | `/upload/zb1/[token]`, `/upload/dokumente/[token]` | Kunde | Nachreichungen ohne Account |
| **A9** | `/kunde/termin/[token]`, `/kunde/re-termin/[token]`, `/kunde-termin`, `/kunde-nps/[token]` | Kunde | Termin-Tracking / Umbuchung / Bewertung |

**Struktur in einem Satz:** ~12 Marketing-Einstiege und 3 App-Einstiege erzeugen einen **Lead**;
alle führen (oder sollten führen) auf **einen** FlowLink; `/flow/[token]` ist der einzige Ort, an
dem aus dem Lead ein **Claim** wird.

---

## 2 · Operatives Soll — der Fluss ohne Bruch

> Hergeleitet aus der Fachlogik, nicht aus dem Code. Maßstab für Phase 2; jede Abweichung
> Code ↔ Soll ist ein **Befund**, keine Seed-Hürde.

**Die Leitidee:** Ein Mensch, dem gerade jemand ins Auto gefahren ist, hat *einen* Bedarf und
*wenig* Geduld. Er soll an **einer** Stelle anfangen, **nie** vor einem Login stehen, und ab dem
ersten Absenden **von uns geführt** werden — nicht selbst suchen müssen, wie es weitergeht. Jeder
Punkt, an dem er selbst aktiv werden müsste, ohne dass wir ihn dorthin geleiten, ist ein Abbruch,
den wir uns selbst gebaut haben.

### S1 · Der Einstieg (jeder Kanal, ohne Ausnahme)

Der Besucher gibt ab, was er in diesem Moment weiß — nicht mehr. **Genau ein Absenden**, danach
ist er drin. Egal ob er über die Stadtseite, den Finder, den Mini-Wizard, die Startseite oder den
Rückruf kam, passiert **dasselbe**:

1. Der Vorgang existiert (Lead), und zwar **sofort** — auch wenn erst drei Felder gefüllt sind.
   Ein unvollständiger Vorgang ist besser als ein verlorener.
2. Er bekommt **innerhalb von Sekunden eine WhatsApp** mit einem Link zurück in seinen Vorgang.
   WhatsApp ist der Primärkanal, weil er dort ohnehin ist; E-Mail ist der Rückfall, SMS der
   Rückfall dahinter. **Er muss sich nichts merken und nirgends anmelden.**
3. Wir wissen von ihm — der neue Vorgang ist im Team sichtbar, egal über welchen Kanal er kam.
4. Ein zweites Absenden desselben Schadens (Doppelklick, Netz-Retry, „ich probier's nochmal")
   erzeugt **keinen zweiten Vorgang** und **keine zweite Nachricht**.
5. Bricht die Zustellung über alle Kanäle, entsteht ein **sichtbarer** Auftrag „Melder nicht
   erreichbar" — nie stille Ablage.

### S2 · Die Führung (der Flow)

Der Link öffnet den Vorgang genau dort, **wo er stehen geblieben ist** — nicht am Anfang. Was wir
schon wissen, wird gezeigt, nicht erneut gefragt. Der Wizard fragt in der Reihenfolge, in der ein
Mensch denkt: *Was ist passiert → wo steht das Auto → wann kann jemand schauen → wer macht das →
womit sind Sie einverstanden.*

Die **Service-Entscheidung** („Komplettservice" vs. „Nur Gutachten") ist die einzige echte
Weggabelung. Sie gehört an die Stelle, an der der Kunde sie beurteilen kann — also **nachdem** er
weiß, wer sein Gutachter ist und wann der Termin ist, und **bevor** er unterschreibt. Wählt er
„Nur Gutachten", verschwindet alles Anwaltliche **sofort und sichtbar**: keine Vollmacht, keine
Kanzlei-Frage, kein Mandat. Sein Fortschrittsbalken zeigt drei Stationen, nicht vier — sonst
wartet er auf eine Phase, die für ihn nie kommt.

Jeder Schritt endet mit **einem** naheliegenden Weiter. Es gibt **keinen Zustand ohne Ausweg**:
kein Schritt, der auf sich selbst zurückverweist, kein Button, der nichts tut, keine Auswahl, die
nicht gespeichert wird. Verlässt er den Flow, holt ihn eine Erinnerung zurück — an derselben
Stelle.

### S3 · Die Konversion (Unterschrift)

Mit der Unterschrift wird aus der Anfrage **ein Fall**. In diesem Moment bekommt er **genau eine**
Nachricht: was er beauftragt hat, wer kommt, wann, und was er dafür tun muss (nichts). Ab hier hat
er einen Fall, den er jederzeit ansehen kann — **weiterhin ohne Pflicht-Account**; ein Zugang ist
ein Angebot, keine Hürde.

Intern ist ab jetzt jemand zuständig: Der Gutachter hat einen verbindlichen Auftrag, der Termin
steht, und wenn kein passender Gutachter gefunden wurde, **weiß das Dispatch** — nicht der Kunde.

### S4 · Die Durchführung

Der Kunde erfährt **jeden** Zustandswechsel, der ihn betrifft, per WhatsApp — und **nur** die:
Termin bestätigt, Gutachter unterwegs, Termin erledigt, Gutachten fertig. Was intern passiert
(Qualitätsprüfung, Zuweisungen), erfährt er nicht. **Eine Nachricht pro Ereignis**, nie zwei für
dasselbe.

### S5 · Der Abschluss (nur Gutachten)

Beim „Nur Gutachten"-Weg endet unsere Leistung mit dem Gutachten. Der Fall wird geschlossen,
**wenn die Besichtigung stattgefunden hat** — bestätigt vom Gutachter, vom Kunden, oder per
Antwort auf die WhatsApp. Der Kunde bekommt zum Abschluss: das **Gutachten in der Hand**, eine
klare Aussage, dass wir fertig sind, und — weil er *selbst* mit der gegnerischen Versicherung
reguliert — **den nächsten Schritt in seinen Worten**: was er wem schickt und worauf er achtet.

Ein Fall, der ohne dieses letzte Wort geschlossen wird, ist technisch fertig und für den Kunden
ein Abbruch. **Das ist die kritischste Stelle des ganzen Wegs** — und die, die im Komplettservice
gar nicht existiert, weil dort die Kanzlei übernimmt.

---

## 3 · Wo dieses Soll heute gefährdet ist (Hypothesen für Phase 2)

Aus Code- und DB-Erhebung, **noch nicht am laufenden System belegt** — genau das macht Phase 2.

| # | Hypothese | Soll-Verstoß | Quelle |
|---|---|---|---|
| **H1** | **Werkstatt-Finder (E5) sendet dem Kunden nichts** — kein WA, keine Mail, nur ein Client-Redirect | S1 §2 | A4-Register B-2; J2 IST-Abweichung #5 |
| **H2** | **Service-Wahl im Embed tot** — `regulierungs_modus` 50/50 NULL + Wertedivergenz `vollstaendig`↔`komplett` | §0 | prod-Zählung + `gutachter-finder-actions.ts:104/390` |
| **H3** | **Mini-Wizard (E1) schickt nur E-Mail**, nicht WhatsApp — obwohl WA der Primärkanal ist | S1 §2 | `mini_wizard_magic_link`; WA-Outbound ist seit 31.07. wieder gesund (272 zugestellt/30 T) |
| **H4** | **SMS-Rückfall weiterhin kaputt** — 2 `fehlgeschlagen` in 30 Tagen, 0 erfolgreich | S1 §2 | prod `nachrichten` |
| **H5** | **Rückruf-Wege (E2/E3/E9/E10) enden ohne Selbstbedienungs-Weg** — kein FlowLink, der Kunde wartet auf einen Anruf | S1 §2 | A4 B-4; Intake-Funnel-Baseline |
| **H6** | **Doppel-Absenden im Gutachter-Finder erzeugt zwei Vorgänge** — `createCase`-Dedup verlangt Person **+ Kennzeichen**, der Finder erhebt keins | S1 §4 | J2 IST #4 |
| **H7** | **Mehrfach-WhatsApp im Konversionsmoment** — bis zu 6 Sends ohne gemeinsamen Dedup | S3, S4 | J1 IST #1 (C3b teilweise gelöst) |
| **H8** | **Der Abschluss sagt dem „nur Gutachten"-Kunden nicht, wie es weitergeht** | **S5** | keine Notification-Zeile für `termin_durchgefuehrt` gefunden |
| **H9** | **Stadtseiten (E6) = derselbe iframe** — 300+ Einstiege teilen eine Kette; ein Fehler dort trifft alle | Risiko | 5 iframe-Fundstellen |
| **H10** | Flow-Schleife `termin ↔ gutachter` (#4952) und **Slot-Klick bucht nicht** (B11) — beide im August offen gemeldet | S2 | Entry-Point-Marker 03.08. |

---

## 4 · Testplan Phase 2

**Warum nicht 12 × die volle Kette:** Die Einstiege unterscheiden sich **nur bis zum FlowLink**;
ab `/flow/[token]` ist der Weg identisch (§0). Zwölf Volldurchstiche würden elfmal dasselbe
beweisen und dabei elf Test-Fälle auf prod erzeugen. Deshalb zwei Stufen:

**Stufe A — Einstiegs-Vergleich (jeder Kanal, bis zum FlowLink).**
Je Einstieg per Playwright anonym absenden und **vier Dinge** messen:
Vorgang da? · FlowLink da? · Nachricht raus (welcher Kanal)? · Zweites Absenden = ein Vorgang?
Das prüft H1–H6, H9 an der Realität.

**Stufe B — Ein Volldurchstich „nur Gutachter", Rolle für Rolle.**
Anonym über den stärksten Kanal (E4/E6, Gutachter-Finder) → WhatsApp abfangen → `/flow` →
Feststellung → Ort → Termin → Gutachter → **Service-Wahl „Nur Gutachten"** → SA unterschreiben →
Claim. Dann **Dispatch** (sieht der den Fall? Aufgabe?), dann **SV** (Auftrag da? Termin
bestätigen? „durchgeführt" setzen?) → **Terminal `termin_durchgefuehrt`** → zurück in die
Kunden-Sicht: sieht er den Abschluss, hat er das Gutachten, weiß er, was jetzt kommt (H8)?

**Sicherheit (Regel 4):** Test-Identität mit `telefon = NULL` → keine echten Comms an Fremde.
Marker-Präfix in allen Testwerten. Cleanup-Kaskade nach jedem Lauf (**Claims zuerst einsammeln** —
`claims.lead_id` ist `SET NULL`, wer den Lead zuerst löscht, lässt den Claim verwaist zurück).
Keine Versicherer-Meldung, kein Payment-Schritt (`nur_gutachter` hat keinen).

**Bekannte Messfallen, die hier greifen** (aus AGENTS.md Regel 4 + Memory):
iframe-Frame gezielt adressieren · `networkidle` abwarten statt einmal messen · `CI=1` setzen ·
Klick erst nach Hydration (sonst verpufft er folgenlos) · Werte aus der laufenden Oberfläche
lesen statt konstruieren · Erfolg am **DB-Zustand** messen, nicht an der Anzeige.

---

## 5 · Ergebnisse Phase 2

Gefahren gegen **prod** (`claimondo.de` + `app.claimondo.de`), 28.08.2026 ab 08:00 UTC.
Identität intern (`epsweep-*@claimondo.de`) → Test-SV-Guard + Send-Isolation greifen wie vorgesehen;
Telefon `+491633628571` (Aaron-Freigabe) für den Zustellnachweis.

### 5.1 E1 · Mini-Wizard `/schaden-melden` → Claim `CLM-2026-05610` — **durchgelaufen**

Kette belegt: Formular → Lead `cf009480` (`source_channel='mini_wizard'`, `status='flow-gesendet'`)
→ FlowLink → 18 Flow-Schritte → SA unterschrieben → **Claim mit `service_typ='nur_gutachter'`,
`kanzlei_wunsch='nicht_gefragt'`, `abrechnungsweg='haftpflicht'`**.

**Was funktioniert:**

| Soll | Beleg |
|---|---|
| Vorgang entsteht sofort | Lead 08:07:44, `dsgvo_zustimmung_am` gesetzt |
| FlowLink erzeugt + zugestellt | Token `a850d973…`, WhatsApp 08:07:48 **zugestellt** |
| Team erfährt vom Lead | Team-WA an **beide** Nummern (0163 + 0176) 08:07:47 |
| Service-Wahl „Nur Gutachten" greift | `data-value="nur_gutachter"` aktiv → Claim `nur_gutachter` |
| Anwalt-Frage entfällt korrekt | `kanzlei_wunsch='nicht_gefragt'` |
| Regulierungs-Phase ausgeblendet | Dispatch-Akte zeigt **3** Phasen: Erfassung → Begutachtung → Abschluss |
| Kunde bekommt Zugang | Zugangsdaten-WhatsApp 08:20:46 |
| Termin-Schleife (#4952) | **behoben** — „Termin später vereinbaren" führt sauber weiter, kein Loop |

### 5.2 🔴🔴 BEFUND 1 — Die gewählte Adresse wird durch eine **falsche Stadt** ersetzt

**Der schwerwiegendste Fund.** Eingabe „Domkloster 4, 50667 Köln", Vorschlag angeklickt
(„Domkloster 4, 50667 Köln, Deutschland"). Gespeichert wird:

```
unfallort                 = "Altstadt, Düsseldorf, North Rhine-Westphalia, Germany"
unfallort_lat/lng         = 51.225113 / 6.772396      ← Düsseldorf, ~40 km entfernt
unfallort_plz             = null                      ← die 50667 geht verloren
fahrzeug_standort_adresse = dieselbe falsche Adresse
besichtigungsort_adresse  = dieselbe falsche Adresse
```

**Die Kette, Glied für Glied:**

1. `lib/mapbox/adress-vorschlaege.ts:50` — `ausKontext()` akzeptiert `locality` gleichrangig mit
   `place`: `if (!stadt && (id.startsWith('place') || id.startsWith('locality'))) stadt = c.text`.
   Mapbox liefert für eine Kölner Innenstadtadresse `locality = "Altstadt"` (der **Stadtteil**)
   und `place = "Köln"` (die **Stadt**). Wer zuerst im Array steht, gewinnt → `stadt = "Altstadt"`.
2. `MiniWizardClient.tsx:184` — `onSelect={(r) => setValue('unfallort', r.stadt || r.plz || r.adresse)}`.
   In ein Feld, das die **Adresse** trägt, wird `r.stadt` geschrieben. Hausnummer, Straße und PLZ
   sind damit weg, bevor irgendetwas gespeichert wird.
3. Der Server geocodiert den Reststring „Altstadt" neu — ohne Stadt-Kontext ist er mehrdeutig und
   trifft **Düsseldorf-Altstadt**.

**Warum das teuer ist:** `fahrzeug_standort_lat/lng` ist der **erste** Anker, den `findBestSV`
liest. Der Fall wurde folgerichtig einem Gutachter in **Düsseldorf** zugewiesen, und die
Werkstattliste bot ausschließlich Betriebe in **Ratingen/Langenfeld** an („9,6 km vom
Fahrzeugstandort") — die einzige Kölner Werkstatt stand mit 25,4 km ganz unten. Der Kunde sieht
eine plausible Liste; sie ist nur für die falsche Stadt.

⚠ **Reichweite:** dasselbe `r.stadt || r.plz || r.adresse` steht in **6 Lead-Formularen** —
`MiniWizardClient` (E1), `CheckFunnelClient` (E8), `HomeLeadFormClient` (E9),
`kfzgutachter-lp/LeadFormClient` (E7, 2×), **`StadtLeadFormClient` (E6 — alle Stadtseiten)** und
`autounfall-io/LeadFormClient`. Fehler 1 (`ausKontext`) trifft zusätzlich **jede** Adresseingabe
der App, auch die Registrierungen — dort allerdings in ein Feld, das „Ort" heißen darf, weshalb
nur der falsche Stadtteil ankommt, nicht die falsche Stadt.

### 5.3 🔴 BEFUND 2 — Ein interner Test-Lead wird einem **echten** Gutachter zugewiesen

Der Test-SV-Guard blockt die **Buchung** (`entscheideTestSvGuard`: intern → echt = BLOCK, live
gesehen: „Diese Buchung konnte leider nicht abgeschlossen werden"). Die **Zuweisung am Claim**
läuft daran vorbei: `claims.sv_id = 9364985e…` = „Sachverständigenbüro KFZcheck", Düsseldorf,
`ist_testaccount = false`. In der Dispatch-Akte steht der echte Gutachter samt Name, Telefon und
E-Mail als Ansprechpartner.

✅ **Kein Schaden entstanden:** keine Nachricht an den SV (`nachrichten` im Zeitfenster enthält
nur Team- und Kunden-Sends), kein `auftraege`-Eintrag. Der Guard schützt also den lauten Teil —
die stille Zuweisung deckt er nicht ab.

### 5.4 🔄 KORRIGIERT — „Auswählen" funktioniert; der Step erscheint nur zu früh

**Erste Fassung war falsch.** Sie lautete „Auswählen schreibt nichts" — die Ursache lag in meinem
Testlauf, nicht im Produkt.

`waehleWerkstattFlow` gatet über `brauchtWerkstattVermittlung(lead)`, und das verlangt
`reparaturwunsch ∈ {'reparatur','fiktiv'}`. Mein Walker hatte den Schritt **„Reparatur oder
Auszahlung?" übersprungen** (auf „Weiter" geklickt statt eine Option zu wählen) → `reparaturwunsch`
blieb `null` → jede Auswahl wurde serverseitig abgelehnt.

**Gegenprobe mit gesetztem Intent** („Reparatur (in der Werkstatt)" geklickt), Lead `820864d4`:

```
reparaturwunsch                    = 'reparatur'
reparatur_werkstatt_id             = 24c44c6a-…      ← gesetzt
reparatur_werkstatt_quelle         = 'kunde'
reparatur_vermittlung_status       = 'vermittelt'
```

Und die UI führt korrekt weiter zum Folgeschritt „Wunschtermin vorschlagen". **Die Werkstattwahl
funktioniert vollständig.**

**Was als kleinerer Befund bleibt:** Der Werkstatt-Step wird **auch ohne Reparatur-Intent
angezeigt**. Seine DB-Bedingung (`flow_szenario_steps.bedingung`) prüft nur
`{gutachten_vermittelt: null, reparatur_werkstatt_id: null}` — nicht `reparaturwunsch`. Wer bei
„Reparatur oder Auszahlung?" auf „Vorerst überspringen" klickt, bekommt später fünf Werkstätten
angeboten, und jede Auswahl endet in „Für diesen Vorgang ist keine Werkstatt-Auswahl möglich."
Kein Datenverlust (die Meldung wird angezeigt, „Überspringen" führt weiter), aber ein
Vertrauensbruch mitten im Fluss.

⭐ **Lehre:** Ich habe eine Absage der Server-Action als „schreibt nichts" gelesen, ohne die
Vorbedingung zu prüfen, die sie verlangt. Die Gegenprobe war ein einziger zusätzlicher Klick.

#### 5.4.1 ✅ Der Fix — und die zwei Versuche davor, die auf prod scheiterten

Aaron am 28.08.: **„werkstatt step — ja mach das".** Gefixt wurde er **nicht** durch Verstecken.
Zwei Konfigurations-Versuche gingen voraus, beide appliziert und beide zurückgerollt:

| # | Ansatz | Ergebnis |
|---|---|---|
| 1 | Step-Bedingung an ein abgeleitetes `werkstatt_waehlbar` binden — appliziert **vor** dem Deploy des zugehörigen Codes | 🔴 **Prod-Breaker.** Das Feld existierte im laufenden Code nicht → `undefined === 'ja'` → der Step verschwand **für alle** Kunden. 16 Minuten scharf (11:13:38–11:29:34 UTC). Gemessener Schaden: **0** Leads, **0** Claims, **0** FlowLinks, **0** Werkstatt-Zuweisungen in dem Fenster. Zurückgerollt. |
| 2 | Dieselbe Bedingung, diesmal **nach** dem Deploy (Code inhaltlich auf `origin/main` verifiziert) | 🔴 Step blieb **trotzdem** aus, obwohl der Lead ihn haben musste (`reparaturwunsch='reparatur'`, keine Werkstatt, Status offen). Sofort zurückgerollt. |

**Warum Ansatz 2 scheitern *musste*** — die Ursache steht in `src/app/flow/[token]/FlowWizardKfz.tsx:450`:

```js
// Beim Mount fixiert: sonst schrumpft/waechst die Sequenz mid-flow durch einen RSC-Re-Render
// (LeadRealtimeRefresh) und der numerische stepIndex zeigt auf den falschen Step.
const [steps, setSteps] = useState<StepId[]>(() => { … })
```

Die Sequenz wird **beim Mount eingefroren** — bewusst, gegen die Stale-Index-Falle.
`reparaturwunsch` wird aber erst **mitten im Flow** erhoben. Eine Bedingung darauf sieht deshalb
immer `null`, für jeden Kunden.

⭐⭐ **Die verallgemeinerbare Regel** (liegt jetzt als Kommentar an genau der Stelle in
`src/lib/self-service/flow-kontext.ts`, wo das Feld stand): **Eine Step-Bedingung darf nur Felder
nutzen, die beim Betreten des Flows bereits ihren Endwert haben.** Alles, was der Wizard selbst
erst erhebt, ist als Bedingung ungeeignet — unabhängig davon, wie richtig es fachlich aussieht.
Der zweite Fehlversuch war fachlich korrekt und technisch zwangsläufig wirkungslos.

**Der gebaute Fix** — `pruefeWerkstattAuswahl` (`src/lib/werkstatt/vermittlung-core.ts`),
verdrahtet in `waehleWerkstattFlow`: Der Schritt wird angeboten, **also muss er auch annehmen**.
Fehlt ausschließlich der Abrechnungswunsch, ist die Werkstattwahl selbst die Antwort auf die
übersprungene Frage → `reparaturwunsch` wird auf `'reparatur'` nachgetragen, dann zugewiesen.
Alle übrigen Sperren bleiben in Kraft (bereits vermittelt, Inbound-QR-Werkstatt, Status nicht
offen). `'keine'` — eine ausdrückliche Absage an die Reparatur — wird **nie** überschrieben.

Der Fix wirkt allein in der Server-Action und braucht **keine** Migration; die DB steht wieder auf
dem Alt-Stand (`{gutachten_vermittelt: null, reparatur_werkstatt_id: null}` in allen drei
Szenarien, verifiziert). Regel-4-Nachweis nach Deploy: Flow fahren, „Wie möchtest du den Schaden
abrechnen?" **überspringen**, Werkstatt wählen → `reparatur_werkstatt_id` gesetzt **und**
`reparaturwunsch='reparatur'`.

##### ✅ Regel-4-Nachweis auf prod (29.08., nach Deploy 13:17)

Voll gefahren per UI: Lead über den Mini-Wizard erzeugt (`82c8b7c8`, Haftpflicht), dann der Flow
mit `EP_SKIP_ABRECHNUNG=1` — die Frage „Reparatur oder Auszahlung?" wurde **bewusst übersprungen**:

```
Schritt  5  Reparatur oder Auszahlung?   → Abrechnungsfrage BEWUSST uebersprungen
Schritt 18  Wählen Sie Ihre Werkstatt    → geklickt: "Auswählen"
Schritt 19  Wunschtermin vorschlagen     ← der Folgeschritt: die Wahl wurde ANGENOMMEN
```

Keine Ablehnungsmeldung mehr (der Walker prüft explizit darauf). DB-Gegenprobe am Lead:

```
reparaturwunsch                   = 'reparatur'    ← NACHGETRAGEN (war null)
reparatur_werkstatt_id            = 44996f32-…     ← GESETZT
reparatur_werkstatt_quelle        = 'kunde'
reparatur_vermittlung_status      = 'vermittelt'
```

Damit ist der Fix auf prod belegt. Testdaten anschließend entfernt (0 Leads, 0 Anfragen Rest).

⭐ **Zweite Lehre, teurer als die erste:** Eine Migration, die auf ein Feld aus dem Anwendungscode
zeigt, ist ein **Deploy-abhängiger** Write. Sie vor dem Code zu applizieren ist genau die
Drift-Konstellation, gegen die Regel 3 geschrieben wurde — nur in die andere Richtung: hier war
die **DB voraus**. Die Reihenfolge ist nicht verhandelbar: erst Code auf prod, verifizieren, dann
die Bedingung.

### 5.5 🟡 BEFUND 4 — Kein Kundenbetreuer vorgesehen, trotzdem einer gebunden

`claims.kundenbetreuer_id = aa000001-…` (Anna Weber), sichtbar in der Dispatch-Akte unter
„Ansprechpartner". Journey J1 §Varianten sagt für `nur_gutachter` ausdrücklich: **„kein KB, keine
Kanzlei"**. Die Kanzlei-Seite stimmt (`kanzlei_wunsch='nicht_gefragt'`), die KB-Seite nicht.
Dazu passend bietet die Akte „**Kanzlei-Paket einlesen**" an — eine Aktion, die es für diesen
Service-Typ nicht geben sollte.

### 5.6 🟡 BEFUND 5 — Die Unfallskizze entsteht nicht

`leads.unfallhergang` trägt 183 Zeichen (weit über der 20-Zeichen-Schwelle), aber
`unfallskizze_svg = null` und `unfallskizze_generiert_am = null`, gemessen mehrere Minuten nach
dem Speichern. Nach J2 §1 soll sie ohne Zutun entstehen — sowohl über `createLead` als auch über
den Flow-Feststellungs-Schritt.
⚠ Vor einer Meldung „Regression" zu prüfen: der Generator ruft ein Sprachmodell auf, und das
prod-Anthropic-Guthaben war zuletzt zweimal leer. Ein leeres Feld sieht in beiden Fällen gleich aus.

### 5.7 🟡 BEFUND 6 — Telefon ist Pflicht, obwohl „WhatsApp **oder** E-Mail" versprochen wird

Die Kopfzeile sagt: „Drei kurze Fragen, dann kommt Ihr sicherer Link per WhatsApp **oder**
E-Mail." Ein leeres Telefonfeld blockiert den Submit mit „**Ungültiges Telefon-Format**" — der
Text eines Formatfehlers, nicht einer fehlenden Pflichtangabe. Wer keine Handynummer geben will,
kommt nicht durch und erfährt nicht, warum.

### 5.8 🟡 BEFUND 7 — Der Wizard verspricht „drei kurze Fragen" und stellt 18 Schritte

Gezählt am gelaufenen Weg: Kontakt → Unfalltyp → Hergang → Verletzte → Reparatur/Auszahlung →
Wann&Wo → Polizei&Zeugen → Gegnerdaten → Fahrzeugschein → Fahrzeug → Halter → Vorschäden →
Termin → Gutachter → Fahrzeugstandort → Werkstatt → Beauftragung → Abschluss. Jeder Schritt
trägt „Vorerst überspringen", die Abbruchmöglichkeit ist also eingebaut — die Erwartung, die die
Startseite setzt, ist trotzdem eine andere.

### 5.9 Was der Kunde tatsächlich per WhatsApp bekam (Zustellnachweis, echtes Gerät)

| Zeit | Inhalt | Bewertung |
|---|---|---|
| 08:07:47 | 🔔 Neuer Lead (Team-Alert, an **beide** Team-Nummern) | intern, korrekt |
| 08:07:48 | „Hi Epsweep, … Hier dein sicherer Login-Link (gültig 72 Stunden)" | ✅ Soll S1 erfüllt |
| 08:20:46 | „🔐 Ihre Claimondo-Zugangsdaten … Passwort: …" | ✅ Zugang |

⚠ **Was fehlt (Soll S3):** eine **Auftragsbestätigung**. Nach der Unterschrift bekommt der Kunde
Zugangsdaten — aber keine Nachricht, die sagt *was* er beauftragt hat („Nur Gutachten"), *wer*
kommt und *wann*. Der inhaltlich wichtigste Moment des ganzen Wegs ist kommunikativ leer.

⚠ **Nebenbefund zur Send-Isolation:** Die Kunden-WhatsApp ging an eine Nummer, die über
`istInternesTelefon()` als **intern** gilt (4 `profiles`- und 18 `leads`-Zeilen mit
`@claimondo.de` tragen sie). Die Unterdrückung greift dort also nicht — konsistent mit dem
bekannten Befund, dass der Low-Level-Sendeweg ungegatet ist. Für diesen Test war das nützlich;
als Schutzmechanismus ist es eine Lücke.

### 5.11 E4 · Gutachter-Finder — Lead ✅, Ort ✅, **Termin existiert nicht**

Gefahren über `claimondo.de/gutachter-finden` (iframe auf `app.claimondo.de/embed/gutachter-finder`),
4 Schritte: Ort → Gutachter+Slot → Schadenart → Kontakt → „Termin reservieren".

**Der Ort ist hier korrekt** — und damit der direkte Gegenbeweis zu Befund 1:

| Einstieg | dieselbe Eingabe „Domkloster 4, 50667 Köln" wird gespeichert als | Koordinaten |
|---|---|---|
| **E4 Finder** | `Domkloster 4, 50667 Köln, Deutschland` | 50.941306 → **Köln** ✅ |
| **E1 Mini-Wizard** | `Altstadt, Düsseldorf, North Rhine-Westphalia, Germany` | 51.225113 → **Düsseldorf** ❌ |

Der Finder liest `r.adresse` + `lat/lng` aus demselben Vorschlag; der Mini-Wizard liest `r.stadt`.
Ein und dieselbe Komponente, zwei Auswertungen — nur eine davon stimmt.

### 🔄 KORREKTUR zu Befund 8 — **kein Befund. Das System hat korrekt gehandelt.**

Die erste Fassung lautete: „der bestätigte Termin existiert nicht — der Kunde wartet am
Termintag vergeblich." **Falsch gelesen, in zweierlei Hinsicht:**

1. **Der Text war keine Zusage.** „Ihr Termin bei Gaith · Freitag, 28.08., 11:40 Uhr" steht im
   Kontaktformular als **Auswahl-Zusammenfassung**, direkt daneben „Termin ändern". Es ist die
   Anzeige dessen, was man gerade gewählt hat — nicht die Bestätigung einer Buchung.
2. **Nach dem Absenden erschien eine saubere Fehlermeldung** (Screenshot `e4-nach-reservieren.png`):

   > „Diese Buchung konnte leider nicht abgeschlossen werden. Bitte melden Sie sich kurz bei uns —
   > wir vereinbaren Ihren Termin persönlich."  ·  **Anderen Termin wählen**

**Die Ursache war meine Test-Identität.** `@claimondo.de` = intern; der Test-SV-Guard verbietet
intern → echter SV. `reserviereEmbedTermin` behandelt genau das korrekt und dokumentiert es sogar
im Code (Ops-Test RC-1): ohne Wunschtermin führt eine gescheiterte Buchung zum **harten Abbruch**
mit `slotWeg: true`, und `sendeEmbedTerminBestaetigung` bekommt ein `bestaetigt`-Flag, damit „nie
eine Zusage ohne Termin" rausgeht. Der Lead entsteht trotzdem (Schritt 1 läuft vor der Buchung) —
deshalb sah ich Lead + gfa ohne Termin und hielt das für eine Lücke.

⭐ **Lehre:** Ein Zwischenstand („Lead da, Termin nicht") sieht identisch aus, egal ob das System
versagt hat oder ein Schutzmechanismus korrekt gegriffen hat. Der Unterschied stand im
Screenshot, den ich erst zwei Stunden später geöffnet habe.

**🔴 Befund 2 wiederholt sich hier:** `zugeordneter_sv_id = b2754f9c…` = **„UnfallSafe – Kfz-Gutachten
Köln"**, `ist_testaccount = false`. Das ist genau der Betrieb, der laut Incident-Historie vom
03.07.2026 schon einmal laufend Test-Termine bekam — der Anlass, aus dem der Test-SV-Guard gebaut
wurde. Der Guard greift am Buchungs-Chokepoint; die **Zuordnung** in `gutachter_finder_anfragen`
und in `claims.sv_id` läuft weiterhin daran vorbei.

⚠ Nebenbeobachtung: Die Oberfläche nennt den Gutachter „**Gaith**", gespeichert wird „UnfallSafe".
Vermutlich Person vs. Firma — vor einer Meldung zu klären, nicht als Divergenz zu werten.

### 5.12 E6 · Stadtseite `/kfz-gutachter/koeln` — Anfrage kommt an, **wird aber kein Lead**

Die Stadtseite (Vorlage für **300+ Seiten**) trägt im Hero ein Rückruf-Formular:
Name · Telefon · „Köln oder PLZ" · „Jetzt kostenlosen Rückruf erhalten →".

**Zwei getrennte Befunde — die Trennung war nötig, sonst hätte einer den anderen verdeckt:**

**🔴 BEFUND 9 — der Absende-Button ist nicht klickbar, wenn er unter dem Sticky-Header steht.**
`document.elementFromPoint()` auf der Button-Mitte liefert:

```
<a href="/gutachter-finden?stadt=Köln&lat=50.9413&lng=6.9583">Gutachter finden</a>
   aus <header class="sticky top-0 z-40 …">
```

Playwright verweigert den Klick mit „subtree intercepts pointer events" und nennt **drei**
abfangende Ebenen: den Sticky-Header, eine fixierte Bottom-Leiste (`fixed bottom-4 z-40`, trägt
selbst einen „Rückruf"-Button) und die offene Adress-Vorschlagsliste.
⚠ **Ehrliche Einordnung:** gemessen bei 1440×1100, nachdem der Button an den Viewport-Rand
gescrollt wurde. Ein Nutzer, der das Formular mittig im Bild hat, trifft ihn. Der Klick geht
verloren, wenn der Button oben oder unten am Rand liegt — auf kleinen Fenstern also regelmäßig.
Das ist dieselbe Klasse, die das **Fixed-Overlay-Safe-Area-Gate** (AGENTS.md) abdeckt; der
Header ist dort nicht erfasst.

**🔴 BEFUND 10 — HTTP 200, und trotzdem kein Lead.** Per JS-Klick (Overlay umgangen) ausgelöst:

```
POST https://app.claimondo.de/api/anfrage-from-lp  →  200
```

Entstanden ist eine Zeile in `gutachter_finder_anfragen`:

```
source                 = 'kfz_gutachter_lp'      stadt_slug = 'koeln'
status                 = 'neu'                   konvertiert_zu_lead_id = null
schadenort             = null   ← das eingegebene "Köln" kommt nicht an
email                  = ''     ← das Formular erhebt keine E-Mail
```

### 🔄 KORREKTUR zu Befund 10 (nachgeprüft, 28.08.) — **kein Lead ist entgangen**

Die erste Fassung dieses Befunds lautete „der Rückrufwunsch liegt in einer Tabelle, die in der
Lead-Liste nicht auftaucht". **Das war zu hart und in der Schlussfolgerung falsch.** Drei
Nachprüfungen:

1. **Es gibt eine eigene Dispatch-Ansicht** — `/dispatch/gutachter-finder` lädt
   `gutachter_finder_anfragen` und filtert nur `status='embed_free'` heraus. Cluster-LP-Anfragen
   tragen `status='neu'` → sie werden gezeigt.
2. **Per UI verifiziert** (nicht aus dem Code gelesen): Als `test-dispatch@` eingeloggt steht die
   Anfrage vom 29.07. dort — mit Namen, Datum „29.07." und der Markierung „Cluster".
3. **Kein Lead ist by design, nicht kaputt:** `api/anfrage-from-lp/route.ts:236` erzeugt den Lead
   nur, wenn `SELF_SERVICE_AUTO_ISSUE === 'true'` — ein ENV-Flag mit **Default AUS**. Daneben
   läuft `notifyAnfrage()` (Zeile 228) unabhängig davon.

**Das Ausmaß, gemessen:** Genau **eine** Anfrage ohne Lead existiert auf prod — und sie stammt
von **Aaron Sprafke selbst** (`+4915562740016`, `page_url = kfz-unfallgutachter-koeln.de`,
29.07.2026, `anliegen='schadensberatung'`). **Kein Kundenkontakt ist verloren gegangen.**

Gegenprobe über alle Nicht-Test-Leads (ohne `@claimondo.de`/`.test`, ohne `smoke*`): 20 Leads
insgesamt, davon **5 offen** — und alle fünf sind Test- oder Partner-Vorgänge:
2× Aaron selbst, 1× `mailinator.com`-Wegwerfadresse, 1× „Markus Mayer (Test)",
1× `info@sv-klug.com` (ein Sachverständigenbüro über `/gutachter/willkommen`, also ein
Partner-Lead, kein Geschädigter). **Null unbearbeitete echte Kundenanfragen.**

**Was von Befund 10 bleibt** (unverändert gültig, aber kleiner als zuerst formuliert):

* 🟡 **`schadenort = null`** — der im Formular eingegebene Ort erreicht die Anfrage nicht. Der
  Dispatcher sieht den Namen und die Nummer, aber nicht, wo der Schaden ist.
* 🟡 **`email = ''`** — das Formular erhebt keine E-Mail; der einzige Rückweg ist das Telefon.
* 🔴 **Befund 9 (Button unter Overlays) bleibt bestehen** — das ist die Stelle, an der ein Kunde
  wirklich verloren gehen kann, denn dort entsteht die Anfrage gar nicht erst.

⚠ **Lehre für mich:** `HTTP 200 beweist nicht, dass der Wert ankam` — richtig. Aber „kein Lead in
`leads`" beweist auch nicht, dass niemand es sieht. Ich habe von einer fehlenden Zeile auf einen
blinden Prozess geschlossen, ohne die zweite Ansicht zu prüfen. Die Prüfung war ein Login und ein
Blick auf die Liste.

⚠ **Eine zweite Zahl, die ich bewusst NICHT als Befund melde:** In `leads` haben 35 von 42
`self_service`-Leads keine einzige Zeile in `nachrichten`. Das sieht nach „niemand wurde
informiert" aus und ist es nicht — `notifyTeamWhatsApp` schreibt **grundsätzlich nichts** in
`nachrichten` (dokumentiert in `AUDIT-team-benachrichtigung-9-von-13-lead-quellen-stumm`). Die
Tabelle ist für Team-Sends blind; messbar sind sie nur im Baileys-Log auf dem VPS.

### 5.13 Was NICHT abgeschlossen wurde — und warum

Der Auftrag lautete: alle Einstiege **komplett bis zum Claim-Abschluss**. Erreicht wurde:

| Einstieg | bis Lead | bis FlowLink | bis Claim | bis Abschluss |
|---|---|---|---|---|
| **E1** Mini-Wizard | ✅ | ✅ | ✅ `CLM-2026-05610` | ❌ (§5.16) |
| **E4** Gutachter-Finder | ✅ | ✅ | ✅ `CLM-2026-05682` | ❌ (§5.16) |
| **E9** Startseite | ✅ + KB-Termin | — (telefonisch) | n/a Rückruf-Zweig | n/a |
| **E7** Ads-Landing | ✅ + KB-Termin | — (telefonisch) | n/a Rückruf-Zweig | n/a |
| **E6** Stadtseite | ❌ nur `gfa` | ❌ | ❌ | ❌ |
| **E5** Werkstatt-Finder | offen (Script-Lücke, §5.18) | | | |
| **E8** `/check` | ✅ gefahren 29.08. — 🔴🔴 Blocker gefunden + gefixt (§5.19) | | | |
| **E2/E3/E10** Rückruf-Modals | offen | | | |

**Der Abschluss ist strukturell blockiert**, nicht aus Zeitmangel (§5.10): `nur_gutachter` wird
über `closeNurGutachterTerminAlsDurchgefuehrt(terminId, …)` terminal — und in **keinem** der
gefahrenen Wege kam ein Termin zustande (E1: Guard-Block; E4: Termin wird gar nicht geschrieben).
Ein zweiter Anlauf über die Dispatch-Rolle (SV umweisen auf den Test-SV, dann Termin anlegen)
ist der nächste Schritt; die Dispatch-Akte ist erreichbar und vollständig (§5.14).

Die offenen Einstiege scheiterten an **Selektoren, nicht am Produkt** — die Marketing-Formulare
tragen weder `name` noch `id` an den Feldern, und meine generische Heuristik traf einmal den
Sprachwähler. Für jeden von ihnen braucht es ein gezieltes Script wie bei E6.

### 5.14 Rolle Dispatch — Akte vollständig, zwei Auffälligkeiten

Login `test-dispatch@claimondo.de` (das einzige Konto mit `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`), Route `/faelle/<claimId>`:
die Akte rendert komplett (Kundendaten, Fahrzeug & Halter, Unfall, SV-Briefing, Dokumente,
Kommunikation, Prozess, Verlauf, Timeline).

* ✅ **Phasenleiste korrekt:** `01 Erfassung ✓ → 02 Begutachtung (Termin) → 03 Abschluss` — die
  Regulierung ist für `nur_gutachter` ausgeblendet, genau wie `getVisibleMainPhases` es vorsieht.
* 🟡 „**Kanzlei-Paket einlesen**" wird angeboten, obwohl der Fall `kanzlei_wunsch='nicht_gefragt'` trägt.
* 🟡 **Ansprechpartner** zeigt Kundenbetreuerin *und* den echten Gutachter mit Telefon und E-Mail
  (→ Befund 4 und Befund 2).

### 5.15 Cleanup — 0 Residue, mit einer Lehre

Alle Testdaten entfernt: `epsweep`-Leads **0**, `epsweep`-Anfragen **0**, `CLM-2026-05610` gelöscht.

⚠ **Der erste Cleanup-Lauf ist genau in die dokumentierte Falle gelaufen** und hat den Claim
verwaist zurückgelassen: `claims.lead_id` ist `SET NULL`, der Lead-Delete lief durch, der Claim
blieb. Erst der zweite Lauf hat ihn eingesammelt. Drei Spaltenannahmen waren zudem falsch —
`gutachter_finder_anfragen` verweist über **`konvertiert_zu_lead_id`** (nicht `lead_id`),
`faelle_claim_bridge` hat **keinen `id`-PK**, und `fall_dokumente.claim_id` ist **NOT NULL**
(muss vor dem Claim weg).

⭐⭐ **Nachtrag 29.08. — dieselbe Spalte, diesmal im Werkzeug selbst.** `ep-lib.mjs` (die
gemeinsame Bibliothek beider Cleanup-Scripts) fragte `gutachter_finder_anfragen` weiterhin über
`lead_id` ab, obwohl `ep-cleanup2.mjs` die richtige Spalte (`konvertiert_zu_lead_id`) sogar im
Kommentar dokumentiert. Gemessen:

```
ALT (lead_id):                 FEHLER: column … does not exist
NEU (konvertiert_zu_lead_id):  ok, 0 Zeilen
```

Der Fehler war **still**: `out.gfa = gfa.data ?? []` machte aus der fehlgeschlagenen Query eine
leere Liste, und jeder Report meldete brav `"gfa": 0`. Eine falsche Null liest sich exakt wie
„nichts entstanden". Gefixt (richtige Spalte + die Query-Fehler werden jetzt laut protokolliert
statt in `?? []` zu verschwinden) — sonst hätte ein Finder-Lauf Residue hinterlassen, das der
Report als sauber ausgewiesen hätte. Eine dokumentierte Lehre wirkt erst, wenn sie **am
gemeinsamen Ort** steht, nicht nur in dem Script, in dem sie gelernt wurde.

⭐ **Nebenbefund:** Beim Nachzählen standen **vier verwaiste Claims aus fremden Smokes**
(`CLM-2026-05642`, `…43`, `…44`, `…46`) im selben Zeitfenster — dieselbe Falle, nur unbemerkt.
Sie wurden **nicht** angefasst.

### 5.17 E9 · Startseite und E7 · Ads-Landing — **beide vollständig grün**

Dieselbe Formular-Familie wie die Stadtseite („Schaden melden in 30 Sekunden · Drei Felder.
Ohne Anmeldung." — Name · Telefon · Ort). Sauber gefahren (Felder wirklich gefüllt, Ortsvorschlag
gewählt, echter Klick):

| | E9 Startseite | E7 Ads-Landing |
|---|---|---|
| Button per **echtem** Klick erreichbar | ✅ ja | ✅ ja |
| **Lead** entsteht | ✅ `claimondo-home-hero` | ✅ `kfzgutachter-ads-lp` |
| **Team-WhatsApp** | ✅ zugestellt, **mit Ort** („📍 Köln") | ✅ zugestellt, mit Ort + Referer + IP |
| **Rückruftermin** beim KB | ✅ `kb_beratung`, Mo. 31.08. 08:30, KB zugewiesen | ✅ dito |
| FlowLink | — (telefonischer Zweig, by design) | — |
| Ort **am Lead** gespeichert | ❌ `unfallort`/`_plz`/`_lat` alle `null` | ❌ dito |

**Damit wird der Stadtseiten-Befund schärfer, nicht schwächer:** Drei praktisch identische
Formulare — zwei erzeugen Lead + Team-Alert + Rückruftermin, **eines (die Stadtseite) erzeugt
nur eine `gutachter_finder_anfragen`-Zeile ohne Lead, ohne Termin.** Und nur dort war der Button
von Overlays blockiert. Die Stadtseite ist der Ausreißer der Familie — und sie ist die Vorlage
für **300+ Seiten**.

🔄 **KORRIGIERT — der Ort geht NICHT verloren.** Erste Fassung: „steht in der WhatsApp, aber nicht
am Lead". Ich hatte auf `unfallort` geprüft. Die RPC `convert_anfrage_zu_lead` schreibt ihn nach
**`leads.kunde_plz`** — und das ist semantisch richtig: Das Feld heißt „Köln oder PLZ" und fragt
den *Wohn-/Kontaktort*, nicht den Unfallort. Nachgemessen an einem frischen Lead:

```
anfragen.kontakt_plz_oder_stadt = "Köln"   →   leads.kunde_plz = "Köln"   ✅
```

🟡 Was als Kleinigkeit bleibt: Ein Ortsname steht in einer Spalte namens `kunde_plz`
(`kunde_stadt` bleibt leer). Wer nach PLZ filtert oder sortiert, bekommt „Köln". Vertretbar,
solange das Feld beides zulässt — aber eine Falle für spätere Auswertungen.

⚠ **Zwei eigene Messfehler auf dem Weg dorthin, beide korrigiert:**
1. Mein Erfolgs-Regex enthielt `erhalten` — und das Wort steht im **Button** („Jetzt kostenlosen
   Rückruf **erhalten**"). Der erste Lauf meldete „Bestätigung sichtbar", obwohl nichts passiert
   war. Erfolg wird jetzt am POST + DB-Zustand gemessen, nicht am Seitentext.
2. Ich suchte in der DB über die **E-Mail** — diese Formulare erheben gar keine. Der erste Lauf
   meldete deshalb „0 Leads" für zwei Einstiege, die einwandfrei funktionieren. Suche jetzt über
   den Namen.

### 5.18 E5 · Werkstatt-Finder — **vollständig durchgelaufen, gesund**

Nachgefahren nach vier Selektor-Korrekturen (alle Script-seitig, kein Produktbefund).
Neun Schritte: Ort → Fahrzeug → Schadensbild → Kostenträger → Kontakt → „Anfrage absenden".

| Prüfpunkt | Ergebnis |
|---|---|
| Lead + FlowLink | ✅ `source_channel='werkstatt_finder'`, FlowLink vorhanden |
| **Ort** | ✅ `fahrzeug_standort_adresse = "Domkloster 4, 50667 Köln, Deutschland"`, lat **50.941306** |
| Schadensanalyse | ✅ `bedarf_kategorien = {karosserie, lackierung}`, `bedarf_quelle='schadenbeschreibung'` |
| Fahrzeug | ✅ BMW / 3er / `fahrzeugklasse='M1'` / `gewerbe_flag=false` |
| Schuldfrage | ✅ `gegner` (aus „Unverschuldeter Unfall — der Gegner haftet") |
| Beschreibung | ✅ byte-genau in `fahrzeugschaden_beschreibung` |
| Team-Benachrichtigung | ✅ WhatsApp zugestellt: „🆕 Neuer Lead: Werkstatt-Finder" |

🔄 **Damit ist Hypothese H1 („Werkstatt-Finder sendet dem Kunden nichts") überholt** — der
Team-Alert geht raus (das war PR #5533), und der FlowLink existiert. Was weiterhin fehlt, ist
eine *aktive* Nachricht an den Melder; er wird per Client-Redirect geführt. Das ist der Punkt
aus dem A4-Register, nicht ein neuer Befund.

⚠ **Vier Selektor-Fallen auf dem Weg** — sie treffen jeden Walker über diesen Wizard:
1. „Weiter" ist deaktiviert, bis eine Schadens-**Kategorie** gewählt ist; „Fotos auswählen"
   öffnet nur einen Datei-Dialog.
2. Auswahl-**Karten** tragen Titel + Beschreibung in **einem** Button (~160 Zeichen) — eine
   Längengrenze von 80 filtert sie aus der Erhebung, und der Schritt sieht optionslos aus.
3. `hasText` mit dem **normalisierten** Kartentext trifft nie: der DOM hat Zeilenumbrüche
   zwischen Titel und Beschreibung. Über den Titelanfang ankern.
4. Der Absende-Button heißt hier **„Anfrage absenden"** bzw. „Werkstatt anfragen" — nicht
   „Absenden". Jeder Einstieg nennt ihn anders (Mini-Wizard: „Sicheren Link erhalten",
   Finder: „Termin reservieren").

### 5.19 E8 · `/check` — durchgelaufen (29.08.), und dabei ein 🔴🔴 **Blocker** gefunden

Der erste Anlauf meldete „kein `<form>` gefunden" und blieb offen. Das war **wieder eine
Messfrage**: der Funnel ist state-basiert (3 Options-Fragen → Ergebnis → Kontaktfelder) und ruft
`submitCheckLead` direkt auf. Eine Heuristik, die „das `<form>` mit den meisten Feldern" sucht,
findet dort nichts. Der zweite Anlauf traf mit einem generischen Button-Selektor den
**Sprachwähler** (🇩🇪) — dieselbe Falle, die weiter oben schon protokolliert ist. Erst der dritte,
gezielte Lauf (`button[type="button"]` mit `›`-Span) fuhr den Weg.

#### 🔴🔴 Nach der Ortswahl ist der Absende-Button nicht klickbar

Voll gefahren mit echter Eingabe (`scripts/smoke/ep-e8-check.mjs`): 3 Fragen geklickt, Name +
Telefon getippt, Ortsvorschlag **gewählt** — und dann:

```
[4] Ortsvorschlag GEWAEHLT (5 angeboten): "Domkloster 4, 50667 Köln, Deutschland"
[5] Nach der Auswahl noch offene Vorschlaege: 5
[5] Klick auf die Button-Mitte traefe: <BUTTON> "Köln, Nordrhein-Westfalen, Deutschland"
    — Absende-Button? NEIN ← VERDECKT
[5] ⚠ normaler Klick abgefangen (Timeout) — weiche auf force aus
```

**Kein Lead, keine `anfragen`-Zeile.** Die einzige `claimondo-check`-Anfrage auf prod ist vom
14.07. („Test Kunde"). Der Einstieg ist für jeden, der einen Ortsvorschlag wählt, **tot** — und
schlimmer als nur blockiert: der natürliche nächste Klick trifft einen **fremden Ort**
(„Kölner Straße, 01159 Dresden"), also dieselbe Klasse wie der Köln→Düsseldorf-Bug aus §5.2.

#### Die Ursache — ein Token, wo ein Zustand hingehört

`GooglePlaceAutocomplete` unterdrückte die Suche über zwei **verbrauchbare** Flags (`ausAuswahl`,
und seit #5717 `ersterLauf`): der Such-Effect setzt sie beim Durchlauf selbst zurück, sie gelten
also für **genau eine** Änderung. Nach einer Auswahl ändert sich `value` aber **zweimal**:

```
1. waehle()   setzt den gewählten Treffer            -> "Domkloster 4, 50667 Köln"
2. onSelect() -> Parent setzt seinen State und spielt ihn über defaultValue zurück,
                 und zwar ANDERS: die Formulare nehmen r.stadt  -> "Köln"
```

Änderung 1 verbraucht das Token, Änderung 2 läuft ungeschützt → neue Suche nach „Köln" → Liste
klappt über dem Absende-Button auf.

⭐⭐ **Deshalb hat #5717 es nicht erwischt:** dieser Fix hat ein *zweites* Token neben das erste
gestellt. Zwei Tokens lösen kein Problem, das aus *zwei aufeinanderfolgenden* Änderungen besteht —
es verschiebt nur, welche der beiden ungeschützt durchläuft. Gemessen wurde damals mit **leerem
bzw. vorbefülltem** Feld, nie mit einer **Auswahl**; genau der Pfad blieb blind.

**Der Fix:** ein **Zustand** (`vomTippen`) statt eines Tokens — gesucht wird nur, wenn zuletzt
jemand getippt hat, unabhängig davon, wie oft `value` sich programmatisch ändert.

**Betroffen waren 5 der 6 Consumer** (alle, die `r.stadt` zurückspielen): `/check`, Startseite,
die ~300 Stadtseiten, zweimal Ads-Landing. Der Mini-Wizard **nicht** — er spielt `r.adresse`
zurück, also denselben Wert, und löst die zweite Änderung gar nicht aus. Das deckt sich damit,
dass er im Sweep durchlief.

**Nachweis (A/B am identischen Detektor, 29.08.):**

| | prod (alter Code) | lokal mit Fix |
|---|---|---|
| Vorschläge angeboten | 5 | 5 |
| Nach der Auswahl noch offen | **5** | **0** |
| Klick auf die Button-Mitte trifft | „Köln, Nordrhein-Westfalen…" → **verdeckt** | **„Anspruch kostenlos prüfen"** |

Der Detektor ist damit nachweislich nicht blind — er hat auf dem alten Stand rot gemeldet
(Positivkontrolle) und auf dem gefixten grün.

#### 🟡 Direkt darunter der nächste: der StickyCallBar fängt denselben Button ab

⭐⭐ **Erst sichtbar geworden, NACHDEM die Vorschlagsliste weg war.** Solange die über dem Button
lag, war *sie* das oberste Element — der Balken darunter fiel gar nicht auf. **Ein Fehler kann
einen zweiten maskieren; nach einem Fix neu messen, nicht nur den Fix bestätigen.**

Gemessen am Verhalten (`document.elementFromPoint`, 3 Punkte je Button, mehrere Scroll-Positionen):

| Viewport | prod (ohne Fix) | mit Fix |
|---|---|---|
| 1440×900 | **2/8** Positionen blockiert (Leiste, jeweils 3/3 Punkte) | **0/8** |
| 1280×720 | **5/8** blockiert (3× Leiste 3/3, 2× Bewertungs-Widget 1/3) | **2/8** — nur noch das Widget |
| 1920×1080 | — | 0/8 |

Der Button „Jetzt kostenlosen Rückruf erhalten" liegt bei Dokument-Y **882**; bei 900 px Viewport
also knapp unter der Falz. Wer minimal scrollt, um ihn zu sehen, hat ihn in den unteren ~12 % —
und dort trafen alle drei Messpunkte „Sofort anrufen" bzw. „Rückruf". Beide führen zwar zu einem
Rückruf, aber das Leisten-Formular startet **leer**: Name, Telefon und Ort sind weg.

**Der Fix** liegt in derselben Logik, die die Leiste schon hatte: sie weicht bereits, wenn der
Footer sichtbar ist (der Kommentar dort begründet das ausführlich). Die Regel war nur zu eng —
sie kannte den Footer, nicht den echten CTA in der Seitenmitte. Jetzt prüft sie zusätzlich die
**tatsächliche Überlappung** mit `[data-tracking^="lead-form"] button[type="submit"]`.

⚠ Bewusst Kollision statt „CTA sichtbar → ausblenden": die Leiste ist selbst ein
Conversion-Element. Gegentest gefahren — sie ist an **5 von 7** Scroll-Positionen weiter aktiv
(`opacity=1, pointer-events=auto`) und weicht nur bei `y=0` (dort liegt der Button in ihrer Zone)
und am Seitenende (die bestehende Footer-Regel). Ein Fix, der ein Conversion-Element abschaltet,
wäre schlimmer als der Fehler.

**Der vierte Fall — ausgemessen und bewusst nicht gefixt (31.08.):** das ProvenExpert-Widget
(„Sehr Gut · 27 Kundenbewertungen") verdeckt das **rechte Drittel** desselben Buttons.
Vollständig vermessen, statt geschätzt:

| Seite | Viewport | blockiert |
|---|---|---|
| **Startseite** | **1280×720** | **2 von 8** Positionen, nur der 75-%-Messpunkt |
| Startseite | 1366×768 | 0/8 |
| Startseite | 1440×900 | 0/8 |
| Startseite | 1920×1080 | 0/8 |
| Stadtseite Köln | 1280×720 | 0/8 |

**Ein einziger Fall**, und dort bleiben zwei Drittel der Buttonbreite klickbar.

⚖️ **Warum nicht gefixt:** Das Siegel trägt in `globals.css` und `ProSealWidget.tsx` mehrere
ausführlich begründete, gemessene Entscheidungen — `top: 340px` (das Widget kennt keine
top-Option), `hideOnMobile` (H1 war zu 15–33 % verdeckt), und vor allem `z-index: 39`, gesetzt
am 23.08. **genau gegen diese Klasse**: darunter die eigene Overlay-Schicht (40), darüber
normaler Inhalt. Die Lücke ist, dass ein Formular-Button *normaler Inhalt* ist — die Analyse
damals galt Bottom-Sheets.

Ein Eingriff hieße, im Fremd-DOM eines Trust-Elements eine Kollisionsprüfung nachzurüsten
(wie beim StickyCallBar). Machbar, aber gegen **einen** Viewport bei **zwei** von acht
Positionen und einem Drittel der Breite steht das in keinem Verhältnis. Der Befund ist damit
gemessen, eingeordnet und liegt entscheidungsreif — nicht übersehen.

#### 🔴 Der größere Befund dahinter: drei von vier Einstiegen führen nirgendwohin

Nachgemessen am 30.08., weil `/check` selbst kaum Volumen hat — das **Muster** aber nicht.

**Zwei Familien im Marketing-Build**, keine davon nutzt `createCase` (den Funnel mit
FlowLink-Garantie; der lebt in `src/`, und der Intake-Ratchet gatet nur dort):

| Einstieg | Weg | FlowLink | Nachricht an den Melder |
|---|---|---|---|
| Mini-Wizard `/schaden-melden` | `createLead` + eigener `flow_links`-Insert | ✅ | ✅ WhatsApp mit `/flow/<token>` |
| **Startseite** (`claimondo-home-hero`) | `anfragen` → RPC `convert_anfrage_zu_lead` | ❌ | ❌ |
| **Ads-Landing** (`kfzgutachter-ads-lp`) | dieselbe RPC | ❌ | ❌ |
| **`/check`** (`claimondo-check`) | dieselbe RPC | ❌ | ❌ |

⭐ **Der Standard existiert bereits** — der Mini-Wizard sendet den FlowLink seit der
Aaron-Direktive vom 20.05.2026 an die Kundennummer. Die anderen drei halten ihn schlicht nicht
ein. Der Fix wäre also keine neue Politik, sondern eine Angleichung.

**Prod-Test (30.08., Startseite vollständig per UI ausgefüllt und abgesendet):**

```
anfragen  1 → 2                       ← das Formular SCHREIBT
quelle    claimondo-home-hero
Ort       "Köln"  (korrekt gespeichert)
konvertier_status  success
FlowLinks 0                           ← kein Weg in die App
Nachrichten am Lead  1  = 🔔 "Neuer Lead" an die TEAM-Nummer
```

⭐⭐ **Damit ist eine eigene Hypothese widerlegt:** Aus der leeren Historie (`anfragen` enthielt
über die *gesamte* Laufzeit **eine einzige** Zeile — einen Test vom 14.07.) hatte sich der
Verdacht „das Formular ist tot" aufgedrängt. Es ist **nicht** tot. Die Null ist eine Traffic-
bzw. Conversion-Frage, kein gebrochener Write. Ohne den Absende-Test wäre daraus ein
Fehlbefund geworden.

⚠ **Nebenbefund aus demselben Lauf:** Der Lead bekam automatisch einen **Termin**
(`status='reserviert'`, 31.08. 08:30) — und der Kunde erfährt davon **nichts**. Ein reservierter
Termin ohne Nachricht an den Melder ist schlechter als gar keiner.

#### ✅ Gebaut (Aaron-Go 30.08.): `erzeugeUndSendeFlowLink` für alle vier Call-Sites

`claimondo-marketing/lib/leads/flowlink-fuer-lead.ts` — legt den FlowLink an und schickt ihn
per `dispatchMagicLink` (WhatsApp bevorzugt, Email-Fallback) an den **Melder**. Verdrahtet in
Startseite, `/check` und **beide** Ads-Landing-Actions (`app/kfzgutachter-lp` und
`app/[locale]/kfzgutachter-lp` — die Datei existiert doppelt).

Drei bewusste Unterschiede zum Mini-Wizard-Original:

* **Non-fatal.** Beim Mini-Wizard ist der Versand Teil des Erfolgspfads und bricht die Action
  ab. Hier existiert der Lead bereits (die RPC hat ihn konvertiert) — ein Versand-Fehler darf
  ihn nicht kippen. Der Caller loggt und macht weiter (AGENTS.md §Server-Actions).
* **Idempotent.** Vor dem Insert wird auf einen vorhandenen Link geprüft; ein Doppel-Submit
  darf keine zwei gültigen Tokens auf denselben Vorgang erzeugen.
* **Kein `localhost`-Fallback.** Der Mini-Wizard fällt bei fehlender `NEXT_PUBLIC_APP_URL` auf
  `http://localhost:3000` zurück. Hier geht der Link an einen echten Kunden — fehlt die
  Basis-URL, wird **nicht** versendet (der Link steht trotzdem für Dispatch).

**Lokal bewiesen** (Dev-Server, Formular vollständig per UI abgesendet):

```
vorher (prod):       FlowLinks: 0
mit Fix (lokal):     FlowLinks: 1
Nachrichten am Lead: 0          ← Versand scheitert (keine BAILEYS-Env lokal)
konvertier_status:   success    ← der Lead bleibt intakt
```

⭐ Der lokal fehlende WhatsApp-Zugang hat dabei den **Fehlerpfad** mitgeprüft — genau den, den
man sonst nie zu Gesicht bekommt: Versand scheitert, Lead und Link stehen trotzdem.

##### ✅ Regel-4-Nachweis auf prod (30.08., nach Release R435/#5763, Deploy 19:37 UTC)

Startseiten-Formular vollständig per UI ausgefüllt und abgesendet:

```
anfragen 1 → 2 · quelle=claimondo-home-hero · konvertier_status=success
FlowLinks am Lead: 1          (vorher 0)
Nachrichten am Lead: 2        (vorher 1 — nur Team)
```

Beide WhatsApps **zugestellt**:

```
19:44:07  an den MELDER:  "Hi EPSWEEP, danke für deine Schadenmeldung bei Claimondo.
                           Hier dein sicherer Login-Link (gültig 72 Stunden):
                           https://claimondo.de/flow/68a26f1e…"      enthaelt_flowlink: true
19:44:08  an das TEAM:    "🔔 Neuer Lead …"                          (wie bisher)
```

Und der Link **führt tatsächlich in den Vorgang** — nicht nur „sieht richtig aus": `claimondo.de/flow/<token>`
leitet auf `app.claimondo.de` weiter, Status **200**, und die Seite begrüsst den Melder namentlich
(„Hallo EPSWEEP! Bitte prüfen und korrigieren Sie Ihre Daten"). Damit ist die Kette geschlossen:
Formular → Lead → Link per WhatsApp → Wizard.

Testdaten anschliessend restlos entfernt (0 EPSWEEP-Leads, `anfragen` zurück auf 1).

##### ✅ Regel-4-Nachweis StickyCallBar (#5753) auf prod

| Messung | vorher | nachher |
|---|---|---|
| 1440×900, 8 Scroll-Positionen | **2/8** blockiert (Leiste, je 3/3 Punkte) | **0/8** |
| 1280×720, 8 Scroll-Positionen | **5/8** (3× Leiste 3/3, 2× Widget 1/3) | **2/8** — nur noch das Widget |
| Viewport-Matrix (5 × 3 Seiten) | 1/15 | **0/15** |
| Gegentest Conversion | — | Leiste an **5/7** Positionen weiter aktiv |

Das ProvenExpert-Widget (rechtes Drittel bei 1280×720) bleibt wie angekündigt unangetastet — es ist
sichtbar als einzige verbliebene Blockade und damit sauber isoliert.

#### 🟡 Zusätzlich: der Check-Lead landet in keinem Fluss

`submitCheckLead` schreibt `anfragen` → RPC `convert_anfrage_zu_lead` → Lead. **Kein `createCase`,
also kein FlowLink** — die RPC erzeugt auch selbst keinen (`flow_link` kommt in ihrer Definition
nicht vor, geprüft). Gemessen: `claimondo-check` = 1 Lead, **0 mit FlowLink**.

Und `notifyNewLead` sendet ausschließlich an `WA_EMPFAENGER` (feste Team-Nummern). **Der Melder
selbst bekommt nichts** — keine Bestätigung, keinen Link, keinen Weg zurück in seinen Vorgang.
Er beantwortet drei Fragen, gibt seine Nummer und wartet auf einen Anruf. Gegen das Soll aus §2
(S1: „ein Fluss in die App", Mitteilungen per WhatsApp) ist das die Gegenrichtung.

Der Intake-Funnel-Ratchet greift hier nicht: er scannt nur `src/**`, und der Aufruf geht über die
RPC statt über `createLead`.

### 5.16 🔴 Der Abschluss-Weg ist über die Oberfläche **nicht erreichbar** — reproduziert + gemessen

Zweiter Volldurchstich über den **Finder** (sauberer Ort): Lead `23cdc2cc` → Flow (21 Schritte,
inkl. nachgefragter Schuldfrage) → **Claim `CLM-2026-05682`**, `service_typ='nur_gutachter'`,
`abrechnungsweg='haftpflicht'`, `operative_status='sv-zugewiesen'`, **0 Termine**.

Der Abschluss läuft über `closeNurGutachterTerminAlsDurchgefuehrt(terminId, claimId)` — alle drei
Aufrufer (SV-Action, Kunde-Action, WhatsApp-Inbound) brauchen eine **`terminId`**. Ohne Termin
gibt es keinen Endzustand. Also: kann Dispatch einen Termin nachtragen?

**Die Dispatch-Fallakte durchsucht, Tab für Tab** (Übersicht · Dokumente · Kommunikation ·
Prozess · Verlauf). Verfügbare Aktionen:

```
Werkstatt vermitteln · Kanzlei-Paket einlesen · Dokument anfordern · Videotermin buchen
AS hochladen (PDF) · Hochladen · Nachreichen · Neue Anforderung · Neue Nachricht · Speichern
```

**Kein „Termin anlegen". Kein „Gutachter wechseln".** Beides existiert — aber woanders:
`/dispatch/kalender` → „Spontan-Termin", `/dispatch/terminwuensche` → „SV zuweisen".

* **Spontan-Termin hilft nicht:** Der Dialog erhebt **Kundendaten neu** (Vorname, Nachname,
  Telefon, E-Mail, Besichtigungsort) und hat **kein Feld, um einen bestehenden Fall zu wählen**.
  Er erzeugt einen *neuen* Vorgang, hängt keinen Termin an einen bestehenden Claim.
* **Terminwünsche hilft nicht:** Dort steht der Fall nur, wenn ein Terminwunsch geschrieben
  wurde — und genau das unterbleibt (**Befund 8**: der Finder schreibt `wunschtermin=null`).

**Die Kette schließt sich:** Terminbuchung scheitert → kein Termin, kein Terminwunsch → der Fall
taucht in keiner Termin-Queue auf → Dispatch hat keinen Griff → der Claim hat keinen Endzustand.

**Gemessen auf prod:**

| `nur_gutachter`-Claims | Anzahl | mit Termin |
|---|---|---|
| `sv-termin` | 9 | 9 |
| `ersterfassung` | 8 | 6 |
| **`sv-zugewiesen`** | **5** | **0** ← die Sackgasse |
| `gutachten-eingegangen` | 1 | 0 |
| **`termin_durchgefuehrt`** (terminal) | **1** | 1 |

**23 von 24 `nur_gutachter`-Claims sind nicht abgeschlossen**, der älteste offen seit 17.07.
Zum Vergleich: `komplett` hat 59 Claims, 10 terminal.

### 🔄 KORREKTUR zur Sackgasse — die Ursache ist der Guard, nicht eine Produktlücke

Nachgeprüft, wer in `sv-zugewiesen` ohne Termin steckt:

| Claim | Kunde | zugewiesener SV | `ist_testaccount` |
|---|---|---|---|
| CLM-2026-00984 | `aaron.sprafke@claimondo.de` | Kfz-SV-Büro Brandt | false |
| CLM-2026-01010 | `aaron.sprafke@claimondo.de` | Brandt | false |
| CLM-2026-01451 | `aaron.sprafke+kundeneuneu@…` | Brandt | false |
| CLM-2026-03507 | `aaron.sprafke+kundeneuneuneu@…` | Brandt | false |

**Alle vier sind interne Identitäten mit einem als „echt" markierten SV** — exakt die
Konstellation, die der Test-SV-Guard blockt. Die Buchung scheiterte also **absichtlich**; der
Claim blieb ohne Termin auf `sv-zugewiesen` stehen. Mein eigener Durchstich hat dasselbe Muster
erzeugt und ich habe es für eine Produktlücke gehalten.

⚠ **Was damit NICHT belegt ist:** dass ein *echter* Kunde in dieser Sackgasse landet. Bei ihm
greift der Guard nicht, die Buchung läuft durch, der Termin steht — und `closeNurGutachterTermin`
hat, was er braucht. **Die Frage „ist der Abschluss für echte Kunden erreichbar?" ist offen, nicht
negativ beantwortet.** Nachweisbar wäre sie nur mit einer externen Identität und einem echten SV —
also mit genau dem Kollateralschaden, den der Guard verhindern soll.

**Was unabhängig davon gilt und bleibt:** In der Dispatch-Fallakte gibt es **keine Aktion
„Termin anlegen" und keine „Gutachter wechseln"**. Scheitert eine Buchung aus *irgendeinem*
Grund (Slot weg, SV ausgefallen, technischer Fehler), hat Dispatch am Fall selbst keinen Griff —
Spontan-Termin erzeugt einen neuen Vorgang, Terminwünsche greift nur bei vorhandenem Wunsch.
Das ist die Lücke, die zu schließen wäre; die Zahlen oben belegen sie **nicht**.

⚠ **Nebenbefund:** „Kfz-Sachverständigenbüro Brandt" trägt `ist_testaccount = false`, sein
Profil hängt aber an `nicolas.kitta+testsv@claimondo.de` — faktisch ein Test-SV ohne
Test-Kennzeichnung. Das ist der Grund, warum diese vier Fälle bei einem „echten" SV landeten,
ohne dass jemand gestört wurde.

### 5.10 Struktureller Befund — der Abschluss ist ohne Termin nicht erreichbar

`nur_gutachter` wird terminal über `closeNurGutachterTerminAlsDurchgefuehrt(terminId, claimId)` —
alle drei Aufrufer (SV-Action, Kunde-Action, WhatsApp-Inbound) brauchen eine **`terminId`**.
Im gelaufenen Fall kam kein Termin zustande (Guard-Block), der Claim steht auf `sv-zugewiesen`,
und es existiert kein Weg, ihn ohne Termin abzuschließen. Für einen echten Kunden heißt das:
Scheitert die Terminbuchung und wird sie nie nachgeholt, hat sein Fall **keinen Endzustand**.
