# Nacht-Durchgang 27.08.2026 — Design, i18n, SEO

Drei Durchgänge über die Marketing-Seiten und die kundenseitigen App-Bereiche.
Alles am **gerenderten Output** gemessen, nicht am Quellcode — die Gründe dafür
stehen unten unter „Was das Instrument falsch gemacht hat".

Ergebnis: **5 PRs** (#5669, #5672, #5673, #5675, #5676) und **4 Befunde, die
eine Entscheidung von Aaron brauchen**.

---

## Teil 1 — Design-Gesetze (PR #5669)

Detektor über den Marketing-Code, danach jeder Treffer einzeln am Consumer
geprüft.

| Befund | Status |
|---|---|
| `Card.web.tsx` erzeugte bei `accentColor` einen 4px-`border-left` (Side-Stripe) | behoben → voller Rahmen + 6-%-Tint via `color-mix` |
| `globals.css`: drei Animationen, zwei mit Overshoot-Easing `cubic-bezier(.34, 1.2, .64, 1)` | **0 Consumer** im ganzen Marketing-Build → 40 Zeilen entfernt |
| „3× hartkodiertes Montserrat" | **Messfehler** — die Treffer kamen aus `.next/standalone/`, also aus dem Build-Output |

Zum Montserrat-Punkt: im echten Quellcode sind es **133 Stellen in 70 Dateien**.
Das ist kein Ausreißer, sondern der etablierte Weg — und für Marketing korrekt,
weil Marketing-Seiten per Konvention nicht gewhitelabelt werden (AGENTS.md,
branding-rules). Die Folgefrage, ob der nackte Familienname zur Laufzeit auch
auf den geladenen Font auflöst, wurde separat gemessen: **alle Familien lösen
auf**, kein stiller Fallback.

**Nicht angefasst, weil die App:** dieselbe Card liegt ein zweites Mal in
`src/components/primitives/Card/` (web + native) mit demselben Streifen und dort
**drei** Consumern — `sv/registrieren`, `shared/TerminCard`, `shared/TodoCard`
(letzterer nutzt ihn als Severity-Marker in einer Liste). Eigener PR, eigener
Regel-4-Nachweis.

---

## Teil 2 — Playwright über 16 Seitentypen × 2 Breiten (PR #5672)

390×844 und 1440×900, je 32 Messungen.

### Behoben

1. **WhatsApp-Buttons: 1,98:1 → 8,29:1.** Weiße Schrift auf `#25D366` verfehlt
   die 4,5:1 deutlich. Navy darauf sind 8,29:1. Die Kanalfarbe bleibt — WhatsApp
   setzt in den eigenen Chat-Bubbles ebenfalls dunkle Schrift auf helles Grün.
   Betrifft `StickyCallBar` (auf 52 Seiten eingebunden) und `SpokeCtaBand`.
2. **Eyebrow „Wissen & Ratgeber": 2,51:1 → 4,76:1.** Steht als einziges auf
   hellem Grund. Die 15 übrigen Fundstellen von `text-claimondo-light-blue`
   liegen auf Navy und erreichen dort 6,23:1 — ein globaler Ersatz hätte
   funktionierende Stellen zerstört.
3. **Footer-Tippziele: 20px → 32px.** Unter WCAG 2.5.8 (24px), unter iOS 44pt
   und Android 48dp. Ein Listen-Selektor statt 24 Einzeledits; der Zeilenabstand
   sinkt gegenläufig, damit der Footer nur um 6px pro Zeile wächst.
4. **`/versicherer` lief mobil 28px über.** Der H1 „Kfz-Haftpflichtversicherer
   im Vergleich" passt bei 36px nicht in die 342px nach `px-6`. `hyphens-auto`.

### Geprüft und als kein Befund bestätigt

* **Sticky-Bar verdeckt auf `/wissen` mobil eine Artikel-Karte.** Der Header von
  `StickyCallBar.tsx` dokumentiert, dass die Klasse bereits behandelt ist
  (Ausblenden am Footer per IntersectionObserver) — und dass ein reservierter
  Platz **schon versucht und wieder verworfen** wurde: der Footer ist auf
  manchen Seiten höher als der Viewport, zusätzlicher Platz verschiebt dann nur,
  *welcher* Teil darunter liegt. Ich hätte fast eine verworfene Lösung wieder
  eingebaut.
* **Zwei H1 auf `/faq` und `/gutachter-partner`.** Je ein `sr-only`-H1 fürs
  SSR-HTML plus der sichtbare aus der Client-Komponente, mit Begründung im Code.
* **„Kein sichtbarer H1" auf den Finder-Seiten.** Der Finder läuft im **iframe**
  (`app.claimondo.de/embed/…`). Die Messung im äußeren Dokument sah ihn nicht.

---

## Teil 3 — i18n (PR #5673)

### Behoben

Auf `/ar/check`, `/pl/check` und `/ru/check` rendern eine komplette CTA-Karte und
eine Formular-Überschrift den **rohen Key-Pfad** statt Text:
`check.foto_check.heading/.text/.button` + `check.lead_heading_alt`. Alle vier
werden aktiv referenziert; einen Fallback gibt es nicht, weil `i18n/request.ts`
genau eine Locale-Datei lädt.

**Der strukturelle Teil ist wichtiger:** Der Completeness-Check lief nur über
`src/i18n/messages`. Marketing war ausschließlich vom Duplikat-Guard erfasst —
die Parität seiner sechs Locales prüfte niemand. Der Kommentar begründete das
mit „Marketing pflegt seine Locales unabhängig". Unabhängig gepflegt heißt aber
nicht ungeprüft; genau in dieser Lücke sind die vier Keys aufgelaufen. Das Gate
prüft jetzt **beide Bäume, jeden gegen sein eigenes `de.json`**.

Nachgewiesen (Exit-Codes ohne Pipe gemessen): grün → Key entfernt → **Exit 1** →
wiederhergestellt → grün.

### Gemessen, aber latent

**180 hartkodierte deutsche Strings in 52 Dateien**, ausschließlich in Bereichen,
die laut `src/i18n/locale-source.ts` überhaupt lokalisiert werden (interne
Portale sind deutsch-only by design, Aaron 04.06.2026 — die wurden ausgenommen).

| Bereich | Strings | Dateien |
|---|---|---|
| `src/app/flow/[token]` | 51 | 15 (5 nutzen `t()`) |
| `src/app/embed/gutachter-finder` | 34 | 5 |
| `src/app/schaden/[token]` | 23 | 3 |
| `src/app/embed/werkstatt-finder` | 16 | 6 |
| `src/app/embed/anspruch-pruefen` | 13 | 3 |

**Warum latent:** auf prod gibt es keinen einzigen nicht-deutschen Kunden —
`flow_links` 75× `de`, `leads` 90× `de`, `profiles` 13× `de` + 171 NULL (Fallback
`de`). Der Befund wird scharf, sobald der erste türkische oder arabische Kunde
kommt. Die gefährlichste Einzelstelle ist `FlowQualiStep.tsx`: dort steht `t()`
**neben** 13 hartkodierten Strings — ein halb übersetzter Screen.

### Fremdsprach-Seiten: rund ein Drittel Restdeutsch

Gemessen über deutsche Funktionswörter, mit der deutschen Seite als Referenz:

| Seite | de (Referenz) | tr | Anteil |
|---|---|---|---|
| Startseite | 361 Marker | 115 | ~32 % |
| Stadtseite Köln | 227 | 88 | ~39 % |
| Cluster-Hub | 106 | 11 | ~10 % |

Anders als in der App haben diese Seiten **echten Traffic**. Der auffällige
Ausreißer `pl/kfz-gutachter` (185 Marker) hat sich als **Artefakt** erwiesen: der
Abschnitt ist sauber polnisch, die Treffer waren Städtenamen. Die Wortmarker-
Heuristik taugt für den groben Vergleich, nicht für Feinbefunde.

---

## Teil 4 — SEO (PR #5675, #5676)

20 Seitentypen, am ausgelieferten HTML mit Googlebot-User-Agent.

### Behoben

* **`/haftpflicht` war der einzige Ausreißer seiner eigenen Familie.** Der Hub
  zog sein Canonical aus `localeAlternates()` und erklärte damit jede
  Sprachversion zum eigenen Original — bei **identischem deutschen Inhalt** (H1
  und erster Absatz zeichengleich nachgemessen) und mit genau **1** hreflang-Tag
  statt 7. Seine eigenen 61 Unterseiten machen es richtig. Jetzt festes
  de-Canonical wie bei `/versicherer`, `/wissen` und `haftpflicht/[slug]`.
* **`/decoder` und `/sachverstaendige` ohne `BreadcrumbList`/`ItemList`.** Beide
  haben eine sichtbare Brotkrumen-Navigation ohne maschinenlesbare Entsprechung.
* **Vier Descriptions über 158 Zeichen** gekürzt (de 178, pl 185, ru 177, tr 161
  + `/wissen` 168).

### In Ordnung

| Achse | Ergebnis |
|---|---|
| Bilder ohne `alt` | **0 von 45** |
| `og:image` / `twitter:image` | auf **allen 20** Seiten |
| JSON-LD Parse-Fehler | keine |
| Antwortzeiten | 47–591 ms |

Der Metadata-Merge-Ratchet wirkt sichtbar.

Ebenfalls geprüft und als **beabsichtigt** bestätigt: `/wissen`,
`/wissen/[slug]` (68 Artikel), `/versicherer`, `/versicherer/[slug]`,
`/sachverstaendige/[slug]` sind de-only mit festem de-Canonical und bewusst ohne
hreflang — der Datei-Header von `wissen/page.tsx` hält das fest. `/ratgeber` hat
ein bewusstes Cross-Canonical auf `/unfall-was-tun-als-geschaedigter`.

---

## Vier Befunde, die eine Entscheidung brauchen

### 1 · Bruce Wayne auf `/ueber-uns`

Neben der Biografie von Nicolas Kitta (CEO) steht:

> „Es geht nicht darum wer ich bin, sondern was ich tue. Daran wird man
> gemessen." — **Bruce Wayne**

In allen sechs Sprachen live. Aaron hat daneben ein Zitat von **Henry Ford**
(„Qualität bedeutet, es richtig zu machen, wenn niemand zuschaut"). Das Muster
ist konsistent — es sind bewusst gewählte Lieblingszitate, kein vergessener
Platzhalter. Zwei Anmerkungen dazu:

* Bruce Wayne ist eine Comicfigur. Auf der Über-uns-Seite eines
  Rechtsdienstleisters, direkt unter „Geschäftsführer, CEO & Mitgründer", liest
  sich das je nach Publikum charmant oder unseriös. Für die KI-Zitierbarkeit ist
  es ungünstiger: ein Modell, das die Seite auf E-E-A-T-Signale liest, findet
  „Bruce Wayne" als benannte Entität neben dem Geschäftsführer.
* Das Ford-Zitat ist ein **bekanntes Fehlzitat** — es gibt keinen Beleg in Fords
  Schriften. Auf einer Seite, die mit „BGH-belegt" und Quellentreue wirbt, ist
  das ein Widerspruch.

Nichts geändert: Aussagen, die realen Personen zugeordnet sind, ändere ich nicht
eigenmächtig.

### 2 · `/werkstatt-finden` hat keine sichtbare Überschrift

Im iframe gemessen: der **Gutachter**-Finder hat einen sichtbaren H1 (30px,
„Kfz-Gutachter in Ihrer Nähe finden."), der **Werkstatt**-Finder hat gar keinen —
das größte Textelement der ganzen Seite ist ein 14px-`h3` („Wo steht das
Fahrzeug?"). Der Marketing-Wrapper übergibt zwar `title=`, das ist aber nur das
iframe-`title`-Attribut für Screenreader.

Nicht behoben, weil kein Zweizeiler: der Wizard wird in zwei Container gerendert
(Desktop-Spalte + Mobil-Sheet, beide im DOM), ein H1 dort wäre doppelt. Dazu
Regel 4 und paralleler Zugriff anderer Sessions auf `src/`.

### 3 · Anrede: `/flow` duzt, alles andere siezt

25 kundenseitige Dateien siezen (93 Stellen), **6 duzen** (35 Stellen) — und die
sechs liegen fast alle im `/flow/[token]`-Magic-Link-Weg. `FlowWerkstattAnzeige.tsx`
mischt sogar innerhalb einer Datei: „Ihre Werkstatt" als Überschrift über „…die
Reparatur **deines** Fahrzeugs".

Das ergänzt einen bereits dokumentierten Befund:
`docs/2026-08-23-marketing-audit-B-konversion-partner.md` §6 beschreibt denselben
Bruch für `/gutachter-partner`, und Audit E hält fest, dass er „nicht Teil der
Freigabe und unverändert" ist. Neu ist die **App**-Seite davon. Ein Kunde kommt
von der gesiezten Marketing-Seite in den geduzten Flow.

### 4 · Reihenfolge auf der Startseite

Steht aus einem früheren Durchgang offen: BGH-Beleg erscheint auf Bildschirm 15,
„32 Tage" auf 27.

---

## Was das Instrument falsch gemacht hat

Vier Messfehler, alle vor der Meldung gefunden — sie sind der Grund, warum in
diesem Durchgang jede Zahl eine Positivkontrolle hat.

1. **Alpha-Schwelle zu hoch.** `bg-white/85` wurde übersprungen (die Kette
   verlangte ≥ 0.95), gemessen wurde die Navy-Section dahinter. „Navy auf Navy =
   1:1" wäre unsichtbarer Text gewesen; der Screenshot zeigte dunkle Schrift auf
   hellem Grau. **Fünf von 13 Kontrast-Meldungen waren dadurch falsch.**
2. **Blind für Hintergrundbilder.** Hero-Fotos liegen als absolut positioniertes
   **Geschwister** unter dem Text, nicht als Vorfahre. Der reparierte Detektor
   verweigert die Messung, wo ein Bild den Grund bildet — 548 Elemente sind jetzt
   ehrlich „nicht messbar" statt falsch bewertet.
3. **Doppelt gezählt.** Zwei Regexe mit `i`-Flag über dieselben Tags meldeten 14
   hreflang statt 7.
4. **Falscher Helper-Name.** Ein Code-Grep suchte `buildLanguageAlternates`, der
   echte Helper heißt `localeAlternates` — Ergebnis: 59 „Verletzer" statt 1.

Dazu zwei Beinahe-Fehler anderer Art: der Sticky-Bar-„Fix" und der
hreflang-„Fix" wären beide gegen eine **dokumentierte, bereits getroffene
Entscheidung** gelaufen. Beide Male stand die Begründung im Datei-Header. Die
Lehre ist dieselbe wie bei den gelockten Sektionen: **erst den Header lesen,
dann den Render-Block messen.**

Und einmal hat das Werkzeug den Gegenstand verändert: eine Positivkontrolle
schrieb ihr Backup nach `C:\tmp`, während Git-Bash unter `/tmp` suchte — die
`ru.json` trug danach kurz einen Probe-Key. Sofort repariert, Diff geprüft.

---

## Offen: Regel 4

Alle fünf PRs brauchen nach dem Deploy einen Prod-Smoke:

| PR | Nachweis |
|---|---|
| #5669 | `/gutachter-partner` bis Schritt 4 durchspielen — Bestätigungs-Card mit Rahmen ringsum statt Streifen links |
| #5672 | WhatsApp-Button antippen, Footer-Links auf 390×844 treffen, `/versicherer` mobil auf `scrollWidth == 390` |
| #5673 | `/pl/check` im Ergebnis-Schritt: Text statt `check.foto_check.heading` |
| #5675 | `/tr/haftpflicht` → Canonical muss auf `https://claimondo.de/haftpflicht` zeigen |
| #5676 | `/decoder` muss `BreadcrumbList` und `ItemList` liefern |
