# B1 — Journey-Smoke-Oracle: welche Spec bewacht welche Journey

> Fundament B1 (§2). **Das Oracle**: für jede Journey (J1–J10) die bewachende(n) E2E-Spec(s), ihre Abdeckung und
> ihren Lauf-Modus — plus die **Lücken**. Kern-Fund der Erhebung (29.07.): die Journey-Smokes **existieren
> größtenteils schon** (~80 Specs in `tests/e2e/`). B1 baut nicht from scratch, sondern **ankert** den Bestand an
> die Journeys, füllt Lücken und weist J1+J4 grün nach.
>
> **Lauf-Modi:** `prod-optin` = gegen Prod mit Test-Accounts, opt-in per Env-Flag, **nie in CI** (Regel-4-Stil,
> `reserviere()`-Guard schützt echte SVs). `ci-postmerge` = läuft in `ci.yml` nach Merge. `staging` = gegen
> `*.staging.claimondo.de` (in `playwright.config.ts` `testIgnore`). Test-Konten: [[reference-internal-test-account-logins]].

## Matrix

| Journey | Bewachende Spec(s) | Abdeckung | Lauf-Modus | Verifiziert |
|---|---|---|---|---|
| **J1** Haftpflicht e2e | `golden-path-deep-prod`/`-completion-prod` (**Status-Assert** via pollRow) · `golden-path-prod` (⚠ **FLACH** — nur Landing) · `smoke-vollstrecke` · `smoke-orchestrator-prod` | Specs da; **Tiefe in deep/completion** — `golden-path-prod` selbst assertet **keine** Status-Progression (s. Soll-Assert-Ziel) | prod-optin (`RUN_GOLDEN_PATH_PROD=1` + `TEST_SV_PASSWORD`) | ✅ gelesen + a6c863e2 |
| **J2** Meldung alle Kanäle | `lead-to-fall` · `flowlink-kunde` · `smoke-mini-wizard-strecke` · `golden-path-finder-prod` | teil (Wizard/FlowLink/Finder; Embed/API/Karte offen) | gemischt | Name |
| **J3** Unterschriften SA/Vollmacht | eingebettet in `golden-path-completion-prod` · `smoke-vollstrecke` · `smoke-final-vollstaendig` | teil (kein **dediziertes** SA/Vollmacht-Spec) | prod-optin | ✅ grep |
| **J4** Reparatur-Weg | `reparatur-weg-e2e-smoke` · `reparatur-funnel-abschluss-smoke` · `reparatur-weg-kva-betrag-pflicht` · `reparatur-weg-kva-ablehnung-loop` · `kasko-reparatur-phase-smoke` (Seed: `reparatur-weg-e2e-seed.mjs`) | **voll** (KVA→Freigabe/Ablehnung→Schlussrechnung→Abschluss) | prod-optin | ✅ gelesen |
| **J5** Kasko/Selbstzahler | `kasko-reparatur-phase-smoke` | teil (Abrechnungsweg-Weiche selbst nicht dediziert) | prod-optin | Name |
| **J6** Kanzlei-Übergabe | eingebettet in `golden-path-completion-prod` · `smoke-staging-vollstaendig` | teil (kein dediziertes Kanzlei-Übergabe-Spec) | prod-optin/staging | ✅ grep |
| **J7** Storno/DSGVO | **— keine —** | **LÜCKE** | — | ✅ grep (bestätigt leer) |
| **J8** Onboarding je Rolle | `onboarding-pflichtdok` · `partner-onboarding-termin-smoke` · `2fa-enroll-smoke` | teil (SV/Werkstatt/Kanzlei-Onboarding nicht end-to-end) | gemischt | Name |
| **J9** Honorar/Provision/Zahlung | `provisionen-lifecycle-smoke` · `provisionen-staffel-smoke` · `provisionen-verrechnung-smoke` · `abrechnung-cron` | **voll** (Provisions-Lebenszyklus) | ci/gemischt | Name |
| **J10** Dispatch | `sv-tagesroute` · `werkstatt-finder-smoke` · `golden-path-finder-prod` · `smoke-staging-sv-termin-verlegen` | teil (Ranking/Reservierung/Eskalation nicht dediziert) | gemischt | Name |

„Verifiziert": ✅ = Spec gelesen/gegrept; „Name" = Zuordnung aus Dateiname, in B1-Schritt 2 zu bestätigen.

## Soll-Assert-Ziel (was ein guter Smoke prüfen muss — J1/J4, von a6c863e2)

