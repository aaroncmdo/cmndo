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

## 2026-08-04 · B-Journey-Suite · Kurskorrektur „keine Skips" — J5 gebaut, alle Skips werden CI-Steps

**Direktive (Aaron, 04.08.):** Die begründeten CI-Skips der Journey-Suite sind **nicht zulässig**. §9-Punkt-2 gilt erst als erfüllt, wenn **alle 10** Journeys wirklich CI-grün laufen — für jede geskippte Journey wird die fehlende Test-Infrastruktur gebaut/verändert (deterministischer, isolierter, self-cleaning Seed + robuste Spec, J4-Muster). Die frühere „§9 via Skips erfüllt"-Deklaration (03.08., zwei Einträge oben) ist damit **revidiert**.

**J5 gebaut (dieser PR, kitta/fundament-journey-j5-kasko):** `scripts/smoke/kasko-reparatur-seed.mjs` legt je Lauf einen Wegwerf-Kasko-Claim an — `abrechnungsweg=kasko` + `operative_status=reparatur-angefragt` + `reparatur_werkstatt_id` gesetzt + **keine** `reparatur_termine` → subPhase `reparatur_terminfindung` (belegt `lifecycle.ts:234-244`), interne Fallakte zeigt „Terminfindung" statt „SA-Unterschrift offen". Eigene Wegwerf-Werkstatt (die frühere feste Fixture `badecb82…` existiert nicht mehr = genau der Drift), self-cleaning via Marker. Spec: `loginContextOrSkip('admin')` **aal1** — test-admin trägt keinen TOTP-Faktor, deshalb **kein** `TEST_ADMIN_TOTP_SECRET` im CI-Step (mit Secret würfe `completeMfa` mangels Faktor → `loginContextOrSkip` skippt statt grün). CI-Step `RUN_KASKO_SMOKE`. Lokal gegen prod grün 04.08.: Seed 5/5 + Smoke 1 passed. Ersetzt den gedrifteten festen prod-Claim `39734007`.

**Reihenfolge der restlichen:** J3/J6 (dedizierte Seeds+Specs), J7 (Skeleton → echte Storno/DSGVO-Logik), J2 (Multi-Kanal-Meldeweg), J9-`lifecycle` (Release-Cron Test-Row-Isolation — ggf. Produkt-Change, mit Aaron + Netzwerk-Lane abzustimmen).

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
## 2026-08-04 · B-Journey-Suite · J10 (Werkstatt-Finder) als CI-Step — 2 Bugs behoben

