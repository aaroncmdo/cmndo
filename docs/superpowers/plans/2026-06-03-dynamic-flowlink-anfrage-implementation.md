# Implementation Plan — Dynamischer FlowLink: Anfrage → Lead → kanonischer Flow

> **Für cdd8f4f3 (`aar-956 flow-booking`).** Du kennst FlowWizardKfz/FlowSlotStep/self-service-actions — dieser Plan gibt Verhalten, Constraints, Bug-Orte, TDD/Verify + Reihenfolge. Spec: `docs/03.06.2026/anfrage-wizard-flowlink-kanonik-spec.md`.

**Goal:** EIN kanonischer Pfad: Wizard füllt **Anfrage** → Konversion zu **Lead** → User landet **direkt im FlowLink** (`/flow/[token]`), der den **Lead spiegelt** + den **SV/Termin aktiv auflöst** (nicht „wir suchen…"). Signatur **nur** im FlowLink. **Eine** Matching-Quelle. **Keine** Flow-Proliferation.

**Architecture:** `Wizard (anfrage) → /start (issue-canonical-flowlink, idempotent) → Lead + EIN flow_links → /flow/[token]`. Resolver = `sv-matching-modul/matchAndSlots` (→ `findBestSV`). Signatur/Auto-Confirm im `/flow`.

**Tech/Constraints:** Next App-Router. Gates: `npm dedupe` → `tsc --noEmit`/`vitest`/`check:token-audit`/`check:component-set --ratchet`/`check:knip --ratchet`. PR `--base staging`, nicht selbst mergen. **Eigener Branch off frischem staging** (off `aar-956-flow-booking`-Tip falls darauf gestackt). Worktree-`npm ci`→`npm dedupe`.

---

## Constraints (nicht verhandelbar)
1. **Eine Matching-Quelle:** `matchAndSlots`/`findBestSV` (+ `fixerSvId` für Monika). **Keine dritte** Such-/Slot-Implementierung. (Termin-Engine-Port `lib/termine/engine/matching-score.ts` = transitorischer Mirror → mit termin-engine-Sessions Repoint koordinieren.)
2. **Signatur NUR im FlowLink.** Anfrage/Wizard = Daten + (reservierter) Termin, **nie** SA/Vollmacht-Signatur.
3. **Idempotenter FlowLink — keine Proliferation:** pro Lead **ein** kanonischer `flow_links`-Eintrag; `issue-canonical-flowlink` reused bei „schon konvertiert + gültig". Niemals pro Wizard-Submit einen neuen Token, wenn schon einer existiert.
4. **Der FlowLink spiegelt den Lead:** `/flow/[token]` liest live `leads`/`gutachter_termine`/gfa-Back-Ref — kein eingefrorener Snapshot.

---

## Task 0 — Konversions-Pfad: EINE idempotente Brücke, User landet direkt im Flow
**Aarons Vorgabe (wörtlich):** „Der Wizard bestimmt die Anfrage-Füllung → Konversion zu Lead → Nutzer wird **direkt** zum FlowLink weitergeleitet. Es sollen **nicht tausende Flows** rumliegen. Der **FlowLink ist das Kanonische**, er **spiegelt den Lead**." + offene Frage: „Was hat `/start` da zu suchen?"
**Files:** `app/start/[anfrageId]/route.ts`, `lib/start-link/issue-canonical-flowlink.ts`, die Wizard-Submit-Handler.
- [ ] **Entscheiden + dokumentieren — `/start` behalten oder in den Submit falten?** `/start` ist heute die **anon-HMAC-Brücke** (ein public/anon Wizard darf keine Server-Konversion ungeschützt triggern). Genau **EINER** dieser Endzustände:
  - **(A) `/start` bleibt die EINE Brücke:** Wizard-Submit → 302 `/start/[anfrageId]` (HMAC) → `issueCanonicalFlowlink` → 302 `/flow/[token]`. Für den User **ein nahtloser Redirect** (kein sichtbarer Zwischenscreen).
  - **(B) Submit-Action konvertiert selbst** (server-seitig, anon-sicher) + liefert direkt die `/flow/[token]`-URL → `/start` entfällt.
  In **beiden** Fällen: **eine** Konversion, **kein** user-sichtbarer Zwischenscreen, Landing **direkt** in `/flow`. Empfehlung: (A), weil die HMAC-Brücke den anon-Schutz schon trägt und idempotent ist — aber explizit entscheiden, nicht beides offen lassen.
- [ ] **Verify Idempotenz (HART — „nicht tausende Flows"):** zweites Submit derselben Anfrage / Reload / Doppel-Klick erzeugt **keinen** zweiten Lead + **keinen** zweiten `flow_links` — `issueCanonicalFlowlink` reused den gültigen Token (über `gfa.konvertiert_zu_lead_id`). Mit Test/Log belegen.
- [ ] **Verify Spiegel:** `/flow/[token]` liest den Lead **live** (kein eingefrorener Snapshot) — eine Lead-Änderung (Dispatcher/Resolver) ist sofort im Flow sichtbar.
- [ ] **Doku:** Entscheidung (A oder B) + Regel „Wizards konvertieren über die EINE Brücke, nie ad-hoc" in die Spec schreiben.
- [ ] **Commit.**

## Task 1 — Passiven „wir suchen einen SV"-Text killen → aktiver Resolver
**Files:** `components/onboarding/fields/TerminField.tsx:105` (`"Wir suchen den passenden Gutachter für Sie …"`), i18n `de.json:386 kein_gutachter` + die `…pending`-Keys (alle Sprachen), `app/flow/[token]/actions.ts:~1258` (Kommentar bezieht sich schon darauf).
- [ ] **Test (RED):** Render `/flow` mit Lead **ohne** SV/Termin → erwarte **kein** „wir suchen"-Text, sondern den **Termin-Buchungs-Step (FlowSlotStep)** bzw. die Besichtigungsort-Abfrage (Task 3).
- [ ] **Fix:** der `termin`-Zustand „kein SV/Termin" rendert **FlowSlotStep / Resolver** (Task 2), nicht den Platzhalter. `TerminField`-Platzhalter nur dort behalten, wo er legitim ist (z.B. Dispatcher-Pfad ohne Self-Service); im dynamischen FlowLink ersetzt der Resolver ihn.
- [ ] **Verify:** Smoke `/flow` (Lead ohne SV) → Buchungs-UI statt „suchen".  **Commit.**

## Task 2 — SV/Termin-Resolver-State-Machine im `/flow` (eine Quelle)
**Files:** `app/flow/[token]/self-service-actions.ts` (matchAndSlots/fixerSvId/booking — Basis da), `FlowSlotStep.tsx`, `FlowWizardKfz.tsx` (STEPS-Maschine, Z.212-228).
Zustände (im `termin`-Step, `matchAndSlots`/`findBestSV`):
- [ ] **SV + Termin gesetzt** → anzeigen, kein Resolver, kein „suchen".
- [ ] **SV gesetzt, kein Termin** → Slots **dieses** SV (`matchAndSlots({fixerSvId})`) → buchen.
- [ ] **Weder SV noch Termin** → Besichtigungsort da? → ja: `matchAndSlots({lat,lng})` global → SV+Slot buchen; nein → Task 3.
- [ ] **Monika `fixerSvId`** (`gfa.zugeordneter_sv_id`) → nur sein Kalender, **nicht** neu suchen.
- [ ] **Test:** je Zustand ein Unit-/Integrations-Test (Resolver-Entscheidung). **Commit pro Zustand.**

## Task 3 — Besichtigungsort fehlt → im Flow abfragen
**Files:** `self-service-actions.ts:119` (heute „wir melden uns telefonisch"), FlowSlotStep/FlowWizardKfz (ein Adress-Eingabe-Schritt vor dem Slot-Step).
- [ ] **Fix:** fehlt `besichtigungsort_lat/lng` → **Adress-Abfrage-Step** (PlaceAutocomplete, schreibt `besichtigungsort_*` auf den Lead) → dann Resolver (Task 2). Kein „wir rufen an" mehr im Default-Pfad.
- [ ] **Test + Smoke.** **Commit.**

## Task 4 — `service_typ` Auswahl (Komplett vs. nur-Gutachter)
**Files:** FlowWizardKfz STEPS + ein Auswahl-Step/-Panel.
- [ ] **Fix:** `service_typ` unbestimmt → **Auswahl-UI** (komplett/nur-Gutachter) vor/bei der Termin-Auflösung; Auswahl auf den Lead schreiben. Bestimmt (z.B. Monika „gutachter") → nutzen, Auswahl überspringen.
- [ ] **Test + Smoke.** **Commit.**

## Task 5 — Termin reserviert+geblockt → Auto-Confirm bei SA (nicht SV-manuell)
**Files:** `FlowWizardKfz.handleSignSA` (Z.255+), `signSAandCreateFall`/`convert-lead-to-claim`, `gutachter_termine`-Status.
- [ ] **Verify/Fix:** beim Slot-Buchen → Termin **reserviert/geblockt**; bei **SA-Unterschrift** (`handleSignSA`) → Termin **automatisch `bestaetigt`** (Engine `bestaetigeTermin` — mit termin-engine-Sessions koordinieren), **ohne** SV-Aktion. Kein „wartet auf SV-Bestätigung".
- [ ] **Test:** SA-Signatur → Termin-Status `bestaetigt`. **Commit.**

## Task 6 — Resolver in gutachter-finder + Monika-Wizards integrieren
**Files:** die Wizard-Komponenten (gutachter-finden, Monika-Embed) + die geteilten Resolver-Bausteine.
- [ ] **Fix:** beide Wizards nutzen denselben Resolver/Slot-Baustein (kontextualisiert: Monika=fixerSvId, gutachter-finder=Karten-Pick/global) — **eine Quelle**, kein Copy. Anfrage-Felder je Wizard unterschiedlich (gewollt), aber Konversion+Resolver geteilt.
- [ ] **Smoke je Quelle.** **Commit.**

## Task 7 — Self-Service-Versand: IMMER ein Kanal (WA → SMS → Email)
**Befund (VPS-Diagnose 03.06., bestätigt):** der Baileys-Worker ist **online + connected** (`pm2 claimondo-baileys online`, `:3055/health {"state":"open"}`, Token+BASE_URL gesetzt) — **nicht** die Ursache. Die Lücke: `issue-canonical-flowlink.ts:sendeInitialLink` macht WA(availability)→**Email**, aber (1) **kein SMS**, (2) bei WA-unavailable + keiner Email → `return 'none'` = nichts raus, (3) `return 'whatsapp'` schon bei `sent.ok` (Worker-Annahme ≠ Zustellung).
**Aarons Vorgabe:** „im Self-Service muss der Fallback SMS oder Email sein, für den Anfang."
- [ ] **Fallback-Kette WA → SMS → Email**, sodass IMMER ein Kanal rausgeht. SMS via `sendSmsTemplate` (`lib/whatsapp/send-sms-template.ts`) — **Achtung:** template-gebunden (ContentSid); der kanonische Link ist Plain-Link → Plain-Twilio-SMS (raw `buildText`) oder schlankes canonical-link-SMS-Template anlegen.
- [ ] Telefon vorhanden, aber WA `verfuegbar===false` → **SMS** (nicht still auf Email/`none` fallen).
- [ ] `kanal`-Rückgabe nur auf echte Zustellbarkeit stützen; `none` nur wenn WEDER Telefon NOCH Email. **Test + Commit.**

## Task 8 — Legacy/konkurrierende Pfade entfernen (DER EINZIGE Prozess)
**Spec §1a.** Der kanonische Funnel ist der **einzige** Anfrage→Lead→FlowLink-Weg — die Alt-Pfade müssen WEG, nicht daneben stehen bleiben. Je Pfad: Consumer greppen → auf `/start` umlenken → löschen (Dead-Code-Gate `check:knip`). **Nicht blind löschen — erst Consumer-frei.**
- [ ] `lib/self-service/issue-flowlink.ts` (AAR-940 `self_service_token`/`/anfrage`) → Aufrufer auf `/start`/`issueCanonicalFlowLink`, dann löschen.
- [ ] `app/anfrage/[token]/*` (Route + `BeauftragungWizardStart`) entfernen; `self_service_token*`-Spalten droppen (DDL via Supabase-Plugin, Regel 2).
- [ ] `lib/actions/konvertiere-anfrage-zu-fall.ts` (eigener `flow_links`-Insert) → durch `issueCanonicalFlowLink` ersetzen.
- [ ] `anfrage-actions.ts` / `finalizeAnfrage.ts` / `api/anfrage-from-lp` prüfen + ggf. auf `/start` umlenken.
- [ ] **Klären (Aaron):** Dispatcher-Versand (`dispatch/.../_actions/flowlink.ts` + `dispatch-fall-actions.ts`) = separater Portal-Pfad (Default: bleibt) oder auch konsolidieren?
- [ ] **Verify:** danach **genau ein** Self-Service-Konversions-/Versand-Pfad (grep `flow_links … insert` + `issue-flowlink`). **Smoke je Quelle + Commit.**

---

## Reihenfolge & Verify
Task 0 (Pfad bestätigen) → 1 (Bug-Text) → 2 (Resolver) → 3 (Besichtigungsort) → 4 (service_typ) → 5 (Auto-Confirm) → 6 (Wizard-Integration) → 7 (Versand-Fallback WA→SMS→Email, parallel) → 8 (Legacy-Pfade WEG = einziger Prozess).
**Voll-Smoke je Quelle (mini-wizard / gutachter-finden / Monika):** Anfrage füllen → Submit → direkt `/flow` (kein Doppel-Token) → Resolver bucht/zeigt SV+Termin (kein „suchen") → service_typ-Auswahl falls offen → SA-Signatur → Termin auto-`bestaetigt` → (WA/Email kam an). Plus Gates (s.o.).

## Owner / Koordination
cdd8f4f3 / 753d8096 bauen 0–6 + **8**. Versand-Fallback (7) ist **schon gebaut** (PR #2377, gemergt). **Task 8 (Legacy-Pfade WEG) = Pflicht**, sonst bleibt das „Doppel". Matching bleibt `matchAndSlots`/`findBestSV` — **keine dritte Quelle**; mit den **termin-engine-Sessions** (Repoint-Plan) abstimmen.
