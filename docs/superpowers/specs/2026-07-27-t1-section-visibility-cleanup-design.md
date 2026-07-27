# T1 — Section-Visibility Cleanup (Richtung C) — Design

**Datum:** 2026-07-27
**Herkunft:** T1 aus der 9-Rollen-Operativ-Bestandsaufnahme ([[audit-operative-bestandsaufnahme-haftpflicht-9rollen-27-07]]) + State-Map ([[audit-t1-section-visibility-state-map-27-07]]).
**Entscheidung (Aaron 27.07.):** Richtung **(C) — löschen + Realität formalisieren**.

## Goal (ein Satz)

Die tote Rollen-Whitelist-Schicht von `src/lib/fall/section-visibility.ts` entfernen und den einzigen echten Consumer (Admin-`ProzessTab`) direkt auf die nützliche, rollen-agnostische Trigger-Logik setzen — **verhaltens-neutral** (kein Nutzer sieht danach etwas anderes).

## Warum (C) und nicht A/B

`getVisibleFallSections(fall, rolle, subphase)` = `getTriggeredFallSections(subphase, fall) ∩ ROLLE_SECTION_WHITELIST[rolle]`. Aber:

- **Einziger Consumer, der aus dem Ergebnis rendert:** `ProzessTab.tsx:25` — und der übergibt hart `'admin'`.
- **Admin-Whitelist = alle 8 Sections** → `triggered ∩ {alle 8} = triggered`. Die Whitelist ist **selbst für ihren einzigen Consumer ein No-op**.
- `kb`-Whitelist = identisch admin (gleicher Prozess-Umfang), wird aber nie erreicht (ProzessTab hardcodet 'admin').
- `sv`-Zweig: `FallDetailClient.tsx:205` berechnet `visibleSections`, **referenziert es nie** (Dead Var; SV-Cards sind ad-hoc phasen/status-gated).
- `kunde`/`makler`-Whitelists: nie importiert. `dispatch`/`flottenmanager`/`kanzlei`/`werkstatt`: nicht mal im `FallVisibilityRolle`-Union — sie haben **eigene RLS-gegatete ViewModels** (Kunde-Zonen, `getFlottenClaimView`, `v_werkstatt_auftrag`, MaklerAkteDetail).

Die „eine-Section-Wahrheit-für-5-Rollen" existiert also **nicht** — es ist ein Single-Consumer-Admin-Helper, dessen Gating-Schicht nichts tut. (A) würde 4 live Views zurückbauen, (B) das Kunde-Zonen-Modell (686 LOC/Rolle) verachtfachen — beide hohes Risiko für ein Gate, das nur Admin je hatte.

## Architektur / was bleibt vs. geht

**BLEIBT (die nützliche Hälfte):**
- `FallSectionKey` (die 8 Section-Keys) + `FallPhaseInput`.
- **`getTriggeredFallSections(subphase, fall)`** — rollen-agnostisch, berechnet aus Phase + Falldaten, WELCHE Sections gerade relevant sind. Das ist echte, geteilte Logik. Bleibt exportiert.

**GEHT (die tote Rollen-Gating-Schicht):**
- `FallVisibilityRolle` (Rollen-Union).
- `ROLLE_SECTION_WHITELIST` (die 5 Whitelists — 4 davon unerreichbar).
- `getVisibleFallSections` (= triggered ∩ whitelist).
- `isFallSectionVisible` (nur Wrapper um getVisibleFallSections; **Consumer prüfen** — s. Task-Plan; falls genutzt, auf `getTriggeredFallSections(...).includes(section)` umstellen).
- `src/lib/fall/prozess-section-visibility.ts` (deprecated Wrapper `getVisibleProzessSections`, **0 Consumer**) — komplett löschen.

## Änderungen pro File (verhaltens-neutral)

