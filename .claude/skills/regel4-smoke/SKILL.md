---
name: regel4-smoke
description: Use when running the Regel-4 prod smoke after a PR, when a Regel-5 Abnahme measures the Nutzerstrom on the deployed environment, or whenever a Playwright smoke is written or debugged against app.claimondo.de / app.staging.claimondo.de. Triggers on "Regel 4", "Regel 5", "Abnahme", "Prod-Smoke", "Smoke fahren", "smoke gegen prod", "Playwright gegen prod", "Regel-4-Nachweis", "Nutzerstrom", and on any red/skipped smoke that needs diagnosing. Carries the failure modes that cost this project multiple days.
---

# Regel-4-Smoke — operatives Soll zuerst, dann messen

## Schritt 0 — liegt der Stand überhaupt dort, wo du misst?

Bevor du einen Prod-Lauf startest: **beweise, dass der Code auf prod liegt.** Am 04.09. hielten
zwei Sessions denselben Stand für „noch nicht auf prod" — die eine wegen `git merge-base
--is-ancestor <merge-commit> origin/main` (liefert bei Squash-Drains **falsche Negative**), die
andere, weil sie den Drain nach ihrem Merge nicht gesehen hatte. Beide hätten gegen den alten
Stand gemessen.

```bash
git fetch origin main staging --quiet
git diff --stat origin/main origin/staging | tail -3      # nur fremde Dateien = dein Stand ist drin
git ls-tree --name-only origin/main <pfad-deiner-datei>   # Datei existiert auf main
gh run list --workflow="Deploy → VPS (app.claimondo.de)" --limit 3 --json conclusion,createdAt,displayTitle
```

Tree-Diff + erfolgreicher Deploy-Run nach dem Release-Merge = auf prod. Der stärkste Beleg bleibt
eine DB-Zeile, die nur der neue Code erzeugen kann (`werkstattbindung_quelle='tarif'` gab es vor
dem Deploy nirgends). Ausführlich: Memory `reference-beweis-dass-code-auf-prod-live-ist`.

## Schritt 1 ist NICHT der Test

Bevor irgendetwas gefahren wird: **formuliere das operative Soll** — wie sollte das Feature
aus Nutzer-/Geschäftssicht ablaufen, **unabhängig davon, was gebaut ist**. Aus der Fachlogik
hergeleitet, nicht aus dem Code gelesen. Das Soll gehört in den PR und in die Abnahme-Datei
(`memory/abnahmen/`, Abschnitt 1b), **bevor** du die Komponenten liest.

Ein Smoke, der die Implementierung nachfährt („seede den Zustand, den der Code erwartet,
treibe den Pfad, den der Code nimmt"), bestätigt nur *„Code tut, was Code tut"* — eine
Tautologie. Weicht der Code vom Soll ab, ist das ein **Befund**, keine Seed-Hürde, um die
man herum-baut.

**Alles per UI.** Jeder Zustandsübergang, der zum getesteten Soll gehört, ist ein echter
Klick über echte Logins, über alle beteiligten Rollen. DB-Seed ist nur für den
*Ausgangszustand* erlaubt, den ein vorgelagerter Schritt erzeugt hätte (Lead + FlowLink,
wie ein Kanal ihn anlegt — Muster `smoke-kundenfunnel-szenarien-prod.spec.ts`).

## Schritt 2 — Eingänge × Rollen: der Nutzerstrom, nicht die Funktion

> „Wir haben öfter andere Leute, ab und an auch Leute, die angemeldet sind. Du musst das immer
> von allen Ecken und Enden durchleuchten." *(Aaron, 04.09.2026)*

Ein Feature-Smoke, der einen Eingang fährt, beweist einen Eingang. Vor dem Schreiben die Matrix
aufstellen — **jede Zelle, in der der Zustand entstehen oder gelesen werden kann, ist ein Test:**

| | Eingänge, an denen der Zustand entsteht | Rollen, die ihn sehen oder ändern |
|---|---|---|
| **anonym** | Marketing-Seite · FlowLink `/flow/<token>` · Embed im `iframe` (`/embed/…`) · QR/NFC-Karte · Anspruchsprüfung `/check` · Telefon → Dispatcher legt an | Besucher (Re-Visit desselben Links!) |
| **angemeldet** | Kunde-Portal „Schaden melden" · Werkstatt-QR · Dispatch-Anlage | Kunde (Fallakte) · Werkstatt · SV · Dispatch (Override) · Admin (Stammdaten) · KB · Makler · Flotte · Kanzlei |

Beispiel Kasko-Werkstattbindung (04.09.): 9 Tests — FlowLink gebunden/frei/unklar/Freitext,
Embed gebunden, Dispatch-Override wirkt auf Lead **und** Claim **und** Kundensicht, Kunde-Portal
„Schaden melden" → Tarif-Card, Admin-Liste, Marketing-Einbettung. Der Re-Visit ist eine eigene
Zelle: derselbe Link, zweiter Besuch, muss das Ergebnis zeigen und nicht die Frage.

**Endzustände sind Zellen mit eigener Frage:** Welche Handlungen bietet die Seite? Buttons und
Links zählen (`getByRole('button').allInnerTexts()`). Ein irreversibler Klick ohne Bestätigung
und ohne Weg zurück ist ein Befund (Kasko-WB: ein Klick auf die Tarif-Karte disqualifizierte
den Lead und schickte die Mail; die Endseite bot nur „Rückruf" → PR #5864).

## Immer Playwright, immer mit echter Eingabe — die fünf Messfallen

`curl`, ein Statuscode, ein Grep im HTML oder ein DB-Read sind **kein** Nachweis; sie ergänzen
einen Playwright-Lauf. Zum Nachweis gehören echte Eingaben und der Folgezustand. Fünf Fallen,
alle real aufgetreten (AGENTS.md Regel 4):

1. **Falscher Frame.** Der Finder läuft im `iframe` auf der Marketing-Seite. Wer das äußere
   Dokument misst, sieht „0 Eingabefelder". → `page.frames().find(f => f.url().includes('embed/'))`.
2. **Zu früh gemessen.** „Leer" und „noch nicht fertig" sehen identisch aus. Am 04.09.: die
   Endseite war sichtbar, dann rendert `revalidatePath` die Seite über das Re-Visit-Gate neu
   („Wird geladen …") — ein einmaliger `innerText`-Snapshot las genau diesen Moment und meldete
   die Endseite als leer. → **Auto-Wait-Assertions** (`expect(locator).toBeVisible()`,
   `expect.poll`), Ladezustände explizit wegwarten (`expect(page.getByText('Wird geladen …')).toHaveCount(0)`),
   nie `innerText` einmal lesen und daran mehrere `expect` hängen.
3. **Erfundene Testdaten.** Ein ausgedachter Slot/Tarif fällt korrekt auf einen Fallback — das
   sieht aus wie ein Bruch. Werte aus der laufenden Oberfläche oder der DB holen
   (`HUK-COBURG` → Tarife `Basis|Basis SELECT|Classic|Classic SELECT|…` per `execute_sql`).
4. **Falsche Schicht.** `innerText` blendet Kommentare aus; für LLM-Themen den Quelltext
   messen. Erst die Frage klären, dann die Schicht wählen.
5. **Blindes Instrument.** Eine Null ist erst ein Befund, wenn dasselbe Werkzeug einen Fehler
   auch zeigen würde. Positivkontrolle mitfahren.

**`has-text` matcht Substring UND case-insensitiv** — `getByText('Classic', { exact: true })`,
sonst trifft „Classic" auch „Classic SELECT" und „Classic Kasko PLUS SELECT".

## Vor dem Lauf: Umgebung, die den Lauf verhindert

```bash
rm -rf playwright/.auth/*.json    # sonst fährst du mit fremden Cookies (totp-secrets.json behalten!)
rm -rf .next/dev                  # sonst bricht der nächste Production-Build
```

`playwright/.auth/<rolle>.json` trägt den Host **nicht im Namen**. Ein gecachter
localhost-Login lässt einen prod-Lauf als flächendeckenden Produktfehler erscheinen —
gemessen: 4/4 Wege rot, „0 Links" überall.

Gegenprobe, wenn etwas nicht stimmt:
```bash
node -e "const s=require('./playwright/.auth/admin.json'); console.log([...new Set((s.cookies||[]).map(c=>c.domain))])"
```

**Der Haupt-Checkout hat unter Umständen kein `node_modules`** (04.09.: 0 Einträge; `npx
playwright --version` antwortet trotzdem aus dem npx-Cache und täuscht eine Installation vor).
Im Worktree eine Junction auf ein **echtes** `node_modules` eines Nachbar-Worktrees legen —
aber nie so:

* `cmd //c "mklink /J …"` aus Git-Bash → MSYS-Pfadkonvertierung verstümmelt das Ziel (`\C:\…`);
  mit `MSYS_NO_PATHCONV=1` wird `//c` nicht mehr zu `/c` und `cmd` startet eine leere Shell.
* `node -e "fs.symlinkSync('C:\\…')"` → Bash frisst die Backslashes, `\n` wird zum Zeilenumbruch.

Richtig: Script-Datei mit Forward-Slashes, `fs.symlinkSync(target, 'node_modules', 'junction')`,
danach `createRequire` auf `@playwright/test/package.json` prüfen. Turbopack-Builds brechen an
Junctions (Memory Werkstattbindung-Lane) — für den Smoke ist das egal.

**Typecheck im Worktree braucht Heap:** `npx tsc --noEmit` stirbt mit dem Default-Heap als
V8-Crash (`Exit 134`, Stacktrace mit `v8::String::Utf8Value`) — das ist **kein Typfehler**, aber
auch kein Nachweis. Mit `NODE_OPTIONS=--max-old-space-size=8192` läuft er in ~6 Minuten grün
(05.09., zweimal reproduziert).

**Lange Läufe unter dem 10-Minuten-Limit des Bash-Tools halten.** Ein Hintergrundbefehl, der
auf ein Deploy wartet **und** danach sechs Tests fährt, wird am Limit abgeschossen, ohne dass
ein Test gelaufen ist. Aufteilen: ein Poll-Befehl (≤ 9 Min), dann je Lauf ein eigener Befehl
mit 2–3 Tests. Parallele Läufe brauchen je Lauf ein eigenes `--output <dir>` **und** ein eigenes
Screenshot-Verzeichnis (`ABNAHME_SHOTS_DIR`) — Playwright leert `test-results/` beim Start, ein
zweiter Prozess löscht sonst die Bilder des ersten, während der noch läuft (Lauf 11 → 12: die
Screenshots von „frei" waren weg, ein reiner Bilder-Lauf musste nach).

**Secrets:** `.env.local` trägt `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, aber
**keine** `TEST_*`-Passwörter. Die stehen in der Memory-Referenz
`reference-internal-test-account-logins` (rotiert 31.08., 32 Zeichen, nie ins Repo). Lauf:

```bash
RUN_<GATE>=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de \
  node --env-file=.env.local --env-file=<session-scratch>/smoke.env \
  node_modules/@playwright/test/cli.js test <spec> --project=chromium --reporter=line --retries=0 --workers=1
```

Die Test-Konten `test-admin@`, `test-dispatch@`, `smoke-kunde@` haben **0 verifizierte
MFA-Faktoren** (Stand 04.09.) — ein `/login/2fa`-Umweg bedeutet, dass jemand das geändert hat.

## Zeigt der Lauf wirklich dorthin, wo du denkst?

Die teuerste Fehlerklasse dieses Projekts: **eine Bedingung hängt an einem Stellvertreter
statt am Ziel.** Drei Fälle an einem Tag (#5512, #5526, #5543) — jedes Mal fand der
vorgeschriebene Prod-Lauf nicht statt, und jedes Mal sah der Lauf normal aus.

> **Prüfsatz:** „Wenn ich das ZIEL wechsle (localhost ⇄ staging ⇄ prod) — ändert sich diese
> Bedingung mit?" Lautet die Antwort nein, hängt sie am falschen Wert.

Hängt eine Bedingung an `CI` oder `!IS_LOCAL` statt an der URL, ist sie falsch. In CI fällt
das nie auf, weil dort Stellvertreter und Ziel zufällig übereinstimmen.

**Die Gegenprobe ist nicht der Test-Output, sondern das Zugriffslog der Instanz, die du zu
testen glaubst.** (Ein Dev-Server-Log, das bei 758 Bytes steht, hat null Requests gesehen —
der Lauf ging in Wahrheit scharf gegen prod.)

Zentrale Stelle für Ziel + Basic-Auth: `tests/e2e/lib/ziel.ts`. Nur staging liegt hinter
nginx-Basic-Auth.

## Bezeichner nachschlagen, nie raten

Vier geratene Namen in einer Session, vier fehlgeschlagene Prod-Queries: `onboarding_flow_steps`
(heißt `flow_szenario_steps`, Schlüssel `step_id`), `claims.erstellt_am` (heißt `created_at`),
`claims.fallnummer` (gibt es nicht). Vor jeder DB-Assertion:

```sql
select column_name from information_schema.columns where table_name = 'email_log';
```

Test-Identitäten `…@claimondo.test` sind **intern** (`ist_interne_email` = true): keine
Kunden-WhatsApp, aber E-Mails laufen — der Nachweis ist `email_log (empfaenger, template,
status)`, nicht der Posteingang und nicht `nachrichten.template_key` (der Sendeweg schreibt
ihn nicht; Memory `audit-kundenfluss-laeuft-durch-16-befunde`).

## Assertions: die vier Fallen

**Am DB-Zustand messen, nicht am Toast.** `sonner`-Toasts sind beim Auslesen oft schon weg.
`expect.poll` auf Zeilenzahl/Status; Text höchstens als Zusatz.

**`pointer-events: none` ist nicht „verdeckt".** Wer per `elementFromPoint` prüft, ob ein Ziel
erreichbar ist, misst nur, *welches* Element am Punkt liegt — nicht, ob das *Ziel selbst* Zeiger-
Ereignisse empfängt. Ein bewusst durchlässiges Overlay (`pointer-events: none`, oft plus
`opacity: 0`) wird dann systematisch als Blocker gemeldet, und zwar umso öfter, je sauberer die
Seite gebaut ist. Gemessen 05.09. auf `/check` mobil: 4 „verdeckte" Ziele, alle vier Teile einer
Kontaktleiste mit `pointer-events: none`; der echte Blocker war längst behoben. **Gegenprobe, die
entscheidet:** `locator.click({ trial: true })` — fährt alle Actionability-Checks, klickt aber nicht
(kein `tel:`-Aufruf, kein Lead). Sagt sie „klickbar", ist die Geometrie-Meldung ein Artefakt.

**Nach einem Deploy nicht sofort messen.** Prod ist minutenlang träge, nachdem ein Release
durchgelaufen ist. Gemessen 05.09.: dieselben sechs Tests brauchten auf staging 40 Sekunden, 15
Minuten nach dem Prod-Deploy 6 Minuten, und einer lief in den 300-s-Test-Timeout. Die Einzel-
Wiederholung war nach 13 Sekunden grün. **Ein roter Lauf in diesem Fenster ist erst nach einer
Wiederholung ein Befund** — und ein Timeout beim Warten auf ein Element, das nachweislich in
`origin/main` liegt, ist fast nie das Produkt.

**`has-text` matcht Substring UND case-insensitiv.** Die gefährlichste, weil sie nicht in
einen Timeout läuft, sondern **plausibel den falschen Pfad nimmt**: `button:has-text("Ich")`
traf „Die Schuldfrage ist noch n·**ich**·t eindeutig geklärt" statt „Ich selbst" — und die
Schlussfolgerung wäre „der Fix ist kaputt" gewesen, bei korrektem Code. Nimm den vollen
Optionstitel oder `getByRole('button', { name: /^Ich selbst/ })`.

**Ein generischer Button-Text ist kein Zustands-Detektor.** Am 05.09. sollte
`getByRole('button', { name: /^überspringen$/ })` die Werkstatt-Liste erkennen — er traf den
„Überspringen"-Link im Fahrzeugschein-Foto-Widget der Feststellung (Sub-Step 6 von 9). Daraus
wurde fast ein Befund „Kasko-Lead bekommt Werkstatt ohne Tariffrage", inklusive Fix-Auftrag an
die Lane. Ein Zustand wird an dem erkannt, was es **nur dort** gibt (die „Auswählen"-Buttons der
Werkstattkarten, mehrere), nie an „Weiter"/„Überspringen"/„Zurück". Und **vor jeder Meldung den
Screenshot vom Erkennungszeitpunkt ansehen** — er zeigte Feststellung 6/9 und den
Fortschrittsindikator mit dem angeblich fehlenden Step als Kreis 3 von 5.

**`button[type="submit"]`.first() klickt ABMELDEN.** Der Logout in der Portal-Navigation ist
ein Server-Action-Form und steht im DOM **vor** dem Seiteninhalt. Gilt für jedes Portal mit
Nav. Richtig: `.filter({ hasText: 'Schaden melden' })` — und danach `count()` loggen.

**Body-Text-Polls treffen die Navigation.** Ein Poll auf „Kostenvoranschlag" war sofort
erfüllt, weil das ein Nav-Eintrag ist — er meldete Erfolg, bevor geklickt wurde.

**Kein `describe.configure({ mode: 'serial' })` über unabhängige Eingänge.** Ein roter T1 riss
am 04.09. acht weitere Eingänge mit („8 did not run") — jeder Eingang ist ein eigener Befund.
Serial nur für echte Abhängigkeiten, und die abhängige Zelle skippt sauber mit Grund.

**Nach einem FEHLGESCHLAGENEN Test startet Playwright einen neuen Worker** — Modul-State ist
dann weg, und `afterAll` des alten Workers läuft beim Shutdown. Ein Test, der den Zustand
eines früheren Tests braucht (Dispatch-Override auf den Lead des Flow-Laufs), muss direkt
hinter ihm stehen und den Zustand zusätzlich als Datei persistieren; sonst sieht er `null`,
skippt, und das Cleanup hat den Zustand schon gelöscht (05.09., zweimal).

**`page.goto` direkt nach einem Client-Redirect wirft `net::ERR_ABORTED`.** Nach Passwort-Setzen
oder Login navigiert die App noch selbst; ein sofortiges `goto` auf die Fallakte wird
abgebrochen. `waitForLoadState('networkidle')` davor, und den `goto` einmal wiederholen.
Kein Produktfehler — derselbe Schritt war in den Läufen davor grün.

**Playwright leert `test-results/` bei jedem Lauf.** Eigene Messscripte, extrahierte Assets und
Belege, die dort liegen, sind nach dem nächsten `playwright test` weg — am 05.09. verschwand so eine
komplette Unfallguide-Messung samt Screenshots. Belege in den Session-Scratchpad; Scripte dort mit
`createRequire('<worktree>/package.json')` auf `@playwright/test` zugreifen lassen, ein ESM-`import`
aus dem Scratchpad findet das Paket nicht. Fehler-Screenshots (`test-failed-1.png`) sofort
wegkopieren, bevor der nächste Lauf startet.

**Portale liegen in Tabs.** Die Dispatch-Lead-Seite zeigt Kontakt · Schaden · Unfall · Fahrzeug ·
Schuld · … — ein Feld aus der Sektion `schuld` existiert erst nach dem Klick auf den Tab.
`getByLabel` findet nichts und meldet ein fehlendes Feature; der Screenshot vom Fehlerzeitpunkt
zeigt die Tab-Leiste. Erst den Screenshot ansehen, dann den Selektor anzweifeln.

## Vorbedingungen scharf stellen

Jeder Smoke prüft **zuerst** seinen Ausgangszustand. Ohne das prüft er unbemerkt etwas
anderes: ein bereits freigegebener Auftrag ist ohnehin offen → grün ohne Aussage.

## Cleanup gehört in `afterEach`, nicht in `finally`

Bei Test-Timeout bricht Playwright den Test-Body ab — ein `finally { cleanup() }` läuft
**nicht** mehr. Real passiert: der Lead eines geflakten Laufs blieb auf prod stehen, obwohl
die Spec „0 Residue" versprach. Mit aufräumen: `tasks` (entity_id **und** lead_id/claim_id),
`admin_termine`, `flow_links`, Claim deaktivieren, Auth-User löschen — sonst flutet die
Task-Liste an vier Stellen.

## Ein grünes Ergebnis ist nicht automatisch ein Nachweis

`0 passed / N skipped` ist **kein** erbrachter Lauf, sondern ein stiller Skip. Die Zeile
`N passed` muss dastehen. Ebenso: `cancelled` ist kein Erfolg, und ein `✓` mit einem Hinweis
darin ist ein halber Befund. **Ein Wrapper-Exit maskiert den echten Exit** — `… | tee log | tail`
liefert den Exit von `tail`; den Playwright-Exit separat festhalten
(`…; echo "PLAYWRIGHT_EXIT=$?" >> log`).

## Selektoren gegen prod

Prod deployt von `main`; viele `data-testid` liegen nur auf `staging`. **Rollenbasiert
schreiben** (`getByRole`), nicht per Testid. Und „ist X auf prod?" nie per
`git branch --contains` prüfen — staging→main läuft über Squash-Commits, der Test liefert
massenhaft falsche Negative. Inhaltlich prüfen (Schritt 0):
```bash
git cat-file blob origin/main:<pfad> | grep -c '<marker>'
```

## Ergebnis ablegen (Regel 5)

Der Lauf ist erst Nachweis, wenn er dort steht, wo Aaron und die Abnahme-Session ihn finden:
`memory/abnahmen/<datum>-<slug>.md`, Abschnitt 7 (Nachweise mit Zahlen + Quelle: Kommando,
`N passed`, DB-Reads, Screenshot-Pfade) und Abschnitt 10 (Checkliste). Screenshots je Zelle
(`page.screenshot({ fullPage: true })`) sind der Beleg fürs Auge — die Abnahme-Session prüft
sie gegen das Soll aus Abschnitt 1b.

## Verwandt

- `journey-verifikation` — prüft den ganzen Lauf, nicht nur die neue Funktion
- `docs/fundament/journey-smokes.md` — welche Spec bewacht welche Journey
- Test-Konten: `scripts/test-fixtures/ids.ts` (stabile IDs immer von dort); Passwörter nur aus Memory
- Abnahme-Mandat: Memory `feedback-abnahme-instanz-mandat-aaron` + `memory/abnahmen/INDEX.md`
