# SV-Profil-Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/gutachter/profil` von einem 908-Zeilen-Monolithen (Profil+Settings gemischt) zu einem fokussierten Profil aus Section-Components umbauen; Settings (Benachrichtigungen, 2FA, GPS) nach `/gutachter/einstellungen` verschieben.

**Architecture:** Verhaltens-erhaltender Extraction-/Move-Refactor. `ProfilClient` wird dünner Orchestrator, der `profil/_components/*`-Sections rendert. Settings-Panels wandern (inkl. Server-Load) in die bestehende Einstellungen-Hub-Page. Keine Shell-Änderung (Header→Top-Bar ist Sub-Projekt B, separat/koordiniert).

**Tech Stack:** Next.js 15 (App Router, RSC + 'use client'), React, Tailwind (claimondo-Tokens), Supabase (browser client für Toggles, `updateOwnProfile` Server-Action), `SectionCard`.

## Global Constraints

- Verhaltens-erhaltend: gleiche Felder, gleiche Save-/Toggle-Logik, gleiche Server-Actions. Kein Feature-Add.
- `updateOwnProfile` behält `{ success: boolean; error? }`-Shape (Caller in ProfilClient erwartet `success` — NICHT auf `ok` umstellen).
- Frontend-Strings mit echten Umlauten (ä/ö/ü/ß).
- Design-Tokens: `claimondo-navy/-ondo/-border/-bg`, `var(--brand-*)`, `rounded-ios-*`, `text-success/danger/...` — keine raw Tailwind-Defaults/Hex.
- Komponenten aus dem Set: `SectionCard` (kein handgerolltes `<div class="bg-white rounded border p-...">`).
- Kein DDL. Keine `GutachterShell`-Änderung in diesem Plan.
- Verifikation pro Task: `npx tsc --noEmit` (8GB Heap) clean für geänderte Files (verbleibende 17 TS2307 = borrowed node_modules = env, ignorieren). Am Ende: `npm run build`-Äquivalent via CI + Playwright-Screenshot als `test-sv`.

---

### Task 1: Feld-Primitives extrahieren

**Files:**
- Create: `src/app/gutachter/profil/_components/fields.tsx`
- Modify: `src/app/gutachter/profil/ProfilClient.tsx` (Primitives raus, importieren)

**Interfaces:**
- Produces: `FieldRow({label, value})`, `ControlledRow({label, value, onChange, type?, placeholder?})`, `SelectRow({label, value, onChange, options})`, sowie die Konstanten `ROW_WRAPPER_CLS`, `ROW_LABEL_CLS`, `ROW_INPUT_CLS`. (EditRow ist tot — NICHT mitnehmen, siehe knip.)

- [ ] **Step 1:** `fields.tsx` mit `'use client'` anlegen und die bestehenden Funktionen `FieldRow`, `ControlledRow`, `SelectRow` + die 3 `ROW_*_CLS`-Konstanten **1:1** aus `ProfilClient.tsx` (aktuell Zeilen ~806–907) hierher verschieben, jeweils `export`. `EditRow` weglassen (0 Consumer).
- [ ] **Step 2:** In `ProfilClient.tsx` die verschobenen Funktionen/Konstanten löschen und `import { FieldRow, ControlledRow, SelectRow, ROW_WRAPPER_CLS, ROW_LABEL_CLS } from './_components/fields'` ergänzen.
- [ ] **Step 3:** Run `npx tsc --noEmit` (NODE_OPTIONS=--max-old-space-size=8192) → keine neuen Fehler in `profil/*`.
- [ ] **Step 4:** Commit: `refactor(sv-profil): Feld-Primitives nach _components/fields.tsx extrahiert`

---

### Task 2: Read-only-/Toggle-Sections extrahieren (Vertrag, Community-Privacy, Spezialisierung)

**Files:**
- Create: `src/app/gutachter/profil/_components/ProfilVertrag.tsx`
- Create: `src/app/gutachter/profil/_components/ProfilCommunityPrivacy.tsx`
- Create: `src/app/gutachter/profil/_components/ProfilSpezialisierung.tsx`
- Modify: `src/app/gutachter/profil/ProfilClient.tsx`

