# Ops-Test-Sanierung + Sweep-Rückstände — Implementierungsplan

**Stand: 13.08.2026, 18:40** · Basis `origin/staging`

> ## 🟢 Der Bau-Teil dieses Plans ist zu ~85 % erledigt
>
> Lanes **A, B, C1, E, F1–F3, G1, G2, G3** sind gebaut und in `staging` gemergt (PRs #5176, #5180, #5187, #5191, #5196, #5200). **Nicht neu bauen** — vor jeder Aufnahme den Marker `COORDINATION-ops-test-lane-a-embed-termin-wahrheit` lesen, er ist die laufende Wahrheit.
>
> **Was wirklich offen ist, steht in „Reststand" weiter unten.** Stand 13.08.: **D3 und F5 sind gebaut** (Datum · Nav-Markierung), **B5 und E3a sind gegenstandslos** (Datenbasis bzw. Befund entfallen). Offen bleiben: Regel-4-Smokes für die deploy-gated PRs · Lane H (Fundament, unberührt) · die Aaron-Entscheide zu **D4** (Voice/AVV), **E3b** (OCR-Einstieg) und **F4** (fahrzeug-zentrierte Navigation).
>
> ⚠️ **Regel-4-Lehre vom 13.08.:** Der Prod-Smoke der eigenen PRs fand **zwei Regressionen, die alle Unit-Tests bestanden hatten** — das Datumsfeld verschluckte „3.4.2026" still, und der Nav-Fix griff nur bei Kunden mit genau EINEM Fall. Gefunden hat sie erst die *untypische* Konfiguration (englisches Browser-Locale, Konto mit 7 Fällen). Beim Smoken bewusst die untypische Variante wählen — die typische deckt man beim Bauen ohnehin ab. Fix: **#5256**.
>
> ⚠️ **Eine Belegstufe der zugrunde liegenden RCA wurde am 12.08. widerlegt** (`last_synced_at` taugt nicht als „zuletzt gesehen"). Die Wurzel RC-1 steht unverändert, der Ersatz-Beleg ist härter. Details im Korrekturkasten der RCA.

**Goal:** Die 26 Befunde des Ops-Tests vom 11.08. entlang ihrer 10 Wurzeln beheben, plus die echten Rückstände aus dem Voll-Sweep desselben Tages.

**Quellen:**
- `docs/2026-08-11-ops-test-rca-embed-bis-claim.md` — RCA (Symptome #1–#26, Wurzeln RC-1…RC-10), inkl. Korrekturkasten
- Marker `COORDINATION-ops-test-lane-a-embed-termin-wahrheit` — **laufender Stand, hat Vorrang vor diesem Plan**
- Marker `HANDOFF-offene-aufgaben-sweep-2026-08-11` — Voll-Sweep (Lanes G/H)

---

## Global Constraints

Aus `AGENTS.md`, nicht verhandelbar:

- **Nie direkt auf `main` pushen.** Feature-Branch `kitta/aar-<nr>-<slug>`, PR gegen `staging`.
- **DDL ausschließlich über `mcp__plugin_supabase_supabase__apply_migration`**, danach `list_migrations` → File exakt nach getrackter Version benennen. `execute_sql` ist READ-only.
- **Regel 4 (#5122):** operatives Soll ZUERST definieren, dann smoken — alles per UI.
- **Kein unbegleiteter Stash am Session-Ende.**
- **7-Punkte-Post-Task-Audit vor jedem Commit**, Audit-Block im Commit-Body. Bei Routen/Layouts/Server-Actions **immer** `npm run build`.
- **Frontend-Umlaute:** echte `ä ö ü ß`.
- **Server-Actions liefern Result-Objects**, kein `throw`; `revalidatePath` nicht vergessen.
- **Komponenten-Set:** `primitives/*` → `shared/*` → `ui/*`. **Token-System:** keine Inline-Hex, keine rohen Status-Scales, `rounded-ios-*`.
- **Prod-Ref `paizkjajbuxxksdoycev`.**

**Gates:** `npm run typecheck && npm test && npm run check:token-audit && npm run check:component-set -- --ratchet`

**Merge:** Die Merge/Drain-Session zieht PRs automatisch, sobald non-draft + grün + mergeable.

**Doku-Disziplin:** Wer einen Plan abschließt, setzt einen `ABGESCHLOSSEN`-Header. Der Sweep fand 3775 offene Checkboxen, ~95 % stale.

---

## ⚠ Koordinationslage (12.08.)

**6 Sessions sitzen auf `kitta/aar-956-embed-reservierung-rueckruf`.** Dort nicht arbeiten. Eigener Worktree:

```bash
node scripts/new-session-worktree.mjs <slug>
cd .claude/worktrees/session-<short>
git fetch origin && git checkout -B <slug> origin/staging
git log -1 --format="%h %ad" --date=short   # muss 2026-08-12 oder neuer sein
```

| Zone | Wer |
|---|---|
| Lane-A-Prod-Smoke (`finder-wunschzeit-anfrage-prod.spec.ts`, #5207) | Session `9f54b5bf` — **nicht übernehmen ohne Abstimmung** |
| Gegner-Pflichtdok (H3-1) | **VERGEBEN** an Session `59cdebcb` |
| `app/flow/[token]/actions.ts` | aar-956-Territorium — betrifft H2 |

⚠️ **Stacked-PR-Falle wurde real getroffen:** Ein Lane-B-Commit hing nach dem #5176-Merge an einem geschlossenen PR. Nach jedem Merge **frisch von `origin/staging` branchen**, nie aus dem alten Branch weiter.

---

# Erledigt — nicht neu bauen

| Lane | Thema | PR | Kern der Lösung |
|---|---|---|---|
| **A** | RC-1 Terminzusage ohne Termin | **#5176** | `wunschzeit-optionen.ts` (`baueWunschzeitOption` + fail-closed `istWunschzeitFrei`); `mitZeiten` → `mitWunschAnfrage` (hängt die **geprüfte** Wunschzeit vor die echten Slots, statt sie zu ersetzen); `matchType: 'wunschtermin_anfrage'`; `bestaetigt: boolean` im Result; WhatsApp folgt dem echten Ausgang |
| **A+** | Arbeitszeit-Nachbesserung | **#5200** | #5176 prüfte nur `v_belegung` — außerhalb der Arbeitszeit gibt es keine Belegung, also galt 08:00/18:00/Samstag weiter als frei. Neue pure `liegtInArbeitszeit()` + `konfigFuerAssignee` wiederverwendet, fail-closed |
| **B** | RC-2/RC-3 ZB1 + vehicles | **#5180** | `Zb1Korrekturen` 4 → 12 Felder; vehicles-Nachzug |
| **C1** | RC-5 Gutachter-Bindung | **#5187** | Die Schuldfrage-Weiche existierte längst (`qualiFlowOutcome`) — was fehlte: der reservierte Termin blieb stehen (Phantom im SV-Kalender). Wird jetzt in **jedem** Zweig ohne SV-Gutachten gelöst |
| **E** | RC-9 KVA bei Haftpflicht | **#5196** | `abrechnungsweg` ist Teil des Gate-Inputs: `haftpflicht` ⇒ Gate offen (Kostenzusage kommt aus dem Gutachten) |
| **F1–F3** | RC-7/RC-10 | **#5191** | F1: kein fehlender Upload, sondern `layout.tsx:46` blendete den Nav-Eintrag aus · F2: `glass-panel` war eine **tote Klasse** (nirgends als CSS-Regel definiert) · F3: `TERMIN_OFFEN` enthielt Warte-Zustände ohne bestätigbaren Zeitpunkt |
| **G1** | main-CI-e2e rot | — | try/catch + `test.skip`; Guard `check-e2e-toplevel-fs.mjs` existiert als Ratchet |
| **G2** | Subphase nach Absage | — | `subphase-resolver.ts:219` filtert jetzt auch `abgesagt`/`abgelehnt` |
| **G3** | tote Spalten | — | in `claim-duplicate-columns.ts` entfernt (Z. 120/276) — **entgegen dem Marker bereits erledigt, am 12.08. gegen staging verifiziert** |

**Drei Befunde trafen eine andere Ursache als in der RCA vermutet** (F1, F2, F3) — die Symptome stimmten, die Diagnose nicht. Wer die verbleibenden Lanes aufnimmt, sollte die vermutete Ursache erneut prüfen statt sie zu übernehmen.

---

# Reststand — hier geht es weiter

## R1 · ~~Drei PRs mergen~~ ✅ erledigt (12.08.)

#5197 (09:55), #5201 (09:46) und #5207 (10:40) sind **alle gemergt**, inkl. der Releases R290/R291/R293. Nichts mehr zu tun.

## R2 · Regel-4-Prod-Smokes — **Solls formuliert, E belegt** (12.08.)

Die vier operativen Solls (Regel 4, Schritt 1) fehlten komplett und stehen jetzt im Marker `COORDINATION-ops-test-regel4-solls-und-verifikation`. Verifikationsstand:

| Lane | Stand |
|---|---|
| **E** (#5196 KVA-Gate) | ✅ **am lebenden System belegt** — alle 7 offenen Haftpflicht-Claims mit Werkstatt waren vorher „ZU — Kostenvoranschlag ausstehend", jetzt OFFEN. UI-Klick steht noch aus |
| **F3** (#5191) | ⚠ **nicht auslösbar** — 0 Termine in allen fünf Warte-Status; Smoke bräuchte einen Seed |
| **C1** (#5187) | ✅ Prävention — 0 disqualifizierte Leads mit aktivem Termin, kein Bestandsschaden |
| **B** (#5180) | 🟡 indirekt — 8/8 konvertierte Leads synchron mit `vehicles`, aber kein Beweis für den Nachzug |

⭐ **Kernbefund:** Von 15 Hängern haben 4 eine Werkstatt — und **alle 4 waren vom KVA-Gate blockiert** (`CLM-2026-00932/-00939/-00977/-00991`, 16–26 Tage still). E ist damit nicht nur ein UI-Blocker-Fix, sondern löst reale Hänger auf.

**Verbleibend:** die UI-Klickwege. Hürden je Lane im Marker.

Pro Lane: **operatives Soll zuerst formulieren**, dann per UI auf prod nachstellen, dann Residue aufräumen.

Bekannte Fallen (`BROADCAST-prod-playwright-smoke-drei-fallen`):
- `getByTestId` greift auf prod ins Leere → über sichtbaren Text selektieren
- Hydration-Race: `count()` direkt nach `goto` liefert 0
- Cleanup gehört in `afterEach`, **nicht** in `try/finally` (Timeout überspringt `finally` → Prod-Residue)

⚠️ **Falle speziell für Finder-Smokes:** Der kanonische Test-SV ist im Embed-Finder **unsichtbar** — `applyDispatchableFilter` filtert `ist_testaccount=false`. Der interne-Tester-Fallback `findeNahenTestSv` rettet das nicht, weil `ladeEmbedMatching` gar keine `kundenIdentitaet` entgegennimmt (die wird erst in Schritt 4 erfasst, das Matching läuft in Schritt 2). ⇒ **Wegwerf-SV** (`seedThrowawayFinderSv`) ist der einzige Weg.

## R3 · Lane-A-Smoke: ein Schritt fehlt

`tests/e2e/flows/finder-wunschzeit-anfrage-prod.spec.ts` (#5207), opt-in `RUN_WUNSCHZEIT_SMOKE=1`. Vier Hürden sind gelöst, eine offen:

🔴 Der Wizard springt nach der Ortsauswahl **automatisch** von Schritt 1 zu Schritt 2 — der `WunschterminPicker` lebt aber in **Schritt 1** (`FinderWizard.tsx:382`). Beim Chip-Klick ist er weg. Zu klären: vor dem Sprung bedienen, oder über „‹ Anderer Ort" zurück.

> Session `9f54b5bf` ist hier dran. Vor Aufnahme abstimmen.

⭐ Nebenbefund, der den Fix stützt: die auf prod angebotenen Zeiten liegen sauber im **40-Minuten-Engine-Raster** (12:20/13:00/13:40/14:20); der alte synthetische Pfad bot volle Stunden. Indiz, **kein** Beweis — der Wunschzeit-Zweig selbst ist noch nicht gefahren.

## R4 · D1 Stufe 2 ✅ erledigt → **PR #5212**

🔴 **Das geplante Ein-Zeilen-Update konnte nie funktionieren.** Der CHECK-Constraint `onboarding_felder_typ_check` kennt nur 17 Typen — **`place` ist keiner davon**. Das vorgesehene `update … set typ='place'` scheitert mit `23514`. #5201 hat den Feldtyp im `FieldRenderer` eingeführt, aber die DB-Seite nie nachgezogen: der neue Feldtyp wäre **dauerhaft unbenutzbar** geblieben.

PR #5212 erweitert den Constraint additiv (17→18) **und** stellt die Zeile um — Reihenfolge zwingend, beides in einer Migration. Getrackte Version `20260812120513`, prod verifiziert (`unfallort` → `typ='place'`). Rollback: `set typ='text'`, Constraint darf bleiben (additiv).

⇒ **D2 (Unfallskizze, #11) ist damit entsperrt**, sobald #5212 deployed ist.

⚠️ **Nebenbefund:** `FieldTyp` kennt auch `'embed-site-create'`, das ebenfalls im DB-Constraint fehlt — also ebenfalls nicht setzbar. Nicht mitgenommen (eigener Scope). Zu prüfen, ob `EmbedSiteCreateField` toter Code ist.

## R5 · Lane H — Fundament (komplett unberührt)

Aus dem Sweep, von der Ops-Test-Sanierung nie angefasst. **Der größte freie Block.**

- **H0 · C4-Formalabschluss + §2/§9-Sync** — größter Hebel, **kein neuer Code**. Die §2-Tabelle in `docs/fundament/FUNDAMENT.md` ist für C2, C3 und C4 stale („Plan done, Code gated"), obwohl C4a–e (#4940, #4977), C2a (#4986/#4992) und C3a/b + Teile c (#5011/#5090/#5095, #5017/#5044/#5059, #5068) gemergt sind. §9 steht real bei 2/9; reines Nachziehen bringt 4–5/9. Für #7 fehlt der DoD-Nachweis (knip/Alt-Code-Check + Journey-Smokes pro Rolle).
- **H2 · C3c SA-Moment 7→3 WhatsApp** — meistzitierter offener Punkt. ⚠ Territorium `app/flow/[token]/actions.ts` · offene Produktentscheidung: welche WA bleibt kanonisch?
- **H3 · C2b create-case-Lücken** — nur 1 von ~15 Meldewegen läuft über `createCase`. Aircall-Dedup (D-4b) und Embed-Finder-Dedup (B-1) frei; Gegner-Pflichtdok **vergeben**.
- **H4 · C1-Rest** — Regel-4-Prod-Smoke-Nachweis · `lexdrive manual_status_override` schreibt kein Event-Log.
- **H5 · Unaufgenommene Handoffs** — Outbox-Retarget-Rest · **#4804 KVA-Pflicht** (⚠ mit E abgleichen: dort ist Haftpflicht jetzt KVA-frei — die Pflicht muss abrechnungsweg-abhängig sein) · Ortseingaben P3/P4 · Partner-Cockpit-System-Events · C5-Folgetranche (`from('claims')` → `v_claim_full`, 17 Stellen).

## R6 · Rest aus den Ops-Test-Lanes

- **D2** Unfallskizze im Kunden-Flow — blockiert bis R4 gelaufen ist
- **E3** „Partnerwerkstatt vermitteln" neu bauen (#23) — braucht Aaron-Entscheid
- **F4** Kunden-Einstieg auf Fahrzeuge (#26) — Produktarbeit, eigener Scope
- **C2-Rest**: #21 ist mit #5176 überwiegend erledigt (der Text hing an `termin === null`); Rest-Fall: Wunschzeit nur angefragt → Text weiterhin irreführend

---

# Nicht gebaut, mit Begründung

- **Kein Schuldfrage-Step im Finder-Wizard** — die Weiche existiert im Flow-Quali. Ein weiterer Funnel-Schritt vor der Terminwahl ist eine Conversion-Entscheidung, kein Bugfix.
- **Ops-Test #20/#22** (Fahrzeugschein doppelt gefragt · „4 Dokumente" trotz Upload) — **nicht reproduzierbar**: alle 6 Pflichtdokumente des Test-Claims stehen auf `hochgeladen`, und der Zähler rechnet nachweislich gegen den Ist-Bestand (`docStatus ?? d.status`). Verdacht Timing, unbelegt. **Braucht Screenshot + Zeitpunkt.**
- **Dead-Pins bekommen keine Wunsch-Anfrage** — unclaimte `sv_leads` haben keinen Kalender, ihre Verfügbarkeit ist nicht prüfbar.

---

# Entscheidungen — ✅ alle acht getroffen (Aaron, 12.08.)

| # | Frage | Entscheidung | → Task |
|---|---|---|---|
| 1 | Hänger-Detektor bauen? | **Ja — Cron + Dispatch-Task** | I1 |
| 2 | 7 Alt-Claims mit divergentem Kennzeichen | **Migration, Lead-Wert gewinnt** | B4 |
| 3 | SA-Moment: 6–7 WhatsApp bündeln | **Drei nach Zweck** (SA · Termin · Dokumente) | H2 |
| 4 | Fahrzeug-zentrierte Navigation | **Gestaffelt** — Sprung sofort, Umstellung eigenes Ticket | F5 + F4 |
| 5 | Spracheingabe Wort-für-Wort | **Streaming-STT** mit AVV | D4 |
| 6 | Datum im US-Format | **Systematisch suchen** (Ursache nicht lokalisiert) | D3 |
| 7 | „Partnerwerkstatt vermitteln" | **Erst der Bug, OCR als eigenes Ticket** | E3a + E3b |
| 8 | ZB1-Parser-Härtung | **Testkorpus aus prod-Uploads** (anonymisiert) | B5 |

**Zu #2 — abweichend von meiner Empfehlung, bewusst so entschieden.** Ich hatte Einzelprüfung empfohlen, weil bei bereits unterschriebener SA das Papier den alten Wert trägt und eine stille DB-Änderung Dokument und Datensatz auseinanderlaufen lässt. Aaron hat die Migration gewählt. Umsetzung daher **mit** zwei Sicherungen, die die Entscheidung nicht aufweichen: (a) Vorher-Werte im Migrations-Kommentar + Backup-Tabelle festhalten, damit der Schritt reversibel bleibt; (b) vor dem Lauf erheben, **welche** der 7 Fälle eine unterschriebene SA oder ein versandtes Gutachten haben — das Ergebnis wird berichtet, nicht zur Blockade gemacht.

**Zu #5 — Beschaffung nötig.** Streaming-STT braucht Anbieterwahl + AVV (Deepgram/AssemblyAI/OpenAI Realtime). Vor dem Bau prüfen, was `src/lib/ai/models.ts` bereits an Infrastruktur bietet (Redundanz-Check), dann Anbieter vorschlagen.

---

# Nachträge — die acht abgeleiteten Arbeitspakete

### B4 · ~~Kennzeichen-Migration für 7 Alt-Claims~~ ❌ **GEGENSTANDSLOS** (Erhebung 12.08.)

Die Erhebung vor dem Bau hat die Prämisse widerlegt. Aufschlüsselung der 16 Claims mit `vehicle_id`:

| Konstellation | n |
|---|---|
| `leads.kennzeichen` **NULL**, `vehicles.kennzeichen_aktuell` gesetzt | **7** ← die vermeintlich „Divergenten" |
| Lead gesetzt, vehicle NULL | 0 |
| beide NULL | 1 |
| **beide gesetzt** | **8 — restlos identisch, auch normalisiert** |

**Kein einziger** Fall hat zwei verschiedene nicht-NULL-Kennzeichen. Die Fehlzählung entstand durch einen Vergleich, der NULL als Abweichung wertet (`null !== 'K-AB-123'`). Bestätigend: bei allen 7 ist `zb1_status` NULL (nie ein Fahrzeugschein hochgeladen), die Werte sind Testdaten (`SMOKE-J2 001`, 4× `K-AB-123`).

🔴 **Die beschlossene Migration wäre schädlich gewesen:** „Lead-Wert gewinnt" hätte `vehicles.kennzeichen_aktuell` auf NULL gesetzt und diesen 7 Claims ihr einziges Kennzeichen genommen. **Nicht ausgeführt.**

**Lehre:** Bei Drift-Messungen zwischen zwei Quellen NULL immer separat ausweisen — „A ≠ B" und „A fehlt" sind verschiedene Befunde mit gegensätzlicher Behandlung. Der Fix aus #5180 (`ziehVehicleNach`) bleibt richtig; er verhindert künftige echte Drift.

### B5 · ZB1-Testkorpus aus prod-Uploads — ❌ **NICHT BAUBAR** (Erhebung 13.08.)

Der Korpus sollte aus vorhandenen Storage-Uploads entstehen. Von **233** ZB1-Dateien im Bucket sind **231 Smoke-Dummies** (70–200 Byte); es bleiben **2** echte Scans, und genau **1** Lead trägt einen `raw_text`. Aarons Entscheid „Korpus aus prod-Uploads, anonymisiert" hatte damit keine Datenbasis.

**Ersatz:** Die Parser-Härtung lief gegen den einen vorhandenen Rohtext (den amtlichen **Muster**-Schein, keine Kundendaten) → **PR #5243**. Ein echter Korpus braucht erst echte Uploads.
*Rest-Akzeptanz:* Regel-4-Smoke für #5243 steht aus.

### D3 · Datum im US-Format — ✅ **ERLEDIGT (13.08.)**, PRs #5242 · #5254 · #5256

Native `<input type="date">` rendern **immer** im Browser-/OS-Locale (deutscher Browser `13.08.2026`, englischer `08/13/2026`) — per HTML/CSS nicht erzwingbar. Der Ops-Test lief auf einem Gerät mit englischem Locale.

> ⚠ **Korrektur der Erhebung vom 13.08.:** Der früher hier stehende Satz *„betrifft aktuell **keine** [kundensichtbare Stelle], da alle 23 intern sind"* war **falsch**. `kunde/schaden-melden/SchadenMeldenWizard.tsx` ist kundensichtbar und trug ein `type="date"`. Die Zählung hatte die Kunden-Oberflächen übersehen — genau darauf war die Empfehlung „nichts tun" gestützt.

**Gebaut statt entschieden** (Option 2, auf Erfassungsfelder begrenzt):

| PR | Umfang |
|---|---|
| **#5242** | `DatumFeld` + `lib/format/datum-de` (Kunde: Schaden melden) |
| **#5254** | `DatumInput` für interne Erfassungsfelder (Dispatch-Phase-1, `InlineEditField`, `VsKorrespondenzCard`) |
| **#5256** | Regressions-Fix: der Formatierer zerstörte „3.4.2026" zu „34.20.26" → Datum ging **still** verloren (Prod-Smoke-Fund, betraf beide Komponenten) |

**Bewusste Grenze — kein offener Rest:** Die **Termin-Wahl**-Felder (Spontantermin, Verfügbarkeit, Nachbesichtigungs-Picker, alle `datetime-local`) behalten das native Feld; dort ist der Kalender ein Vorteil, weil ein Datum in der ZUKUNFT gewählt statt erinnert wird. Ein „noch nicht migriert"-Fund dort ist **kein Befund**.

⚠ **Offen (Aufräumen, kein Bug):** `DatumFeld` (#5242) und `DatumInput` (#5254) lösen dieselbe Aufgabe mit derselben Kernlogik, je 4 Consumer — gehören zusammengeführt.

### D4 · Streaming-STT statt Batch-Transkription (P2, Beschaffung nötig)
Voice ist im Flow eingebunden (`voiceDictation` am Unfallhergang), aber Batch: aufnehmen → stoppen → Whisper → Text am Stück. Wort-für-Wort ist so ausgeschlossen. Web Speech API wurde verworfen (Chrome schickt das Audio an Google — bei Unfall- und Personendaten datenschutzrechtlich zu prüfen).
*Akzeptanz:* Text erscheint während des Sprechens; AVV liegt vor.

### E3a · „Partnerwerkstatt vermitteln" — ❌ **GEGENSTANDSLOS** (Bestandsaufnahme 13.08.)

Die vom RCA geforderte eigene Bestandsaufnahme des Werkstatt-Pfads ist gelaufen. **Alle drei Teilbehauptungen von #23 halten nicht.**

Einstieg ist `gutachter/auftraege/PartnerWerkstattVermittelnButton.tsx` → `_actions/vermittle-partner-werkstatt.ts` (P4/Netzwerk, SV-Selbstanlage). Auf prod existiert genau **ein** Vermittlungsvorgang (`source_channel='gutachter-vermittlung'`):

| Behauptung #23 | Befund |
|---|---|
| „legt keinen Auftrag an" | ❌ **falsch** — `CLM-2026-03529` wurde angelegt (Lead → `convertLeadToClaim` → Claim + FlowLink, `vermittle-partner-werkstatt.ts:83–161`) |
| „schickt den Kunden in eine Unterschrift" | ❌ **designtes Verhalten** — PR #4922 hat die Vermittlungs-Sequenz bewusst auf `zusammenfassung/quali/feststellung/sa/account` verkürzt (der Kunde bringt ein fertiges Gutachten mit, braucht also keine Termin-/Logistik-Steps). Die SA ist bei Haftpflicht die **Abtretung** — sie gehört genau dorthin. |
| „statt in die Werkstattauswahl" | ❌ **fachlich korrekt so** — siehe unten |

**Warum keine Werkstattwahl erscheint:** Der Claim trägt `abrechnungsweg='haftpflicht'`. `reparaturPhaseErreicht()` (`lib/werkstatt/reparatur-phase-erreicht.ts`) gibt dort erst `true` zurück, **wenn das Gutachten abgeschlossen und kein Totalschaden ist** — bei Selbstzahler/Kasko dagegen sofort. Der Claim steht auf `filmcheck`, das Gutachten ist also noch in der QC. Man repariert nicht, bevor der Schaden abgenommen ist.

Der Kunde sieht in diesem Zustand **nicht** nichts, sondern den Stepper auf `Begutachtung` mit dem Untertitel **„Gutachten wird geprüft"** (`phasen.subKunde.filmcheck`). Die Werkstattzone bleibt konsistent leer — und der Haftpflicht-Stepper (`ClaimStepper`) hat gar keine Werkstatt-Stufe, die eine Erwartung wecken würde. (Der R3-„Blind-Window"-Kommentar in `GeldZone.tsx` zielt auf den **Selbstzahler**-Stepper, der eine hat.)

**Auch der scheinbare Rest löst sich auf:** Der Claim steht seit 09.08. im `filmcheck`, gehört aber `nicolas.kitta@claimondo.de` — er ist der **Testvorgang aus dem Ops-Test selbst**, kein wartender Kunde. Es gibt auf prod keinen einzigen echten Vermittlungsfall. (Sollte die QC künftig real liegenbleiben, fängt das der Hänger-Detektor #5223 + VPS-Cron #5241.)

⚠ Nebenbefund: Dieser Test-Lead trägt eine **echte Telefonnummer** (`telefon` nicht NULL) — bei künftigen Tests des Vermittlungspfads gilt Regel 4 (Test-Konten mit `telefon = NULL`), sonst gehen echte Comms raus.

**Der Sollzustand aus dem Test** („oben OCR für Gutachten *und* SV-Rechnung, daraus Claim per Klick") ist **E3b** — ein Feature-Wunsch, kein Fix.

### E3b · OCR-Einstieg für Gutachten + SV-Rechnung (P3, Feature)
Im Vermittlungs-Einstieg Gutachten **und** SV-Rechnung per OCR auslesen, Claim per Klick anlegen.

**✅ Aaron-Entscheid 13.08.: bauen.** Erhebung dazu (13.08.) — der Bau ist damit vorbereitet:

**Ist-Zustand:** Das Modal `gutachter/auftraege/PartnerWerkstattVermittelnButton.tsx` lässt den SV **11 Felder von Hand tippen** (Vor-/Nachname, Telefon, E-Mail, Kennzeichen, Unfallort, Hersteller, Modell, Hergang, Schadenshöhe netto) — und lädt daneben bereits das **Gutachten als PDF** hoch. Genau diese Felder stehen im PDF.

**Was schon existiert:** `POST /api/ocr-gutachten` sowie `lib/ai/gutachten-ocr.ts` mit Zod-Schema und LLM-Prompt, die u.a. `kennzeichen`, `schadenhoehe_netto` und `wiederbeschaffungswert` liefern.

**Warum es trotzdem nicht einfach verdrahtbar ist — die eigentliche Arbeit:** Beide Pfade sind **claim-gebunden**. Der Endpoint lehnt ohne `fall_id` mit 400 ab, und das Modul exportiert genau **eine** Funktion: `extractGutachtenAndSaveToClaim` — Extraktion und DB-Write sind gekoppelt. Im Vermittlungs-Formular existiert der Claim aber noch **nicht** (er soll ja erst daraus entstehen).

**Bauplan (drei Schritte, in dieser Reihenfolge):**
1. **Extraktion herauslösen:** eine pure `extractGutachtenFelder(pdfText)` aus `extractGutachtenAndSaveToClaim` schneiden; die bestehende Funktion ruft sie danach auf (kein Verhaltenswechsel, unit-testbar).
2. **Claim-freier Endpoint** (`extract`-Modus ohne `fall_id`) — gibt die Felder nur zurück, schreibt nichts.
3. **UI:** Nach Dateiwahl im Modal OCR anstoßen und die Felder **vorbefüllen statt setzen** — der SV muss jeden Wert sehen und korrigieren können (der ZB1-Parser hat gezeigt, wohin ungeprüft übernommene OCR-Werte führen: Formular-Labels als Adresse, siehe B5/#5243).

⚠ **SV-Rechnung:** Für sie gibt es noch **keinen** Extraktor — `ocr-gutachten` deckt nur das Gutachten ab. Das ist der zweite, eigenständige Teil des Wunsches.

### F5 · Nav-Sprung „Mein Fall" → „Fahrzeuge" — ✅ **ERLEDIGT (13.08.)**, PRs #5227 · #5256

Regel + Tests in `kunde/_components/nav-aktiv.ts`; genau ein Eintrag ist aktiv, auf der kanonischen Claim-Route gewinnt das Fall-Item.

⚠ **#5227 allein reichte nicht:** Der Fall-Href kam als `singleFallId ? … : null`. Bei einem Kunden mit **mehreren** Fällen war er `null`, die Regel griff nicht, und „Fahrzeuge" blieb markiert — der Befund bestand für diese Kunden fort (Prod-verifiziert an einem Konto mit 7 Fällen). **#5256** schließt das über `fallItemHref()` als eine Quelle.

### F4 · Fahrzeug-zentrierter Einstieg (P3, Produktarbeit — eigenes Ticket)
Fahrzeuge werden Einstieg (Liste + Detail), Claim von dort erreichbar. Betrifft Navigation und Routenstruktur, braucht eigene Smokes. **Nicht** im Bugfix-Strom.

### I1 · Hänger-Detektor ✅ gebaut → **PR #5223**

Zwei Funde, die den Bau verändert haben:

**„Rückfall ist keine Bewegung".** Die naive Definition („wann gab es zuletzt irgendeine Transition?") hätte den **Anlassfall verfehlt**: `CLM-2026-01011` hatte am 08.08. einen Übergang `ersterfassung → sv-zugewiesen`, steht aber wieder auf `ersterfassung` (`sv_id` NULL) — jüngste Transition 4 Tage alt, tatsächlicher Stillstand 14 Tage. Der Detektor misst deshalb *seit wann steht der Fall im **aktuellen** Status* (`ermittleImStatusSeit`). Messung gegen prod: naiv 14 Hänger, korrekt **15** — der Unterschied ist exakt der Auslöserfall, ohne False Positive.

**`prioritaet: 'hoch'` hätte den Cron still ausgehebelt.** `tasks_prioritaet_check` erlaubt nur `['normal','dringend','kritisch']`; der Wert wäre vom CHECK verworfen worden → `ok` gemeldet, **0 Tasks** angelegt. Jetzt `'dringend'`, `check:flag-drift` 0 Verletzer.

Dedup über `task_code` + Deckel `MAX_TASKS_PRO_LAUF=25` (loggt, wenn er greift) + Test-Account-Filter (`istTestPartner` wiederverwendet). 27 Tests, Build grün.

⚠️ **Offen (Aaron):** Der Cron braucht einen VPS-Crontab-Eintrag — `30 6 * * * /usr/local/bin/cron-call.sh /api/cron/haenger-detektor` (VPS läuft auf UTC = 08:30 MESZ). Bewusst **nicht** in `docs/vps-crontab.md` eingetragen, weil die Datei den Ist-Stand des VPS abbildet.

<details><summary>ursprüngliche Aufgabenbeschreibung</summary>
Kein Automatismus meldet steckengebliebene Fälle — `CLM-2026-01011` hing 13 Tage unbemerkt ohne Termin, und RC-1 hat solche Fälle systematisch erzeugt. Lane A schließt die Quelle, der Detektor fängt, was trotzdem durchrutscht.
**Vorgehen:** Täglicher Cron findet Claims ohne Fortschritt (Vorschlag: >5 Tage ohne Termin **oder** ohne Statuswechsel — Schwelle abstimmen) und legt einen Dispatch-Task an. Bestehende Muster wiederverwenden (`src/app/api/cron/*`, `lib/tasks`).
⚠ **Erst Bestand sichten:** `sla-check` und `task-eskalation` existieren bereits — prüfen, ob sie das teilweise schon leisten, bevor etwas Neues entsteht.
*Akzeptanz:* Ein künstlich stehengelassener Fall erzeugt binnen 24 h genau einen Task (Dedup-Key, keine Duplikate bei wiederholtem Lauf).
</details>

---

# Anhang — Aaron-only (nicht Bau-Scope)

**Operativ dringend:** 2 echte SV-Registrierungen nie freigeschaltet (`ing-hagag` seit **24.06.**, `sv-muensterland` seit 21.07.) · Kundenfall `CLM-2026-01011` hängt seit 13 Tagen ohne Termin.

**Blocker/Zugänge:** Auth-Mails über Supabase-Built-in-SMTP (Rate-Limit ~2–4/h, kein Branding) · Cardentity-API tot (401) · Stripe `sk_live` + VPS-root-Passwort standen im Klartext im Chat, Rotation unbestätigt · Steuernummer/USt-IdNr „beantragt" → B2B-Rechnungen formal nicht voll §14-konform.

**Entscheidungen:** Eniola-Go fehlt (4.000 € netto) · **PR #5058 seit 08.08. CONFLICTING** — rebasen oder schließen · Werkstatt-Self-Signup schreibt Firmenname in `profiles.vorname`.

**Braucht physisches Gerät:** 3 Regel-4-Smokes (HEIC iPhone, mobile Zustandsdoku, NFC Android) · NFC-Karten: 0 von 20 haben je eine UID · Telefon-Verify-Livetest · erster echter 29,99-€-Abo-Kauf.

---

# Empfohlene Reihenfolge

~~R1~~ ✅ · ~~R4~~ ✅ (#5212) · ~~H0~~ ✅ (§2 nachgezogen, §9 bei 6/9, #5184)
~~**B4**~~ ❌ **gegenstandslos** — die Prämisse ist widerlegt, die Migration wäre schädlich gewesen (Details oben bei B4). **Nicht bauen.**
~~**R2**~~ ✅ — alle vier Lane-Smokes (E · F3 · B · C1) gebaut und **gegen prod grün** (#5237).
~~**I1**~~ ✅ **Code** (#5223) — ⚠ der Cron braucht noch den VPS-Crontab-Eintrag, sonst läuft er nie (liegt bei der `ops-vps-crontab-nachzug`-Session).

~~**F5**~~ ✅ **gebaut** — `_components/nav-aktiv.ts` + Unit-Tests; der Kommentar dort nennt den Auslöser („Ops-Test #26"). Genau ein Nav-Eintrag ist aktiv, auch unter `/kunde/fahrzeuge/[vehId]/schaden/[claimId]`.
~~**F4**~~ ✅ **gebaut** — der fahrzeug-zentrierte Einstieg steht: `/kunde/fahrzeuge` (Liste), `/[id]` (Detail), `/[id]/schaden/[claimId]` (Claim von dort). Damit erklärt sich auch der Titel von F5.
~~**D3**~~ ✅ **diagnostiziert** — Ursache sind native `<input type="date">` + Browser-Locale, kein Code-Defekt (Details oben). Nur noch Aaron-Entscheid.

**Jetzt offen, in dieser Reihenfolge:**

1. ~~**B5**~~ ✅ **Parser gehärtet → PR #5243** (13.08.). Eine Wurzel für alle Fehler: die Label-Anker verlangten die Zeile *exakt* als Feldcode, echtes OCR legt die Beschriftung daneben. **Vierter, vorher unbekannter Fehler:** `kennzeichen` war `Q-F 2` statt `XX Z123` — genau der Wert, den `ziehVehicleNach` ins Claim-Fahrzeug zieht. ⚠ Der **Testkorpus ist nicht baubar** (231 der 233 Bucket-Dateien sind Smoke-Dummies, 1 echter `raw_text`); die FIN war **kein** Fehler (18 statt 17 Zeichen → korrekt abgelehnt). **Regel-4-Smoke steht aus.**
2. ~~**E3a**~~ ❌ **gegenstandslos** (Bestandsaufnahme 13.08., Details oben) — der Claim wird angelegt, die Unterschrift ist designt, und die Werkstattwahl kommt bei Haftpflicht fachlich erst nach der Gutachten-Freigabe. **Nichts zu bauen.**
3. **§9-Reste** — #5 (~13 Intake-Writer außerhalb `createCase`) · #6 (Outbox-Dedup) · ~~#7~~ ✅ **erledigt (14.08.)**: alle sechs Rollen-Detailsichten hängen am Kern, Makler via **#5277**, Flotte via **#5283** — siehe `FUNDAMENT.md:77`. Die hier notierte Rest-Position „Kunde" existierte nie (`/kunde/faelle/[id]` rendert längst `<KundeClaimView>`). **Von den drei Posten sind damit nur #5 und #6 offen — und beide sind nicht frei baubar** (#5 braucht je Entry-Point eine fachliche Entscheidung, #6 zeigt sich erst unter Traffic).
4. **D2** — Unfallskizze: im Kunden-Flow bisher **nur als Ankündigungstext** vorhanden („Daraus erstellen wir die präzise Unfallskizze" in `feststellung-steps.ts`), das Feature selbst liegt in Dispatch. Scope vor dem Bau klären.
5. **D4** (nach Anbieterwahl) · **E3b** — Beschaffung bzw. eigenes Produkt-Ticket.

**H2** (SA-WhatsApp 7→3) — ❌ **GEGENSTANDSLOS, belegt (13.08.).** Die Zahl „6–7 Kunden-WhatsApps" hielt der Nachprüfung nicht stand. Gemessen über die Historie von `signSAandCreateFall` (Funktionsgrenze je Stand einzeln bestimmt, nicht mit fester Zeilennummer): **18.07. · 27.07. · 08.08. · 13.08. — jedes Mal 6 Sends gesamt, davon konstant 3 an den KUNDEN.** Die übrigen adressieren SV und Team. Es gab also nie 7 Kunden-Sends und folglich auch keine Konsolidierung — im Git-Log existiert kein entsprechender Commit. Die „6–7" war die **Gesamtzahl** aller Sends, gelesen als Kunden-Zahl. **Nichts zu bauen; `flow/[token]/actions.ts` bleibt unberührt.**

> ⚠ **Diese Liste war bis 13.08. eine Falle:** Sie führte B4 als Priorität 1 mit der Begründung „falsche Kennzeichen wandern sonst in Gutachten und Abrechnung" — obwohl der Detail-Abschnitt B4 weiter oben die Prämisse längst widerlegt hatte. Wer die Reihenfolge liest statt den Abschnitt, hätte die schädliche Migration gebaut.
>
> **Zwei Lehren:**
> 1. Eine Widerlegung muss an **jeder** Stelle nachgezogen werden, an der die Aufgabe auftaucht — Detailabschnitt UND Reihenfolge UND Marker.
> 2. **Vor dem Bau gegen `origin/staging` prüfen, nicht gegen den lokalen Checkout.** Beim Nachziehen am 13.08. stellte sich heraus: F5, F4 und D3 waren längst erledigt — der Haupt-Checkout hing so weit zurück, dass `KundeNav.tsx` dort 75, die Fall-Detailseite 973 Zeilen anders aussah als auf `staging`. Wer den lokalen Stand liest, baut Erledigtes nach.

---

# Lehren aus dieser Sanierung

Vier Dinge, die beim nächsten Audit Zeit sparen:

1. **`last_synced_at` in `sv_kalender_events_cache` wird nur beim INSERT gesetzt** — `diffAndApply` aktualisiert bestehende Zeilen nicht. Taugt nicht als „zuletzt gesehen". Vom heutigen Datenstand nicht auf den Zustand von vor Tagen schließen.
2. **`sv_kalender_events_cache.sv_id` ist bei allen 126 prod-Zeilen NULL** — der CalDAV-Sync füllt nur `profile_id`, der `v_belegung`-Join läuft über den Fallback. Wer über `sv_id` seedet, seedet ins Leere.
3. **Ein Muster schlägt einen Einzelfall.** Der widerlegte Cache-Beleg wurde durch eine Messung über 41 Termine ersetzt — die trug, weil sie nicht von einem rekonstruierten Zeitpunkt abhing.
4. **Symptom ≠ Diagnose.** Bei F1, F2, F3 und C1 lag die Ursache jeweils woanders als vermutet (Nav-Ausblendung statt fehlendem Upload; tote CSS-Klasse; Warte-Zustände ohne Zeitpunkt; Phantom-Termin statt fehlender Weiche). Vermutete Ursachen aus diesem Plan vor der Umsetzung erneut prüfen.

---

# Abgleich RCA-Maßnahmen ↔ diesem Plan (13.08.)

Die RCA schließt mit **21 nummerierten Maßnahmen** (P0 1–4 · P1 5–9 · P2 10–17 · P3 18–21). Dieser Plan hat sie in Lanes übersetzt — **vier sind dabei nie zu einem Task geworden**. Nicht falsch bearbeitet: schlicht nie aufgenommen. Der Abgleich schließt diese Lücke.

| RCA | Maßnahme | Stand (13.08. verifiziert) |
|---|---|---|
| 1–4 | P0 Terminzusage | ✅ Lane A (#5176/#5200/#5207), Regel-4 grün |
| 5–6 | vehicles-Rücksync · ZB1 15 Felder | ✅ #5180 |
| **7** | „Klären, warum das OCR nichts geschrieben hat" | ✅ **beantwortet** — der Parser las Formular-**Labels** als Werte, weil alle Anker die Zeile *exakt* als Feldcode verlangten (#5243) |
| **8** | Schuldfrage-Weiche in den Finder | ⏸️ bewusst nicht gebaut (Conversion-Entscheidung, s. „Nicht gebaut") |
| **9** | Onboarding-Vorlauf „was ist schon da" | 🔴 **nie aufgenommen, nicht umgesetzt** (0 Treffer in `kunde/onboarding`) |
| 10–12 | Unfallort · Unfallskizze · Datumsfelder | ✅ Ortseingaben-Marker · #5249 · #5242/#5254 |
| 13 | Live-Transkript | ⏸️ D4 — braucht Anbieter + AVV |
| **14** | Werkstatt-Pfad kartieren | ✅ **erledigt** — die Bestandsaufnahme ist gelaufen (#5247), sie widerlegte #23 |
| **15** | Werkstatt als Claim-Beteiligte | ✅ **vollständig erledigt** (13.08. verifiziert) — (a) **Verknüpfung**: 12 der 75 Claims tragen `reparatur_werkstatt_id`, 8 zusätzlich `werkstatt_id` (dort *steht* das Fahrzeug), und **0 Claims haben einen Reparaturtermin ohne Werkstatt**. (b) **Werkstatt + Termin im Claim**: `GeldZone` rendert `WerkstattCard` samt `reparaturTermin`. (c) **Gutachtertermin in der Werkstatt-Sicht**: `v_werkstatt_auftrag` liefert `besichtigung_start`/`_ort`/`_status` + `gutachter_firmenname`, und `WerkstattAuftragDetail.tsx:410-430` zeigt sie an. Der RCA-Satz „mangels Verknüpfung gibt es nichts anzuzeigen" trifft an keiner der drei Stellen mehr zu |
| 16 | KVA-Blocker Haftpflicht | ✅ #5196, am Bestand belegt (4 Hänger gelöst) |
| **17** | „Partnerwerkstatt vermitteln" neu bauen | ❌ **gegenstandslos** (#5247) — Claim WIRD angelegt, die „Unterschrift" ist die per #4922 designte SA-Sequenz, die Werkstattwahl kommt bei Haftpflicht fachlich erst nach Gutachten-Freigabe. Der OCR-Teil bleibt als **E3b** ein Feature-Wunsch |
| **18** | SA-Upload in `gutachter/einstellungen` | ✅ **gebaut → #5268** — ⚠ die Prämisse stimmte nicht: Der Upload existiert **längst** auf `/gutachter/verifizierung` (Slot `sv_sicherungsabtretung`), und die Slots rendern **unabhängig vom Verifizierungsstatus**. Es fehlte allein der **Weg** dorthin: `gutachter/layout.tsx` blendet den Nav-Eintrag aus, sobald `verifizierung_status='geprueft'` ist (der Kommentar dort: „blieb erreichbar, war aber unauffindbar"). Ein fertig verifizierter SV fand seine Dokumente nie wieder. Fix = dauerhafter Einstieg „Dokumente & Nachweise" in den Einstellungen, **kein zweiter Upload** (Freigabe-Logik bleibt an einer Stelle) |
| **19** | Chat-Hintergrund `KundeKbChat` | 🟡 **nie aufgenommen, nicht bewertbar** — die Komponente nutzt eine bewusste Glass-Optik (`bg-transparent` + `bg-white/75 backdrop-blur-xl`). Ob das gemeldete Problem noch besteht, ist ohne Screenshot nicht entscheidbar (gleiche Lage wie bei D3) |
| 20–21 | Fahrzeug-Einstieg · Termin-Aufgabe | ✅ F4 (`/kunde/fahrzeuge`) · F3 (#5191) |

**Was daraus offen bleibt:** ~~#18~~ ✅ gebaut (#5268) · **#9** (Scope unklar formuliert, braucht eine Klärung, was „was ist schon da" zeigen soll) · **#19** (braucht einen Screenshot) 

**Lehre für den nächsten Plan:** Wer eine RCA in Lanes übersetzt, sollte am Ende **rückwärts** abgleichen — Maßnahme für Maßnahme gegen den Plan. Vier von 21 sind hier lautlos herausgefallen, darunter mit #18 ein echter Nutzer-Gap. Aufgefallen ist es erst, als der Plan fast leer war und jemand fragte, ob der Ops-Test wirklich abgearbeitet ist.

> ⚠️ **Messfalle beim Verifizieren von #15c:** `v_werkstatt_auftrag` liefert über den Supabase-MCP **0 Zeilen** — die View ist self-scoped über `auth.uid()`, und `execute_sql` läuft als `postgres`. Das ist **kein** Befund, sondern dieselbe Falle wie bei den `v_claim_*`-Views ([[broadcast-v-claim-views-liefern-null-rows]]). Wer daraus „die Werkstatt sieht nichts" schließt, meldet einen Bug, den es nicht gibt. Für self-scoped Views zählt der Code-Pfad (View-Spalten + rendernde Komponente), nicht die MCP-Zeilenzahl.