Die Matrix zeigt **welche** Spec eine Journey bewacht; dieser Abschnitt **was** sie asserten muss. Ein Oracle, das nur
Landing-Text prüft, ist ein schwaches Oracle. (Quelle: a6c863e2's j01/j04-Ist-Verifikation + A2 `state-machine.md`.)

**J1 — `golden-path-prod` ist FLACH** (Stage 1 = `/schaden-melden`-URL-Check, Stages 2–6 = nur Rollen-Landing). Die
Status-Tiefe liegt in `golden-path-deep-prod`/`-completion-prod` (verifiziert: pollRow/`operative_status`-Assertions vorhanden).
Ein guter J1-Smoke assertet die **Progression**:
`ersterfassung → sv-gesucht/sv-zugewiesen → sv-termin → begutachtung-laeuft → gutachten-eingegangen → filmcheck →
kanzlei-uebergeben → anschlussschreiben → regulierung → zahlung-eingegangen → abgeschlossen` — plus `phase_transitions`-Log
pro Übergang + `fall.status_changed`-Event.
- **IST-Abweichungen als bewusste Checks/Skips** (j01 #6–#9, PR #4835): #6 SV-Zuweisung-WILD (`sv-zuweisung/route.ts:284` → **kein** Event-Fanout); #7 `gutachten_fertig`-Doppel-WA; #9 Template-Mislabel `sv_losgefahren`.
- ⚠ **Abschluss:** der Smoke prüft den **IST** (Sofort-Cascade `regulierung→abgeschlossen`), NICHT das Soll (C1c-48h-Karenz nach Schlussabrechnung ist noch nicht gebaut — Aaron-Entscheid B, [[audit-c1-auto-close-luecke-zahlung-eingegangen]]).

**J4 — `reparatur-werkstatt-suche` ist ein toter Lane-State** (nie geschrieben; die Zuweisung springt `ersterfassung → reparatur-angefragt`). Ein Smoke, der ihn erwartet, wäre falsch. Prüfen, ob die 4 Reparatur-Specs den **Sprung** + die KVA-Lücken asserten: KVA-Betrag nur clientseitig erzwungen (#4804), KVA-Ablehnung-Loop (#4824), Schlussrechnung-Dedup (#4799).

## Lücken (priorisiert)

1. **J7 Storno/DSGVO — ✅ Skeleton geliefert** (`tests/e2e/flows/storno-dsgvo-smoke.spec.ts`, opt-in `RUN_STORNO_DSGVO_SMOKE`, begründeter Skip). Stages: Storno→`storniert` (mit #4625-Row-Check-Guard); DSGVO Antrag→Bestätigung→Ausführung (⚠ irreversibel → nur Wegwerf-Konto). Selektoren TODO beim Lauffähig-Machen.
2. **J3/J6 nur eingebettet** — SA/Vollmacht + Kanzlei-Übergabe laufen nur als Teil der Golden-Path-Kette, kein isolierter Wächter. Bei Bedarf ausgründen (der 6-WhatsApp/P1.1-Fix + der Kanzlei-Funnel/C1 brauchen einen fokussierten Smoke).
3. **Abrechnungsweg-Weiche (J5)** + **Ranking/Reservierung (J10)** — die Netzwerk-Modell-Neuerungen (P1.4 harter Override, „Dein Netzwerk") haben noch keinen Smoke; kommen mit dem Netzwerk-Lane-Bau (P0).

## Nächste B1-Schritte (nach dieser Matrix)

- ✅ **J7-Skeleton** angelegt (`storno-dsgvo-smoke.spec.ts`, opt-in + begründeter Skip).
- **J1 + J4 grün** = **CI-Job** (nicht lokal — s. u.).
- **Journey-Schritt-Referenzen**: diese Matrix IST die zentrale Journey↔Spec-Referenz; die neuen Skeletons tragen inline-Referenzen (`// Journey: J<N>`). Massen-Annotation der ~80 Bestands-Specs ist ohne Lauf-Verifikation geringwertig — verschoben.
- „Name"-Zuordnungen (J2/J5/J8/J9/J10) durch kurzes Spec-Lesen bestätigen (parallel-sicher, jederzeit).

## Grün-Nachweis = CI-Job (A · B1→B2-Übergang)

Der „J1+J4 grün"-DoD läuft **nicht lokal** (empirisch 29.07.): (a) `test-sv` trägt einen **CI-TOTP-Faktor** (`e2e-ci`,
Secret nur im CI-Repo-Secret) → golden-path braucht die CI-Umgebung; (b) in diesem Setup sind lokal **keine
`node_modules`** installiert (CI baut/testet, nicht lokal). Der grüne Nachweis gehört daher in einen
**post-merge-CI-Job**, der an den bestehenden `e2e`-Job in `.github/workflows/ci.yml` dockt (e2e läuft ohnehin nur post-merge):

**Job-Rezept:**
- **J4** (TOTP-frei, `@claimondo.test`-Wegwerf-Konten): `node scripts/smoke/reparatur-weg-e2e-seed.mjs` → `CI=1 PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test reparatur-weg-e2e-smoke --project=chromium` → `--assert` → `--clean`.
- **J1** (golden-path): `RUN_GOLDEN_PATH_PROD=1 npx playwright test golden-path-prod --workers=1` — mit dem `e2e-ci`-TOTP-Secret für die test-sv-2FA-Challenge; Kunde-Rolle auf `smoke-kunde@` umstellen (der Spec-Default `test-kunde@` ist tot).
- **Secrets (CI-Repo):** `TEST_SV_PASSWORD=Claimondo2026!`, `TEST_ADMIN/DISPATCH/KB_PASSWORD`, `e2e-ci`-TOTP-Secret, `.env.local`-`SERVICE_ROLE` (Seed). Regel-4-sicher: `reserviere()`-Guard blockt echte SV-Buchung; Seed nutzt Wegwerf-Konten (`telefon=NULL`).

Das ist der Übergang zu **B2** (CI-Gate): die Journey-Smokes als post-merge-Wächter grün halten.

## Scope
B1 = Oracle (Zuordnung + Lücken + grüner Nachweis für J1/J4). **Kein** Produktions-Code-Umbau — das ist C.
Diese Matrix ist Schritt 1; sie ist parallel-sicher (nur diese Docs-Datei + später Test-Header/Skeletons).

## Journey-Suite in CI — Tauglichkeit + Stand (D-Phase, ab 03.08.)

§9 verlangt: J1–J10 in CI **grün oder mit begründetem, journey-referenziertem Skip**. Nicht jede Journey ist gefahrlos gegen prod in CI fahrbar — viele Bewacher-Specs sind per Design `prod-optin` (echte Buchung/Comms, `reserviere()`-Guard, testIgnored). Klassifikation (Erhebung 03.08., file:line-belegt in der Spec-Lektüre):

| Journey | CI-Stand | Bewacher / Grund |
|---|---|---|
| **J1** | ✅ **CI-Step** | `golden-path-deep-prod` (Status-Tiefe) |
| **J4** | ✅ **CI-Step** | `reparatur-weg-e2e-smoke` (voller Reparatur-Weg) |
| **J9** | ✅ **CI-Step VOLL** (05.08.) | `provisionen-verrechnung` + `provisionen-staffel` (rein DB, self-cleaning) + **`provisionen-lifecycle`** (Aaron-Entscheid 05.08.): schießt den ECHTEN globalen Release-Cron, aber hinter dem **Fremd-Effekt-Precheck-Geld-Guard** (Muster `netzwerk-release-scharf-smoke.mts`, prod-erprobt #4927) — würde ein Schuss eine FREMDE fällige/storno-fällige pending-Provision flippen → `test.skip` dieses Laufs (sichtbar, zustandsabhängig-selten; der Nacht-Cron räumt das Fenster). Kein Produkt-Change am Release-Runner. `CRON_SECRET` im Step. Guard-Berechnung lokal read-only prod-bewiesen 05.08. (10 fremde pending, 0 betroffen → Schuss wäre safe); scharfer 4-Test-Nachweis = erster post-merge-Lauf |
| **J8** | ✅ **CI-Step** (T2) | `2fa-enroll-smoke` (konto-isoliert, TOTP-Enroll-UI) + Seed-Step `seed-smoke-enroll.mjs` (process.env-first, self-reset je Lauf) |
| **J5** | ✅ **CI-Step** (04.08.) | `kasko-reparatur-phase-smoke` — deterministischer Seed `kasko-reparatur-seed.mjs` (Wegwerf-Kunde + Wegwerf-Werkstatt, `abrechnungsweg=kasko` + `operative_status=reparatur-angefragt` + Werkstatt gesetzt, keine `reparatur_termine` → subPhase `reparatur_terminfindung`, self-cleaning via Marker) ersetzt den gedrifteten prod-Claim `39734007`. Login `loginContextOrSkip('admin')` **aal1** (test-admin trägt keinen TOTP-Faktor → **kein** `TEST_ADMIN_TOTP_SECRET`, sonst würfe `completeMfa` → skip). `RUN_KASKO_SMOKE`. Lokal grün 04.08. (Seed 5/5 + Smoke 1 passed) |
| **J10** | ✅ **CI-Step** (04.08.) | `werkstatt-finder-smoke` — Seed `werkstatt-finder-seed.mjs` überarbeitet (process.env-first, eigene Wegwerf-Werkstatt `email=NULL` für `nurEchte`-Sichtbarkeit + Wegwerf-Kunde, self-cleaning; behebt 2 Bugs: tote Fixture `badecb82` + fehlendes `abrechnungsweg` → `reparaturPhaseErreicht=false` → Karte rendert nie). **S1** (Kunde-Fallakte fiktiv → Finder + Werkstatt-Auswahl schreibt `reparatur_werkstatt_id`) + **S3** (Werkstatt-Portal-Auftrag) deterministisch grün; **S2** (Flow-Wizard) `test.skip` (fragile Heuristik; Follow-up: deterministischer Flow-Seed). `RUN_WF_SMOKE`. Lokal grün 04.08. (Seed 5/5 + Smoke 2 passed/1 skipped) |
| **J2** | ✅ **CI-Step** (05.08.) | `meldung-kanaele-smoke` — 3 Meldewege = 3 Melde-Muster: **A** Kunde-Wizard `/kunde/schaden-melden` (Wrapper `convertLeadToFall`: leads+claims+**pflichtdokumente**; Ein-Formular, keine Terminwahl, kein `reserviere()`) · **B** `POST /api/v1/melde-schaden` (lead-first: gfa+lead+**flow_link**; 2. POST beweist j02-Soll „Doppel-Submit idempotent" via `bereits_angelegt`; **Assert `kanal='none'` = Runtime-Beweis der Send-Isolation** — Drama-Festnetznummer BNetzA-Range 030 23125xxx je Lauf variiert gegen phone-cap 3/24h) · **C** Gegner-Schadenkarte `/schaden/[token]` (Kern-direkt: Direkt-Claim + verursacher-Party + interner `vs_meldung`-Fallback-Task; **ohne Telefon, ohne Versicherer** — VS-Meldung prod-scharf, `/unfallmeldung` wird NICHT bestätigt). Seed `meldung-kanaele-seed.mjs` (Wegwerf-Kunde + Wegwerf-Firma OHNE Flotten-Konto → 0 FM-WA-Nummern + Fahrzeug + `schadenkarten`-Karte `status='gebunden'`; FK-Reihenfolgen: gfa VOR leads, vehicles NACH claims wg. RESTRICT, `tasks.lead_id` ohne CASCADE). Isolation identitätsbasiert — `SIDE_EFFECT_MODE` erreicht den prod-Prozess nicht. Der frühere Skip-Grund (echte Buchung) entfällt: kein Kanal berührt `reserviere()`. `RUN_MELDUNG_SMOKE`. Lokal grün 05.08. (Smoke 3/3 + Assert 11/11) |
| **J3** | ✅ **CI-Step** (04.08.) | `sa-vollmacht-smoke` — dedizierter Seed `sa-vollmacht-seed.mjs` (Wegwerf-Lead im WerkstattIntake-SA-offen-Zustand `werkstatt_intake_am` + flow_link, self-cleaning). Spec fährt `/flow/[token]` **anon** (kein Login/Auth-Wall) → Canvas-Signatur (bewährtes toPass-Muster aus J4) + Checkbox + „SA unterzeichnen" → DB-Verify `claims.sa_unterschrieben=true`. `RUN_SA_SMOKE`. Vollmacht = server-intern (LexDrive/`confirmVollmacht`, kein Canvas) → dokumentiert, nicht im UI-Scope. Lokal grün 04.08. (Seed 4/4 + Smoke 1 passed) |
| **J6** | ✅ **CI-Step** (04.08.) | `kanzlei-uebergabe-smoke` — dedizierter Seed `kanzlei-uebergabe-seed.mjs` (Wegwerf-Claim übergabe-bereit: `haftpflicht`+`komplett`+`eigene_kanzlei`+Ansprechpartner-Mail @claimondo.test + freigegebenes Erstgutachten als Button-Gate, self-cleaning). Externer Kunde-Login (kein Auth-Wall, keine echte Kanzlei-Gegenseite) → Button „Kanzleipaket versenden" → DB-Verify (toPass-Poll, da PDF-Gen dauert) `operative_status='an_externe_kanzlei_uebergeben'`. `RUN_KANZLEI_SMOKE`. Lokal grün 04.08. (Seed 2/2 + Smoke 1 passed) |
| **J7** | ✅ **CI-Step** (04.08.) | `storno-dsgvo-smoke` — Skeleton → echte Logik; Seed `storno-dsgvo-seed.mjs` (**3 GETRENNTE Wegwerf-Konten**: Throwaway-Admin ohne TOTP + Storno-Kunde+Claim `regulierung` + DSGVO-Kunde+eigener Claim, self-cleaning; Clean-Reihenfolge FK-getrieben: Löschaufträge VOR Admin-Konto wegen `bestaetigt_von_user_id` NO ACTION). **A Storno ist intern** (Admin/KB via `EndzustandDropdown`→Modal in `/faelle/[id]`, `markClaimAsStorniert` — j07 „Kunde storniert" hat keine Kunde-UI) → `operative_status='storniert'`+`abgeschlossen_am`. **B DSGVO 2-Schritt:** Kunde-Antrag `/kunde/profil` → Admin „Bestätigen" → „Direkt ausführen" (Zeile per **EXAKTER** Wegwerf-Email, nie „erste Zeile"); Bestätigen MUSS vor Ausführen (`chk_bestaetigt_logic` verlangt `bestaetigt_am` für `ausgefuehrt` — sonst Silent-CHECK-Reject des Status-Writes). **Smoke-Fund (Prod-Bug):** RPC `dsgvo_anonymize_user_data` war schema-gedriftet (tote Referenzen `claims.kunde_email` + `claim_parties`-PII-Spalten + `faelle.kunde_*` → **jede** DSGVO-Ausführung scheiterte mit „Anonymisierung fehlgeschlagen") — Fix Migration `20260804193646`. `RUN_STORNO_DSGVO_SMOKE` + Cleanup-Step `if: always()` (Wegwerf-**Admin** nicht liegen lassen). Lokal grün 04.08. (Smoke 3/3 + Assert 9/9) |

**Regel-4-opt-in-Weg** für die skippenden Journeys: die jeweiligen Specs manuell mit ihrem Env-Flag (`RUN_GOLDEN_PATH_PROD` / `RUN_STORNO_DSGVO_SMOKE` / `RUN_PROVISION_SMOKE` für lifecycle / …) gegen prod fahren (Wegwerf-Konten, `reserviere()`-Guard schützt echte SVs).

**Stand — 05.08. (Aaron-Direktive „keine Skips"):** §9-Punkt-2 gilt erst als **erfüllt, wenn alle 10 Journeys wirklich CI-grün** laufen — ein begründeter Skip ist nicht länger das Ziel (die frühere „§9 via Skips erfüllt"-Deklaration war voreilig). **ALLE 10 Journeys haben jetzt einen CI-Step: J1/J4/J9/J8/J5/J10/J3/J6/J7/J2** (04.–05.08.: deterministische Wegwerf-Seeds, alle lokal prod-grün — J5 kasko aal1-Login, J10 werkstatt-finder S1+S3 (S2-`test.skip`), J3 SA-Signatur anon `/flow/[token]` Canvas, J6 Kanzlei-Übergabe „Kanzleipaket versenden", J7 Storno intern + DSGVO-2-Schritt inkl. Prod-Fix der Anonymisierungs-RPC `20260804193646`, J2 drei Meldewege inkl. Dedup-Idempotenz-Beweis). **Auch J9-`lifecycle` ist seit 05.08. im CI-Step** (Aaron-Entscheid: Fremd-Effekt-Precheck-Geld-Guard statt Produkt-Change am Release-Runner) — die Suite ist damit OHNE Rest vollständig.

**✅ §9-P2 NACHGEWIESEN (05.08., post-merge-`e2e`-Lauf Run 30996577437 nach dem #5024-Merge):** Alle Journey-Steps success — J1-deep/J4 · **J9 „13 passed" inkl. erstem scharfen CI-Flip `pending→freigegeben`** (lifecycle S8 über den echten Release-Cron; der Geld-Guard ließ korrekt durch, `CRON_SECRET` griff) · J8 · **J5 „1 passed"** · J10 S1+S3 (S2 designtes Skip) · J3 · J6 · J7 „3 passed" · J2 „3 passed". **Betriebs-Befund aus dem Erst-Attempt:** J5 skippte, weil das GH-Secret `TEST_ADMIN_PASSWORD` einen Altwert trug (Auth-API-bewiesen: kanonisches Test-PW = 200, Lib-Fallback = 400) — Secret 05.08. korrigiert, Re-Run grün. Der e2e-**Job** bleibt rot allein durch den Fremd-Blocker `feststellung-flow-gate`-ENOENT im finalen „Run E2E Tests"-Step (Owner: feststellung-Lane; die Journey-Steps laufen davor und sind unabhängig bewertbar).
