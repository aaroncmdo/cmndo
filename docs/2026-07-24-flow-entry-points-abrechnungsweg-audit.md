# Entry-Point-Audit: Abrechnungsweg-Routing in den /flow

**Datum:** 2026-07-24
**Kontext:** Aaron 24.07. — „aus dem Gutachter-Finder muss ich immer in den Haftpflicht-Flow, und aus dem Werkstatt-Finder muss ich ggf. auch Kasko/Selbstzahler auswaehlen. Lass uns alle Entry-Points durchgehen."
**Ziel:** Jeden Eingang in den `/flow` (bzw. die Schadenerfassung) auflisten und pruefen, ob der Kunde zum richtigen Abrechnungsweg (Haftpflicht / Kasko / Selbstzahler) geroutet wird — oder ob ein Funnel blind eine Annahme trifft.

---

## 1. Kern-Mechanismus (verifiziert)

Der `/flow` ist **DB-getrieben** (`flow_szenarien` + `flow_szenario_steps`). Welches Szenario greift, entscheidet `matcheSzenario` rein ueber `schuldfrage` + `eigene_versicherung` + `service_typ` (NULL = Wildcard, hoechste Prioritaet gewinnt):

| Szenario | schuldfrage | eigene_versicherung | prio | Steps (gekuerzt) |
|---|---|---|---|---|
| `haftpflicht` | `gegner` | * | 10 | feststellung → **ort_besichtigung → termin → gutachter** → ort_fahrzeug → werkstatt → sa |
| `kasko` | `eigenverantwortung` | `ja` | 10 | feststellung → werkstattbindung_check → ort_fahrzeug → werkstatt |
| `selbstzahler` | `eigenverantwortung` | `nein` | 10 | feststellung → ort_fahrzeug → werkstatt |
| `teilschuld` | `unklar` | * | 10 | → rueckruf |
| `unqualifiziert` | **`null`** | null | **0** | zusammenfassung → **quali** `[quali_offen]` |

**Konsequenz:** Ein Lead mit `schuldfrage=null` matcht **nur** `unqualifiziert` → der **Quali-Step fragt den Abrechnungsweg** und routet dann. `quali_offen = schuldfrage===null || (eigenverantwortung && eigene_versicherung===null)`.

Das ist **korrekt und bewusst so gebaut** (Aaron 14.07., Kommentar in `flow/[token]/page.tsx:315-321`):
> „Vorher fragte needsBooking nie nach dem Abrechnungsweg; Kasko/Selbstzahler fielen nur zufaellig heraus … ein Kasko-Kunde sah den Gutachter-Finder ('loses Ende'). Jetzt: steht 'termin' in der Step-Sequenz, braucht der Kunde einen Gutachter — sonst nicht."

Gegatet an `CANONICAL_FLOWLINK_ENABLED === 'true'` — **live** (empirisch belegt: reale `werkstatt_finder`- und `self_service`-Leads mit `eigenverantwortung`+`ja/nein`).

**→ Der /flow-Motor routet richtig. Die Frage ist, ob die Funnels DAVOR den Kunden schon vorab festlegen.**

---

## 2. Entry-Point-Matrix

Empirie: Verteilung `source_channel` × Szenario-Felder aus `leads` (letzte 60 Tage) + Code-Trace je Funnel.