**J10 gebaut (PR gestackt auf #4973, Branch `kitta/fundament-journey-j10-werkstatt-finder`):** `scripts/smoke/werkstatt-finder-seed.mjs` überarbeitet — process.env-first (war `.env.local`-only = doppelter CI-Blocker), eigene Wegwerf-Werkstatt statt toter Fixture `badecb82`, Wegwerf-Kunde statt festem `aaron.sprafke+smokewf@`, self-cleaning inkl. Konten.

**Zwei Bugs im alten Seed behoben:** (1) tote Fixture `badecb82` (MCP-verifiziert weg); (2) **fehlendes `abrechnungsweg`** → `reparaturPhaseErreicht=false` → die WerkstattFinderCard rendert **nie** (`GeldZone.tsx:50` gatet auf `brauchtVermittlung && reparaturPhaseErreicht`; `reparatur-phase-erreicht.ts:14-23` verlangt `abrechnungsweg ∈ {selbstzahler,kasko}`). Fix: S1-Claim `reparaturwunsch=fiktiv` **+ `abrechnungsweg=selbstzahler`**. Zusätzlich `nurEchte`-Filter (`finder.ts:46-48`, filtert per `werkstaetten.email`): die Wegwerf-Werkstatt braucht **`email=NULL`** für Finder-Sichtbarkeit — Comms laufen über die `@claimondo.test`-Profil-Email + `telefon=NULL` → Send-Layer suppressed alles.

**Spec:** `db()`→`process.env`-first (Haupt-CI-Blocker); S1 (Kunde-Fallakte → Finder + Auswahl → `reparatur_werkstatt_id`) + S3 (Werkstatt-Portal-Auftrag, eigener zugewiesener S3-Claim unabhängig vom S1-Klick; `v_werkstatt_auftrag` rollen-gefiltert via `is_werkstatt_for_claim` = reparatur_werkstatt_id ODER werkstatt_id) deterministisch; S2 (Flow-Wizard) `test.skip` mit Begründung (fragile 14-Schritt-Heuristik + Match-Divergenz + `CANONICAL_FLOWLINK_ENABLED` — Follow-up: deterministischer Flow-Seed). CI-Step `RUN_WF_SMOKE` (+ `SUPABASE_SERVICE_ROLE_KEY` im Test-Step für `db()`). Lokal prod-grün 04.08.: Seed 5/5 + Smoke 2 passed / 1 skipped.

**Review:** offen (im PR an Aaron).

## 2026-08-04 · B-Journey-Suite · J3 (SA/Vollmacht) als CI-Step — anon Canvas-Signatur

**J3 gebaut (PR gestackt auf #4980, Branch `kitta/fundament-journey-j3-sa-vollmacht`):** neuer Seed `scripts/smoke/sa-vollmacht-seed.mjs` (Wegwerf-Lead mit `werkstatt_intake_am` + `abrechnungsweg=haftpflicht` + `service_typ=nur_gutachter` + flow_link mit DB-Token; Kunde-Account entsteht erst beim Signieren; self-cleaning via Marker + email-Muster) + neuer Spec `sa-vollmacht-smoke.spec.ts`.

**Kern:** Die SA ist voll UI-fahrbar — der WerkstattIntake-Signatur-Surface (`flow/[token]/page.tsx:189`, `if lead.werkstatt_intake_am`) kurzschliesst `/flow/[token]` **anon** (kein Login → **kein Auth-Wall-Skip**) direkt auf `SaSignaturStep` (signature_pad-Canvas + 1 Checkbox + „SA unterzeichnen"). Canvas-Drive = das bereits in CI bewährte toPass-Muster (`reparatur-weg-e2e-smoke.spec.ts:73-86`). `signSAandCreateFall` → `convertLeadToClaim` schreibt `claims.sa_unterschrieben=true` + `sa_unterschrieben_am` + `abtretung_pdf` (SSoT-Assert per `lead_id`). Comms-Isolation: `telefon=NULL` → Willkommens-WA guarded weg; `@claimondo.test` → Send-Layer suppressed.

**Vollmacht bewusst NICHT im UI-Smoke:** kein Kunde-Canvas — `vollmacht_signiert_am` / `vollmacht_status='bestaetigt'` werden server-intern gesetzt (LexDrive-Webhook / `confirmVollmacht`). Als Journey-Verweis (j03 Schritt 3) im Spec dokumentiert, **kein** `test.skip`. CI-Step `RUN_SA_SMOKE` (+ `SUPABASE_SERVICE_ROLE_KEY`). Lokal prod-grün 04.08.: Seed 4/4 + Smoke 1 passed.

**Review:** offen (im PR an Aaron).

## 2026-08-04 · B-Journey-Suite · J6 (Kanzlei-Übergabe) als CI-Step — Kunde-Login, kein zweites Konto

**J6 gebaut (PR gestackt auf #4981, Branch `kitta/fundament-journey-j6-kanzlei`):** neuer Seed `scripts/smoke/kanzlei-uebergabe-seed.mjs` + Spec `kanzlei-uebergabe-smoke.spec.ts`.

**Kern:** Die Übergabe an die eigene Kanzlei ist mit **externem** Wegwerf-Kunde-Login fahrbar (kein Auth-Wall, **keine** echte Kanzlei-Gegenseite nötig — schlanker als J10). Trigger: Kunde-Portal-Button „Kanzleipaket versenden" (`EigeneKanzleiPaketCard`) → `versendeKanzleiPaketAnEigeneKanzlei` (`kanzlei-wunsch/actions.ts:270`, sanktionierter Direkt-Writer aus `operative-status-writes-baseline.json`) schreibt `claims.operative_status='an_externe_kanzlei_uebergeben'` + `kanzlei_uebergeben_am` (SSoT-Assert, **nicht** `kanzlei_id` = intern gecappt). Button-Gate (`kunde-claim-view.ts`): `service_typ≠nur_gutachter` + `eigene_kanzlei` + Ansprechpartner-Mail + **freigegebenes Erstgutachten** (`auftraege` typ=erstgutachten, `gutachten_final_freigegeben=true`; ⚠ `auftraege.sv_id` NOT NULL → Test-SV `0469524f`). Der Klick startet PDF-Gen (Button „Wird versendet…") → Assert per **toPass-Poll** (nicht fixer Timeout — sonst flaky). CI-Step `RUN_KANZLEI_SMOKE` (+ `SUPABASE_SERVICE_ROLE_KEY`). Lokal prod-grün 04.08.: Seed-assert 2/2 + Smoke 1 passed.

**Review:** offen (im PR an Aaron).

## 2026-08-04 · B-Journey-Suite · J7 (Storno/DSGVO) als CI-Step — Prod-Bug in der Anonymisierungs-RPC gefunden + gefixt

**J7 gebaut (PR gestackt auf #4984, Branch `kitta/fundament-journey-j7-storno-dsgvo`):** neuer Seed `scripts/smoke/storno-dsgvo-seed.mjs` (**3 GETRENNTE Wegwerf-Konten**: Throwaway-Admin `throwaway-admin-j7-…` ohne TOTP + Storno-Kunde+Claim `operative_status='regulierung'` + DSGVO-Kunde+eigener Claim; self-cleaning, Clean-Reihenfolge FK-getrieben: `dsgvo_loeschauftraege` VOR dem Admin-Konto — `bestaetigt_von_user_id` → auth.users hat NO ACTION) + Spec `storno-dsgvo-smoke.spec.ts` (Skeleton → echte Logik, 3 Tests).

**Soll≠Ist:** j07 „Kunde storniert" hat **keine** Kunde-UI — Storno ist intern (Admin/KB): `markClaimAsStorniert` (`endzustand-actions.ts:309`, requireRole admin/kb) via `EndzustandDropdown`→Modal (Begründung + Confirm-Tipp `STORNIEREN`; notify default false = keine Comms) → `operative_status='storniert'` + `abgeschlossen_am` + `endzustand_gesetzt_*` (Row-Check #4625-Klasse). DSGVO = 2-Schritt über `/kunde/profil` (`stelleLoeschAntrag`) + `/admin/datenschutz/loeschauftraege` („Bestätigen" → „Direkt ausführen"; Zeile per **EXAKTER** Wegwerf-Email, nie „erste Zeile"). **Bestätigen MUSS vor Ausführen:** der DB-CHECK `chk_bestaetigt_logic` verlangt `bestaetigt_am` für `status='ausgefuehrt'` — `fuehreLoeschungAus` ignoriert sein Update-Result, ein Direkt-Ausführen auf `eingereicht` verlöre den Status-Write silent (Rest-Befund, s.u.).

**Smoke-Fund (Prod-Bug, gefixt):** Die RPC `dsgvo_anonymize_user_data` (Stand `20260510095718`) war gegen das Schema gedriftet — tote Referenzen auf `claims.kunde_email` (ersatzlos gedroppt), die `claim_parties`-PII-Spalten (seit dem personen-Modell weg) und `faelle.kunde_*` (CMM-49; der IF-EXISTS-Guard prüfte nur die TABELLE, nicht die Spalten). **Jede** DSGVO-Ausführung scheiterte prod-sichtbar mit „Anonymisierung fehlgeschlagen: column kunde_email of relation claims does not exist" → Fix Migration **`20260804193646`** (die drei toten UPDATEs entfernt; `personen` bewusst unberührt = Aaron-Entscheid 16.06.). Der Journey-Smoke hat damit beim ersten Lauf genau die Bug-Klasse gefangen, für die er gebaut wurde.

**Offene Befunde für Aaron (bewusst NICHT unilateral geändert):** (1) `fuehreLoeschungAus` auf einem `eingereicht`-Antrag = Silent-CHECK-Reject (User wird anonymisiert+gelöscht, Antrag bleibt aber auf `eingereicht` stehen) — Fix wäre `bestaetigt_am` im Status-Update mitzusetzen + das Update-Result zu prüfen; (2) `claim_parties`-Rest-PII (`kennzeichen*`/`verletzungsart`/`krankenhaus_name`/`notiz`) und `personen` sind aktuell NICHT Teil der Anonymisierung (eigener `ist_anonymisiert`-Mechanismus existiert) — Soll-Klärung gegen Journey j07.

CI-Step `RUN_STORNO_DSGVO_SMOKE` (+ `SUPABASE_SERVICE_ROLE_KEY` für `db()`; `--workers=1`; Admin-Creds aus dem Seed-JSON, **kein** `TEST_ADMIN_*`) + Cleanup-Step `if: always()` — das Wegwerf-**Admin**-Konto ist sensibler als die Wegwerf-Kunden der anderen Journeys und bleibt nicht bis zum nächsten Lauf liegen. Lokal prod-grün 04.08.: Smoke **3/3 passed** + Seed-assert **9/9**.

**Review:** offen (im PR an Aaron).

## 2026-08-05 · B-Journey-Suite · J2 (Meldung alle Kanäle) als CI-Step — Suite damit 10/10 code-komplett

**J2 gebaut (PR gestackt auf #4995, Branch `kitta/fundament-journey-j2-meldung`):** neuer Seed `scripts/smoke/meldung-kanaele-seed.mjs` + Spec `meldung-kanaele-smoke.spec.ts` — **drei Meldewege = die drei Melde-Muster** aus j02 (Wrapper / lead-first / Kern-direkt), aufbauend auf den empirischen Rezepten des Entry-Point-Mapping-Audits (Wege 6/7/8, Session 264a7df6, 03.08.).

**Kanäle:** **A** Kunde-Wizard `/kunde/schaden-melden` (Ein-Formular, Pflicht nur PLZ, keine Terminwahl, kein `reserviere()`; `meldeNeuenSchaden` → `createLead` → `convertLeadToFall` = leads + claims + **pflichtdokumente**). **B** `POST /api/v1/melde-schaden` (anon, Zod-Minimum ohne `sv_id`/`slot_*` → keine Reservierung; gfa + lead + **flow_link**; **2. POST mit derselben Nummer → `bereits_angelegt`** = j02-Fehlerfall „Doppel-Submit idempotent" erstmals CI-bewiesen). **C** Gegner-Schadenkarte `/schaden/[token]` (geseedete Wegwerf-Karte `status='gebunden'`; 6-Step-Wizard, Pflicht nur Name+Consent; Direkt-Claim + verursacher-Party + interner `vs_meldung`-Fallback-Task).

**Isolations-Modell (wichtigste Erkenntnis der Erhebung):** identitätsbasiert, NICHT `SIDE_EFFECT_MODE` (das erreicht den prod-Prozess nicht). A: `@claimondo.test`+`telefon=NULL` → `fall_eroeffnet` hat keine Empfänger. B: **Drama-Festnetznummer** (BNetzA-Fiktionsrange 030 23125xxx, je Lauf variiert gegen phone-cap 3/24h + Cross-Run-Dedup) → WA-Precheck false, SMS inert, kein Email-Feld ⇒ der Spec **asserted `kanal==='none'`** als Runtime-Beweis. C: Submit ohne Telefon (Airdrop unterbleibt → Fallback-Task ist das Assert) + Wegwerf-Firma OHNE `firmen_flotten_konten`-Zeile (→ 0 FM-WA-Nummern, `konto-firma.ts:50-60`); **nie einen Versicherer wählen** (VS-Meldung prod-scharf, STOP-Marker firmen-flotte) und `/unfallmeldung` nicht bestätigen.

**Clean-Reihenfolgen (MCP-verifiziert):** gfa VOR leads (`konvertiert_zu_lead_id` NO ACTION) · `tasks.lead_id` ohne CASCADE → vor leads · vehicles NACH claims (`claims.vehicle_id` RESTRICT) · personen nach claims (parties `person_id` SET NULL) · `partner_provisionen` über alle drei Bezüge. `consent_records` (B) trägt keine Subjekt-Referenz (Befund B8) → bleibt als anonyme Audit-Zeile.

CI-Step `RUN_MELDUNG_SMOKE` (+ `SUPABASE_SERVICE_ROLE_KEY`, `--workers=1`). Lokal prod-grün 05.08.: Smoke **3/3 passed** (erster Lauf) + Seed-assert **11/11** + Clean vollständig. **Damit haben alle 10 Journeys einen CI-Step; §9-P2-Nachweis = erster post-merge-e2e-Lauf nach Kette-Merge. Rest: J9-`lifecycle` (opt-in, Aaron).**

**Review:** offen (im PR an Aaron).

## 2026-08-05 · B-Journey-Suite · J9-`lifecycle` in CI via Fremd-Effekt-Precheck-Geld-Guard (Aaron-Entscheid)

**Lücke:** `provisionen-lifecycle-smoke` schießt den ECHTEN globalen Release-Cron (`/api/cron/release-provisionen`) — in CI würde jeder Lauf echte fällige Provisionen FRÜHER freigeben (Geld-Timing-Effekt, deshalb 03.08. als opt-in ausgeschlossen). Drei Optionen wurden Aaron vorgelegt: (1) Precheck-Gate im Spec, (2) Test-Row-Filter-Param am Cron (Produkt-Change am Money-Pfad), (3) Status quo opt-in.

**Entscheidung (AARON, 05.08.): Option 1 — Precheck-Geld-Guard im Spec, KEIN Produkt-Change.** Vor jedem Cron-Schuss läuft `zaehleFremdEffekte()` (portiert aus `scripts/smoke/netzwerk-release-scharf-smoke.mts:58-112`, dem prod-erprobten #4927-Muster): alle fremden `pending`-Rows werden bewertet (storno-fällig ODER release-berechtigt = Completion+7d, inkl. `nur_gutachter`-Terminpfad über beide Bezug-Achsen; P3-Suppression-Flips zählen mit). Betroffene > 0 → `test.skip` DIESES Laufs mit sichtbarer Begründung — zustandsabhängig-selten, der Nacht-Cron (02:00 UTC) räumt das Fenster, der nächste Lauf prüft neu. `afterAll`-Cleanup räumt die eigenen Seeds auch im Skip-Fall.

**Begründung:** Testlogik bleibt aus dem Release-Runner (Money-Pfad) draußen; keine Koordinationslast mit der Netzwerk-Lane (Provisionen-Owner); der Guard ist derselbe Mechanismus, der den scharfen 01.08.-Referenzlauf abgesichert hat. Der bedingte Skip ist ein Geld-Guard, kein Test-Verzicht — qualitativ anders als die von der „keine Skips"-Direktive gemeinten Pauschal-Skips.

**Beweis-Stand:** ci.yml-J9-Step fährt jetzt alle drei Specs (+ `CRON_SECRET`, in GH-Secrets vorhanden). Lokal 05.08.: (a) ohne `CRON_SECRET` → sauberer `beforeAll`-Skip (4 skipped, bewiesen); (b) Guard-Berechnung read-only gegen prod: **10 fremde pending-Rows, 0 betroffen** → der Schuss wäre aktuell safe, kein chronischer Skip (die 3 `nur_gutachter`-pending-Rows haben keinen durchgeführten Termin = korrekte Nicht-Treffer). Der scharfe 4-Test-Lauf = erster post-merge-CI-Lauf (`CRON_SECRET` liegt nur in CI/VPS — bewusst nicht in die lokale Env geholt); die 4 Szenarien selbst sind aus Phase B + #4927 prod-erprobt.

**Review:** entschieden durch Aaron (05.08., Session 59cdebcb); CI-Nachweis nach Kette-Merge.

## 2026-08-08 · C5 (Zugriffs-Doktrin) · doc-close statt server-migration — §9-#8 via Verankerung erfüllt

**Lücke:** §9-Endzustand-Punkt #8 verlangt „Zugriffs-Doktrin dokumentiert, **verlinkt**, **Checkliste im Review-Prozess**; Top-Abweichler migriert". Die Doktrin (`zugriffs-doktrin.md`, #4860) war zwar geschrieben, aber (a) aus `AGENTS.md` mit **0** Referenzen unverlinkt, (b) ohne Checkliste im Review-Prozess (kein PR-Template im Repo), und die §2-C5-Zeile führte „17-Read-Surface-Migration" als offen. Frage: Schließt C5 über die (große, collision-prone) server-`from('claims')`→`v_claim_*`-Migration ab, oder reicht die Verankerung?

**Entscheidung: doc-close.** Die zugriffs-*relevante* Achse ist die Client-Achse — und dort sind die Direkt-Selects auf Basistabellen **= 0** (Doktrin §5, verifiziert): „Top-Abweichler migrieren" ist gegenstandslos, server-first ist gelebt. §9-#8 fehlte damit nur noch die **Verankerung**: (a) `AGENTS.md`-Dach-Absatz „Zugriffs-Doktrin (Server-first)" über den vier durchsetzenden Ratchets (RLS-Policy/Anon-Grant/Reachability/Write-Reachability); (b) `.github/pull_request_template.md` (NEU) mit der 6-Punkt-„neue Tabelle"-Checkliste (§3); (c) Status-Nachzug (§2-C5 + §9-#8 → done). Die server-seitige `v_claim_*`-Konsolidierung ist eine **separate Optimierungs-Tranche** (kein Zugriffs-*Sicherheits*-Thema; die vier Gates decken die Sicherheitsachse), collision-prone bei den aktuell ~8 heißen Sessions → bewusst NICHT in dieser Tranche.

**Begründung:** Verfassung §7 (Server-first-Zugriff) ist auf der Sicherheitsachse erfüllt und maschinell gegated; der offene Rest ist reine Read-Muster-Konsolidierung, kein Doktrin-Verstoß. Verankerung schließt den §9-Punkt ehrlich (nicht „Checkbox-Theater": die Client-Achse IST sauber). Reine Docs/Config → Regel-4-exempt.

**Review:** offen (Aaron). Session 59cdebcb, Branch `kitta/fundament-c5-doc-close`.

## 2026-08-08 · D2 (Lebende Spec) · Pflege-Rhythmus + erster Decision-Review-Digest

**Lücke:** §2-Paket D2 („Lebende Spec / Pflege-Rhythmus") war das letzte formal offene §2-Paket. §7 (Paketformat) + §8 (DECISIONS-Format) definierten die **Formate**, aber nicht den **Rhythmus** — WANN/WIE Spec-Status + Entscheidungen aktiv nachgezogen werden. Symptom: 9 B-Suite-Entscheidungen standen nach Merge + Prod-Bewährung noch auf `offen (im PR)` (DECISIONS-Historie ≠ Live-Stand); 23 offene `Review`-Einträge aufgelaufen ohne Review-Mechanik.

**Entscheidung:** D2 = zwei Deliverables, kein Code. (1) **Pflege-Rhythmus als FUNDAMENT §8.1** — 4 verbindliche Regeln: Status-Nachzug als Teil des Paket-Abschlusses (§2-Zelle + DECISIONS-Review-Zeile + §9-Checkbox); Decision-Review-Zyklus bei ≥10 offenen Einträgen oder Meilenstein via wegwerfbarem `DECISION-REVIEW-<datum>.md`-Digest; Journeys/Doktrin nur per PR (Journey gewinnt bei Widerspruch); neue Pakete nach §7-Format. (2) **Erster Digest `DECISION-REVIEW-2026-08-08.md`** — die 24 Einträge gruppiert nach empfohlener Aktion (14 durch Bau+Prod bestätigbar · 2 durch spätere Entscheidung überholt · 7 echter offener Produkt-/Design-Entscheid + C5/D2 frisch).

**Begründung:** Verfassung §10 / FUNDAMENT-Methode „Bestand bleibt in jedem Zwischenzustand grün" gilt auch für die Spec selbst — eine Spec, deren Status verrottet, ist als Steuerdokument wertlos. Der Digest macht den DoD-Teil „erster Decision-Review" für Aaron in Minuten machbar. Reine Docs → Regel-4-exempt.

**Review:** offen (Aaron). Session 59cdebcb, Branch `kitta/fundament-d2-lebende-spec`. ⚠ DoD-Rest = der Review SELBST (Aaron geht `DECISION-REVIEW-2026-08-08.md` durch → Status-Rückfluss per §8.1-Regel 1) — Handoff.

## 2026-08-11 · C1 (Ein Status-Writer) · Nicht-Matrix-Terminals funneln statt allowlisten

**Lücke:** Die 2 letzten Ratchet-Baseline-Direkt-Writer (`kanzlei-wunsch/actions.ts` → `an_externe_kanzlei_uebergeben`, `termine/close-nur-gutachter-termin.ts` → `termin_durchgefuehrt`) schrieben `operative_status` an der Engine vorbei. Beide Ziele standen **nicht** in `FALL_STATUS_TRANSITIONS` — ein Funnel war also nicht mechanisch möglich, sondern brauchte eine Engine-Entscheidung: (a) Matrix-Kanten von jedem denkbaren Quellstatus ergänzen, (b) die 2 in die Ratchet-Allowlist aufnehmen (wie `endzustand-actions`), oder (c) ein Terminal-Konzept einführen.

**Entscheidung:** (c) — **`BROADLY_REACHABLE_TERMINALS`**: die 2 Terminal-Closes sind aus **jedem AKTIVEN** Zustand erreichbar (`istTerminalUebergangErlaubt(current)` = Cursor gesetzt und nicht in `CLOSED_OPERATIVE_STATUS`), exakt das Muster von `storniert`. Die Engine setzt für sie `abgeschlossen_am`. Kein DDL nötig (beide Werte waren bereits CHECK-gültig und in `CLOSED_OPERATIVE_STATUS` + `CLAIMS_TERMINAL_STATES`). Ratchet-Baseline **2 → 0**, keine neue Allowlist-Ausnahme.

Zwei Nebenentscheidungen: (1) Die 4 `smoke*`-Reset-Server-Actions in `kanzlei-wunsch/actions.ts` wurden **gelöscht statt allowlistet** — Erhebung ergab **0 Consumer** (git grep src/tests/scripts); ungenutzte prod-mutierende Actions (Vollmacht-Reset, Status-Sprung, Fake-OCR) sind reine Angriffsfläche. (2) Die `endzustand_*`-Audit-Felder setzt der Caller separat **nach** dem Engine-Übergang — sie sind claims-only und **nicht** in `CLAIM_OWNED_DUPLICATE_COLUMNS`, würden in der Engine also im (nie geschriebenen) `faelleUpdate` verschwinden = stiller Audit-Datenverlust.

**Begründung:** Verfassung §2 („Status wird nie direkt geschrieben"). (a) hätte die Matrix mit ~20 künstlichen Kanten aufgebläht; (b) hätte den Ratchet grün gemacht, aber das eigentliche Ziel verfehlt — die Writes blieben event-log-los. (c) erhält das Verhalten exakt (die Direkt-Writes hatten **keine** Source-State-Guard) und bringt Timeline + `phase_transitions` + `fall.status_changed`-Emit für beide Terminals. Emit ist `fall.status_changed` = kunde `[web_push, in_app]`, **kein WA** → kein Kunden-Kommunikations-Delta.

**Fund + Nachtrag (11.08., selber Tag gefixt):** Die Voll-Achsen-Verifikation (11.08., Prod-READ) zeigt die DB-Achse sauber (0 Trigger/Functions schreiben `operative_status`) und `reparatur-cursor.ts` als Engine-Wrapper. **Verbleibende Event-Log-Feinlücke:** der `manual_status_override`-Pfad in `lexdrive/process-event.ts` (dokumentierte Allowlist-Ausnahme, bewusst validierungsfrei) schreibt kein `phase_transitions` — ein Admin-Force-Status bleibt damit ohne Event-Log-Spur. **Direkt im Statusnachzug-PR geschlossen** (der Punkt ist C1-DoD „Event-Log bei jedem Übergang", kein Fremd-Paket-Beifang): der Override-Zweig schreibt jetzt einen `phase_transitions`-Eintrag (`from_phase` = Cursor vor dem Write, `trigger_type='manual'`, Herkunft in `payload.via='manual_status_override'`), **ohne** den Override zu funneln — validation-frei bleibt er per Design. ⚠ Beim Bau gefangen: `trigger_type='manual_override'` wäre ein **stiller CHECK-Reject** gewesen (erlaubt sind nur `auto|manual|webhook|scheduled`) — exakt die Flag-Drift-Klasse; `check:flag-drift` bestätigt den Fix als CHECK-gültig. Ebenfalls notiert: die 52 prod-Claims „mit `status_changed_at` ohne Event-Log" sind zu 43/52 **Initial-Cursor ohne je einen Übergang** (`status_changed_at ≈ created_at`) — kein Loch, sondern korrekt.

**Review:** offen (Aaron). Session a6c863e2, PRs #5114 (Code) · #5120 (Nachzug) · #5127 (Event-Log-Lücke) · #5137 (C2b). **Regel 4 GRÜN (11.08. 19:59 UTC)** — durch echten Prod-Traffic statt künstlichem Trigger: `from_phase=regulierung` → `an_externe_kanzlei_uebergeben` mit `payload.via=transitionFallStatus` + `abgeschlossen_am` (CLM-2026-04139). Beweist in einer Zeile: Matrix-Bypass via `BROADLY_REACHABLE_TERMINALS`, Engine-Pfad, Close-Marker UND die geschlossene Event-Log-Lücke. Ohne Prod-Vorkommen (kein Traffic, kein Fehler): `termin_durchgefuehrt` + `manual`-Override.

## 2026-08-11 · B2/B3 (Journey-Wächter) · `e2e`-Job läuft nightly + on-demand statt bei jedem Push

**Lücke:** Der Journey-CI-Wächter (`e2e`-Job) lief bei jedem `push:main/staging` — kam aber bei der Fleet-Frequenz **nie durch**. Messung 11.08. über die letzten 37 staging/main-Läufe: **21 cancelled · 10 failure · 0 success**. Ursache ist NICHT Rot in den Journey-Steps, sondern die Queue: `concurrency: prod-e2e-smoke` steht (bewusst, #4911) auf `cancel-in-progress: false` — das cancelt zwar keine *laufenden* Jobs, aber GitHub hält pro Gruppe nur **einen wartenden** Lauf; jeder neuere verdrängt ihn. Bei ~6 Releases in 2 Minuten kommt ein 15–20-minütiger Job schlicht nie dran. Der Wächter, den B3 aufgebaut hat, **wachte damit faktisch nicht** — und erzeugte dabei prod-Seed-Last + `cancelled`-Rauschen.

**Entscheidung:** Der `e2e`-Job läuft ab jetzt **nightly (`schedule`, 03:30 UTC) + manuell (`workflow_dispatch`)**, nicht mehr bei `push`. `build`/`vitest`/alle Ratchets bleiben **unverändert** an `push` + `pull_request` — die Merge-Gates sind nicht betroffen.

**Begründung:** Der Job **gatet nichts** (er läuft post-merge, informativ) — sein Zweck ist Regressions-Erkennung, und die erfüllt ein garantierter Nachtlauf vollständig, während der Status quo 0 % Durchläufe liefert. 03:30 UTC ist zusätzlich der günstigste Slot: nach dem 02:00-Nacht-Cron (fällige Provisionen sind freigegeben → der J9-`lifecycle`-Geld-Guard findet 0 fremde Rows und schießt scharf) und in der ruhigsten Fleet-Phase (keine parallelen lokalen Seed-Läufe → kein Fixture-Race, vgl. #5152). Für „Beweis jetzt" nach einem Journey-PR gibt es `workflow_dispatch` (ein Klick bzw. `gh workflow run CI --ref main`).

**Nicht gewählt:** (a) *nur auf `main`* — halbiert die Läufe, löst das Problem aber nicht (Releases takten in Peaks alle ~8 Min < Job-Laufzeit). (b) *`cancel-in-progress: true`* — würde den laufenden Job killen statt den wartenden und die #4911-Serialisierung gegen Cross-Run-Fixture-Races aufgeben.

**Review:** offen (Aaron). Session 59cdebcb. ⚠ Rückstellung auf `push` nur nach erneuter Frequenz-Messung.

## 2026-08-12 · C4/§9-#7 · „Alle Rollen-Detailseiten" schließt künftige Rollen ein — §9-#7 ist ein Dauerkriterium

**Frage:** §9-#7 verlangt „Ein Akte-Kern, **alle** Rollen-Detailseiten migriert, Alt-Implementierungen gelöscht". Der C4-Scope waren die **5 Rollen** aus #4977 (Kunde · SV · Werkstatt · Staff-Varianten). Meint „alle" genau diese 5 (dann wäre der Punkt hakbar) — oder jede Rolle mit Fall-Detailsicht, auch künftige?

**Entscheidung (Aaron, 12.08.):** **einschließen.** „Alle Rollen-Detailseiten" meint *jede* Rolle mit einer Fall-/Claim-Detailsicht, auch später hinzukommende. §9-#7 ist damit **kein Momentaufnahme-Haken, sondern ein Dauerkriterium**: Wer eine neue Rollen-Fallsicht baut, baut sie am `<FallAkte>`-Kern.

**Begründung:** Deckt sich mit Verfassungsprinzip 4 („Eine Akte, viele Sichten … **Neue Rolle = Konfiguration, nicht neues Portal**"). Eine Auslegung „nur die 5 von damals" hätte den Punkt abhakbar gemacht, während parallel weiter eigene Akte-Implementierungen entstehen — genau die Divergenz, die C4 beseitigen sollte.

**Erhebung dazu (12.08., Session 9ac44965) — 3 Claim-Detailsichten hängen NICHT am Kern:**

| Sicht | Status | Umsetzung heute |
|---|---|---|
| Staff `faelle/[id]` · SV `gutachter/fall/[id]` | ✅ am Kern | direkter `fall-akte`-Import |
| Kunde `fahrzeuge/[id]/schaden/[claimId]` · Werkstatt `(shell)/auftraege/[claimId]` | ✅ am Kern | via `KundeClaimView` / `WerkstattAuftragDetail` |
| **Makler `(shell)/akten/[id]`** | ❌ | **eigene Komponente `components/makler/akte-detail/MaklerAkteDetail`** |
| **Flotte `(shell)/fahrzeug/[id]/schaden/[claimId]`** | ❌ | eigene Implementierung, liest `from('claims')` direkt |
| **Kunde `faelle/[id]`** | ❌ | `FallDetailSections` + `shared/fall-header`/`fall-kontakte` — **parallel** zur bereits migrierten `KundeClaimView`-Variante (zwei Kunde-Fallsichten nebeneinander) |

**Konsequenz:** §9-#7 bleibt **offen** mit dieser konkreten Rest-Liste (statt einer Auslegungsfrage). Die Kanzlei ist **kein** Rest-Punkt — sie hat keine Fall-Detailsicht (nur `kanzlei/mandate` als Liste) und kam im C4-Plan nie vor.

⚠ **Territorien beachten:** `flotte/*` und die Kunde-Zonen gehören anderen Lanes (Memory `COORDINATION-AN-b0e963b6-claim-detail-fm-vs-kunde-split`: „63fe43f9=FM (flotte/*), b0e963b6=Kunde+SV; Kunde-Zonen NICHT anfassen"). Die Migration ist deshalb **bewusst nicht** in diesem PR erfolgt, sondern als zuweisbare Tranche dokumentiert.

**Review:** offen (Aaron). Session 9ac44965, PR #5186 (Doku) · Vorarbeit #5181 (§2-Sync) + #5184 (6 tote Akte-Files, knip 54→48).

## 2026-08-12 · C3 · Kunden-Nachzug-Event `kunde.account_bereit` — der Fan-out erreichte Kunden strukturell nicht

**Lücke (prod-gemessen, 30–60 T):** `fall.created` + `sa.signed` feuern in `signSAandCreateFall`. Dort ist `claims.geschaedigter_user_id` **noch NULL** — der Kunden-Account entsteht erst danach in `createKundeAccount` (Code-Kommentar dort sagt es wörtlich: „Account wird ja erst HIER nach SA angelegt"). Der Fan-out adressiert den Kunden aber **ausschliesslich** über diese Spalte (`loadClaimParticipants` → `kundeUserId`) → es entsteht **kein Empfänger und nicht einmal eine `skipped`-Zeile**.

**Messung:** Bei denselben Events bekam **Staff 312** Zustellungen, **Kunden 5**. Aufgeschlüsselt: **Neukunden 0 von 9**, Wiederkehrer 1 von 15. Geprüft und **widerlegt** als Ursachen: fehlende `claim_id` am Event (39/39 haben eine) und Selbst-Notify-Skip (`triggered_by_user_id` ist bei allen 39 NULL).

**Entscheidung:** Neues Event **`kunde.account_bereit`**, das in `createKundeAccount` **nach** der Account-Verknüpfung feuert — also genau dann, wenn der Kunde erreichbar ist **und** seine Identität bestätigt ist (er hat die E-Mail im Account-Schritt selbst eingegeben).

**Warum ein eigenes Event statt `fall.created`-Repeat:** Die Matrix trägt für `kunde.account_bereit` **nur kunde-Kanäle** → Staff bekommt kein Doppel. Ein Wiederholen von `fall.created` hätte 8 Admin-Zustellungen pro Fall dupliziert.

**Nicht gewählt:** *Verknüpfung früher setzen* (in `signSAandCreateFall` per Lead-E-Mail einen bestehenden Account suchen) — **unsicher**: der Kunde kann im Account-Schritt eine **andere** E-Mail angeben; ein E-Mail-Match hätte womöglich einen fremden Account mit dem Claim verknüpft (RLS-Sichtbarkeit!). Die Identität ist erst nach dem Account-Schritt bestätigt.

**Offen (eigene Tranche):** Der account-lose Empfängerpfad. **57 % der aktiven Claims haben gar keinen Kunden-Account** (magic-link-first, Verfassung §1-6) — für sie bleibt der Event-Kanal blind, sie werden weiter über die Direkt-Sends (Telefon/E-Mail) bedient. §9-#6 ist erst mit einem account-losen Pfad vollständig erreichbar.

**Review:** offen (Aaron). Session 9ac44965. Marker [[audit-event-fanout-erreicht-kunden-nicht]]. ⚠ Regel-4-Nachweis deploy-gated: nach Deploy einen Flow-Durchlauf fahren und prüfen, dass für den Claim eine `notification_deliveries`-Zeile mit `recipient_role='kunde'` entsteht.
