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

1. **J7 Storno/DSGVO — echte Lücke** (kein E2E). Kritisch: DSGVO-Löschung ist rechtlich sensibel + hatte den Silent-Fail-Incident (#4625). → B1-Skeleton `storno-dsgvo-smoke.spec.ts` mit Stages (Storno→`storniert`; Löschantrag→Bestätigung→Ausführung), begründeter Skip wo dev-nicht-automatisierbar.
2. **J3/J6 nur eingebettet** — SA/Vollmacht + Kanzlei-Übergabe laufen nur als Teil der Golden-Path-Kette, kein isolierter Wächter. Bei Bedarf ausgründen (der 6-WhatsApp/P1.1-Fix + der Kanzlei-Funnel/C1 brauchen einen fokussierten Smoke).
3. **Abrechnungsweg-Weiche (J5)** + **Ranking/Reservierung (J10)** — die Netzwerk-Modell-Neuerungen (P1.4 harter Override, „Dein Netzwerk") haben noch keinen Smoke; kommen mit dem Netzwerk-Lane-Bau (P0).

## Nächste B1-Schritte (nach dieser Matrix)

- **Journey-Schritt-Referenzen** in die Kern-Specs (DoD „kein Spec ohne Journey-Schritt-Referenzen"): je Spec ein Header-Kommentar `// Journey: J<N> Schritt <k>`.
- **J1 + J4 grün nachweisen** (DoD): `RUN_GOLDEN_PATH_PROD=1 … npx playwright test golden-path-prod` + `reparatur-weg-e2e-smoke` — Kommando + Output in den B1-PR. Braucht die Test-Account-Passwörter (Env).
- **J7-Skeleton** anlegen (begründeter Skip für dev-nicht-automatisierbare Schritte).
- „Name"-Zuordnungen (J2/J5/J8/J9/J10) durch kurzes Spec-Lesen bestätigen.

## Scope
B1 = Oracle (Zuordnung + Lücken + grüner Nachweis für J1/J4). **Kein** Produktions-Code-Umbau — das ist C.
Diese Matrix ist Schritt 1; sie ist parallel-sicher (nur diese Docs-Datei + später Test-Header/Skeletons).
