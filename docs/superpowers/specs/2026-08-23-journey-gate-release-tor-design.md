# Journey-Gate am Release-Tor — Design

> **Auftrag (Aaron, 23.08.2026):** „Die Smokes decken nicht auf, was wirklich der Fehler ist. Sie
> fokussieren sich nur darauf, dass diese eine kleine Funktion, die wir neu eingebaut haben,
> einzeln gecheckt wird — aber nicht, ob der gesamte Lauf, in dem wir gerade arbeiten, dann auch
> wirklich funktioniert. Ausserdem nehmen uns Merges auseinander: sie loeschen wieder
> Applikationsschritte. Ich will nicht immer selbst festfahren, weil ich keine Zeit habe."

## 1 · Befund: die Abdeckung ist da, das Timing nicht

Die Erhebung vom 23.08. widerlegt die naheliegende Vermutung, es fehlten Tests. Es fehlt nichts —
es greift nur nichts zum richtigen Zeitpunkt.

| Gemessen | Wert |
|---|---|
| Journey-Smokes J1–J10 | vollstaendig vorhanden, deterministische Wegwerf-Seeds, self-cleaning |
| Journey-Steps im nightly vom 23.08. | **10 von 10 gruen** |
| E2E-Specs gesamt | 89 |
| Ratchet-Gates auf jedem PR | ~25 (Token, knip, component-set, RLS, Reachability, Stille-Writes …) |
| **Laufzeit aller 10 Journeys inkl. Seeds** | **212 s** |
| Laufzeit des ungefilterten Sammel-Steps | 1799 s (88 % der Job-Zeit) |
| nightly-Job-Status seit 14.08. | 7× `cancelled`, dann 3× `failure` — **kein einziges Mal gruen** |

### Die vier Luecken

**L1 — Der Journey-Waechter gatet nichts.** `ci.yml` sagt es woertlich: *„Der Job GATET NICHTS
(laeuft post-merge, informativ)"*, `if: schedule || workflow_dispatch`. Ein PR kann jede Journey
brechen und wird trotzdem gruen gemergt. Der Bruch zeigt sich fruehestens am naechsten Morgen um
03:30 UTC. **Das ist die vollstaendige Kausalkette fuer „Merges loeschen Applikationsschritte".**

**L2 — Der informierende Waechter ist blind.** Der Job ist seit 14.08. durchgehend rot oder
abgebrochen. Die Ursache liegt aber **nicht** in den Journeys, sondern allein im ungefilterten
Sammel-Step am Ende, der dieselben Fixtures ein zweites Mal auf bereits verbrauchtem Zustand
anfasst. Ein dauerhaft roter Job traegt kein Signal mehr: bricht morgen J4 wirklich, aendert sich
an der Anzeige nichts. (Vgl. [[audit-tote-postfaecher-verschluckten-echte-warnungen]] — ein Alarm
ins tote Postfach ist schlechter als kein Alarm.)

**L3 — Niemand ist verpflichtet, den ganzen Lauf zu pruefen.** Die Journey↔Spec-Zuordnung
existiert seit 29.07. als `docs/fundament/journey-smokes.md`, aber keine Regel zwingt eine Session,
sie zu konsultieren. Regel 4 verlangt einen Prod-Smoke nach jedem PR — der ist an das eigene
Feature gebunden. `ci.yml` protokolliert die Folge selbst: *„⚠ OFFEN: `-kva-betrag-pflicht` und
`-kva-ablehnung-loop` haben KEINEN eigenen Journey-Step und werden damit nirgends mehr scharf
geprueft."*

**L4 — 15 von 26 ENV-Gates werden nirgends gesetzt.** `RUN_KUNDENFUNNEL_SMOKE`,
`RUN_C1_QUALI_SMOKE`, `RUN_WERKSTATT_GATE_SMOKE`, `RUN_VEHICLES_NACHZUG_SMOKE` u. a. laufen nur,
wenn jemand sie von Hand startet. Bei neun parallelen Sessions faktisch nie. Ein Teil davon ist
gewollt (`prod-optin` fuer echte Buchungen) — welcher, ist bisher ungemessen.

## 2 · Der strukturelle Knoten und seine Aufloesung

Die Journeys laufen gegen `app.claimondo.de`. Deshalb *koennen* sie nicht an einem PR haengen:
`ci.yml` erklaert, dass ein PR-Lauf den Prod-Stand gegen den nicht deployten PR-Branch testen
wuerde — systematisch rot. Genau darum steht das Gate in der Nacht statt am Tor.

