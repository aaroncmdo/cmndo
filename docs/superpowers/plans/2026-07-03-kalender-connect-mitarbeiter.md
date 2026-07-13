# SP2b — Kalender-Connect-UI für Mitarbeiter — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).

**Goal:** KB/Dispatch/Admin können auf `/mitarbeiter/profil` Google + CalDAV verbinden — via geteiltem `KalenderConnectPanel`.

**Architecture:** Panel aus der SV-Connect-UI extrahieren (`returnPath`-Prop) → SV-Client darauf refactoren → Panel + State-Load in die KB-Profilseite.

**Tech Stack:** Next.js 16 (App Router, RSC + client), Supabase.

## Global Constraints
- Regel 1: Branch `kitta/kalender-connect-mitarbeiter` (erstellt, stacked auf SP2a), PR gegen SP2a-Branch (auto-retarget staging).
- Umlaute in UI-Strings (Pflicht — nutzersichtbare Cards/Buttons/Disclaimer).
- Component-Set-Policy: geteiltes Composite in `src/components/shared/`.
- 7-Punkte-Audit vor jedem Commit.
- Keine DB-/Migration-Änderung. Keine neue Server-Action (SP2a-Modul nutzen).

## File Structure
- **Create:** `src/components/shared/KalenderConnectPanel.tsx` (client) — Google+CalDAV-Cards + Modal, `returnPath`-Prop.
- **Modify:** `src/app/gutachter/einstellungen/kalender/KalenderEinstellungenClient.tsx` — auf Panel refactoren.
- **Modify:** `src/app/mitarbeiter/profil/page.tsx` — State-Load + Panel-Section.

---

### Task 1: `KalenderConnectPanel` extrahieren + SV-Client refactoren

**Files:** Create `src/components/shared/KalenderConnectPanel.tsx`; Modify `KalenderEinstellungenClient.tsx`.

**Interfaces:** Produces `KalenderConnectPanel({ googleConnected, googleEmail, caldav, returnPath })` + exportierter `CalDavState`-Type.

- [ ] **Step 1: Panel erstellen** — den Inhalt von `KalenderEinstellungenClient` **innerhalb** des äußeren `<div>` OHNE `PageHeader` (also Google-`<section>` + CalDAV-`<section>` + Footer-Disclaimer + `CalDavConnectModal`) in `KalenderConnectPanel.tsx` verschieben. Änderungen:
  - Props `{ googleConnected: boolean; googleEmail: string | null; caldav: CalDavState | null; returnPath: string }`; `CalDavState`-Type hierher + `export`.
  - `handleConnectGoogle`: `return=` → `encodeURIComponent(returnPath)`.
  - `disconnectCaldav`-Import aus `@/lib/kalender/connect/caldav-connect-actions` (SP2a).
  - Äußerer Wrapper des Panels: `<div className="space-y-5">` (ohne `max-w-3xl mx-auto py-6 px-4` — das Layout gibt der Caller vor).
  - Disclaimer-Text neu (generisch/korrekt): „Credentials werden verschlüsselt gespeichert (AES-256-GCM). Claimondo berücksichtigt deine Kalender-Verfügbarkeit bei Terminvorschlägen."
- [ ] **Step 2: SV-Client refactoren** — `KalenderEinstellungenClient` rendert `<div className="max-w-3xl mx-auto py-6 px-4 space-y-5"><PageHeader …/><KalenderConnectPanel googleConnected={…} googleEmail={…} caldav={…} returnPath="/gutachter/einstellungen/kalender" /></div>`. `svId`-Prop bleibt in der Signatur (page.tsx übergibt es), wird aber nicht mehr genutzt → als `_svId` markiert lassen (bereits so). Ungenutzte Imports (CalendarIcon etc., jetzt im Panel) entfernen.
- [ ] **Step 3: tsc** `npx tsc --noEmit` (0).
- [ ] **Step 4: Commit** (`feat(kalender-connect): Task 1 — KalenderConnectPanel extrahiert + SV-Client refactoren`).

---

### Task 2: KB-Profilseite — State-Load + Panel

**Files:** Modify `src/app/mitarbeiter/profil/page.tsx`.

- [ ] **Step 1: Google + CalDAV-State laden.** Im bestehenden `profiles`-Select `google_connected_at, google_email` ergänzen. Danach die caldav-Row laden:
  ```ts
  const { data: caldavRow } = await supabase
    .from('kalender_verbindungen')
    .select('id, provider_label, username, calendar_display_name, connected_at, last_sync_at, last_error, last_error_at')
    .eq('profile_id', user.id)
    .eq('provider', 'caldav')
    .maybeSingle()
  ```
  `CalDavState` bauen (analog SV-`page.tsx`: `id`, `providerLabel: provider_label ?? 'CalDAV'`, `username`, `calendarDisplayName`, `connectedAt: connected_at`, `lastSyncAt`, `lastError`, `lastErrorAt`) oder `null`.
- [ ] **Step 2: Panel rendern** — zwischen `MitarbeiterProfilClient` und `KontoSicherheitPanel` eine Section:
  ```tsx
  <div className="mt-5 max-w-3xl px-4">
    <h2 className="text-base font-semibold text-claimondo-navy mb-3">Kalender</h2>
    <KalenderConnectPanel
      googleConnected={!!profile.google_connected_at}
      googleEmail={(profile.google_email as string | null) ?? null}
      caldav={caldavState}
      returnPath="/mitarbeiter/profil"
    />
  </div>
  ```
  Import `KalenderConnectPanel` from `@/components/shared/KalenderConnectPanel`.
- [ ] **Step 3: tsc (0) + Full-Build** (`NODE_OPTIONS=--max-old-space-size=8192 npm run build`) grün (Route betroffen).
- [ ] **Step 4: Commit** (`feat(kalender-connect): Task 2 — Kalender-Section auf /mitarbeiter/profil`).

---

### Task 3: Verifikation + PR

- [ ] **Step 1:** tsc 0 · Full-Build 0 (aus Task 2) · 3 Ratchets 0 neue (v.a. component-set — Extraktion darf keinen NEUEN Verletzer erzeugen).
- [ ] **Step 2: Prod-Smoke (deployed):** `/mitarbeiter/profil` als KB (JWT-Cookie) rendern → „Kalender"-Section sichtbar, Google+CalDAV-Cards „nicht verbunden", kein 5xx/Crash beim State-Load; Google-Button-`href` trägt `return=/mitarbeiter/profil`. (Erst nach Deploy des Branches möglich — sonst Code-Pfad-Beweis.)
- [ ] **Step 3: 7-Punkte-Audit** + Session-Abschluss-Check (status/stash/unpushed).
- [ ] **Step 4: Push + PR** gegen `kitta/kalender-verbindungen-ssot` (SP2a-Branch, stacked; auto-retarget staging).
- [ ] **Step 5: Marker** + MEMORY.md aktualisieren (SP2b gebaut).

## Self-Review
- Spec-Coverage: Panel-Extraktion (T1), KB-Seite (T2), Verify+PR (T3) — deckt die Spec.
- Platzhalter: keine — Panel-Move + Query sind konkret; `CalDavState`-Shape aus SV-page.tsx übernommen.
- Typ-Konsistenz: `CalDavState` einmal (Panel-Export); `returnPath` durchgängig.
- Risiko: SV-Extraktion = identische Markup; KB additiv; kein DB-Change.
