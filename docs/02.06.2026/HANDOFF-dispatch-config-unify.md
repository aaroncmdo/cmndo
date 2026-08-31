# HANDOFF — Dispatch-Leads × Flowlink Config-Unify (Strecke B)

**Stand:** 2026-06-02 · **Worktree:** `.claude/worktrees/dispatch-leads-config-unify` · **Memory:** `project_dispatch_config_unify`

---

## 0. TL;DR — wo anfangen

Die **komplette `?v2`-Strecke (P0–P2c) ist gebaut + live-verifiziert** — der Dispatcher hat einen config-getriebenen, flachen, frei editierbaren Lead-Form mit Autosave + nicht-blockierenden Flags, **sicher hinter `?v2`** neben der Live-Phasen-UI.

**Nächster Schritt:** **P2e** (OCR-always-DB-Fix, §8b) — ACHTUNG: erster **LIVE**-Kunden-Change der Strecke (nicht `?v2`-gated). Danach P2d → P2f → P3-Cutover. Reihenfolge von Aaron bestätigt: **P2e → P2d → P2f → P3**.

**Branch-Muster:** jede Sub-Phase = eigener Branch **off frischem `origin/staging`** + eigener PR (`--base staging`). Grund: die Strecke wird **squash-gemergt** → frühere Commits sind keine Ancestors; immer off aktuellem staging branchen (sonst Konflikt/Doppel-Diff). Nie selbst mergen (Merge-Session ownt das).

---

## 1. Was gebaut wurde (P0–P2c)

| Phase | Inhalt | PR | Stand |
|---|---|---|---|
| **P0** | `onboarding_felder.audience`(kunde\|dispatcher\|beide, default `beide`, CHECK) + `.sektion`; `filterFelderByAudience`-Helper (TDD); beide Kunden-Loader filtern `'kunde'` | #2186 | ✅ merged |
| **P1** | Feld-Inventar-Seed: unified Flow `lead-erfassung` (9 Sektion-Phasen + **63 Felder**, audience/sektion, db_target=leads); + Spalten `leads.gegner_telefon`/`.gegner_email` | #2191 | ✅ merged |
| **P2a** | `DispatchLeadForm` Skeleton (flach, sektion-Akkordeons, read-only) + `FieldRenderer` aus WizardClient extrahiert (shared) + `ladeFlowPhasen(flowKey,audience)` generalisiert + `page.tsx ?v2`-Gate | #2197 | ✅ merged · **Smoke PASS** |
| **P2b** | `saveDispatchLeadFelder` (Allowlist+db_target serverseitig aus onboarding_felder; Boolean-/Number-Coercion; Auth+SA-Lockdown) + debounced Autosave 700ms + Save-Indikator; **Fix** bevorzugter_kanal-Optionen | #2205 | ✅ merged · **Autosave-Smoke PASS** (DB-Round-Trip) |
| **P2c** | `DispatchGatesPanel`: Warn-Badges (eigenverschulden/kein_schaden) + manuelles disqualifiziert-Flag + read-only Vollständigkeits-Indikator (`computeQualificationStatus` reuse) | #2215 | 🟢 **offen, MERGEABLE** |

**Architektur (Aaron-Entscheidung):** *eine Config, zwei Renderer.* `onboarding_felder` ist die einzige Definition. Kunde-Flowlink (`beauftragung`, gestuft/simpel) bleibt vorerst unverändert; Dispatcher liest dieselbe Schema-Mechanik aus der neuen Flow `lead-erfassung` (flach, audience `dispatcher`/`beide`). Spec: `docs/superpowers/specs/2026-06-01-dispatch-leads-config-unify-design.md`.

---

## 2. Offene Aufgaben

### P2e — OCR-always-DB-Fix (§8b) · ⚠️ ERSTER LIVE-CHANGE
**Problem (verifiziert):** `Zb1UploadField` schreibt die OCR-Extraktion via `uploadDokumentViaAnfrageToken('fahrzeugschein')` token-basiert auf den Lead — ABER `confirmZb1Korrekturen(fallId)` + `clearZb1Felder(fallId)` (Korrektur / Neu-Fotografieren) brauchen eine `fallId`, die im **Pre-Fall-Flowlink nicht existiert** → No-op → **Kunden-Korrekturen am OCR gehen verloren**.
**Soll:** token-basierte Varianten von `confirmZb1Korrekturen`/`clearZb1Felder` (auf den Lead, nicht fallId-gated).
**Files:** `src/app/kunde/onboarding-details/zb1-actions.ts` (+ token-Variante), `src/components/onboarding/fields/Zb1UploadField.tsx` (token statt fallId nutzen wenn kein fallId), ggf. `src/app/upload/dokumente/[token]/actions.ts`.
**ACHTUNG:** **nicht `?v2`-gated** — fasst den Live-Kunden-OCR-Flow an (`/flow/[token]`, kunde-onboarding). Eigener Smoke Pflicht (Kunde lädt ZB1 → korrigiert → reload → Korrektur persistiert). Unabhängig von P2b/c → kann off staging gebaut werden.

