# HANDOFF — Dispatch Config-Unify: Cutover-Runway (Parität 3/3 → P3b → P4)

**Stand:** 2026-06-02 (EOD) · **Memory:** `project_dispatch_config_unify` · **Vorgänger-Handoff:** `docs/02.06.2026/HANDOFF-dispatch-config-unify-p2d-rest.md`

---

## 0. TL;DR — wo anfangen

Der config-getriebene flache Dispatcher-Form (`DispatchLeadForm`, hinter `?v2` auf `/dispatch/leads/[id]`) ist diese Session bis kurz **vor den Cutover** gebracht. Die Reststrecke:

1. **Parität 3/3 — SA-Konversions-Banner/Lock** (NÄCHSTES, klein) → v2-Panel.
2. **P3b — Cutover** (⚠️ HIGH-STAKES, Aaron-Freigabe + grüner Voll-Smoke): `?v2`-Default, Phasen-Maschinerie löschen.
3. **P4** — Kunden-Flowlink → lead-erfassung + token-confirm/clear (§8b) + i18n.

**WICHTIGSTE LEKTIONEN (sonst rote CI / Zeitverlust):**
- Vor JEDEM PR lokal: `npx tsc --noEmit` **+** `npx vitest run <pattern>` **+** `npm run check:token-audit` **+** `npm run check:component-set -- --ratchet` (Build OOMt im Worktree → tsc statt `npm run build`).
- **Worktree-`npm ci` kann nicht-deterministisch ein doppeltes `@types/react` ziehen** → falsche `<style jsx>` / Ref-tsc-Fehler in FREMDEN Files (`kunde/_components/*`, `ui/Chip.tsx`). Fix: **`npm dedupe`** im Worktree, dann tsc erneut. **`package-lock.json` NICHT committen** (war nur lokaler Install-Fix).
- `primitives.Button` hat **kein `title`-Prop** (nur `variant`/`onClick`/`size`/`loading`/`iconLeft`/`fullWidth`/`className`).

---

## 1. Was diese Session gebaut hat (8 PRs)

Jede Stufe off frischem `origin/staging`, single-phase, 7-Punkt-Audit, **nie selbst gemerged**.

| PR | Phase | State |
|---|---|---|
| #2256 | P2d-2b — `kennzeichen` Parts-Override (+ shared `KennzeichenPartsInput`, `buildKennzeichenFields`) | ✅ merged |
| #2263 | P2d-3 — Sektion-Panels (Unfallskizze / Zeugen / Wunschtag-Pills, Mechanismus B) | ✅ merged |
| #2267 | P2f T1 — `DispatchChecklistPanel` (§8c erfasst/offen) | ✅ merged |
| #2273 | P2f T2 — `DokumenteAnfordernCard` im v2-Form (§8c Anforder-Buttons) | 🟦 open |
| #2278 | P3a — §9 `disqualifiziert`-Flag Reader-Repoint (Cutover-Prep) | 🟦 open (**independent**) |
| #2280 | P2g — `DispatchFlowlinkPanel` (Versand-Parität 1/3) | 🟦 open — **stackt auf #2273** |
| #2282 | P2h — `DispatchStatusPanel` (Status-Tracking-Parität 2/3) | 🟦 open — **stackt auf #2280** |

**⚠️ MERGE-REIHENFOLGE des Parität-Stacks: `#2273 → #2280 → #2282`.** `#2278` ist unabhängig (off staging, eigene Files). Erst NACH diesen Merges baut man Parität 3/3 + P3b off frischem staging (sonst `DispatchLeadForm`/`page.tsx`-Konflikt).

---

## 2. v2-Form-Architektur jetzt (`DispatchLeadForm`)

Reihenfolge im Render (alle additiv, nicht-blockierend):
1. `DispatchGatesPanel` (oben) — Warn-Badges + Vollständigkeits-Indikator (q1–q8) + manuelles `disqualifiziert`-Flag. Nutzt `computeQualificationStatus`.
2. Sektion-Akkordeons (`phasen.map`) — generischer `FieldRenderer` PLUS:
   - **Field-Overrides** (`_v2/dispatch-field-override-keys.ts` + `dispatch-field-overrides.tsx`): `termin`→SvDispatchPanel, `gegner_versicherung`→VersichererAutocomplete, `besichtigungsort_adresse`/`unfallort`→PlaceAutocomplete, `kennzeichen`→KennzeichenPartsInput.
   - **Sektion-Panels** (`_v2/dispatch-section-panel-keys.ts` + `dispatch-section-panels.tsx`, Mechanismus B): `unfall`→UnfallskizzeCard + (wenn `values.zeugen==='true'`) ZeugenKontakteEditor; `termin_sv`→Wunschtag-Pills.
