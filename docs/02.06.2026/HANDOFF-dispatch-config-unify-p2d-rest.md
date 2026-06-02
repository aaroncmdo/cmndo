# HANDOFF — Dispatch Config-Unify: Reststrecke P2d-2b / P2d-3 / P2d-4 / P2f / P3

**Stand:** 2026-06-02 · **Memory:** `project_dispatch_config_unify` · **Worktree:** `.claude/worktrees/dispatch-leads-config-unify`

---

## 0. TL;DR — wo anfangen

Der config-getriebene flache Dispatcher-Form (`DispatchLeadForm`, hinter `?v2` auf `/dispatch/leads/[id]`) ersetzt schrittweise die alte 6-Phasen-UI. **P0–P2c + P2e + P2d-1 + P2d-2 sind merged + live-gesmoked.** Die **Override-Architektur steht** (siehe §2) — die Reststrecke folgt exakt dem Muster.

**Nächster Schritt: P2d-2b** (`kennzeichen`-Parts), dann **P2d-3** (Sektion-Panels), dann **P2f** + **P3-Cutover**. Jede Sub-Phase = eigener Branch **off frischem `origin/staging`** + eigener PR `--base staging` (squash, **nie selbst mergen**).

**WICHTIGSTE LEKTION (sonst rote CI):** Vor JEDEM PR lokal `npm run check:token-audit` **UND** `npm run check:check:component-set -- --ratchet` fahren — nicht nur `tsc`/`vitest`. Rohes Inline-Hex in `style={{}}` (auch Status-Farben!) blockt den Token-Audit → `var(--brand-danger, #c0392b)` / `var(--brand-success, #1a7a35)` (beide echte Tokens, `css-vars.ts`). Das hat P2d-2 (#2244) einen CI-Zyklus gekostet.

---

## 1. Was gelaufen ist

| Phase | Inhalt | PR | Stand |
|---|---|---|---|
| P0/P1/P2a/P2b/P2c | audience/sektion-Schema · lead-erfassung-Seed (9 Sektionen, 63 Felder) · DispatchLeadForm-Skeleton · Save+Autosave · Gates→Flags | #2186/#2191/#2197/#2205/#2215 | ✅ merged |
| **P2e** (re-scoped) | Dispatcher-ZB1-Foto-Feld ausblenden (audience `kunde`); das urspr. token-confirm/clear war toter Pfad → verschoben auf P4 | #2229 | ✅ merged + verifiziert |
| **P2d-1** | `termin` → `SvDispatchPanel` (statt TerminField „Link ungültig") | #2236 | ✅ merged + Smoke PASS |
| **P2d-2** | `gegner_versicherung` + `besichtigungsort_adresse` + `unfallort` → Autocomplete | #2244 | ✅ merged + Smoke PASS (live) |
| **P2d-Plan** | Architektur + Decomposition + 3 offene Entscheidungen | Branch `kitta/dispatch-config-unify-p2d-plan` (Commit 0aca82b60) | 🔵 **Aaron-Review offen** |

Plan-Doc (Architektur-Detail): `docs/superpowers/plans/2026-06-02-dispatch-config-unify-p2d-rich-sektionen.md` (auf dem `…p2d-plan`-Branch).

---

## 2. Die Override-Architektur (das Muster — exakt nachbauen)

**Zwei Mechanismen, beide in `DispatchLeadForm`, der geteilte `FieldRenderer` bleibt REIN** (er bedient auch den Kunden-Flow!):

### (A) Field-Override-Map (für einzelne Felder → Rich-Input)
- `src/app/dispatch/leads/[id]/_v2/dispatch-field-override-keys.ts` — **pure** Liste `DISPATCH_FIELD_OVERRIDE_KEYS` + `hasDispatchFieldOverride(feldKey)`. Pure (keine Component-Imports) → unit-testbar. Test: `_v2/dispatch-field-overrides.test.ts`.
- `src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.tsx` — `OVERRIDES: Record<DispatchOverrideKey, (feld, ctx) => ReactNode>` (der `Record`-Typ **erzwingt** keys↔map-Sync via tsc) + `renderDispatchFieldOverride(feld, ctx)`.
- `DispatchFieldCtx = { leadId, lead: Record<string,unknown>, hardGateOk, hardGateDetails, aktiverTermin, wunschterminIso, wunschterminWochentage }` — `lead` = volle Row für Initialwerte.
- `DispatchLeadForm` Feld-Loop: `if (hasDispatchFieldOverride(feld.feld_key)) return renderDispatchFieldOverride(feld, ctx)` **vor** dem `FieldRenderer` → das Override-Feld läuft NICHT über den generischen Autosave (es self-saved).
- **Wrapper-Komponenten** (`_v2/Dispatch*Field.tsx`) self-saven via **`saveStammdaten`** (`_actions/stammdaten.ts`, Allowlist `STAMMDATEN_ALLOWED_FIELDS` — Spalten VORHER prüfen!) + zeigen Status über `_v2/OverrideFieldShell` (Eyebrow-Label 1:1 wie `fields/TextField` + saving/saved/error). Ausnahme: `termin` → `SvDispatchPanel` ownt eigene Actions (`_actions/sv-termin.ts`).

Bestehende Overrides: `termin`(SvDispatchPanel), `gegner_versicherung`(VersicherungAutocomplete), `besichtigungsort_adresse`+`unfallort`(GooglePlaceAutocomplete via `DispatchPlaceField` target-param).

### (B) Sektion-Injektion (für Panels, NICHT an EIN Feld gebunden) — **NEU in P2d-3**
Noch nicht gebaut. Plan: ein `SEKTION_PANELS: Record<phaseKey, (ctx)=>ReactNode[]>` in `DispatchLeadForm`, das nach den Feldern einer Sektion bespoke Panels rendert (Unfallskizze, Zeugen-Editor, Wunschtermin-Pills).

---

## 3. Reststrecke (der Reihe nach)

### P2d-2b — `kennzeichen`-Parts (Field-Override)
Extrahiere `KennzeichenPartsField` aus `src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx:382-499` (+ helpers `parseKennzeichen`/`buildKennzeichen` aus `@/lib/format/kennzeichen`) nach `src/components/shared/KennzeichenPartsInput.tsx` (Boy-Scout: beide Consumer migrieren). Dann Override für `kennzeichen` (Eigen-Fahrzeug). Spalten `kennzeichen, kennzeichen_kreis, kennzeichen_buchstaben, kennzeichen_zahl, kennzeichen_suffix` — **alle in der saveStammdaten-Allowlist** (verifiziert). **`gegner_kennzeichen` hat KEINE Parts-Spalten** → als Text-Feld lassen (kein Override).

### P2d-3 — Sektion-Panels (Mechanismus B, der UX-Kern)
- **`UnfallskizzeCard`** (`_phases/UnfallskizzeCard.tsx`, props `leadId, unfallhergang, initialSvg, initialBestaetigt, initialGeneriertAm`; eigene Actions generate/approve/clear) → in Sektion **Unfallhergang**.
- **`ZeugenKontakteEditor`**: extrahieren aus `Phase4Stammdaten.tsx:255-361` (props `leadId, initialKontakte: {name,telefon?,email?,notiz?}[]`, `leads.zeugen_kontakte` jsonb, save via `saveStammdaten`) → Sektion **Unfallhergang**, **nur wenn** `values['zeugen']==='true'`.
- **Wunschtermin-Pills**: extrahieren aus `Phase2TerminServiceTyp.tsx:191-237` (`leads.wunschtermin_wochentage` int[] ISO 1=Mo..7=So, save via `saveStammdaten`) → Sektion **Termin & Besichtigung**.
- **Kein neues Seeding** — `zeugen_kontakte`/`wunschtermin_wochentage` sind Spalten, keine Felder; die Editoren pflegen sie direkt.

### P2d-4 — Kontext-Panels (Plan-Entscheidung 2 → empfohlen SEPARAT)
`KundenMatchCard` (`_sidebar/KundenMatchCard.tsx`) + `Gesprächsleitfaden` (`_sidebar/SidebarStubs.tsx` + `GespraechsleitfadenTimer.tsx`) sind **Sidebar-Widgets mit `useDispatchPhase()`-Kontext**, den die flache Form NICHT hat. Empfehlung: eigenes „Dispatcher-Sidebar-v2"-Ticket, NICHT in die Feld-Config. (Gesprächsleitfaden müsste de-phase-context-et werden.)

### P2f — Checkliste vor Flowlink-Versand (§8c)
„erfasst/offen"-Übersicht (welche Felder fehlen) + **Anforder-Buttons** (`triggerDokumenteUploadRequest`/`dokumente-anfordern`) — nicht-blockierend, Versand jederzeit.

### P3 — Cutover (⚠️ HIGH-STAKES, Aaron-Freigabe, nur nach grünem Voll-Smoke)
`/dispatch/leads/[id]` rendert default `DispatchLeadForm`; `?v2`-Gate entfernen; Phasen-Maschinerie entfernen (`DispatchShell`, `_lib/qualification-engine` als UI-Steuerung, `initialPhase`, `_phases/*`-Gating — die Flag-Logik bleibt als Badge). **§9-Risiko:** Disqualifikations-Reporting/Triage, das heute auf `qualifizierungs_phase='disqualifiziert'` filtert, MUSS auf das manuelle `disqualifiziert`-Flag umgestellt werden (sonst „verschwinden" disqualifizierte Leads nicht mehr aus den Queues). CMM-44-Lesson: Reader-Sweep vor Drop.

### P4 — Kunden-Flowlink → lead-erfassung + token-confirm/clear (§8b) + i18n (später)
Wenn der Kunden-Flowlink `lead-erfassung` **pre-fall** rendert (kein fallId), wird das token-basierte `confirmZb1KorrekturenViaToken`/`clearZb1FelderViaToken` nötig (`dokument_upload_anfragen.token`→`lead_id`, Muster: `uploadDokumentViaAnfrageToken`). **Bis dahin nicht bauen** (dead/un-smoke-bar — das war der Grund für P2e-Re-Scope). P1 seedete nur deutsche Labels (`i18n=null`) → i18n nachziehen.

---

## 4. Harte Regeln / Gotchas

1. **Vor JEDEM PR lokal:** `npx tsc --noEmit` (Build OOMt im Worktree) + `npx vitest run <pattern>` + **`npm run check:token-audit`** + **`npm run check:component-set -- --ratchet`**. Die letzten zwei NICHT vergessen (P2d-2-CI-Fail). Inline-hex in `style={{}}` → `var(--brand-*, #fallback)`.
2. **Branch-Muster:** jede Sub-Phase off **frischem `origin/staging`** (squash-merge → frühere Commits sind keine Ancestors). PR `--base staging`. **Nie selbst mergen** (Merge-Session ownt; merged auf `build`-grün, `e2e` läuft gegen Prod = kein PR-Gate).
3. **Override-Felder NICHT im generischen Autosave** (`saveDispatchLeadFelder`) — sie self-saven via `saveStammdaten`/eigene Action + revalidieren selbst. Der `hasDispatchFieldOverride`-Short-Circuit in DispatchLeadForm verhindert das Doppel-Save (Override-Keys haben `db_target.tabelle='leads'` → würden sonst doppelt geschrieben).
4. **Smoke = post-merge+deploy** (Code-Change → Staging hat es erst nach VPS-Deploy, ~10 min Lag). Deploy-Detektor-Muster: das alte `TextField` rendert `data-testid="feld-<key>"`, das Override nicht → Abwesenheit = deployed. Smoke-Scripts: `scripts/smoke-dispatch-v2-termin.mjs` (P2d-1), `scripts/smoke-dispatch-v2-autocompletes.mjs` (P2d-2) — als Vorlage + Monitor (`for`-Loop re-smoke bis DEPLOYED).
5. **Server-Actions = Result-Object** (`{success/ok, error?}`), Umlaute in UI-Strings, neue UI via `primitives`/`shared` bzw. Reuse bestehender Komponenten. 7-Punkt-Audit pro Commit.
6. **saveStammdaten-Allowlist** (`STAMMDATEN_ALLOWED_FIELDS`) + SA-Lockdown (nach `sa_unterschrieben` kein Lead-Edit) — Spalten vor jedem neuen Write prüfen.

---

## 5. Offene Entscheidungen für Aaron (aus dem Plan-Doc)
1. **Scope-Cut:** alle 4 Sub-PRs oder MVP? (P2d-1+2 sind durch; P2d-2b/3 = nächste.)
2. **Gesprächsleitfaden/KundenMatch** (P2d-4): in die Feld-Config oder eigenes Sidebar-v2-Ticket? (Empfehlung: separat.)
3. **Address-Multi-Spalten-Save:** in P2d-2 bereits via `saveStammdaten` gelöst (Freitext-Blur NULLt Koordinaten — keine stale coords ans SV-Matching). Muster steht.

---

## 6. Konstanten / Smoke
- **Supabase:** `paizkjajbuxxksdoycev`. Dispatcher-Login (staging): `test-dispatch@claimondo.de` / `Test1234!` (2FA aus). Basic-Auth: `aaroncmdo` / `ClaimondoSuperuser123789!!`. URL `app.staging.claimondo.de`. Test-Lead `c1964512-23af-4973-bf37-ff62d80599d5`, Pfad `?v2`.
- **Kern-Files:** `src/app/dispatch/leads/[id]/{page.tsx, DispatchLeadForm.tsx, SvDispatchPanel.tsx, _v2/*}`, `src/components/onboarding/{FieldRenderer.tsx, fields/*, lade-flow-phasen.ts, filter-felder-by-audience.ts}`, `_actions/{stammdaten.ts, dispatch-lead-felder.ts, sv-termin.ts}`.
- **Merged PRs:** #2229 (P2e), #2236 (P2d-1), #2244 (P2d-2). Plan: `…p2d-plan`-Branch.