### P2d — Rich-Sektionen (groß, der UX-Kern)
Die Platzhalter-Felder im `DispatchLeadForm` durch die echten Dispatch-Komponenten als Sektion-Inhalte ersetzen:
- `termin` (sektion termin_sv) → **`SvDispatchPanel`** (SV-Vorschläge + Slot-Reservierung; ersetzt den TerminField-Platzhalter, der ohne token „Link ungültig" zeigt).
- Unfallskizze → `UnfallskizzeCard` (generiert, sektion unfall).
- `zeugen_kontakte` (jsonb) → `ZeugenKontakteEditor` (sektion unfall; in P1 als Special markiert, NICHT geseedet).
- `wunschtermin_wochentage` (int[]) → Pill-Multiselect (in P1 NICHT geseedet).
- Place-Autocomplete (unfallort/besichtigungsort/kunde-Adresse), Kennzeichen-Parts, Versicherungs-Autocomplete → die bestehenden Dispatch-Inputs.
- KundenMatch + Gesprächsleitfaden als Sektion-Inhalte.
Baut auf P2b/c (gleiche `DispatchLeadForm`) → off staging NACH P2c-Merge.

### P2f — Checkliste vor Flowlink-Versand (§8c)
„erfasst / offen"-Übersicht (welche Felder fehlen) + **Anforder-Buttons** (`triggerDokumenteUploadRequest`/`dokumente-anfordern`) — nicht-blockierend, Versand jederzeit möglich.

### P3 — Cutover · ⚠️ HIGH-STAKES, LIVE, Aaron-Freigabe
`/dispatch/leads/[id]` rendert default `DispatchLeadForm`; `?v2`-Gate entfernen; die Phasen-Maschinerie **entfernen** (`DispatchShell`, `_lib/qualification-engine` als UI-Steuerung, `initialPhase`, `_phases/*`-Gating, hard-gate-Gating — Flag-Logik bleibt als Badge). **Nur nach grünem Voll-Smoke** (CMM-44-Lesson: Reader-Sweep vor Drop).
**§9-Risiko:** Disqualifikations-**Reporting/Triage**, das heute auf `qualifizierungs_phase='disqualifiziert'` filtert, MUSS auf das manuelle Flag umgestellt werden — sonst „verschwinden" disqualifizierte Leads nicht mehr aus den Queues.

### P4 — Re-Smoke + (später) Kunden-Cutover
Re-Smoke beider Renderer; (später) Kunden-Flowlink auf `lead-erfassung` umstellen + **i18n** nachziehen (P1 seedete nur deutsche Labels, `i18n=null`).

---

## 3. Wichtige Fakten / Gotchas (vom Bau gelernt)

1. **Boolean-Coercion (§D.1):** `groupFelderByTarget` schreibt `segmented`-Werte als String. Bool-`leads`-Spalten (schaden_sichtbar, polizei_vor_ort, *_flag, fahrzeug_fahrbereit, ist_fahrzeughalter, zeugen, hat_vorschaeden, whatsapp_verfuegbar, aufklaerung_teilschuld_bestaetigt, disqualifiziert) brauchen Coercion `'true'/'false'->bool`. **`checkbox`-Typ ist hier NICHT nutzbar** (coerct zu TIMESTAMPTZ). → in `saveDispatchLeadFelder` gelöst (`coerceVal`).
2. **Seeded Enum-Werte MÜSSEN den CHECK der TARGET-Spalte matchen** (nicht den der Quell-Spalte!). P2b-Bug: `bevorzugter_kanal` hatte `'anruf'` (vom `gutachter_finder_anfragen`-Feld), aber `leads.bevorzugter_kanal` CHECK = `whatsapp/sms/email` → Korrektur-Migration `20260601210356`. **Vor jedem neuen Write-Pfad gegen Live-CHECKs prüfen** (`pg_get_constraintdef`).
3. **`zb1-upload`-Feld:** db_target=`leads.kennzeichen`, aber der Wert ist ein OCR-Marker-Objekt — der generische Save **überspringt** zb1-upload (der OCR-Endpoint schreibt kennzeichen). Das manuelle `kennzeichen`-Textfeld deckt die Spalte.
4. **Sentinels `_termin`/`_finalize`** (termin/SA) sind keine leads-Spalten → fallen im Save automatisch raus (Termin = SvDispatchPanel/P2d, SA = eigener Flow).
5. **Squash-Merge-Timing:** PRs werden squash-gemergt; frühere Commits sind danach keine Ancestors von staging. Jede Sub-Phase **off frischem `origin/staging`** branchen + cherry-picken falls nötig.
6. **Worktree-Gates:** `npm run build` OOMt im Worktree → **`tsc --noEmit`** ist das lokale Gate; `knip` lokal nicht lauffähig (Binary fehlt) → CI ist autoritativ. `check:token-audit` + `check:component-set -- --ratchet` laufen lokal.
7. **DDL/Seed nur via Plugin** (`apply_migration`), Filename == recorded version (kein Twin-Drift). `execute_sql` nur READ.

---

## 4. Smoke / Verifikation

- **Smoke-Script:** `scripts/smoke-dispatch-v2-staging.mjs` (untracked; im Worktree). `node scripts/smoke-dispatch-v2-staging.mjs` (Render) bzw. `DO_AUTOSAVE=1 node …` (Autosave-Test).
- **Dispatcher-Login (staging):** `test-dispatch@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` (2FA aus). Staging-Basic-Auth: `aaroncmdo` / `ClaimondoSuperuser123789!!`. URL `app.staging.claimondo.de`.
- **Test-Lead:** `c1964512-23af-4973-bf37-ff62d80599d5` (Aaron Sprafke, nicht-konvertiert).
- **Verifiziert:** P2a-Render = PASS (Sektionen + Prefill + audience-Filter, 0 Errors). P2b-Autosave = PASS (Notiz getippt → „Gespeichert ✓" → `leads.notiz` persistiert, DB-Round-Trip). Screenshots: `docs/02.06.2026/smoke-dispatch-v2/`.
- **Kosmetik:** Smoke hinterließ „smoke 23:23:53" in `leads.notiz` des Test-Leads — harmlose Test-Spur.
- **Smoke offen:** P2c (Gates-Panel-Render) + P2d/e/f nach jeweiligem Merge+Deploy.

---

## 5. Konstanten / Koordination

- **Supabase:** Projekt `paizkjajbuxxksdoycev`. **PR immer `--base staging`**, nie main, **nie selbst mergen** (Merge-Session ownt; merged auf `build`-grün, e2e-fail auf PRs ist Prod-False-Negative).
- **Migrationen dieser Strecke:** `20260601190655` (audience/sektion), `20260601194119` (gegner-Kontakt), `20260601194200` (phasen), `20260601194358` (63 felder), `20260601210356` (bevorzugter_kanal-Fix) — alle live appliziert + getrackt.
- **Viele aktive Sessions** auf dispatch/leads/monika-embed → vor jeder Schema-Migration `information_schema` live prüfen; geteilte Ressource = `onboarding_felder`.
- **7-Punkt-Audit** pro Commit, **Umlaute** in UI-Strings, **Server-Actions = Result-Object** (`{ok}`), neue UI via `primitives`/`shared` (FieldRenderer-Reuse).

## 6. Referenzen
- Memory: `project_dispatch_config_unify` (laufender Verlauf).
- Spec: `docs/superpowers/specs/2026-06-01-dispatch-leads-config-unify-design.md`.
- Pläne: `docs/superpowers/plans/2026-06-01-dispatch-config-unify-{p0-schema,p1-feld-inventar,p2a-skeleton}.md`.
- PRs: #2186, #2191, #2197, #2205, #2215.
- Kern-Files: `src/lib/onboarding/lade-flow-phasen.ts`, `src/components/onboarding/FieldRenderer.tsx`, `src/app/dispatch/leads/[id]/DispatchLeadForm.tsx` + `DispatchGatesPanel.tsx` + `_actions/dispatch-lead-felder.ts`.
