# DECISIONS — Fundament-Programm (append-only)

> Protokoll nach FUNDAMENT.md §8. Jede unterwegs getroffene Entscheidung, die weder im Steuerdokument noch in den Journeys stand. Review-Spalte bleibt `offen`, bis Aaron sie bestätigt/revidiert.

## 2026-07-28 · SV-Org-Lane · organisationen/Verwalter/Pool-Lead-Modell (KFZ-152 / #4579) retiren

**Lücke:** Aaron wies die SV-Org-Lane zu ([[coordination-an-a6c863e2-sv-org-organisation-id-wiring]]): `assignPoolLead` / `/gutachter/team` ist auf prod **unerreichbar** (`v_claim_full.organisation_id` ist hardcoded `NULL::uuid` in `v_claim_base`, verifiziert via `pg_get_viewdef`; 0 `organisationen`, 0 `sachverstaendige.organisation_id`). Erste Aufgabe = Entscheidung **Launch (View verdrahten) vs Retire (toten Pfad entfernen)**, abzustimmen mit dem Netzwerk-Epic (paused), das die kanonische SV-Struktur bestimmt.

**Entscheidung:** **RETIRE** des Code-Pfads — `/gutachter/team` (`page.tsx` + `TeamClient.tsx` + `actions.ts`: `assignPoolLead`/`ensureVerwalter`/`toggleSubSvSperre`) + der `showTeam`-Nav-Thread (`GutachterShell.tsx`/`layout.tsx`/`_shell/page-titles.ts`). **Schema bleibt unangetastet** (`organisationen`-Tabelle, `sachverstaendige.organisation_id`/`rolle_in_organisation`/`ist_parent_account`) — FUNDAMENT §10 Nicht-Ziel „keine Drops".

