# HANDOFF — Gutachter-Finder → Self-Service (Y-Modell, config-driven)

**Datum:** 2026-06-01 · **Session:** 1601e3a6 · **Branch:** `kitta/gutachter-finder-self-service`
**Status:** Architektur GELOCKT + Spec gepusht + P1-Fundament committed. Bereit für P1-Rest → P7.

---

## 0. TL;DR — wo anfangen

1. **Lies das Spec** (kanonisch, alle Details): `docs/superpowers/specs/2026-05-31-gutachter-finder-self-service-wizard.md`
2. **Lies §6 (Constraints) hier** — Pflicht vor dem ersten Code-Touch (leads-RLS, geteilte Live-Engine, Live-Prod-Migration).
3. **Nächster konkreter Schritt:** §8 (token-leads-Save-Action, nutzt den schon getesteten `groupFelderByTarget`-Helper).
4. **Branch ist current:** `kitta/gutachter-finder-self-service` (ab `origin/staging`), Working-Tree clean, kein Stash.

---

## 1. Ziel

Den nativen `/gutachter-finden`-Wizard auf dieselbe config-getriebene Self-Service-Logik heben wie AAR-940 (`/anfrage/[token]`, LIVE auf prod). **Reframe:** `/gutachter-finden` ist heute SCHON self-service (matcht/bucht/SA/konvertiert) — es ist **Vereinheitlichung, kein Neubau** + zwei Bugs fixen (firmenname-Leak, fehlendes Quali-Gate).

**End-State (3 Stufen auf EINER DynamicWizard-Engine):**
```
1) WIZARD (Köder · flow_key=gutachter-finden): Standort → Match(leak-safe) → Termin RESERVIEREN → Kontakt
      → "Termin reserviert, Link kommt per Mail" + FlowLink/Magic-Link ausstellen
2) FLOWLINK/BEAUFTRAGUNG (flow_key=beauftragung, NEU · /anfrage/[token], DYNAMISCH):
      Magic-Link → Anfrage→Lead → Service/Kanzlei → Schuldfrage(letzter Schritt, unverschuldet vorgewählt)
      → SA/Vollmacht → wenn Lead VOLLSTÄNDIG → Convert Lead→Fall+Claim (claim-nativ via signSAandCreateFall)
3) ONBOARDING (flow_key=kunde-onboarding, adaptiv): Login → Rest wird nachgezogen (getOnboardingSteps)
```
**`beauftragung` ist der gemeinsame Back-Half für JEDEN Self-Service** (auch live Cluster-LP). Einziger Entry-Point-Unterschied = der Slot: Cluster-LP hat keinen → Matching+Booking-Phase `conditional_on` „kein Slot"; gutachter-finden hat ihn reserviert → Phase ausgeblendet. **Eine Config, beide Wege.**

---

## 2. Dokument-Verweise (cross-linked)