3. `DispatchChecklistPanel` (§8c T1) — erfasst/offen.
4. `DokumenteAnfordernCard` (§8c T2, in `id="dokumente-anfordern-card"`-Wrapper).
5. `DispatchFlowlinkPanel` (P2g) — WA/SMS/Email-Versand via `sendFlowLinkMultiChannel`.
6. `DispatchStatusPanel` (P2h) — FlowLink-Stepper + Inaktiv-Alarm + Auto-Refresh.

**Geteilte/portierte Komponenten** (entkoppelt vom `useDispatchPhase()`-Provider, den v2 NICHT hat):
- `components/shared/KennzeichenPartsInput.tsx`, `components/shared/WunschterminWochentagePills.tsx` (kontrolliert), `_components/ZeugenKontakteEditor.tsx` (self-saving), `_v2/DispatchWunschterminPanel.tsx`, `_v2/DispatchFlowlinkPanel.tsx`, `_v2/DispatchStatusPanel.tsx`.
- `lib/format/kennzeichen.ts`: `buildKennzeichenFields()` + `KennzeichenFields`-Type.

`page.tsx` ?v2-Zweig lädt `lead` (select *), `aktiverSvTermin`, `qual`, `phasen`, **`flowLinks`** (P2g; transitional dup mit Legacy-Zweig — Cutover räumt auf).

---

## 3. Reststrecke

### 3a. Parität 3/3 — SA-Konversions-Banner/Lock (NÄCHSTES, klein)

**Heute fehlt im v2-Form:** nach `lead.sa_unterschrieben` zeigt die Legacy-`DispatchShell` ein Banner mit Fallakte-Link (Lead-Edit gesperrt → Dispatcher muss zur Fallakte). Im v2-Form fehlt das Banner.

- **Edit-Lock ist serverseitig schon da:** `saveDispatchLeadFelder` + `saveStammdaten` blocken nach `sa_unterschrieben` (AAR-631). Es geht also primär ums **Banner** (+ optional read-only-Hinweis im Form).
- **Bauen:** `_v2/DispatchSaBanner.tsx` — wenn `lead.sa_unterschrieben`: Banner „Lead ist zu Fall konvertiert — über Fallakte editieren" + Link `/admin/faelle/<fallId>` (bzw. korrekter Fallakte-Pfad). `fallId` via `v_claim_full` (`lead_id`→`fall_id`, PostgREST-Alias `id:fall_id`) — `page.tsx` lädt das im Legacy-Zweig bereits (`fallIdFuerBanner`); für v2 `fallId` laden + an `DispatchLeadForm` durchreichen, oder im Banner-Panel selbst abfragen.
- Render GANZ OBEN in `DispatchLeadForm` (vor dem GatesPanel). Stackt auf #2282.

### 3b. P3b — Cutover (⚠️ HIGH-STAKES — Aaron-Freigabe + grüner Voll-Smoke PFLICHT)

