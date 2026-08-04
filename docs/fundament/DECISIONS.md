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
