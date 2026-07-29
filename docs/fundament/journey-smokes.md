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
| **J1** Haftpflicht e2e | `golden-path-prod` · `golden-path-deep-prod` · `golden-path-completion-prod` · `smoke-vollstrecke` · `smoke-orchestrator-prod` | **voll** (Lead→SV→Gutachten→QC→Kanzlei→Abschluss) | prod-optin (`RUN_GOLDEN_PATH_PROD=1` + `TEST_SV_PASSWORD`) | ✅ gelesen |
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
