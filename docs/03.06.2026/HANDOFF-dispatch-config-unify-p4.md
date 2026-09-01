# Handoff — dispatch-config-unify **P4** (letzte Stufe, gated)

**Stand:** 2026-06-03 · **Memory:** `project_dispatch_config_unify` · **Vorherige Session:** `a3340f0e`
**Status der Strecke:** P0..P2d-4 + **P3b-Cutover (#2334) gemergt + auf staging**, Post-Drop-Smoke alle Rollen grün. **P4 ist der einzige verbleibende Teil — und ist gated (s. §2).**

---

## 1. Was P4 ist (4 Teile)

| # | Teil | Kern |
|---|---|---|
| **A** | **Kunden-Flowlink auf `lead-erfassung` pre-fall** (der Gate-Opener) | Der Kunden-Flow nutzt heute `beauftragung` (`/anfrage/[token]`) bzw. den **deprecated** FlowWizardKfz (`/flow/[token]`). P4 vereint den **pre-fall** (ohne fallId) Kunden-Flow auf die **eine** `lead-erfassung`-Config (audience `kunde`/`beide`) — inkl. des `Zb1UploadField`. Damit teilen Kunde + Dispatcher EINE Config (Sinn der ganzen Strecke). |
| **B** | **§8b OCR token-confirm/clear** | `confirmZb1Korrekturen(fallId)` / `clearZb1Felder(fallId)` sind **fallId-gated** → im Pre-Fall-Flowlink **No-ops** → Kunden-ZB1-Korrekturen gehen verloren (verifizierter Bug). P4: **token-basiert** refactoren (analog `uploadDokumentViaAnfrageToken`), gegen den neuen Pre-Fall-Pfad (A) smoken. |
| **C** | **i18n** | Portal-i18n für den Kunden-Flow (s. `_specs/portal-i18n/` + `docs/plans/2026-05-29-portal-i18n.md`). |
| **D** | **Die 4 deferred Minor-Gaps** (aus der Parity-Matrix) | s. §3 — **2 davon NEU implementieren** (Action im Cutover gelöscht), 2 sind neue Features. |

---

## 2. ⛔ DER GATE (kritisch — zuerst lesen)

> **B/C/D NICHT bauen, bis A steht.** Konkret: es gibt **heute keinen** kundenseitigen Pre-Fall-Pfad, der `lead-erfassung` + das `Zb1UploadField` rendert (P2e-Befund 02.06.: `/anfrage`=beauftragung, `/flow`=deprecated, `/kunde/onboarding-details`=post-fall mit fallId). Ohne diesen Pfad ist das §8b-token-confirm/clear **toter + un-smoke-barer Code**.

**Sequenz innerhalb P4:** **A → B → (C, D parallel).** A ist der Gate-Opener.

**Kickoff-Entscheidung (mit Aaron brainstormen, BEVOR gebaut wird):** Wer baut A?
- (a) **P4 selbst baut A** als ersten Schritt (Kunden-Flowlink-Umzug `beauftragung` → `lead-erfassung` pre-fall). Dann ist B/C/D entsperrt. **ODER**
- (b) **Upstream-Kunden-Flow-Redesign** liefert den Pre-Fall-`lead-erfassung`-Render (Mini-Wizard/Magic-Link-Initiative, s. Memory `mini_wizard_magic_link`); P4 macht dann nur B/C/D.

→ Welcher Kunden-Pfad (`/flow/[token]` vs `/anfrage/[token]`) der **kanonische** Pre-Fall-Flowlink wird, ist die erste zu klärende Frage (der Dispatcher sendet FlowLinks via `sendFlowLinkMultiChannel` → `flow_links`; verifizieren, auf welche Route der Link zeigt).

---

## 3. Die 4 Minor-Gaps (D) — Status nach Cutover

| Gap | nach Cutover | P4-Aktion |
|---|---|---|
| **Grüne-Karte-Reminder** (`setGrueneKarteAngefragt`) | Action `_actions/gruene-karte.ts` **GELÖSCHT** | **NEU implementieren** (Reminder/Notification bei Auslandskennzeichen), **nicht re-wiren**. Alter Code als Vorlage: `git show e405398b2~1:"src/app/dispatch/leads/[id]/_actions/gruene-karte.ts"` |
| **checkEmailIsSv-Warnung** (`checkEmailIsSv`) | Action `_actions/email-sv-check.ts` **GELÖSCHT** | **NEU implementieren** (SV-Email-Kollisions-Check vor Flowlink), **nicht re-wiren**. Vorlage: `git show e405398b2~1:"src/app/dispatch/leads/[id]/_actions/email-sv-check.ts"` |
| **`lackfarbe_code` + imagin-Preview** | keine Action weg; `fahrzeug_farbe`-Freitext deckt das Nötigste | strukturiertes `lackfarbe_code`-Feld + imagin-Render-Preview (**imagin gated bis Freischaltung**) |
| **Kundenadresse-Geocoding** (`kunde_lat/lng`) | keine Action weg; v2 hat nur Text-Adresse | Place-Override für die Kundenadresse (wie `besichtigungsort`/`unfallort` in `_v2/DispatchPlaceField`) |

---

## 4. Fundament (steht bereits — darauf baut P4 auf)

- **Eine Config:** `lead-erfassung` (63 Felder / 9 Sektionen, `onboarding_felder.audience` ∈ kunde/dispatcher/beide + `sektion`). Seed-Mig `20260601194358`.
- **Generischer Loader:** `lib/onboarding/lade-flow-phasen.ts` → `ladeFlowPhasen(flowKey, audience)`. `ladeBeauftragungPhasen()` = Wrapper für `('beauftragung','kunde')`. P4-A: einen Kunde-Loader auf `ladeFlowPhasen('lead-erfassung','kunde')` umstellen.
- **Shared Renderer:** `components/onboarding/FieldRenderer.tsx` (Kunde + Dispatcher teilen ihn).
- **v2-Dispatcher = Default** (Cutover #2334): `dispatch/leads/[id]/page.tsx` → `DispatchLeadForm`. Section-Panels (`_v2/dispatch-section-panels.tsx`) + Field-Overrides (`_v2/dispatch-field-overrides.tsx`) als Muster für Rich-Felder.
- **Derive-Hook:** `_lib/derive-dispatch-felder.ts` (polizeibericht_pflicht/unfallort_kategorie) — Muster für abgeleitete Spalten ohne Legacy-Action.

---

## 5. Einstiegspunkte (Files)

**Kunde-Routen:**
- `src/app/anfrage/[token]/page.tsx` (+ `AnfrageStartClient`/`BeauftragungWizardStart`/`SelbstQualiClient`/`TerminBuchungClient`) — beauftragung self-service, nutzt `ladeBeauftragungPhasen()`.
- `src/app/flow/[token]/page.tsx` + `FlowWizardKfz.tsx` — **deprecated** (RSC-Redirect-Stub-Lehre beachten).
- `src/app/kunde/onboarding-details/` — post-fall (fallId gesetzt).

**OCR (§8b):**
- `src/components/onboarding/fields/Zb1UploadField.tsx` — shared Feld; Upload via Token (`uploadDokumentViaAnfrageToken`, funktioniert pre-fall), aber confirm/clear brauchen fallId.
- `src/app/upload/dokumente/[token]/actions.ts:102` — `uploadDokumentViaAnfrageToken` (token-basiert, das Muster für B).
- `src/app/kunde/onboarding-details/zb1-actions.ts:27,67` — `confirmZb1Korrekturen(fallId)` / `clearZb1Felder(fallId)` (die fallId-gated No-ops → token-basiert refactoren).

**Flowlink-Versand (Referenz):** `dispatch/leads/[id]/_v2/DispatchFlowlinkPanel.tsx` + `_actions/flowlink.ts` (`sendFlowLinkMultiChannel`).

---

## 6. Gotchas / Lessons (aus der ganzen Strecke — spart Stunden)

- **tsc im Worktree:** vor `npx tsc --noEmit` ggf. `rm -rf .next/dev/types .next/types` — sonst false `sv-portal`-Fehler aus einem stale generierten Route-Validator.
- **Gates vor PR:** `npm dedupe` → `npx tsc --noEmit` · `npx vitest run` · `npm run check:token-audit` · `npm run check:component-set -- --ratchet` · `npm run check:knip -- --ratchet`. **`package-lock.json` NICHT committen.**
- **Component-Set-Ratchet:** `<details>` für Collapsibles (nicht geflaggt); `shared/SectionCard` / `primitives.Card` für statische Karten; `primitives.Button` (`'@/components/primitives/Button/Button.web'`, variant ondo/ghost) für Selektoren — **kein** handrolled `<div bg-white rounded border claimondo-border>` und **kein** solid-fill lowercase `<button className="bg-claimondo-navy/ondo/shield">`.
- **token-audit:** kein inline-hex (auch in `style={{}}`); `var(--brand-*, #fallback)`.
- **Umlaute** in ALLEN UI-Strings (Kunde-facing!).
- **`'use server'`:** keine Konstanten/Types exportieren (Client-Bundle → undefined).
- **Voller `next build`** OOMt im Worktree → tsc + `next dev`-Route-Compile; der **CI-`build`-Job ist der gatende Check**.
- **Gelöschte Actions** (gruene-karte/email-sv-check): NEU bauen, nicht re-wiren (Code ist weg; Vorlage via `git show` aus History).
- **Whitelabel:** Kunde-Portal IST gebrandet (`resolveKundenTheme`) — neue Kunde-UI muss `var(--brand-*)`/`bg-claimondo-*`-Klassen nutzen, kein hardcoded-hex.

---

## 7. Smoke / Validierung für P4

- **Test-User** (2FA aus, `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`): `test-kunde@claimondo.de` (kunde), `test-dispatch@claimondo.de` (dispatch), + admin/sv/kanzlei/kb/makler analog.
- **Smoke-Muster:** `scripts/smoke-p2d4-sidebar.mjs` (BASE_URL/NO_V2/LEAD_ID) + `scripts/smoke-cutover-roles.mjs` (Multi-Rolle). Lokal: `.env.local` aus dem Main-Checkout in den Worktree kopieren, `npx next dev -p <port>`, Smoke gegen `localhost:<port>`; danach Server killen + `.env.local` entfernen. Staging-Smoke: `BASE_URL=https://app.staging.claimondo.de` (Basic-Auth ist im Script).
- **P4-spezifisch:** den **pre-fall** Kunden-Flowlink öffnen (Magic-Link), ZB1 hochladen → Werte editieren → **Persistenz pre-fall** verifizieren (das ist der §8b-Fix); i18n-Sprachwechsel; die 4 Minor.

---

## 8. Referenzen

- **Spec:** `docs/superpowers/specs/2026-06-01-dispatch-leads-config-unify-design.md` (§8a Feld-Inventar, **§8b OCR token-basiert**, §8d Gegner-Flow, §C Ausschlüsse Vorsteuer/Bankdaten).
- **P1-Plan:** `docs/superpowers/plans/2026-06-01-dispatch-config-unify-p1-feld-inventar.md`.
- **Parity-Matrix (Post-Cutover-Abschnitt):** `docs/03.06.2026/p2d4-parity-matrix.md`.
- **Cutover-Plan:** `docs/03.06.2026/dispatch-config-unify-p3b-cutover-plan.md` (#2330).
- **Memory:** `project_dispatch_config_unify`, `project_mini_wizard_magic_link`, `project_mandantenfragebogen`.

**Nicht selbst mergen. P4 erst nach Brainstorm + Gate-Klärung (§2) bauen.**