| Doc | Pfad / Link | Inhalt |
|---|---|---|
| **🎯 Spec (kanonisch)** | `docs/superpowers/specs/2026-05-31-gutachter-finder-self-service-wizard.md` · [GitHub](https://github.com/aaroncmdo/cmndo/blob/kitta/gutachter-finder-self-service/docs/superpowers/specs/2026-05-31-gutachter-finder-self-service-wizard.md) | Y-Modell, Lead-Completeness, 3-Tier, P1–P7, B/C-Register, Files |
| **Dieses Handoff** | `docs/01.06.2026/HANDOFF-gutachter-finder-self-service-wizard.md` | Orientierung + Aufgaben + Constraints |
| AAR-940-Memory | Memory `project_aar940_self_service.md` | der wiederverwendete Back-Half (`/anfrage`-Flow, gebaut + LIVE) |
| VPS-Infra-Memory | Memory `project_vps_infrastructure.md` | Env/Deploy + `.env.production.local`-Staging-Override-Trick |

**Branch + Commits (`kitta/gutachter-finder-self-service`, ab `origin/staging`):**
- `47ebbbab8` — Spec (finaler Y-Modell-Schnitt)
- `2112a7742` — **P1-Fundament:** `groupFelderByTarget` + Test (6 vitest grün)

---

## 3. FERTIG (done)

- ✅ **AAR-940 Self-Service LIVE auf prod** (Cluster-LP, Flag `SELF_SERVICE_AUTO_ISSUE=true` staging+prod, verifiziert). Convert-Breaker (`claims.status` DEFAULT `'offen'`) gefixt — Migration `20260531203552`, **PR #2154** (offen gg staging, mergen lassen).
- ✅ **Architektur gelockt** (A1 Split/dynamisch, A2 Schuldfrage-letzter-Schritt+vorgewählt, S1 Feld-Verteilung, Lead-Completeness, 3-Tier, universal Back-Half) — Details im Spec §2/§3.
- ✅ **Engine verifiziert (B4):** `WizardClient` ist config-getrieben, Finalize ist schon `flowKey`-verzweigt (→ Finalize-Map trivial additiv), Feld-Typen decken Service/Kanzlei/Schuldfrage/SA ab (keine neuen Typen nötig).
- ✅ **P1-Fundament committed:** `src/lib/onboarding/group-felder-by-target.ts` (pure, getestet, additiv — 0 Live-Consumer berührt).

---

## 4. Offene Aufgaben (geordnet)

**Bau-Sequenz de-risked:** erst gutachter-finden-auf-beauftragung (neu, fasst Live-`/anfrage` NICHT an) + validieren → DANN Cluster-LP behavior-preserving migrieren + Re-Smoke.

| # | Aufgabe | Files | Hinweis |
|---|---|---|---|
| **P1a** | **token-leads-Save-Action** `speichereBeauftragungStep(token, phaseKey, values, felder)` | `src/app/anfrage/[token]/actions.ts` | `ladeAnfrageByToken` + `createAdminClient` + `groupFelderByTarget(…, {allowedTables:new Set(['leads'])})` + update `leads` wo id=konvertiert_zu_lead_id + revalidate. **Service_role, NICHT anon-saveStep** (leads-RLS, §6). |
| **P1b** | **`beauftragung`-flow_key-Config** (onboarding_phasen/felder) | DB-Seed via **Plugin-Migration** | Phasen: service (toggle-cards→leads.service_typ), kanzlei (conditional service=komplett→leads.kanzlei_wunsch), schuldfrage (segmented, gate), sa (signature). `db_target=leads`. i18n 5 Sprachen wie Bestand. Lead-Spalten vorher per information_schema verifizieren (B6). |
| **P1c** | **WizardClient: Save-Adapter + Finalize-Map** | `src/components/onboarding/WizardClient.tsx` | Pluggable Save (anon-GFA vs token-leads je flowKey/Kontext) + `flowKey→Finalize-Handler`-Map (gutachter-finden→FlowLink-Ausstellung; beauftragung→signSAandCreateFall). **Additiv/backward-kompatibel** (Live-Flows dürfen nicht brechen). |
| **P2** | **Quali-Gate-Mechanismus** | WizardClient + Config | Feld-Wert (schuldfrage=eigenverschulden) → Abbruch-Screen + Slot stornieren. `bewerteSchuldfrage` (in `lib/self-service/quali-gate.ts`) wiederverwenden. Default „gegner/unverschuldet" vorgewählt. |
| **P3** | **Completeness → Finalize** | WizardClient | „alle `pflicht`-Felder des beauftragung-flow gefüllt" → Finalize → `signSAandCreateFall` (claim-nativ). |
| **P4** | **Slot-Carry** | WizardClient/actions + `lib/onboarding/slots.ts` | Wizard-reservierter Slot (GFA `reservierter_slot_*`) → Lead-Termin (`gutachter_termine.lead_id`); FlowLink überspringt eigenes Matching/Booking; `signSAandCreateFall` bestätigt + setzt `claim_id` (SP-G2, §6). |
| **P5** | **Wizard trimmen + Handoff** | `WizardClient.tsx`, gutachter-finden-Config, `finalizeAnfrage.ts` | gutachter-finden endet nach Termin+Kontakt → `issueSelfServiceFlowLink` (gebaut) + Magic-Link; alte `konvertiereAnfrageZuFall`-Finalize raus. |
| **P6** | **Leak-Fix Matcher** | `src/lib/onboarding/svMatching.ts`, WizardClient SV-Banner | `firmenname` → `vorname`-only (reuse `toOeffentlichesSvProfil`). Matcher bleibt leads-aware (≠ AAR-940 Tier-1-only — bewusst). |
| **P7** | **Promotion config-driven** | `promoteAnfrageZuLead`/`createLead` | GFA→Lead-Mapping über `db_target`/Spalten-Konvention statt hardcoded. |
| **MIG** | **Cluster-LP-Migration** (zuletzt, live!) | `/anfrage/[token]/*` (bespoke Clients ablösen) | `/anfrage` rendert `WizardClient(flowKey=beauftragung)` statt AnfrageStart/SelbstQuali/TerminBuchung. **Behavior-preserving + Re-Smoke** der live Strecke (scripts/smoke-aar940-staging.py). |

**B — bei Impl zu verifizieren:** B1 konvertiereAnfrageZuFall vs signSAandCreateFall · B2 dispatch/gutachter-finder-Disposition (lead-typ→echter SV) · B3 reserviereSlot↔GFA↔gutachter_termine · B5 getOnboardingSteps (Deferral-Liste) · B6 leads-Spalten für db_target.
**C — Thread 2 (separater Track, net-new):** Free-Plan-paket · Self-Claim-Standort (DAT-Lead→sachverstaendige free + `sv_lead_id`-Link) · 3-Wege-Matcher (paid>free>leads).

---

## 5. Gelockte Entscheidungen (Kurz — Details Spec §2/§3)

- **Lead vollständig (Convert-Gate)** = alle `pflicht`-Felder des `beauftragung`-flow gefüllt (fällt aus den Config-Flags, kein Hardcode). Set: Kontakt · Schaden-Basics · Besichtigungsort · Termin+SV reserviert · Schuldfrage(≠eigenverschulden) · Service(+Kanzlei) · SA. Rest (Fahrzeug-Detail, Doku, Bank, Halter) = **nachgezogen** im Onboarding.
- **db_target-Routing:** Wizard-Front→`gutachter_finder_anfragen`, Beauftragung→`leads`, Onboarding→`faelle`/`claims`.
- **Termin = eigener Lifecycle** (`gutachter_termine` + State-Machine) → Anfrage bleibt schlank, referenziert nur.
- **3-Tier (Matching):** paid > free-plan > leads(Bluff+Dispatch). Thread 1 = heutige Tiers (paid `standard`/`pro` + leads); Free-Tier = Thread 2.

---

## 6. ⚠️ KRITISCHE CONSTRAINTS (PFLICHT vor dem Bauen)

1. **leads-RLS:** `leads` ist service_role-only (anon kein Write). Der Beauftragung-Save MUSS token-gevalidet + `createAdminClient` sein (AAR-940-Muster `ladeAnfrageByToken`), **NICHT** der anon `saveOnboardingStep`. `groupFelderByTarget` ist der geteilte pure Teil.
2. **Geteilte LIVE-Engine:** `WizardClient` läuft für `gutachter-finden` UND `kunde-onboarding` (beide live). Alle Änderungen **additiv/backward-kompatibel** — sonst brechen Live-Flows. (`saveStep`-Refactor nur mit Coverage.)
3. **Live-Prod-Migration:** Cluster-LP `/anfrage` ist scharf (`SELF_SERVICE_AUTO_ISSUE=true` prod). Migration auf den dynamischen Flow **zuletzt + behavior-preserving + Re-Smoke**. Deshalb gutachter-finden ZUERST (neu, fasst Live nicht an).
4. **SP-G2-Termin-Fix:** `signSAandCreateFall` setzt beim Termin-Upgrade `claim_id` (Fix aus PR #2134, heute live). Beauftragung-Finalize nutzt genau diesen Pfad — nicht regredieren.
5. **Worktree-Junction:** lokales `tsc`/`next build` ist unzuverlässig (false TS2307, Memory `feedback_worktree_build_gate`). **CI-`build` ist das autoritative Gate.** Lokal: `npx vitest run <file>` funktioniert (im Worktree-cwd).
6. **`DynamicWizard.tsx`** lag NICHT am erwarteten Pfad — der Config-Loader/Server-Wrapper (lädt `onboarding_phasen` per flow_key, rendert `WizardClient`) ist noch zu lokalisieren (`page.tsx` von `/gutachter-finden` bzw. `/anfrage` folgen).
7. **Harte Regeln:** DDL NUR via Plugin-`apply_migration` (P1b-Config = getrackte Seed-Migration, File==recorded version) · PR `--base staging`, nie main, nie selbst mergen · 7-Punkte-Audit pro Commit · Umlaute in UI-Strings · Server-Actions = Result-Object (kein throw) · neue UI NUR `primitives.Button/Card` (sonst CI-component-set-ratchet rot).

---

## 7. Branch / Worktree / Weiterbauen

- **Branch:** `kitta/gutachter-finder-self-service` (ab `origin/staging`, gepusht). Enthält Spec + P1-Helper.
- **Worktree:** läuft aktuell im `aar-940-self-service`-Worktree (geteilt) — eine frische Session legt besser einen **eigenen** Worktree an (`node scripts/new-session-worktree.mjs gutachter-finder-self-service`) und checkt den Branch aus, um Datei-Kollisionen zu vermeiden.
- **Tests:** `cd <worktree> && npx vitest run src/lib/onboarding/group-felder-by-target.test.ts` (Muster für neue TDD-Files).
- **Engine-Kern gelesen:** `WizardClient.tsx` (Phasen-Iteration, `validatePhase`=pflicht-aware, `handleWeiter`→`saveOnboardingStep`→slot-`reserviereSlot`→last-phase-Finalize `if(flowKey==='gutachter-finden')`), `saveStep.ts` (gruppiert schon nach db_target, ALLOWED_TABLES=GFA, anon), `types.ts` (`OnboardingFeld.db_target/pflicht/conditional_on`).

---

## 8. NÄCHSTER konkreter Schritt

**P1a — token-leads-Save-Action.** In `src/app/anfrage/[token]/actions.ts` (neben `ladeAnfrageByToken`):
```
speichereBeauftragungStep(token, phaseKey, values, felder):
  ladeAnfrageByToken(token) → leadId = anfrage.konvertiert_zu_lead_id (sonst Fehler "nicht promotet")
  grouped = groupFelderByTarget(felder, values, { allowedTables: new Set(['leads']) })
  if grouped.leads: admin.from('leads').update(grouped.leads).eq('id', leadId).select('id')  // 0 rows → not_found
  revalidatePath(...) ; return { ok }
```
Pur-Teil ist schon getestet (`groupFelderByTarget`). Danach P1b (beauftragung-Config) + P1c (WizardClient Save-Adapter/Finalize-Map).

---

*Stand der Übergabe: AAR-940 prod-live + komplette Strecken-Architektur designt/gelockt/gespec't + P1-Fundament getestet & committed. Der Rest (P1-Rest → P7 + Cluster-LP-Migration) ist ein fokussierter Mehr-Schritt-Bau an geteilter/Live-Engine — frischer Kopf empfohlen.*