**Begründung (Verfassung §3 „kein totes Gerüst" + Roadmap):**
1. Der Pfad ist **tot** (0 Orgs, kaputte View → unerreichbar). Belassen = ein stiller Deadlock-Erwartungswert, der bei künftigem Org-Anlegen tot startet.
2. Die **kanonische SV-Struktur-Richtung** ist das Netzwerk-Epic (`netzwerk_owner_id` = Profil-Graph, `docs/superpowers/specs/2026-07-21-netzwerk-verbindungen-freundschaft-design.md:93/99`), das **Multi-Account-Organisationen für v1 explizit ausklammert** (`sv_buero ausgeklammert`, :109). Das organisationen/Verwalter/Pool-Lead-Modell ist damit **off-roadmap** für v1.
3. **Reversibel:** Git-Historie + Schema intakt; bei künftigem Agentur-Bedarf neu gebaut (voraussichtlich netzwerk-aligned).

**Nicht in Scope:** Die `sv-zuweisung/route.ts`-Org-Pool-Branche (schreibt `sv-gesucht` für Pool-Verteilung) ist separat tot UND zugleich der A2-Fund #6 (WILD-`operative_status`-Write, der den Ratchet per Type-Cast umgeht) → gehört zu **C1**. Ein Schema-Drop der org-Spalten liegt **außerhalb** des Fundament-Programms (§10).

**Review:** offen (Aaron)

## 2026-07-28 · Bug3 (C2/C4-Vorgriff) · Logged-in-Redirect → onboarding-details kanonisch

**Lücke:** Welche Erhebungs-Strecke ist kanonisch für eingeloggte Kunden — /flow FlowWizardKfz (Flow A, leads.*) oder /kunde/onboarding-details (Flow B, claims.*)? Beide erheben Unfall-Hergang/Service/Kanzlei/SA in teils anderen Spalten (leads.unfallhergang vs claims.hergang_kunde_text) = die „zwei Feststellungen".

**Entscheidung:** onboarding-details (Flow B) ist kanonisch für eingeloggte Kunden; FlowWizardKfz bleibt anon/Magic-Link-Fallback. Der Logged-in-Redirect (src/app/flow/[token]/page.tsx) lag tot im try/catch (NEXT_REDIRECT wurde ohne isRedirectError-Re-throw verschluckt) und wurde reaktiviert (redirect außerhalb des try).

**Begründung:** Verfassung §4 (eine Akte) + §5 (ein Intake); folgt dem Funnel-v2-Plan (docs/plans/funnel-vereinfachung-2026-05-11.md — „/kunde/onboarding ersetzt FlowWizardKfz"). Dedup: convertLeadToClaim kopiert leads.unfallhergang → claims.hergang_kunde_text.

**Review:** offen (Aaron) — Regel-4-Prod-Smoke 28.07. GELAUFEN (Session 264a7df6, 4 geseedete Sub-Fälle, echte UI, Seeds aufgeräumt): (a) ERLEDIGT. Kernpfade GRÜN wie entschieden: offene Feststellung → Redirect /kunde/onboarding-details mit hergang-Phase; SA-offen (haftpflicht) → FokusSignatur direkt auf /flow/<token>. VERFEHLT: „erledigte Feststellung → Fallakte" — die felderlose sa-Phase (onboarding_phasen kunde-onboarding, ord 40, 0 Felder) ist für den Server-Skip (`pflichtFelder.length > 0`-Guard in ladeNoetigePhasen) nie skippbar → `phases.length === 0` unerreichbar → der Fallakte-Redirect in onboarding-details/page.tsx ist toter Code; ein Kunde mit längst signierter SA sieht stattdessen Schritt 1/1 „Schaden-Abtretung unterschreiben" (irreführende Aufforderung, kein Bruch/500/Sackgasse → kein Revert, fix-forward). (c) dedupe-Edge BESTÄTIGT: hergang-Skip+Prefill sehen nur claims.hergang_kunde_text — leads.unfallhergang wird weder geskippt noch vorbefüllt (textarea leer, per eval verifiziert) = Doppel-Erhebung; Bestand quantifiziert 0/6 echte Kunde-Claims in dieser Konstellation → dormant, fix-forward statt Revert. (b) C2/C4-Vorgriff unverändert offen. NEU (Nebenbefund): Wizard-localStorage-Key `claimondo-wizard-state:<flowKey>` trägt keine fallId → Restore-Banner übernimmt Zustand aus dem ZULETZT bearbeiteten Fall desselben Kunden (Cross-Fall-Contamination bei Mehrfall-Kunden).

## 2026-07-29 · C1 · Event-Log = bestehende `phase_transitions` (kein neues `claim_events`)

**Lücke:** C1 (FUNDAMENT §5) verlangt ein Event-Log und lässt offen, ob eine bestehende Tabelle das Format trägt oder eine additive Migration `claim_events` nötig ist.

**Entscheidung (VORSCHLAG):** **`phase_transitions` ist das Event-Log** — keine neue Tabelle. Verifiziertes Prod-Schema (`id · fall_id · claim_id · from_phase · to_phase · transition_at · transitioned_by · actor_rolle · trigger_type · grund · payload jsonb · created_at`) deckt das geforderte `{claim_id, event, actor, payload, created_at}` mehr als ab; die Engine (`state-machine.ts:324`, AAR-586) schreibt es bereits. C1 schließt nur die Gaps: `claim_id` in den Insert, fire-and-forget → `await`+non-fatal, WILD-Writer funneln. Details: `c1-transition-claim-plan.md` §2.

**Review:** offen (Aaron)

## 2026-07-29 · C1 · C1/FG1-Partition (Matrix-Funnel vs Terminal-Sync)

**Lücke:** C1 und das FG1-Programm (`flag-fg1-claims-writer-funnel`) berühren beide `operative_status`-Writer. Doc-Vorgabe „andocken, nicht parallel erfinden" — Überschneidung ausweisen.

**Entscheidung (VORSCHLAG):** Saubere Partition — **C1 = Matrix-Transition-Funnel** (Lifecycle-Writer durch `transitionFallStatus`; einziger engine-funnel-fähiger WILD-Rest = `sv-zuweisung/route.ts:284`). **FG1 = Terminal-Sync** (`status`→`operative_status` via Trigger/Mapping, Engine bewusst unangetastet; besitzt die 2 C1-Baseline-Writer). Berührungspunkt: der `operative_status`-CHECK (bereits gelandet, 33 Werte — C1 erbt ihn). Folge: C1a-Beweis = `sv-zuweisung` funneln + Event-Log-`claim_id`; die 2 Baseline-Writer zieht C1 nur nach, wenn FG1 sie synct. Details: `c1-transition-claim-plan.md` §4.

**Review:** offen (Aaron)

## 2026-07-29 · C1 · Abschluss-Pfad = Schlussabrechnung + 48h-Karenz (Option B)

**Lücke:** Der Kern-Haftpflichtfall hat zwei Abschluss-Terminals (`abgeschlossen` via Engine-Cascade vs. `reguliert_vollstaendig` via Endzustand) und einen **toten** 48h-Grace-Cron (`cron/fall-abschluss` gated auf `schlussabrechnung_am`, das nie geschrieben wird — 0/23 Prod). Verifiziert: [[audit-c1-auto-close-luecke-zahlung-eingegangen]] (j01 #8, PR #4835). Nach VS-Zahlung: sofort schließen oder Karenz?

**Entscheidung:** **Aaron 29.07.: Option B** — nach VS-Zahlung schließt der Fall NICHT sofort, sondern wartet auf eine echte Schlussabrechnung + 48h-Karenz. Umsetzung (C1c): Cascade-Regel `regulierung/… → abgeschlossen` (bei `zahlungEingegangen`, `autophase-decision.ts:72`) → **`→ zahlung-eingegangen`**; **neue KB-Aktion „Schlussabrechnung erstellt"** setzt `schlussabrechnung_am`; der bestehende 48h-Cron schließt dann `zahlung-eingegangen → abgeschlossen`. EIN Terminal = `abgeschlossen` (`reguliert_vollstaendig` darauf vereinheitlichen). Cron + Gate bleiben.

**Review:** Richtung von Aaron **bestätigt** (29.07.); offenes Design-Detail (was genau die „Schlussabrechnung" ist — Dokument-Typ / KB-Bestätigung / `abrechnungen`-Anbindung) → C1c-Design. Behavior-Change am Kern-Close-Pfad → erst nach B1 bauen.

## 2026-07-30 · P4 (Netzwerk) · Kunden-Bestätigungs-Gate = `sa_unterschrieben`, nicht `onboarding_complete`

**Lücke:** Der SV-Vermittlungs-Sofort-Claim (P4) wird un-onboardet in `gutachten-eingegangen` geboren — die Mid-Funnel-Reader (AutoPhase, case-billing-batch, Werkstatt-Zuweisung, Kanzlei-Handoff) brauchen ein Gate, das ihn blockt, ohne Normalfall-Claims zu stranden.

**Entscheidung:** Gate-Prädikat = **`sa_unterschrieben === true`** (`kundeHatBestaetigt`, `src/lib/faelle/onboarding-gate.ts`). NICHT `onboarding_complete`: ein Normalfall-Claim erreicht `gutachten-eingegangen` legitim mit `onboarding_complete=false` (Portal-Wizard aufgeschoben) — ein Gate darauf würde die Regulierung stranden. Jeder Nicht-SV-Flow-Claim wird `sa_unterschrieben=true` geboren (Claim entsteht am SA-Signing) → das Gate ist dort inert; nur der SV-Sofort-Claim (geboren `false`) wird geblockt. Der sign-into-existing-Pfad setzt BEIDE Flags.

**Review:** offen (Aaron) — Plan `docs/superpowers/plans/2026-07-28-netzwerk-p4-sv-vermittlungs-flow.md` Global Constraints.

## 2026-07-30 · P4 (Netzwerk) · SV-Flow-Reparatur = Nebenschauplatz auf `reparatur_vermittlung_status`-Achse (J4 Offene Frage 3)

**Lücke:** J4 ließ offen, ob die Haftpflicht-Reparatur des SV-Vermittlungs-Flows auf der `operative_status`-`reparatur-*`-Lane läuft.

**Entscheidung:** SV-Flow-Claim = Abrechnungsweg `haftpflicht`, `service_typ='komplett'` → die SV-/Regulierungs-Achse läuft regulär (J1). Reparatur = **Nebenschauplatz** auf `reparatur_vermittlung_status`/`reparatur_termine` via `assignReparaturWerkstatt` (abrechnungsweg-agnostisch); die `operative_status`-`reparatur-*`-Lane bleibt reduced-repair-only (verifiziert: `advanceReparaturCursorTo` ist auf `abrechnungsweg ∈ {selbstzahler, kasko}` gegatet → bei Haftpflicht No-op).

**Review:** offen (Aaron) — Plan P4, Abschnitt „Invariante & Reparatur-Achse".

## 2026-08-03 · B-Journey-Suite · J9-Provisions-Smokes in CI (verrechnung+staffel); lifecycle bleibt opt-in

**Lücke:** Die Journey-Suite-in-CI-Aufgabe (§9, Tranche J9) trifft auf die `provisionen-*`-Smokes, die per Spec-Kommentar „opt-in (nie in CI)" markiert sind — dürfen sie in den post-merge-CI-Journey-Step?

**Entscheidung:** `provisionen-verrechnung-smoke` + `provisionen-staffel-smoke` laufen ab jetzt im dedizierten CI-Journey-Step (J9, `.github/workflows/ci.yml`); `provisionen-lifecycle-smoke` NICHT — es bleibt opt-in/Regel-4.

**Begründung:** verrechnung+staffel sind rein DB (Insert-Trigger, kein Browser/Comms/Cron), self-cleaning (Marker `SMOKE-PROV`/`SMOKE-STAFFEL-LC`, FK-sicher + Crash-safe) — dasselbe Wegwerf-in-prod-DB-Muster wie J4 (Verfassungsprinzip 10 „Kein Feature ohne Reise"; das etablierte CI-Muster). Die concurrency-Group `prod-e2e-smoke` (#4911) serialisiert die e2e-Läufe → kein Fixture-Cleanup-Cross-Run-Race. Der „nie in CI"-Spec-Kommentar war die Vorsichts-Default vor der Journey-Suite (D-Phase). `lifecycle` triggert den GLOBALEN Release-Cron (`/api/cron/release-provisionen`) → bei jedem Merge würden echte fällige Provisionen früher freigegeben (Geld-Timing-Effekt) → bewusst ausgeschlossen, bleibt manueller Regel-4-Smoke.

**Review:** offen (im PR an Aaron).

## 2026-08-04 · C2 (createCase) · FlowLink IMMER + garantierter Kunde-Kanal (Prep §7#1)

**Lücke:** Prep §7#1 / A4-Frage 2 — garantiert `createCase` bei jedem Meldeweg einen aktiven Kunde-Kanal (WA/Email), oder bleibt reiner Client-Redirect bei den No-Channel-Eingängen (B-2/C-4) zulässig?

**Entscheidung:** `createCase` sichert für JEDE Meldung einen Kunde-Kanal, umgesetzt in C2a als **FlowLink IMMER** (`ensureCanonicalFlowLinkForLead`, in beiden Modi — auch direct-claim). Der FlowLink ist idempotent + harmlos (nur ein DB-Row, kein Send), liefert einen Magic-Link-Fallback auch für den eingeloggten-Kunde-Wizard. Der Voll-Send bleibt bis C3-Outbox der bestehende Wrapper-`sendFallCommunication` (direct-claim) bzw. der FlowLink-Send (lead-first).

**Begründung:** Verfassung §1-Prinzip 8 (eine Outbox / kein stilles Sterben) + Prinzip 10; schließt die A3-P2-Lücken #5–#7 (notification-taube Rollen), die daraus entstanden, dass Eingänge den Kunden ohne Kanal ließen.

**Review:** offen (Aaron) — via C2a-Plan `docs/superpowers/plans/2026-08-04-fundament-c2a.md`.

## 2026-08-04 · C2 (createCase) · /flow bleibt Konvergenzpunkt — createCase speist es, kein Rewire in C2a (Prep §9#2)

**Lücke:** Prep §9#2 — extrahiert `create-case.ts` die /flow-Garantien (Pflichtdok/Notif), sodass /flow SELBST `createCase` ruft, oder bleibt /flow ein eigenständiger zweiter Kanon neben `createCase`?

**Entscheidung:** Für C2a: `createCase` extrahiert die /flow-Garantien NICHT und rewired /flow NICHT. `/flow/[token]` bleibt der Konversions-Konvergenzpunkt (Muster L); `createCase` (mode='lead-first') SPEIST es (Lead+FlowLink). Eine spätere Reconcile-Tranche kann /flow selbst auf `createCase` heben.

**Begründung:** hält C2a bounded (Modul + Wizard A-1, ein Beweis-Adapter) und kollisionsfrei zur aktuell heißen aar-956-Intake/Embed-Lane (6+ Sessions). /flow-Umbau wäre ein separater, kollidierender Eingriff — Strangler-Fig-Direktive: kleinste Tranche zuerst.

**Review:** offen (Aaron) — via C2a-Plan.

## 2026-08-04 · C2 (createCase) · Gegner-Pflichtdok im Kern (C2b) + Marketing-Wizard deferred (C2c)

**Lücke:** Prep §7#2 (bekommt der A-3-Gegner-Claim Pflichtdok-Slots?) + §7#3 (Marketing-Mini-Wizard `/schaden-melden` im `claimondo-marketing/`-Build als 16. Eingang?).

**Entscheidung:** §7#2 — **ja, Pflichtdok im Kern** (der Geschädigte erbt den Fall); umgesetzt erst in **C2b** (A-3 Gegner-Flow), nicht C2a. §7#3 — **deferred an C2c** als offene Scope-Frage (eigener Adapter über eine API-Grenze); nicht in C2a/C2b.

**Begründung:** Verfassung §5 (ein Intake, garantierte Nachwirkungen) für §7#2; §7#3 ist eine echte Produkt-Scope-Entscheidung (Marketing-Build-Grenze) → an Aaron, kein §1-Default.

**Review:** offen (Aaron) — §7#2 vor C2b-Code, §7#3 vor C2c-Code.
## 2026-08-03 · B-Journey-Suite · T2: J8-2FA-Enroll in CI; J5 bleibt Skip (Fixture-Claim-Drift)

**Lücke:** T2 der Journey-Suite (J5 kasko + J8 2fa-enroll) — welche kommen in den CI-Journey-Step?

**Entscheidung:** `2fa-enroll-smoke` (J8) läuft ab jetzt im CI-Journey-Step (Seed-Step `seed-smoke-enroll.mjs` + `RUN_2FA_ENROLL_SMOKE`). `kasko-reparatur-phase-smoke` (J5) bleibt opt-in/Skip.

**Begründung:** J8 ist konto-isoliert (`smoke-enroll@claimondo.de`, TOTP-Enroll-UI, kein Comms/Booking); der Seed liest `process.env`-first (CI-tauglich) + setzt das Konto self-reset je Lauf faktorfrei. J5s Login-Refactor wäre machbar (`loginContextOrSkip('admin')` wie J1), ABER die MCP-Verifikation (03.08.) zeigt: der feste Fixture-Claim `39734007` ist zustandsgedriftet — `werkstatt_id NULL`, `operative_status=ersterfassung` statt des von der Spec erwarteten „Werkstatt gesetzt → Reparaturtermin"-Zustands. Die J5-Assertion (`Reparaturtermin|Werkstatt wählen|Reparatur`) wäre damit unsicher → ein flaky-roter Step statt eines verlässlichen Nachweises. J5 braucht einen eigenen deterministischen Seed (der den Claim in den erwarteten Reparatur-Zustand bringt) — Follow-up.

**Review:** offen (im PR an Aaron).

## 2026-08-03 · B-Journey-Suite · J10 = begründeter Skip (Flow-Wizard-Fragilität); §9-Punkt-2 erfüllt

**Lücke:** T3 der Journey-Suite (J10 werkstatt-finder) — in den CI-Journey-Step?

**Entscheidung:** `werkstatt-finder-smoke` (J10) bleibt begründeter opt-in-Skip (nicht in CI). Damit ist §9-Checkliste-Punkt-2 („J1–J10 grün ODER mit begründetem, journey-referenziertem Skip") **erfüllt** — B3 CI-Kern abgeschlossen.

**Begründung:** J10 wäre mit dem `db()`-`.env.local`→`process.env`-Fix technisch liftbar, ABER Szenario 2 (Flow-Self-Service) ist eine fragile 14-Schritt-Wizard-Heuristik (`:99-143`: klickt sich durch FORWARD-Buttons/Checkboxen/Textareas, hängt an `CANONICAL_FLOWLINK_ENABLED`, failt bei jeder Wizard-/Label-Änderung), und alle 3 Szenarien mutieren prod-DB (Claim/Lead → Smoke-Werkstatt) ohne Spec-internes cleaning. Ein nicht-deterministischer Multi-Step-Smoke in einem post-merge-CI-Step erzeugt flaky-rot statt eines verlässlichen Nachweises — das Gegenteil des Oracle-Zwecks. Follow-up: db()-Fix + Isolation auf Szenario 1 (Kunde-Fallakte, deterministisch) + Seed-cleaning-Verifikation → dann grün-liftbar. Analog J5 (Fixture-Drift) ist das ein Follow-up, KEIN §9-Blocker.

**Stand §9-Punkt-2:** Grün in CI = J1/J4/J9/J8. Begründet geskippt = J2/J3/J5/J6/J7/J10 + J9-`lifecycle`. Alle 10 Journeys sind damit CI-abgesichert ODER begründet, journey-referenziert geskippt.

**Review:** offen (im PR an Aaron).

## 2026-08-05 · C3 (Notification-Outbox) · Outbox liegt DAVOR — notification_deliveries bleibt System-1-intern (Prep §8)

**Lücke:** Prep §8 — wird die `notifications_outbox` die NEUE Delivery-Tabelle (ersetzt `notification_deliveries`), oder liegt sie DAVOR (enqueue → Outbox → Worker; System 1 unangetastet)?

**Entscheidung:** Outbox liegt **davor**. `notification_deliveries` (System 1: emit → notification_events → fan-out → deliveries) bleibt intern **unverändert**. Die neue Outbox ist ein additiver, service_role-only durabler Puffer NUR für die heute nicht-durablen System-2/3-Sends. C3a wired den ersten Consumer (dispatch-`updateFallStatus`, 9 Statuswechsel-Trigger).

**Begründung:** minimal-invasiv (Strangler-Fig): System 1 hat seine Durability (Retry/Dead-Letter/Lease) schon — es umzubauen wäre Risiko ohne Nutzen. Der Gewinn ist, die System-2-Sends (fire-and-forget, kein Dedup) auf dasselbe Durability-Niveau zu heben, ohne die 58-Event-Pipeline anzufassen.

**Review:** offen (Aaron) — via C3a-Plan `docs/superpowers/plans/2026-08-05-fundament-c3a.md` + Code-PR.

## 2026-08-05 · C3 (Notification-Outbox) · COMMUNICATION_REGISTRY bleibt Template-Layer UNTER der Outbox (Prep §6#2)

**Lücke:** Prep §6#2 — `COMMUNICATION_REGISTRY` (~50 WA-Templates) komplett auf emit→Outbox heben, oder als Template-Layer UNTER der Outbox behalten?

**Entscheidung:** **Template-Layer behalten.** Die Outbox speichert `template`+`payload`+`claimId`; der Worker ruft `sendFallCommunication(claimId, template, payload)` — die Registry rendert Empfänger/Kanal/Template weiterhin selbst. Die ~50 Templates werden **nicht** umgeschrieben, nur mit Durability (Dedup/Retry/Fehler-Task) umhüllt.

**Begründung:** DRY + bounded: die Registry ist die getestete Template-Wahrheit; sie in die EVENT_MATRIX zu heben wäre eine große, riskante Migration ohne C3a-Nutzen. Die Outbox löst das eigentliche Problem (Durability), nicht das Template-Rendering.

**Review:** offen (Aaron) — via C3a-Plan.

## 2026-08-05 · C3 (Notification-Outbox) · gutachten_fertig-Doppel-Send-Verifikation → C3b (Prep §6#1)

**Lücke:** Prep §6#1 — feuern `termin bestätigt`/`gutachten fertig` **beide** Sende-Systeme (→ 2 WhatsApp)? Konkret der `gutachten_fertig`-Doppel-Send-Verdacht in `gutachter/fall/[id]/actions.ts:225` (`sendFallCommunication`) **+** :231 (`emitEvent('gutachten.fertig')`) — J1-IST #7.

**Entscheidung:** Verifikation + Dedup/Retire **an C3b defert**. C3a wired NUR die dispatch-`updateFallStatus`-Sends (die nicht mit einem parallelen emit in derselben Action kollidieren). Der `gutachten_fertig`-Doppel-Send (System 2 + System 1 zusammen) ist ein separater Fix, weil er das Zusammenführen ZWEIER Systeme über EINEN Dedup-Key braucht.

**Begründung:** C3a bounded halten (ein Consumer, ein Beweis). Der Doppel-Send ist ein echter Bug (2 WA), aber sein Fix berührt die emit-Achse → eigene Tranche mit A2/A3-Abgleich.

**Review:** offen (Aaron) — Verifikation gegen den dann-aktuellen Code vor C3b.

## 2026-08-05 · C3 (Notification-Outbox) · FM/Kanzlei-Kanäle bleiben vorerst In-App → C3b (Prep §6#3)

**Lücke:** Prep §6#3 — bekommen Flottenmanager/Kanzlei über In-App hinaus WA/Email im kanonischen fan-out (EVENT_MATRIX-Erweiterung), oder bleibt In-App bewusst?

**Entscheidung:** **Deferred an C3b** — keine Matrix-Erweiterung in C3a. C3a ändert keine Preference-/Kanal-Semantik, es hüllt bestehende Kunde-Sends in Durability. Die FM/Kanzlei-Kanal-Frage ist eine Produkt-Entscheidung (wollen die Rollen WA/Email?), kein §1-Default.

**Begründung:** Scope-Trennung: Durability (C3a) vs. Kanal-Reichweite (Produkt). Die Matrix-Erweiterung würde NEUE Empfänger-Sends erzeugen (nicht nur bestehende absichern) → eigene Tranche + Aaron-Produktentscheid.

**Review:** offen (Aaron) — Produktentscheid vor C3b.