**Interfaces:**
- Produces:
  - `ProfilVertrag({ paketLabel: string, offene: number, gesamt: number, zugewiesen: number })` — read-only `FieldRow`s in `SectionCard`.
  - `ProfilCommunityPrivacy({ svId: string, initial: boolean })` — enthält den bestehenden `PrivacyToggle`.
  - `ProfilSpezialisierung({ svId, qualifikationen, spezifikationen, schadenarten })` — die 3 `SpezSection` in einer `SectionCard`.

- [ ] **Step 1:** `ProfilSpezialisierung.tsx` (`'use client'`) anlegen; die bestehende `SpezSection`-Funktion + das umgebende `SectionCard`-Markup („Spezialisierungen", 3 Aufrufe) aus `ProfilClient` (Zeilen ~396–427 + `SpezSection` ~734–804) hierher; Props wie oben; `QUALIFIKATIONEN/SPEZIFIKATIONEN/SCHADENARTEN` aus dem bestehenden constants-Import.
- [ ] **Step 2:** `ProfilCommunityPrivacy.tsx` (`'use client'`) anlegen; `PrivacyToggle` (~633–684) + das `SectionCard`-Wrapping (~429–439) hierher.
- [ ] **Step 3:** `ProfilVertrag.tsx` (`'use client'` nicht nötig — reine Anzeige) anlegen; die 3 Vertrag-`FieldRow`s (~340–345) in eine `SectionCard` mit Header „Vertrag".
- [ ] **Step 4:** In `ProfilClient` die verschobenen Blöcke durch `<ProfilSpezialisierung .../>`, `{sv.rolle_in_organisation === 'community_member' && <ProfilCommunityPrivacy .../>}`, `<ProfilVertrag .../>` ersetzen; Imports ergänzen; die alten Inline-Funktionen (`SpezSection`, `PrivacyToggle`) löschen.
- [ ] **Step 5:** Run `npx tsc --noEmit` → clean für `profil/*`.
- [ ] **Step 6:** Commit: `refactor(sv-profil): Vertrag/Community/Spezialisierung als Sections`

---

### Task 3: Darstellung-Section extrahieren (Profiltext + Google-Business + Branding-Link)

**Files:**
- Create: `src/app/gutachter/profil/_components/ProfilDarstellung.tsx`
- Modify: `src/app/gutachter/profil/ProfilClient.tsx`

**Interfaces:**
- Produces: `ProfilDarstellung({ svId, mapsReady }: { svId: string; mapsReady: boolean })` — rendert die Branding-Verweis-Card (bestehende `BrandingSection`), `{mapsReady && <GoogleBusinessFeld />}`, sowie den Profiltext-Hinweis. (Profiltext-Feld selbst bleibt im Identitaet-Form, Task 4 — hier nur die kunden-sichtbare Darstellung/Verknüpfungen.)

- [ ] **Step 1:** `ProfilDarstellung.tsx` (`'use client'`) anlegen; die bestehende `BrandingSection` (~510–528) + `{mapsReady && <GoogleBusinessFeld/>}` (~485) in eine kohärente Sektion („Wie Kunden dich sehen") auf `SectionCard`.
- [ ] **Step 2:** In `ProfilClient` die Branding/GoogleBusiness-Blöcke durch `<ProfilDarstellung svId={sv.id} mapsReady={mapsReady} />` ersetzen; `BrandingSection`-Inline-Funktion löschen.
- [ ] **Step 3:** Run `npx tsc --noEmit` → clean.
- [ ] **Step 4:** Commit: `refactor(sv-profil): Darstellung-Section (Branding + Google-Business)`

---

### Task 4: Identität-/Firma-/Standort-Form-Section extrahieren

**Files:**
- Create: `src/app/gutachter/profil/_components/ProfilStammdaten.tsx`
- Modify: `src/app/gutachter/profil/ProfilClient.tsx`

**Interfaces:**
- Consumes: `FieldRow/ControlledRow/SelectRow` aus Task 1.
- Produces: `ProfilStammdaten({ email, profile, sv })` — kapselt Avatar-Kopf + das gesamte Edit/View-Form (Anrede…HRB) + Standort (`GooglePlaceAutocomplete`) + Save via `updateOwnProfile`. Hält den lokalen `form`/`standort`/`editing`-State (aus ProfilClient herausgezogen). Rendert die `Maps`-`<Script>`-Einbindung + `mapsReady`-State und exponiert `mapsReady` NICHT (Darstellung-Section bekommt eigenen mapsReady — ODER: mapsReady bleibt in ProfilClient und wird an beide durchgereicht; **Entscheidung: mapsReady bleibt im ProfilClient-Orchestrator**, Task 5).

- [ ] **Step 1:** `ProfilStammdaten.tsx` (`'use client'`) anlegen; Avatar-Header (~212–223), das Fields-Grid (View+Edit, ~226–346 OHNE den Vertrag-Block der in Task 2 ging), die Save-Actions (~348–372), `handleSave` + `form`/`standort`/`editing`/`saving`/`error`/`success`-State + `updateField`/`onPlaceSelect` hierher. Props `{ email, profile, sv }`. `mapsReady` als Prop reinreichen.
- [ ] **Step 2:** In `ProfilClient` den Form-Block durch `<ProfilStammdaten email={email} profile={profile} sv={sv} mapsReady={mapsReady} />` ersetzen; zugehörigen State/Handler aus ProfilClient entfernen (wandern in die Section).
- [ ] **Step 3:** Run `npx tsc --noEmit` → clean.
- [ ] **Step 4:** Commit: `refactor(sv-profil): Stammdaten/Firma/Standort-Form als Section`

---

### Task 5: ProfilClient → dünner Orchestrator + Maps-Script zentral

**Files:**
- Modify: `src/app/gutachter/profil/ProfilClient.tsx`

**Interfaces:**
- Consumes: alle Task-2/3/4-Sections.
- Produces: `ProfilClient`-Default-Export bleibt (gleiche Props-Signatur MINUS `notificationPrefs`/`pendingTermine` — die gehen in Task 6/7).

- [ ] **Step 1:** `ProfilClient` reduzieren auf: Maps-`<Script>` + `mapsReady`-State (einmal, zentral), `<ProfilStammdaten mapsReady/>`, `<ProfilDarstellung mapsReady/>`, `<ProfilSpezialisierung/>`, `{community_member && <ProfilCommunityPrivacy/>}`, `<ProfilVertrag/>`. Der (in Task 6 verschiebende) 2FA/Benachrichtigungen/GPS-Block bleibt vorerst stehen.
- [ ] **Step 2:** Run `npx tsc --noEmit` → clean; sicherstellen `ProfilClient` ist jetzt < ~120 Zeilen.
- [ ] **Step 3:** Commit: `refactor(sv-profil): ProfilClient als dünner Orchestrator`

---

### Task 6: Settings nach /einstellungen verschieben (inkl. Server-Load-Split)

**Files:**
- Modify: `src/app/gutachter/profil/page.tsx` (Loads entfernen)
- Modify: `src/app/gutachter/profil/ProfilClient.tsx` (Settings-Blöcke + Props raus)
- Modify: `src/app/gutachter/einstellungen/page.tsx` (Loads + Sections ergänzen)
- Create: `src/app/gutachter/einstellungen/_components/EinstellungenSettings.tsx` (client wrapper für die verschobenen Panels)

**Interfaces:**
- Consumes: bestehende `NotificationPreferencesForm`, `TwoFaPhoneChange`, `TotpEnrollCard`, `PhoneVerificationModal`, `GpsTrackingToggle` (letzterer aus ProfilClient extrahieren nach `_components/`).
- Produces: `EinstellungenSettings({ svId, notificationPrefs, twofaTelefon, telefonFallback, gpsInitial })`.

- [ ] **Step 1:** `GpsTrackingToggle` (~703–730) + `TwoFaPhoneSection` (~688–701) aus ProfilClient nach `einstellungen/_components/EinstellungenSettings.tsx` (`'use client'`) verschieben; dort die Sektionen Benachrichtigungen (`NotificationPreferencesForm role="sachverstaendiger"`), 2FA (`TwoFaPhoneChange` + `TotpEnrollCard` + `TwoFaPhoneSection`), Live-Standort (`GpsTrackingToggle`) auf `SectionCard` rendern.
- [ ] **Step 2:** `einstellungen/page.tsx`: `getGutachterForUser` um `live_tracking_enabled` erweitern; `notificationPrefs` + `profiles.twofa_telefon` laden (wie zuvor in `profil/page.tsx`); `<EinstellungenSettings .../>` nach der Kalender-Sektion, vor DSGVO, rendern.
- [ ] **Step 3:** `profil/page.tsx`: Loads für `notificationPrefs`, `twofa_telefon`, `pendingTermine` entfernen; `googleConnected` nur behalten falls noch genutzt (Kalender-Card ging → prüfen: wird `googleConnected` in ProfilClient noch gebraucht? Wenn nein, Load + Prop entfernen). ProfilClient-Props entsprechend kürzen.
- [ ] **Step 4:** In ProfilClient die Blöcke `<TwoFaPhoneChange/>`, `<TotpEnrollCard/>`, `<TwoFaPhoneSection/>`, GPS-`SectionCard`, `<NotificationSection/>` + die Kalender-Verweis-Card (~379–393, lebt schon in Einstellungen) löschen; `notificationPrefs`/`pendingTermine`/`googleConnected`-Props raus.
- [ ] **Step 5:** Run `npx tsc --noEmit` → clean für `profil/*` + `einstellungen/*`. Grep `profil/` nach verwaisten Imports (`grep -rn "TwoFa\|Notification\|Gps\|pendingTermine" profil/`).
- [ ] **Step 6:** Commit: `refactor(sv): SV-Settings (Benachrichtigungen/2FA/GPS) von /profil nach /einstellungen`

---

### Task 7: Terminanfragen-Rest entfernen + Dead-Code + Verifikation

**Files:**
- Modify: `src/app/gutachter/profil/ProfilClient.tsx` + `page.tsx` (Rest von `pendingTermine`/`TerminAnfrage`)

**Interfaces:**
- Produces: sauberes `/profil` ohne operative/Settings-Reste.

- [ ] **Step 1:** `TerminAnfrage`-Inline-Funktion (~530–631) + „Offene Terminanfragen"-Block + `pendingTermine`-Prop aus ProfilClient löschen; `page.tsx` `pendingTermine`-Load entfernen (falls in Task 6 noch nicht).
- [ ] **Step 2:** `npm run check:knip -- --ratchet` → keine neuen toten Files (die neuen `_components/*` sind alle konsumiert); `npm run check:component-set -- --ratchet` + `check:token-audit` → 0 neu.
- [ ] **Step 3:** `npx tsc --noEmit` clean für alle geänderten Files.
- [ ] **Step 4:** Playwright-Verifikation als `test-sv` (`.env.local` mit TEST_SV_PASSWORD + TEST_SV_TOTP_SECRET; Harness `tests/e2e/fixtures.ts`): Screenshot `/gutachter/profil` (schlank, Save funktioniert) + `/gutachter/einstellungen` (Benachrichtigungen/2FA/GPS da + funktional). Vorher/Nachher dokumentieren.
- [ ] **Step 5:** Commit: `refactor(sv-profil): Terminanfragen raus + Dead-Code + Verifikation`

---

## Self-Review

**Spec coverage:** /profil-behält (T2/3/4), →/einstellungen (T6), raus (T7), Section-Struktur (T1–5), Server-Load-Split (T6), Reuse bestehender Components (alle Tasks), Verifikation (T7). Header→Top-Bar = Sub-Projekt B, out-of-scope (Spec §4). Abgedeckt.

**Placeholder scan:** Extraktions-Referenzen sind Zeilen-präzise auf existierenden Code (kein Platzhalter — der Code existiert, wird verschoben). Ein offener Entscheid: `googleConnected`-Nutzung in ProfilClient nach Kalender-Card-Move (T6 Step 3 prüft explizit + entfernt bei 0 Consumer).

**Type consistency:** Section-Props (svId/profile/sv/mapsReady) konsistent über Tasks; `updateOwnProfile` `success`-Shape unangetastet.

**Hinweis:** Zeilennummern beziehen sich auf den `ProfilClient.tsx`-Stand bei Plan-Erstellung (908 Zeilen) — der ausführende Worker verifiziert per Suche nach dem Funktions-/Block-Namen, falls verschoben.
