# Makler-Aktivierungs-Onboarding — Design-Spec

**Datum:** 2026-07-02 · **Autor:** Session fbca7869 (Brainstorming mit Aaron)
**Kontext:** Follow-up der live Makler-Vermittlung-Strecke ([[makler-self-registrierung-bau]] / [[makler-landeseite-hub]]). Adressiert den schwächsten Funnel-Link: **Aktivierung**.

## Ziel (ein Satz)
Aus einem frisch registrierten Makler einen **aktiven Teiler** seiner Landeseite machen (1:1 **und** passiv), motiviert über **Kundennutzen** — statt der heutigen Sackgasse „register → generische Supabase-Mail → nichts".

## Problem
Nach `registriereMaklerSelf` bekommt der Makler nur `resetPasswordForEmail` (generische Supabase-Mail). Kein „teile jetzt"-Moment, kein Onboarding, keine passiven Werkzeuge. Ein registrierter Makler, der nie teilt = 0 Leads.

## Entscheidungen (Aaron, 02.07.)
1. **Beide Share-Modi:** 1:1 (WhatsApp an einzelne Kunden) **+** passiv (QR im Büro, E-Mail-Signatur, Website-Embed). **1:1 zuerst** als Aktivierung.
2. **Erst-Login = geführter Onboarding-Wizard** (mehrstufig, überspringbar; Checkliste bleibt auf `/makler/promo` bis erledigt).
3. **Motivation = Kundennutzen** („unverschuldet = 0 € für deine Kunden, §249, voller Service, Kundenbindung"). **KEIN Provisions-Claim** (entkoppelt den Bau von der UWG-Frage; Provision später).

## Architektur — 3 Touchpoints

### 1 · Erfolgs-Seite „Teile jetzt" (sofort, kein Login)
`MaklerRegistrierenClient` success-State: „Deine Empfehlungs-Landeseite ist **LIVE**: [URL]" + **WhatsApp-Share** (vorformulierter Kundennutzen-Text) + **Link kopieren** + „Für QR & mehr: einloggen [Login]". Fängt die höchste Intention direkt ab, unabhängig von E-Mail-Zustellung.

### 2 · Branded Welcome-E-Mail
`registriereMaklerSelf`: `resetPasswordForEmail` → `admin.auth.admin.generateLink({type:'recovery'})` + **`sendMaklerWelcome`** (neue react-email-Vorlage `MaklerWelcome`). Inhalt: „Willkommen als Claimondo-Partner, [Firma]!" · *Passwort setzen & einloggen*-Button (magic-link) · deine Landeseite [URL] · Kundennutzen-Framing + „so teilst du sie". Best-effort (non-critical).

### 3 · Geführter Onboarding-Wizard (Erst-Login)
Neue Route `src/app/makler/(shell)/onboarding` (auth-gated — Makler ist eingeloggt). 4 Schritte:
1. **Willkommen + dein Link** (Landeseiten-Vorschau/iframe).
2. **Jetzt 1:1 teilen** (WhatsApp-Button vorformuliert + Link kopieren) — die Aktivierung.
3. **Passive Kanäle** (QR-Download · E-Mail-Signatur-Snippet · Website-Embed-Snippet).
4. **Verfolgen** (Stats-Vorschau + Kundennutzen-Zusammenfassung) → „Fertig, ins Portal".
Überspringbar. **Erst-Login-Erkennung** via `makler.onboarding_abgeschlossen` (bool). Skip/Complete → Flag=true; solange false → Portal-Entry redirectet → `/makler/onboarding`, und `/makler/promo` zeigt die Checkliste.

## Neue Werkzeuge (im Wizard + auf `/makler/promo`)
- **E-Mail-Signatur-Snippet** (kopierbar): z.B. „[Firma] · Kfz-Schaden? Kostenlos regulieren: claimondo.de/m/[code]".
- **Website-Embed-Snippet** (kopierbar): HTML-`<a>`/Badge auf die Landeseite.
- (QR-SVG/PNG + WhatsApp/E-Mail/LinkedIn-Share existieren bereits in `MaklerPromo`.)
Extrahiert in eine geteilte Komponente `ShareTools` (Wizard + `/makler/promo` nutzen sie).

## Datenmodell
- **NEU** `makler.onboarding_abgeschlossen boolean not null default false`. Via **Supabase-Plugin** (`apply_migration`, Regel 2); File == getrackte Version. Set `true` bei Wizard-Complete **oder** Skip (Server-Action).
- (Keine weiteren Schema-Änderungen — Promo/QR/Stats existieren.)

## Komponenten (File-Struktur)
### NEU
- `src/lib/email/google/templates/MaklerWelcome.tsx` (react-email, Vorbild `WillkommenSv`) + `sendMaklerWelcome(params)` in `src/lib/email/google/flows.ts`.
- `src/app/makler/(shell)/onboarding/page.tsx` + `OnboardingWizardClient.tsx` (4-Schritt-Wizard).
- `src/app/makler/(shell)/onboarding/actions.ts` — `markiereOnboardingAbgeschlossen()` (Result-Object).
- `src/components/makler/ShareTools.tsx` — WhatsApp/copy + Signatur-Snippet + Embed-Snippet (geteilt).
### MODIFY
- `src/app/makler/registrieren/MaklerRegistrierenClient.tsx` — Success-State: Share-Buttons (WhatsApp/copy).
- `src/app/makler/registrieren/actions.ts` — `resetPasswordForEmail` → `generateLink` + `sendMaklerWelcome`.
- `src/app/makler/(shell)/promo/page.tsx` + `src/components/makler/MaklerPromo.tsx` — `ShareTools` einbinden (Signatur/Embed) + Onboarding-Checkliste (wenn `onboarding_abgeschlossen=false`).
- Portal-Erst-Login-Weiche (das `(shell)`-Layout **oder** die Portal-Root-Page): neue Makler (`onboarding_abgeschlossen=false`) → Redirect `/makler/onboarding`.
### REUSE
- `MaklerPromo` (QR/Share), `getMaklerPrimaryPromoCode`, `landingBase()`/`NEXT_PUBLIC_SITE_URL`, `getCurrentMakler`.

## Error-Handling
- Welcome-E-Mail + `generateLink`: best-effort try/catch (Account steht auch ohne; Makler kann „Passwort vergessen" nutzen).
- `markiereOnboardingAbgeschlossen`: Result-Object; ein Fail lässt den Makler ins Portal (Wizard zeigt notfalls nochmal — harmlos).
- `ShareTools` Clipboard: Fallback, wenn `navigator.clipboard` fehlt.

## Testing
- **vitest:** Snippet-Generierung (Signatur- + Embed-String korrekt aus code/firma); `sendMaklerWelcome`-Payload; `markiereOnboardingAbgeschlossen` (Flag-Update).
- **E2E-Smoke (prod, mit Cleanup wie #3427-E2E):** Registrierung → Success-Share sichtbar → Welcome-Mail generiert (Log) → erster Login → Wizard erscheint → Skip setzt `onboarding_abgeschlossen=true` → zweiter Login zeigt Wizard NICHT mehr. Test-Makler danach löschen.

## Koordination
- **Frischer Worktree** (`kitta/makler-onboarding-aktivierung` off staging, isoliert — Kollisions-Warnung).
- Touched: Makler-Portal (`/makler/(shell)/promo`, neu `onboarding`), `registrieren/*`, `email/flows.ts` + neue Vorlage. Vor Edit an geteilten Files (`flows.ts`, `MaklerPromo`) `git log origin/staging` prüfen.
- **DDL** `makler.onboarding_abgeschlossen`: apply_migration → list_migrations → File nach getrackter Version benennen.

## Out of Scope
- **Provision-Transparenz** (UWG, Aaron) — layert später ins Kundennutzen-Framing.
- **Re-Engagement-Nudges** (Makler teilt nicht → Erinnerung nach N Tagen) — Follow-up.
- **Akquise-LP-Verbesserungen** (Social Proof etc.) — eigene Richtung.
- **createMakler-Refactor** + branded-Email-Deferral aus dem Reg-Bau (letzterer wird HIER durch `sendMaklerWelcome` mit-erledigt).
