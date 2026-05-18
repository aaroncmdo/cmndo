# CMM-44 SP-B PR2a — Call-Site-Inventur Cluster a (Workflow/Zuweisung)

**Datum:** 18.05.2026  
**Branch:** kitta/cmm-44-spb-pr2a-workflow  
**Spalten (27):** makler_id, betreuungspaket, notizen, prioritaet, onboarding_complete, status_changed_at, google_review_gesendet, datenschutz_akzeptiert, datenschutz_akzeptiert_am, interne_notizen, ist_aktiv, deaktiviert_am, deaktiviert_grund, deaktiviert_notiz, szenario, service_typ, geschlossen_grund, bevorzugter_kanal, sprache, fallakte_angelegt_am, google_review_prompt_gezeigt_am, sv_zugewiesen_am, kundenbetreuer_fallback_flag, kundenbetreuer_zugewiesen_am, eskaliert_an_admin_id, eskaliert_am, eskaliert_grund

## Legende

- **A** — Direkt-Select aus `faelle`, nur SP-B-Spalten → auf `claims` umstellen
- **B** — Direkt-Select aus `faelle`, gemischt → SP-B-Spalten in claims-Nested-Block ziehen
- **C** — Write auf `faelle` mit SP-B-Spalten → auf `claims` umstellen
- **D** — Nested `faelle(...)`-Select von anderer Tabelle → SP-B auf claims umstellen
- **E** — View-Read (v_claim_full / v_faelle_mit_aktuellem_termin etc.) → PR1 bereits repointed, kein Code-Change
- **F** — Reines TypeScript / JSX / Property-Zugriff (kein DB-Call) → kein Change

---

## Pattern C — Writes auf `faelle` mit SP-B-Spalten

| Datei:Zeile | Spalten | Muster |
|---|---|---|
| src/app/faelle/[id]/_actions/core.ts:66-70 | ist_aktiv, deaktiviert_am, deaktiviert_grund, deaktiviert_notiz | C |
| src/app/faelle/[id]/_actions/core.ts:90-93 | ist_aktiv, deaktiviert_am, deaktiviert_grund, deaktiviert_notiz | C |
| src/app/faelle/[id]/_sidebar/eskalation-actions.ts:55-62 | eskaliert_an_admin_id, eskaliert_am, eskaliert_grund | C |
| src/app/faelle/[id]/_sidebar/eskalation-actions.ts:88-91 | eskaliert_an_admin_id, eskaliert_am, eskaliert_grund | C |
| src/lib/whatsapp.ts:412-414 | google_review_gesendet | C |
| src/lib/communications/channel-router.ts:53 | bevorzugter_kanal | C |
| src/app/api/webhooks/twilio/status/route.ts:55 | bevorzugter_kanal | C |
| src/lib/faelle/state-machine.ts:79 | status_changed_at (via splitOrKeepFaelleUpdate → CLAIM_OWNED_DUPLICATE_COLUMNS erweitern) | C |
| src/lib/faelle/state-machine.ts:114-115 | geschlossen_grund (via splitOrKeepFaelleUpdate) | C |
| src/lib/faelle/kb-assignment.ts:66-71 | kundenbetreuer_fallback_flag, kundenbetreuer_zugewiesen_am | C |
| src/app/gutachter/team/actions.ts:65-69 | sv_zugewiesen_am | C |
| src/app/api/sv-zuweisung/route.ts:233-244 | sv_zugewiesen_am | C |
| src/lib/actions/sv-lead-ablehn-actions.ts:87-91 | sv_zugewiesen_am | C |
| src/app/faelle/[id]/_actions/prozess.ts:162-168 | geschlossen_grund | C |
| src/app/kunde/onboarding/actions.ts:513-524 | onboarding_complete (read-filter + write) | C |
| src/lib/kanzlei-wunsch/actions.ts:542-546 | onboarding_complete | C |
| src/app/kunde/faelle/[id]/google-review-actions.ts:13-16 | google_review_prompt_gezeigt_am | C |
| src/lib/leads/convert-lead-to-fall.ts:93-107 | kundenbetreuer_fallback_flag, kundenbetreuer_zugewiesen_am | C |
| src/lib/lead-fall-mapping.ts:221-228 | sv_zugewiesen_am, service_typ (faelle INSERT — SP-B-Spalten entfernen, claims-Write ergänzen) | C |
| src/lib/actions/dispatch-fall-actions.ts:428 | service_typ | C |

## Pattern B — Direkt-Selects aus `faelle`, gemischt mit non-SP-B

