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
| **J9** | ✅ **CI-Step** (T1) | `provisionen-verrechnung` + `provisionen-staffel` (rein DB, self-cleaning); `lifecycle` = **opt-in** (globaler Release-Cron → Geld-Timing-Effekt, DECISIONS 03.08.) |
| **J5** | 🟡 CI-tauglich, **T2** | `kasko-reparatur-phase-smoke` (read-only) — braucht inline-Login → `fixtures.adminPage` + Fixture-Claim-Persistenz |
| **J8** | 🟡 teils, **T2** | `2fa-enroll-smoke` (konto-isoliert) — braucht Seed-Step `seed-smoke-enroll.mjs` |
| **J10** | 🟡 teils, **T3** | `werkstatt-finder-smoke` — braucht Code-Fix (`db()` liest `.env.local` direkt → `process.env`) |
| **J2** | ⏭️ **begründeter CI-Skip** | echte Meldung/Buchung (`smoke-mini-wizard` testIgnored schreibt Leads; Finder = echte Buchung, opt-in) → Regel-4-opt-in |
| **J3** | ⏭️ **begründeter CI-Skip** | SA/Vollmacht nur eingebettet (`golden-path-completion-prod`, opt-in, mutiert Claim). Signatur-Mechanik läuft ersatzweise über **J4** |
| **J6** | ⏭️ **begründeter CI-Skip** | Kanzlei-Übergabe nur eingebettet + testIgnored-Staging → Regel-4-opt-in |
| **J7** | ⏭️ **Lücke/Skip** | `storno-dsgvo-smoke` = Skeleton (Placeholder-Asserts); DSGVO-Löschung irreversibel → prod-optin auch fertig gebaut |

**Regel-4-opt-in-Weg** für die skippenden Journeys: die jeweiligen Specs manuell mit ihrem Env-Flag (`RUN_GOLDEN_PATH_PROD` / `RUN_STORNO_DSGVO_SMOKE` / `RUN_PROVISION_SMOKE` für lifecycle / …) gegen prod fahren (Wegwerf-Konten, `reserviere()`-Guard schützt echte SVs).

**Tranchen:** **T1** (J9 verrechnung+staffel) = dieser PR. **T2** = J5 (Login-Fix) + J8-`2fa-enroll` (Seed-Step). **T3** = J10-`werkstatt-finder` (+ `.env.local`→`process.env`-Fix). Die Skip-Journeys (J2/J3/J6/J7 + J9-lifecycle) sind mit obiger Begründung §9-konform „begründet, journey-referenziert geskippt".