1. **`src/lib/fall/section-visibility.ts`** — Rollen-Union + Whitelist + `getVisibleFallSections` + `isFallSectionVisible` entfernen; `getTriggeredFallSections` + `FallSectionKey` + `FallPhaseInput` behalten. Header-Kommentar auf die neue Realität aktualisieren.
2. **`src/app/faelle/[id]/_tabs/ProzessTab.tsx:25`** — `getVisibleFallSections(fall, 'admin', subphase)` → `getTriggeredFallSections(subphase, fall)`. **Beweis No-op:** admin-Whitelist = alle 8 → identische Ausgabe.
3. **`src/app/gutachter/fall/[id]/FallDetailClient.tsx:205`** — die tote `visibleSections`-Var (+ deren `getVisibleFallSections`-Import) entfernen. Keine Nutzung → keine Verhaltensänderung.
4. **`src/lib/fall/prozess-section-visibility.ts`** — File löschen (0 Consumer). knip-Baseline ggf. senken.
5. **`src/lib/fall/section-visibility.test.ts`** — Whitelist-/`getVisibleFallSections`-Tests entfernen; `getTriggeredFallSections`-Tests behalten/erweitern.
6. **Consumer-Sweep vor Delete:** `git grep -n "getVisibleFallSections\|isFallSectionVisible\|FallVisibilityRolle\|getVisibleProzessSections\|prozess-section-visibility"` — jeder Treffer außerhalb (2) muss vorher migriert/entfernt sein (State-Map: nur ProzessTab rendert, SV = dead var, permissions/* = comment-only, wrapper = 0). Der Plan verifiziert das erneut gegen origin/main zur Implementierungszeit.

## Bewusst NICHT in Scope (YAGNI)

- **Die 4 Bespoke-ViewModels bleiben unangetastet** (Kunde-Zonen, Flotte, Werkstatt, Makler) — sie sind der akzeptierte Ist-Zustand, RLS-gegatet, live.
- **`src/lib/permissions/` (AAR-752)** — der schon-designte Nachfolger gatet auf **Tab/Resource**-Ebene (`'prozess'`), nicht per-Section. Das Falten des Tab-Zugriffs dorthin ist ein **eigener Folge-Task**, kein Teil dieses Cleanups (Rollen-Zugang zu ProzessTab ist heute schon Route-/Portal-Guard-gegatet).
- **`src/lib/fall/subphase-visibility.ts`** — separate Achse (Phasen-*Label*-Namespaces, eigene `EXTERN_ROLLEN`), nicht betroffen.
- **Kein neues Gating** — es wird nichts ersetzt, nur totes entfernt. Falls `kb` je *weniger* als admin sehen soll, ist das ein künftiger expliziter Gate (AAR-752), nicht diese tote Whitelist.

## Error-Handling / Daten-Fluss

Kein Runtime-/DB-/Fehlerpfad betroffen — reine Typ-/Funktions-Entfernung + ein Call-Site-Rewrite. `getTriggeredFallSections` bleibt pure (kein I/O).

## Testing

- **Unit:** `getTriggeredFallSections`-Tests bleiben grün (Phase/Daten → Section-Set). Whitelist-Tests entfallt (getestete Funktion existiert nicht mehr).
- **Build/CI:** tsc fängt jeden übersehenen Consumer (Import ins Leere). knip-Ratchet bestätigt die gelöschten Files.
- **Regel-4-Prod-Smoke (Abschluss-Kriterium):** Admin öffnet einen Claim in verschiedenen Phasen → `/faelle/[id]` ProzessTab rendert **dieselben** Sections wie vor dem PR (Screenshot-Vergleich pro Phase). Test-Konto smoke-admin. Da es ein Verhaltens-No-op ist, ist „identisch" das Erfolgskriterium.

## Erfolgs-Kriterium

`section-visibility.ts` exportiert nur noch `getTriggeredFallSections` (+ Typen); `prozess-section-visibility.ts` gelöscht; ProzessTab rendert unverändert; tsc/knip/CI grün; Prod-Smoke: Admin-ProzessTab pro Phase identisch. Netto: totes Rollen-Gating weg, Code ehrlich, AAR-752 hat freie Runway.