**Aufloesung:** Der Ort, an dem der neue Stand bereits deployt *und* noch nicht auf prod ist, ist
`app.staging.claimondo.de`. Zwei Messungen machen den Umbau billig:

* **staging und prod teilen dieselbe Supabase-Datenbank.** Beide Deploy-Workflows lesen dasselbe
  Secret `NEXT_PUBLIC_SUPABASE_URL`; nur `NEXT_PUBLIC_APP_URL` unterscheidet sich. Test-Accounts,
  Seeds und Service-Role-Key gelten unveraendert. Die Specs brauchen nur eine andere `baseURL`.
* **Das zielabhaengige Basic-Auth-Gate existiert seit #5543** (`BRAUCHT_BASIC_AUTH =
  /staging/i.test(BASE)`). Das Muster ist erprobt und wird hier verallgemeinert.

⚠ **Was das NICHT bedeutet:** staging ist kein isoliertes Environment. Ein Lauf gegen staging
schreibt in die **Produktionsdatenbank**. Alle heutigen Schutzmechanismen (Wegwerf-Konten,
`reserviere()`-Guard, self-cleaning Seeds) bleiben unveraendert Pflicht. Das gilt analog zu
[[coordination-stripe-golive-cutover-runbook]] — staging faehrt auch mit dem Stripe-Live-Key.

## 3 · Architektur

### 3.1 Das Gate haengt am Release-Drain, nicht am staging-Deploy

Gemessene Frequenzen: **staging-Deploys ~40/Tag** (teils drei in einer Minute), **main-Releases
~5–10/Tag** ueber `release/rNNN-drain`-PRs. Ein Gate pro staging-Deploy waere sinnlos teuer und
wuerde die Seed-Last auf der Produktionsdatenbank vervierzigfachen.

```
Feature-PR ──► build + ~25 Ratchets (unveraendert schnell) ──► merge staging
                                                                    │
                                                            staging-Deploy
                                                                    │