| # | Entry-Funnel | `source_channel` | Setzt vorab | /flow-Szenario | Kunde waehlt Abrechnungsweg? | Status |
|---|---|---|---|---|---|---|
| 1 | **Gutachter-Finder** (`/gutachter-finden`, embed) | `self_service` | SV-Wahl + Termin + **SA/Vollmacht signiert**; **kein** schuldfrage | `unqualifiziert` → quali | Quali fragt — aber SV+Vollmacht (Haftpflicht) schon committet | **Bewusst Haftpflicht-only** (Aaron 24.07.) |
| 2 | **Werkstatt-Finder** (embed, `/werkstatt`) | `werkstatt_finder` | Werkstatt-Wahl + `reparaturwunsch='reparatur'`; **kein** schuldfrage/eigene_versicherung | `unqualifiziert` → quali | Quali fragt schuldfrage — aber der **Repair-Weg (Kasko vs. Selbstzahler) wird im Finder nie gefragt** | **GAP → FIX** |
| 3 | **Schadenkarte** (NFC/QR, `/schaden/[token]`) | `schaden-karte` | **`schuldfrage='gegner'`** (Gegner hat Karte getappt = Gegner verursacht) | `haftpflicht` direkt | Nein (per Definition Haftpflicht) | OK by design |
| 4 | **FM-Schaden** (Flotte „Schaden melden", #4748) | `flotte-manuell` | bar — **kein** schuldfrage (Lead-first) | `unqualifiziert` → quali | Quali fragt | OK |
| 5 | **Makler-Anfrage** (`makler/erstelle-anfrage`) | `makler-anfrage-flowlink` | **optional** schuldfrage + eigene_versicherung (Makler qualifiziert vor); `service_typ='komplett'` | direkt ODER quali | Makler fragt ODER Quali fragt | OK |
| 6 | **Mini-Wizard** (Marketing-Funnel) | `mini_wizard` | schuldfrage (Wizard fragt selbst) | matcht direkt | Wizard fragt | OK |
| 7 | **Anspruch-Check** (`claimondo-check`) | `claimondo-check` | Fotos/Schaetzung — **kein** schuldfrage | `unqualifiziert` → quali | Quali fragt | OK |
| 8 | **Dispatcher** (intern, `/dispatch/leads`) | (div.) | Dispatcher qualifiziert in der Lead-Akte | je nach Eingabe | Dispatcher setzt / Quali fragt | OK (intern) |

---

## 2b. Marketing / claimondo.de / Extern (separater Build `claimondo-marketing/` + public APIs)

Diese Funnels liegen **nicht** in der App, sondern auf der Marketingseite bzw. sind offene APIs — sie erzeugen leads/gfa und haenden an denselben `/flow`.

| # | Funnel | `source_channel` / source | Setzt vorab | Weg zum /flow | Abrechnungsweg-Wahl? | Status |
|---|---|---|---|---|---|---|
| M1 | **Mini-Wizard** (`claimondo.de/schaden-melden`) | `mini_wizard` | fragt `schuldfrage` (gegner/unklar/eigenverantwortung); **`eigenverantwortung` → DISQUALIFIZIERT** (→ `/schaden-melden/selbstverschulden`). **KEIN** `eigene_versicherung` | Magic-Link → /flow (nur gegner/unklar) | **Nein** — Eigenverschulden fliegt komplett raus | **GAP F4** |
| M2 | **Gutachter-Finden** (`claimondo.de/gutachter-finden`) | → App-Gutachter-Finder (`self_service`) | wie #1 (SV+SA, Haftpflicht) | App-Funnel → /flow | Nein (Haftpflicht-only) | wie F2 (bewusst) |
| M3 | **Public Rueckruf** (`claimondo-marketing/lib/actions/public-rueckruf`) | `rueckruf` (o. `input.quelle`) | nichts schaden-spezifisch; `status='rueckruf'` | Dispatcher ruft zurueck + qualifiziert | Dispatcher | OK |
| M4 | **MCP / LLM melde-schaden** (`/api/v1/melde-schaden`) | `mcp` | gfa (schadenart, SV, wunschtermin) — **kein** schuldfrage; bucht SV (weicher Hold) | issueCanonical → /flow quali | Quali fragt | OK (deferred; SV-committet wie Gutachter-Finder) |
| M5 | **Cluster-/Embed-LPs** (`/api/anfrage-from-lp`) | `kfz_gutachter_lp` · `sv_embed` · `generic_lp` (autounfall.io) · `monika_anon` | gfa via `insertAnfrage` — **kein** schuldfrage | issueCanonical → /flow quali | Quali fragt | OK (deferred) |
| M6 | **Anspruch-Check** (`/embed/anspruch-pruefen`) | `claimondo-check` | Foto + KI-Schaetzung; `?schuld=`-Prefill wird **NICHT** an den Finder durchgereicht | `buildFinderHandoffUrl` → **immer `/embed/gutachter-finder`** | **Nein** (Haftpflicht) | erbt Gutachter-Finder (wie F2) |
| M7 | **Makler-Hub** (`claimondo.de/m/<code>`) | → Gutachter-Finder (`self_service`) + Anspruch-Check, promo-attribution (`m`) | makler-branded; 2 CTAs „Gutachter finden" + „Anspruch pruefen" — **beide → Gutachter-Finder**; Copy 100% §249/unverschuldet | App-Funnel → /flow | **Nein** (Haftpflicht) | erbt Gutachter-Finder (wie F2) |

**Zentrale Beobachtung claimondo.de:** Die **komplette Marketing-Haustuer ist Haftpflicht-gebaut**. Alle Kunden-Eingaenge — **Mini-Wizard (`/schaden-melden`)**, **Gutachter-Finden**, **Makler-Hub (`/m/<code>`)** und **Anspruch-Check** — fuehren zu SV+Vollmacht (§249/unverschuldet) bzw. werfen Eigenverschulden raus. Das ist Kern-Geschaeft (Haftpflicht = 0€ fuer den Kunden, Gegner zahlt) — aber es gibt **keinen** Kasko/Selbstzahler-Eingang von claimondo.de. Der **einzige** Kasko/Selbstzahler-Weg ist der **Werkstatt-Finder** (Embed) — und der fragt den Abrechnungsweg nicht ab (F1). Zwei konkrete Loecher: **F1** (Werkstatt-Finder fragt Kasko/Selbstzahler nicht) und **F4** (Mini-Wizard-Sackgasse fuer Eigenverschulden). Anspruch-Check + Makler-Hub sind reine Router auf den Gutachter-Finder — sie **erben** dessen Verhalten, brauchen also keinen eigenen Fix (ausser man will Kasko/Selbstzahler dort bewusst anbieten = Produktentscheid).

---

## 3. Findings

**F1 — Werkstatt-Finder fragt den Abrechnungsweg nicht (der einzige echte Funnel-Gap).**
`erstelleWerkstattFinderLead` → `buildWerkstattFinderLeadExtra` setzt `reparaturwunsch='reparatur'` (wenn Werkstatt gewaehlt + Test-Guard passt), aber **nie** `schuldfrage`/`eigene_versicherung`. Der Werkstatt-Finder ist konzeptionell „ich brauche eine Reparatur" — und eine Reparatur ist **Kasko** (eigene VS) **oder** **Selbstzahler** (aus eigener Tasche) **oder** Haftpflicht-nach-Gutachten. Der Kunde waehlt eine Werkstatt, aber der Abrechnungsweg landet erst im /flow-Quali, der die **volle** schuldfrage (inkl. `gegner`=Haftpflicht) fragt — breiter als noetig und semantisch schief fuer einen reinen Repair-Sucher.

**Fix-Vorschlag (Aaron 24.07. bestaetigt — „nur Werkstatt-Finder ergaenzen"):**
Im Werkstatt-Finder eine kurze Weiche **Kasko / Selbstzahler** (ggf. + „Unfall mit Gegner? → Gutachter-Finder"). Mapping auf den Lead:
- Kasko → `schuldfrage='eigenverantwortung'`, `eigene_versicherung='ja'`
- Selbstzahler → `schuldfrage='eigenverantwortung'`, `eigene_versicherung='nein'`

Damit matcht der /flow **direkt** `kasko`/`selbstzahler` (kein Quali-Umweg, kein Haftpflicht-Ast fuer einen Repair-Kunden). `reparaturwunsch='reparatur'` bleibt. Der Guard aus `erstelle-anfrage.ts:122` gilt sinngemaess: `eigenverantwortung` OHNE `eigene_versicherung` wuerde still disqualifizieren — also beide Werte zusammen setzen.

**F2 — Gutachter-Finder ist ein reiner Haftpflicht-Trichter (bewusst, KEIN Fix).**
Der Funnel bucht SV + Termin und laesst die **SA/Vollmacht** direkt unterschreiben (GFA `sa_signatur_data_url`) — alles Haftpflicht-Annahmen. Aaron-Entscheid 24.07.: **so gewollt** — wer einen unabhaengigen Gutachter sucht, ist Haftpflicht. Kein Abrechnungsweg-Gate hier. (Der /flow-Quali wuerde zwar noch fragen, aber der Kunde hat da schon SV+Vollmacht — fuer Kasko/Selbstzahler der falsche Einstieg. Wer Repair will, gehoert in den Werkstatt-Finder = F1.)

**F3 — Uebrige App-Funnels korrekt** (Schadenkarte forced Haftpflicht by design; FM/Anspruch-Check/MCP/Cluster-LPs deferren sauber an den Quali; Makler qualifiziert optional vor).

**F4 — Der claimondo.de-Mini-Wizard (`/schaden-melden`) disqualifiziert JEDES Eigenverschulden — inkl. Kasko (NEUER Gap, claimondo.de-Seite).**
`createLeadFromMiniWizard` setzt `isDisqualifiziert = schuldfrage === 'eigenverantwortung'` und schickt solche Kunden auf `/schaden-melden/selbstverschulden` (kein Magic-Link, kein /flow). Der Wizard fragt **nie** `eigene_versicherung` — also fliegt **Kasko** (eigenverantwortung + eigene VS) genauso raus wie reiner Selbstzahler. Das folgt der alten Quali-Policy (`quali-gate.ts`, Aaron 31.05.: „nur Eigenverschulden blockt") — die aber **aelter ist als die kasko/selbstzahler-Szenarien**, die der /flow inzwischen bedient. Inkonsistenz: der Werkstatt-Finder + /flow **bedienen** Kasko/Selbstzahler, die Marketing-Haustuer **wirft sie raus**. Ergebnis: der Kasko-Kunde erlebt je nach Funnel entweder Service (Werkstatt-Finder) oder Sackgasse (Mini-Wizard).

**Fix-Optionen F4** (Aaron-Entscheid noetig — betrifft App **und** `claimondo-marketing/`):
- **(a)** Mini-Wizard `eigenverantwortung` NICHT mehr hart disqualifizieren, sondern die `eigene_versicherung`-Folgefrage stellen → Kasko (`ja`) durchlassen (→ kasko-Szenario), nur reiner Selbstzahler ggf. weiter zur Selbstverschulden-Seite (oder auch durchlassen = selbstzahler-Szenario).
- **(b)** Auf der Selbstverschulden-Seite einen CTA „Reparatur ueber Kasko/Werkstatt?" → Werkstatt-Finder anbieten (Umleitung statt Sackgasse). **← Aaron-Entscheid 24.07. (F4-Weg).**

---

## 4. Empfehlung / naechster Schritt

**Sofort (bestaetigt, App-only):** **F1 — Werkstatt-Finder Abrechnungsweg-Weiche (Kasko / Selbstzahler)**, die `schuldfrage='eigenverantwortung'` + `eigene_versicherung='ja'|'nein'` auf den Lead setzt (zusaetzlich zum bestehenden `reparaturwunsch='reparatur'`). Ergebnis: Werkstatt-Finder-Leads matchen im /flow direkt `kasko`/`selbstzahler` statt den Umweg ueber den vollen Schuldfrage-Quali.

**F4 (bestaetigt, Variante b):** Auf `/schaden-melden/selbstverschulden` einen CTA „Reparatur ueber Kasko/Selbstzahler? → Werkstatt-Finder" → `app.claimondo.de/embed/werkstatt-finder`. Keine Policy-Aenderung am Mini-Wizard; nur die Sackgasse bekommt einen Ausgang. Reihenfolge (Aaron): **F4 zuerst, dann F1.**

**Non-Gaps (dokumentiert, kein Fix):** F2 (Gutachter-Finder Haftpflicht-only, Aaron-Entscheid) · F3. Anspruch-Check + Makler-Hub erben den Gutachter-Finder (Router).

Reihenfolge: dieses Doc → **F4** (Marketing, Selbstverschulden-CTA) → **F1** (App, Werkstatt-Finder Weg-Wahl). Je eigener PR gegen `staging`, Regel-4-Smoke.
