# Funnel v3 Backlog — Live-Status

**Stand:** 2026-05-12 (wird laufend aktualisiert)
**Bezugsplan:** `docs/plans/funnel-vollmacht-im-wizard-2026-05-12.md`

## Übersicht — alle PRs Funnel v2 + v3

### Funnel v2 (Plan: `docs/plans/funnel-vereinfachung-2026-05-11.md`)

| PR | Was | Status |
|---|---|---|
| #787 | DB: gutachter-finden 5 → 3 Phasen | ✅ merged |
| #788 | findSvsForLocation Server-Action (Tier-aware Matching) | ✅ merged |
| #789 | Slot-Engine + Tier-aware SlotField | ✅ merged |
| #790 | Datenabhängiger Onboarding-Loader (ladeNoetigePhasen) | ✅ merged |
| #791 | flow/[token] Redirect zu /kunde/onboarding-details | ✅ merged |
| #792 | Plan-Doc: Lead-/Claim-Phasen-Verantwortlichkeiten | ✅ merged |

### Funnel v3 (Plan: `docs/plans/funnel-vollmacht-im-wizard-2026-05-12.md`)

| PR | Was | Status |
|---|---|---|
| #793 | DB: Service+Kanzlei-Phasen im Wizard (5 statt 3) | ✅ merged |
| #794 | kanzlei_wunsch-Propagation + Mandat-Push nach Wizard-Submit | ✅ merged |
| #795 | Dispatcher-Realtime auf gutachter_finder_anfragen | ✅ merged |
| #796 | Onboarding-Loader-Skip via db_target.spalte | ✅ merged |

### Backlog (Plan v3 Erweiterung)

| PR | Was | Status |
|---|---|---|
| #797 | Tier-1-Iso-Halos prominent + Marker-Differenzierung | ✅ merged |
| #798 | FlowWizardKfz als DEPRECATED markieren | ✅ merged |
| #799 | conversion_events Tabelle + Tracking-Hook | ✅ merged |
| — | **ZB1-OCR-Field-Type im Wizard** | ⏳ pending (~3h) |
| — | **Mehr Onboarding-Phasen (Fotos, Polizei, Gegner)** | ⏳ pending (~4-6h) |
| — | **220 TS-Errors aufräumen + ignoreBuildErrors raus** | ⏳ Subagent läuft |

## Was steht offen

### 1. ZB1-OCR-Field-Type im DynamicWizard (~3h)

**Warum:** Kunde fotografiert Fahrzeugschein → OCR liest Kennzeichen, FIN, Hersteller, Modell, Baujahr, Lackfarbe, Halter → schreibt direkt in `vehicles` + `faelle`. Reduziert Onboarding-Phasen, weil Fahrzeug-Daten dann skipt werden via `ladeNoetigePhasen`.

**Was existiert schon:**
- `/upload/dokumente/[token]/actions.ts` — OCR-Endpoint mit Cardentity-Integration (Token-basiert)
- `CardentityTypBButton` im Dispatcher-Phase4 — selber Trigger im Power-User-UI
- `Phase4Stammdaten.tsx` — Fahrzeug-Render-Preview-Pattern

**Was zu bauen:**
- Neuer Field-Type `zb1-upload` in `src/components/onboarding/fields/Zb1UploadField.tsx`
- Server-Action `triggerZb1Ocr(fallId, fotoBlob)` → reused existing endpoint
- DB-Phase ergänzen: `flow_key='kunde-onboarding'`, neue Phase `fahrzeug` (reihenfolge=5) mit field_type='zb1-upload'
- Conditional-Skip: wenn `vehicles.kennzeichen_aktuell` schon gesetzt, Phase überspringen (passiert automatisch via `ladeNoetigePhasen`)

### 2. Mehr Onboarding-Phasen (~4-6h)

**Was zu bauen:**

| Phase | Felder | Field-Types | OCR? |
|---|---|---|---|
| `fotos` | mind. 4 Schadensfotos | `multi-file-upload` | nein |
| `polizei` | nur wenn `polizei_vor_ort=true` | `file-upload` (Polizei-Tachenkarte) | ja (TBNR, Aktenzeichen, Schuldfrage) |
| `gegner` | Gegner-VS, Aktenzeichen, Halter | `text` + `file-upload` (Grüne Karte) | ja (VS + Aktenzeichen) |
| `werkstatt` (optional) | Werkstatt-Adresse falls geplant | `place-autocomplete` | nein |

**Reihenfolge in `flow_key='kunde-onboarding'`:**
1. `fahrzeug` (ZB1-OCR) — NEU
2. `hergang` — existiert
3. `polizei` — NEU
4. `gegner` — NEU
5. `fotos` — NEU
6. `service` — existiert
7. `kanzlei` — existiert (Conditional)
8. `sa` — existiert

### 3. 220 TS-Errors aufräumen (Subagent)

**Status:** Subagent `kitta/aar-ts-cleanup-post-polish-v2` läuft seit ~30min im Hintergrund.

**Auftrag (siehe Subagent-Prompt):**
- Errors auf 0 bringen (aktuell ~220 Cascading-Folgen aus PRs #771-775)
- `typescript.ignoreBuildErrors: true` aus `next.config.ts` entfernen
- Lokaler Build muss durchlaufen
- PR auf main mergen

**Wenn der Subagent fertig ist:** Status hier updaten + nächstes Item starten (ZB1-OCR).

## Sequenz nach Subagent-Completion

1. Subagent meldet TS-Cleanup fertig → PR mergen
2. Diesen Doc-Status updaten
3. **PR #800ish: ZB1-OCR-Field-Type** starten
4. PR mergen
5. **PR #801ish: Mehr Onboarding-Phasen** starten (Fotos + Polizei + Gegner)
6. PR mergen
7. Backlog ist dann komplett — neue Themen sind eigene Pläne

## Längerfristige Pläne (NICHT in diesem Sprint)

- **Tier-2 Basic-SV-Onboarding** (`docs/plans/sv-basic-tier.md`) — 7 PRs, ~19h
- **Realtime-Push KB→Kunde** während Onboarding — Pattern aus PR #795 wiederverwenden
- **Admin-Dashboard /admin/analytics/conversion** mit Drop-Off-Funnel — visualisiert conversion_events
- **FlowWizardKfz löschen** — frühestens 2026-05-26 (2 Releases nach Deprecated-Marker)

## Live-Verifikation

Nach Subagent + #69 + #70:

- `/gutachter-finden` zeigt Mapbox mit 9 Tier-1 (Gold-Star) + 62 Tier-3 (grau) Markern
- 5-Phasen-Wizard: standort → termin → service → kanzlei → kontakt
- Wizard-Submit → konvertiereAnfrageZuFall → Magic-Link + WhatsApp-Vollmacht (LexDrive) parallel
- Kunde Magic-Link-Login → `/kunde/onboarding-details`
- Onboarding zeigt nur was wirklich fehlt (skippt was Dispatcher/OCR/Wizard schon erfasst hat)
- Dispatcher sieht in Echtzeit (Toast + Sound bei Konvertierung)
- conversion_events sammelt anonyme Drop-Off-Daten