release/rNNN-drain-PR ──► JOURNEY-GATE (~5 Min, gegen staging) ──► merge main ──► prod
```

Ein Feature-PR wird dadurch **keine Sekunde langsamer**. Aber nichts Kaputtes erreicht prod, ohne
dass die Journey-Suite den neuen Stand gesehen hat.

**Neuer Workflow:** `.github/workflows/journey-gate.yml`, `on: pull_request` mit
`branches: [main]` — greift also genau bei Drain-PRs (`release/rNNN-drain -> main`, gemessen an
#5517/#5527/#5532/#5537/#5541).

⚠ **`main` ist heute NICHT branch-protected** (`gh api …/branches/main/protection` → 404). Es
existiert kein einziger required check; Regel 1 („nie direkt auf `main` pushen") ist eine reine
Konvention. **Damit das Gate wirklich blockiert, muss Branch-Protection erst aktiviert werden —
ein Eingriff in den Repo-Flow, der Aaron gehoert (§8).** Vorschlag mit den geringsten
Nebenwirkungen:

* `required_status_checks: ["journey-gate"]` — **nur dieser eine Check**
* `required_pull_request_reviews: null` — **ausdruecklich keine Review-Pflicht**, sonst braucht
  jeder Drain einen zweiten Menschen und Aaron steht still
* `enforce_admins: false` — der Notausgang bleibt offen

Bis zur Freigabe laeuft das Gate im **Berichtsmodus**: es faehrt vollstaendig, kommentiert den PR
und faerbt den Check rot, verhindert den Merge aber technisch noch nicht. Der gesamte uebrige
Umbau ist davon unabhaengig und wirkt sofort.

### 3.2 Welche Journeys ins Tor gehoeren

Bei 5–10 Laeufen/Tag statt einem pro Nacht steigt das Risiko der schreibenden Journeys. Deshalb
ein Zuschnitt, kein Pauschal-„alle zehn":

| Journey | Im Tor? | Begruendung |
|---|---|---|
| J1 Haftpflicht e2e (`golden-path-deep-prod`) | ✅ | Wegwerf-Fixtures, self-cleaning |
| J2 Meldung alle Kanaele | ✅ | Wegwerf-Konten; `kanal='none'`-Assert beweist Send-Isolation |
| J3 SA-Unterschrift | ✅ | anon `/flow/[token]`, Wegwerf-Lead |
| J4 Reparatur-Weg | ✅ | frische FIN pro Lauf, raeumt Reste > 1 h selbst |
| J5 Kasko-Reparatur | ✅ | deterministischer Wegwerf-Seed |
| J6 Kanzlei-Uebergabe | ✅ | Wegwerf-Claim, externer Kunde-Login |
| J8 2FA-Enroll | ✅ | konto-isoliert, self-reset je Lauf |
| J10 Werkstatt-Finder | ✅ | eigene Wegwerf-Werkstatt |
| **J9 Provisionen-lifecycle** | ❌ nightly | schiesst den **echten** globalen Release-Cron auf echte Provisionen (heute per Geld-Guard abgesichert). 5–10×/Tag erhoeht die Trefferwahrscheinlichkeit fremder faelliger Rows deutlich. J9-`verrechnung`/`-staffel` (rein DB) bleiben im Tor. |
| **J7 Storno/DSGVO** | ❌ nightly | DSGVO-Ausfuehrung ist **irreversibel**. Bei 10 Laeufen/Tag entstehen 10 Wegwerf-Admin-Konten + 20 Loeschauftraege taeglich in der Prod-DB. |

Tor-Suite = **8 Journeys + 2 DB-Teilschritte aus J9**. Geschaetzte Laufzeit: ~175 s Tests +
~99 s Setup = **rund 5 Minuten**.

### 3.3 Rot heisst: Aaron entscheidet

Aaron-Entscheid 23.08.: *„es muss abgesprochen werden."* Das Gate blockiert, waelzt die
Entscheidung aber nicht auf die Automatik ab:

1. **Rot blockiert den Merge** (required check).
2. Ein Bot-Kommentar im PR nennt den **konkreten Befund**: welche Journey, welcher Schritt,
   erwarteter vs. tatsaechlicher DB-Zustand, Link zum Trace-Artefakt. Kein „e2e failed".
3. **Override nur nach Aarons Freigabe:** Label `journey-override` am PR + Pflicht-Begruendung als
   Kommentar. Der Workflow protokolliert beides in der Job-Summary, damit die Uebersteuerung
   nachvollziehbar bleibt und nicht zur Gewohnheit wird.

⚠ **Bewusst kein automatischer Retry bei Rot.** Ein stiller Retry verwandelt einen echten
Regressionsbefund in Flakiness-Rauschen. Wiederholt wird nur auf Aarons Anweisung.

### 3.4 Journey↔Code-Mapping: die Session erfaehrt ihren Lauf automatisch

Neue Datei `scripts/journey-map.json`:

```json
{
  "J4": {
    "titel": "Reparatur-Weg",
    "pfade": ["src/lib/reparatur/**", "src/app/werkstatt/**", "src/app/api/reparatur/**"],
    "waechter": ["reparatur-weg-e2e-smoke", "reparatur-weg-kva-betrag-pflicht"]
  }
}
```

Neues Script `scripts/check-journey-bezug.mjs`, eingehaengt in den bestehenden `build`-Job:

* liest den PR-Diff (`git diff --name-only origin/staging...HEAD`),
* schneidet ihn gegen die Pfad-Muster,
* schreibt in die **Job-Summary**: *„Du hast **J4 (Reparatur-Weg)** beruehrt. Bewachender Smoke:
  `reparatur-weg-e2e-smoke`. Regel 4: operatives Soll fuer J4 durchdenken, dann diesen Smoke
  fahren — nicht nur deine neue Funktion."*

**Nicht blockierend.** Das Script informiert; das Blockieren uebernimmt das Tor in 3.1. Der Grund:
ein Session-Autor kann eine Journey beruehren, ohne sie brechen zu koennen — die Entscheidung
darueber gehoert an den Ort, an dem gemessen wird, nicht an den, an dem geraten wird.

Die Pfad-Zuordnung wird aus `docs/fundament/journey-smokes.md` abgeleitet, das damit von einem
gelesenen zu einem **ausgefuehrten** Dokument wird.

### 3.5 Nightly wird wieder lesbar

* Der ungefilterte Sammel-Step `npx playwright test` wandert in einen **eigenen Job** `e2e-rest`.
  Damit traegt der Journey-Job wieder ein echtes Signal, und der 30-Minuten-Block blockiert nichts.
* Die zwei verwaisten Specs (`-kva-betrag-pflicht`, `-kva-ablehnung-loop`) bekommen je einen
  eigenen Seed-Lauf und damit ihren eigenen Journey-Step. `ci.yml` markiert sie selbst als
  ungeprueft.
* Die 15 nirgends gesetzten ENV-Gates werden inventarisiert und nach **Bekenntnis vs. Daten**
  getrennt (vgl. [[broadcast-cancelled-faellt-durch-beide-raster]]): bewusst `prod-optin` →
  dokumentieren; faktisch vergessen → in Tor oder nightly aufnehmen.

### 3.6 Basic-Auth an eine Stelle

Heute existieren drei Konventionen nebeneinander:
`STAGING_BASIC_AUTH_USER/PASS` · `STAGING_BASIC_USER/PASS` · **Klartext im Repo**
(`tests/e2e/staging-clickthrough.spec.ts:6`).

Neues Modul `tests/e2e/lib/ziel.ts`:

```ts
export const ZIEL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
export const BRAUCHT_BASIC_AUTH = /staging/i.test(ZIEL)   // Muster aus #5543
export function httpCredentialsFuerZiel() { /* … oder undefined */ }
```

Alle Specs, die das Tor faehrt, beziehen ihre Credentials hierher. **Das Klartext-Passwort wird
entfernt** — es steht heute unverschluesselt in der Git-Historie und muss anschliessend rotiert
werden (Aaron-Aufgabe, ausserhalb dieses Umbaus).

⚠ Pruefsatz aus [[broadcast-prod-playwright-smoke-drei-fallen]]: *„Wenn ich das ZIEL wechsle
(localhost ⇄ staging ⇄ prod) — aendert sich diese Bedingung mit?"* Jede neue Bedingung im Tor muss
ihn bestehen.

## 4 · Skills als Infrastruktur

Heute: ein einziger Repo-Skill (`bibliothekar`), kein Mechanismus. Das erkaufte Wissen liegt in
Memory-Dateien und wirkt nur, wenn eine Session es zufaellig liest.

Drei neue Skills unter `.claude/skills/`:

| Skill | Deckt ab | Eingebaute Fallen |
|---|---|---|
| `regel4-smoke` | operatives Soll → Smoke gegen prod | `playwright/.auth` nach Host-Wechsel loeschen · am DB-Zustand messen statt am Toast · volle Optionstitel statt Substring · `button[type=submit]`.first() trifft ABMELDEN |
| `journey-verifikation` | „welchen ganzen Lauf beruehre ich?" | Journey-Map lesen · Vorbedingungen scharf stellen · Cleanup in `afterEach`, nicht `finally` |
| `release-drain` | staging → main | PR-Base-Falle · Stacked-PR-Falle · `--body-file` statt `--body` |

Dazu ein Hook in `.claude/hooks/`, der bei passenden Prompts auf den jeweiligen Skill hinweist.
Der Hook-Mechanismus ist etabliert (`load-memory-digest.mjs`, `update-session-marker.mjs`).

## 5 · Was dieser Umbau ausdruecklich NICHT tut

* **Keine neue Test-Ebene.** Es entstehen keine zusaetzlichen Journey-Smokes; die bestehenden
  bekommen einen Zeitpunkt.
* **Kein Preview-Deployment pro PR.** Waere der sauberste Weg, ist aber ein eigenes
  Infrastruktur-Projekt (10× Build-Last, eigene Subdomains). Das Release-Tor loest 90 % davon zum
  Bruchteil der Kosten.
* **Keine Aenderung an Regel 4.** Der Regel-4-Prod-Smoke bleibt, wie er ist. Das Tor ergaenzt ihn
  um das, was er strukturell nicht leisten kann: den Blick auf den ganzen Lauf statt auf das eigene
  Feature.
* **Keine Isolation von staging.** Eine eigene staging-Datenbank waere ein separates Vorhaben mit
  erheblichen Folgen (Seeds, Accounts, Stripe, Twilio).

## 6 · Risiken

| Risiko | Gegenmassnahme |
|---|---|
| Flakiger Smoke blockiert den Release | Kein Auto-Retry (Rauschen). Stattdessen `journey-override`-Label nach Aarons Freigabe. Flakes werden als Befund behandelt, nicht weggeklickt. |
| 5–10× mehr Seed-Last auf der Prod-DB | Nur self-cleaning Wegwerf-Seeds im Tor. J7/J9-lifecycle ausgenommen (3.2). Nach zwei Wochen Residue messen. |
| Gleichzeitige Drain-PRs racen um Fixtures | `concurrency`-Gruppe im Gate-Workflow, `cancel-in-progress: false` — Drains laufen seriell durchs Tor. Bekannte Klasse: [[broadcast-deploy-workflows-ohne-concurrency-guard]]. |
| Journey-Map veraltet, wenn Code umzieht | Die Map liegt neben `journey-smokes.md`; ein Pfad-Muster ohne Treffer im Repo wird vom Script als Warnung gemeldet. |
| Das Tor wird zur Gewohnheit uebersteuert | Jeder Override erscheint mit Begruendung in der Job-Summary und ist damit zaehlbar. |

## 7 · Abnahmekriterien

1. Ein Drain-PR nach main loest das Journey-Gate aus; es laeuft gegen `app.staging.claimondo.de`
   und ist in **unter 8 Minuten** durch.
2. Ein absichtlich gebrochener Journey-Schritt laesst das Gate rot werden, und der PR-Kommentar
   nennt Journey, Schritt und DB-Zustand — nicht nur „failed". **Scharf nachgewiesen, nicht
   angenommen.**
3. Der nightly-`e2e`-Job ist wieder gruen, wenn die Journeys gruen sind (Sammel-Step getrennt).
4. `check-journey-bezug` meldet an einem realen PR die korrekte Journey.
5. Die 15 ungesetzten ENV-Gates sind nach Bekenntnis/Daten getrennt und dokumentiert.
6. Kein Klartext-Passwort mehr in `tests/**`.

## 8 · Offene Punkte fuer Aaron

* **🔴 BLOCKER: das TLS-Zertifikat von `*.staging.claimondo.de` ist abgelaufen.**
  Gemessen 23.08.: gueltig bis **10.08.2026**, seit 13 Tagen tot. Prod laeuft bis 06.10.
  nginx und App antworten normal (`curl -k` → 401), nur die TLS-Kette ist ungueltig — jeder
  Browser und jeder Playwright-Lauf bricht mit `ERR_CERT_DATE_INVALID` ab. Der
  Let's-Encrypt-Renewal auf dem VPS laeuft nicht mehr.
  **Solange das so ist, kann das Gate nicht gegen staging fahren.** Der Rest ist nachgewiesen
  (s. u.); es fehlt allein das Zertifikat.
  ```bash
  echo | openssl s_client -servername app.staging.claimondo.de \
    -connect app.staging.claimondo.de:443 2>/dev/null | openssl x509 -noout -dates
  ```
  ⚠ Der Workaround `ignoreHTTPSErrors` wurde **bewusst nicht** eingebaut — er wuerde genau
  diese Klasse dauerhaft verdecken. Stattdessen bricht das Gate mit einer lesbaren Meldung ab.

* **🔴 Branch-Protection auf `main` aktivieren** — ohne sie kann das Gate nur berichten, nicht
  blockieren (3.1). Vorbereitet als `scripts/aktiviere-journey-gate-protection.sh`; ein Befehl,
  reversibel. Nebenwirkung: `main` nimmt danach keine Direct-Pushes mehr an — was Regel 1 ohnehin
  verbietet, bisher aber nur als Konvention.
* **Passwort-Rotation:** Das staging-Basic-Auth-Passwort steht im Klartext in der Git-Historie
  (`tests/e2e/staging-clickthrough.spec.ts:6`) und muss nach dem Umbau gewechselt werden.
* **Benachrichtigungsweg bei Rot:** PR-Kommentar allein, oder zusaetzlich der Team-Kanal (analog
  #5534)? Vorschlag: erst PR-Kommentar, Kanal nachruesten, wenn das Tor sich bewaehrt hat.

## 9 · Nachweis der Kernannahme (23.08., scharf gemessen)

Die Annahme „die Journey-Harness ist gegen staging fahrbar" wurde nicht angenommen, sondern
gegen `app.staging.claimondo.de` gemessen (rein lesend, kein Seed, kein Schreibvorgang):

```
[A] ohne Credentials -> HTTP 401       nginx-Basic-Auth greift
[B] mit Credentials  -> HTTP 200       tests/e2e/lib/ziel.ts liefert korrekte Credentials
[C] nach /admin gelandet auf: /admin   die Login-Session gilt gegen staging
                                       (cookieDomain '.claimondo.de' deckt beide Hosts)
3 passed
```

[C] brauchte fuer die Messung ein temporaeres `ignoreHTTPSErrors` — wegen des abgelaufenen
Zertifikats (§8), **nicht** wegen des Codes. Der Patch wurde zurueckgenommen; er ist nicht
Teil der Aenderung.

Damit ist belegt: nach der Zertifikats-Erneuerung ist das Tor ohne weitere Anpassung fahrbar.

---

*Erhebung + Design: Session 23.08.2026. Zahlen aus nightly-Lauf 32617054709, Deploy-Frequenzen aus
`gh run list` vom 23.08.*