| Datei:Zeile | Spalten | Muster |
|---|---|---|
| src/app/admin/faelle/(hub)/page.tsx:113 | ist_aktiv, deaktiviert_grund | B |
| src/app/admin/finance/(hub)/offene-faelle/page.tsx:46 | status_changed_at | B |
| src/lib/claims/get-kunde-faelle.ts:140 (FALL_SELECT) | onboarding_complete, szenario | B |
| src/lib/claims/get-kunde-faelle.ts:378 | onboarding_complete, szenario, google_review_gesendet, service_typ | B |
| src/app/kunde/layout.tsx:90 | sprache | B |
| src/app/kunde/layout.tsx:73-78 | onboarding_complete (Filter-Query) | B |
| src/app/kunde/onboarding/actions.ts:509-517 | onboarding_complete (Filter-Query) | B |
| src/lib/analytics/sv-performance.ts:53 | sv_zugewiesen_am | B |
| src/lib/actions/storno-actions.ts:206 | sv_zugewiesen_am | B |

## Pattern A — Direkt-Select aus `faelle`, nur SP-B-Spalten

_(keine reinen SP-B-only-Selects gefunden — alle Selects enthalten auch non-SP-B-Felder)_

## Pattern D — Nested `faelle(...)`-Select von anderer Tabelle

_(keine D-Hits für die 27 SP-B-Spalten gefunden)_

## Pattern E — View-Reads (kein Code-Change nötig, PR1 hat Views bereits repointed)

| Datei:Zeile | Spalten | Muster |
|---|---|---|
| src/lib/fall/stepper-state.ts:79 | sv_zugewiesen_am via v_faelle_mit_aktuellem_termin | E |
| src/app/admin/_components/KritischeUpdatesWidget.tsx:44 | sv_zugewiesen_am via v_faelle_mit_aktuellem_termin | E |
| src/app/admin/statistiken/page.tsx:156 | sv_zugewiesen_am, schadens_ursache via v_claim_full | E |
| src/app/faelle/page.tsx:78 | service_typ via v_claim_listing | E |
| src/app/faelle/[id]/_prozess/Sections.tsx:129 | service_typ (fall-Objekt aus v_faelle_mit_aktuellem_termin) | E |
| src/app/gutachter/feldmodus/_fallakte/actions.ts:85 | szenario, notizen via faelle-Select mit claims-Embed | E |
| src/app/gutachter/heute/page.tsx:158 | szenario via faelle-Select mit claims-Embed | E |
| src/app/gutachter/feldmodus/page.tsx:143 | szenario via faelle-Select mit claims-Embed | E |

## Pattern F — Reines TypeScript/JSX (kein DB-Call, kein Change)

| Datei:Zeile | Spalten | Muster |
|---|---|---|
| src/app/admin/faelle/(hub)/FaelleKanban.tsx | ist_aktiv, deaktiviert_grund (Props, kein DB-Call) | F |
| src/app/faelle/[id]/FallContext.tsx:32 | service_typ (Interface-Feld) | F |
| src/lib/fall/subphase-resolver.ts | szenario (Parameter-Typ) | F |
| src/lib/fall/section-visibility.ts | szenario (Parameter-Typ) | F |
| src/components/makler/akte-detail/MaklerAkteDetail.tsx | service_typ (Prop-Zugriff) | F |
| src/lib/smoke/lifecycle-seed.ts | onboarding_complete (Seed-Objekt, kein prod-Write) | F |
| src/lib/customer/jetzt-zu-tun.ts | onboarding_complete (Parameter-Typ) | F |
| Alle `prioritaet`-Hits in tasks/mitteilungen-Tabellen | prioritaet (andere Tabelle, nicht faelle) | F |
| Alle `notizen`-Hits in admin_termine / sachverstaendige / rueckrufe | notizen (andere Tabellen) | F |
| `ist_aktiv`-Hits in sachverstaendige / versicherungen | ist_aktiv (andere Tabellen) | F |
| `deaktiviert_am/grund`-Hits in sachverstaendige | deaktiviert_am/grund (sachverstaendige-Tabelle) | F |

## Seed/Test-Data (kein prod-Schreibpfad, aber korrektness-Hinweis)

| Datei:Zeile | Spalten | Muster |
|---|---|---|
| src/app/api/admin/create-test-fall/route.ts | sv_zugewiesen_am, onboarding_complete, datenschutz_akzeptiert, datenschutz_akzeptiert_am | C* (Test-Pfad) |
| src/app/api/seed-testdata/route.ts | sv_zugewiesen_am | C* (Test-Pfad) |

---

## Zusammenfassung

- **A-Pattern:** 0 Call-Sites
- **B-Pattern:** 9 Call-Sites in 7 Dateien
- **C-Pattern:** 20 Call-Sites in 15 Dateien
- **D-Pattern:** 0 Call-Sites
- **E-Pattern:** 8+ (Views bereits korrekt durch PR1)
- **F-Pattern:** 12+ (kein Change nötig)