- **`page.tsx`:** `?v2`-Gate weg → IMMER `DispatchLeadForm`. DispatchShell-Zweig + `initialPhase`-Berechnung + `unterschriftenSnapshot` raus. KEEP (jetzt von v2 genutzt): `lead`, `aktiverSvTermin`, `qual`, `phasen`, `flowLinks`, `fallRow`-Vorschaden-Merge, `fallId` (SA-Banner). `searchParams: v2` entfernen.
- **LÖSCHEN (Reader-Sweep VOR Drop — CMM-44!):** `DispatchShell.tsx`, `PhaseContent.tsx`, `PhaseHeader.tsx`, `_phases/Phase1..6*.tsx`, `SchadentypPicker.tsx`, `ExitSkript.tsx`, `GespraechsleitfadenTimer.tsx`, `_lib/phase-context.ts`, ggf. `_sidebar/*` (KundenMatchCard/SidebarStubs — siehe P2d-4). Legacy-Phase-Setter-Actions (`_actions/qualification.ts` disqualify, `_actions/hard-gate.ts`, `_actions/schadentyp.ts` auto-disqualify) **nur löschen wenn kein anderer Consumer** (grep!).
- **KEEP:** `computeQualificationStatus` (DispatchGatesPanel nutzt es — nur die Phasen-STEUERUNG/`initialPhase` fällt weg, die Engine bleibt), `sendFlowLinkMultiChannel`, `dokumente-anfordern`, `unfallskizze`-Actions, alle `_v2/*` + die geteilten Komponenten.
- **§9 ist via P3a (#2278) vorbereitet** (Disqualifikation phase- UND flag-basiert). **Versand** via P2g, **Status** via P2h, **Banner** via 3a.
- **Reader-Sweep-Pflicht vor Delete:** `grep -rn "from './_phases\|DispatchShell\|phase-context\|PhaseContent\|qualification-engine" src/` — jeder Import muss umgehängt/entfernt werden. `qualifizierungs_phase` wird von vielen Listen/Kanban/Crons gesetzt+gelesen (autoPhase, rueckruf, flowlink, convert, leads/page Kanban-Filter, dashboard) — die bleiben (das Feld lebt weiter); nur die `[id]`-Phasen-UI fällt.
- **Voll-Smoke:** Dispatcher-Login, Lead-Detail OHNE `?v2` rendert jetzt den flachen Form; alle Sektionen + Overrides + Panels (Versand/Status/Card/Checkliste/SA-Banner) funktionieren; Disqualifizieren übers Flag; FlowLink-Versand (mit Test-Lead, KEINE echte Kunden-Nachricht). Plus: Kanban/Leads-Liste/Dashboard/Isochrone unverändert.

### 3c. P4 — Kunden-Flowlink → lead-erfassung + token-confirm/clear (§8b) + i18n

Wenn der Kunden-Flowlink `lead-erfassung` pre-fall (kein fallId) rendert: token-basiertes `confirmZb1KorrekturenViaToken`/`clearZb1FelderViaToken` (`dokument_upload_anfragen.token`→`lead_id`, Muster `uploadDokumentViaAnfrageToken`). P1 seedete nur deutsche Labels (`i18n=null`) → i18n nachziehen. **Bis dahin nicht bauen** (dead/un-smoke-bar).

### P2d-4 — KundenMatch/Gesprächsleitfaden-Sidebar (eigenes Ticket)

`KundenMatchCard` + `Gesprächsleitfaden` (`_sidebar/*` + `GespraechsleitfadenTimer.tsx`) hängen an `useDispatchPhase()`-Kontext. Empfehlung: eigenes „Dispatcher-Sidebar-v2"-Ticket (Gesprächsleitfaden de-phase-context-en), NICHT in die Feld-Config. Vor dem Cutover-Delete klären, ob diese im v2 erhalten bleiben sollen.

---

## 4. Harte Regeln / Gotchas

1. **Gates vor JEDEM PR** (s. §0). Inline-Hex in `style={{}}` (auch Status-Farben) → `var(--brand-danger, #c0392b)` / `var(--brand-success, #1a7a35)`.
2. **Branch-Muster:** jede Sub-Phase off frischem `origin/staging` (squash → frühere Commits sind keine Ancestors). PR `--base staging`. **Nie selbst mergen** (Merge-Session ownt). Push mit EXPLIZITEM Refspec (`git push -u origin <branch>`) — Worktree-Branches tracken sonst `origin/staging` → bare `git push` würde auf staging pushen!
3. **`npm dedupe`-Lektion** (s. §0) bei false tsc-Fehlern in fremden Files.
4. **Stacked PRs** (#2273→#2280→#2282): in Reihenfolge mergen. 3a/3b off frischem staging NACH diesen Merges.
5. **Outward-facing Smoke:** `DokumenteAnfordernCard` + `DispatchFlowlinkPanel` senden ECHTE WA/SMS/Email an Kunden. Post-Deploy: Render-Smoke sicher; Send-Pfad nur manuell mit Test-Lead (keine versehentliche Kunden-Nachricht).
6. **Reader-Sweep vor jedem Drop** (CMM-44). Server-Actions = Result-Object (`{success/ok, error?}`). Umlaute in UI-Strings.

---

## 5. Konstanten / Smoke

- **Supabase:** `paizkjajbuxxksdoycev`. Dispatcher-Login (staging): `test-dispatch@claimondo.de` / `Test1234!` (2FA aus). Basic-Auth: `aaroncmdo` / `ClaimondoSuperuser123789!!`. URL `app.staging.claimondo.de`. Test-Lead `c1964512-23af-4973-bf37-ff62d80599d5`, Pfad `?v2` (bis P3b den Default umstellt).
- **Smoke-Deploy-Detektor:** Code-Change → Staging erst nach VPS-Deploy (~10 min). Altes `TextField` rendert `data-testid="feld-<key>"`; Override/Panel nicht → Abwesenheit = deployed. Bestehende Smoke-Scripts: `scripts/smoke-dispatch-v2-*.mjs`.
- **Kern-Files:** `src/app/dispatch/leads/[id]/{page.tsx, DispatchLeadForm.tsx, DispatchShell.tsx, DispatchGatesPanel.tsx, _v2/*, _phases/*, _actions/*, _lib/qualification-engine.ts}`.

---

## 6. Findings dieser Session (für Aaron)

1. **`DokumenteAnfordernCard` war repo-weit DORMANT** (0 Renders; `Phase4` hatte nur toten Import + totes Scroll-Target — Refactor-Verwaisen). → Der **Legacy-Dispatcher** (Default ohne `?v2`) hat aktuell offenbar KEINE Dokument-Anforder-UI = **mögliche Pre-Existing-Regression**. P2f T2 reaktiviert die Card im v2; P3b macht v2 zum Default und löst es endgültig.
2. **Cutover ≠ nur „Maschinerie löschen":** der flache Form musste erst Versand (P2g) + Status (P2h) + SA-Banner (3a, offen) bekommen, sonst regrediert der Dispatcher.
3. **Worktree-`npm ci`-Dup-`@types/react`** → false tsc-Fehler (s. §0).
