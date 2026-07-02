# Makler-Aktivierungs-Onboarding — Implementierungs-Plan

> executing inline. Spec: `docs/superpowers/specs/2026-07-02-makler-onboarding-aktivierung-design.md`.

**Goal:** Registrierter Makler → aktiver Teiler (1:1 + passiv), via 3 Touchpoints (Success-Share, Welcome-Mail, Erst-Login-Wizard) + geteilte Share-Tools.

## Global Constraints
- UI-Umlaute Pflicht (kundensichtbar). Result-Object (kein throw) für Server-Actions. Non-critical Sends (Email) in try/catch.
- DDL nur via `apply_migration` (Regel 2), File==getrackte Version.
- src/-Ratchets (component-set/token-audit): `primitives.Button`, Claimondo-Tokens, `rounded-ios-*`.
- Motivation durchgängig **Kundennutzen**, kein Provisions-Claim.

---

### T0: DDL `makler.onboarding_abgeschlossen`
`alter table public.makler add column onboarding_abgeschlossen boolean not null default false` → apply_migration → list_migrations → File `supabase/migrations/<V>_makler_onboarding_abgeschlossen.sql`. Verify per execute_sql (READ).

### T1: `share-snippets` util + `ShareTools` (TDD)
- **NEU** `src/lib/makler/share-snippets.ts` — `buildShareSnippets(code, firma, base) → { url, whatsappHref, signatur, embed }`. TDD (vitest): url = `${base}/m/${code}`; whatsappHref = `https://wa.me/?text=<enc>`; signatur/embed enthalten firma+url.
- **NEU** `src/components/makler/ShareTools.tsx` — Client-UI: WhatsApp-Button (`primitives.Button`), „Link kopieren", Signatur-Snippet (copy), Embed-Snippet (copy). Nutzt `buildShareSnippets`. Clipboard mit Fallback.

### T2: Welcome-E-Mail
- **NEU** `src/lib/email/google/templates/MaklerWelcome.tsx` (react-email, Vorbild `sendWillkommenSv`-Template) — Willkommen [Firma], Passwort-setzen-Button (actionUrl), Landeseite [url], Kundennutzen + „so teilst du".
- **NEU** `sendMaklerWelcome({ to, firma, actionUrl, url })` in `src/lib/email/google/flows.ts`.
- **MODIFY** `src/app/makler/registrieren/actions.ts` — `resetPasswordForEmail` → `admin.auth.admin.generateLink({type:'recovery', email})` → `sendMaklerWelcome(...)` (best-effort try/catch). Landeseiten-url aus code.

### T3: Success-Page-Share
- **MODIFY** `src/app/makler/registrieren/MaklerRegistrierenClient.tsx` — success-State: `<ShareTools code firma />` (WhatsApp/copy prominent) über dem Login-Button. „Deine Landeseite ist LIVE".

### T4: Onboarding-Wizard + Erst-Login-Redirect
- **NEU** `src/app/makler/(shell)/onboarding/page.tsx` (Server: lädt makler+code) + `OnboardingWizardClient.tsx` — 4 Schritte (Willkommen+Vorschau · 1:1 teilen [ShareTools] · passive Kanäle [ShareTools] · Verfolgen). Skip/Fertig → Action.
- **NEU** `src/app/makler/(shell)/onboarding/actions.ts` — `markiereOnboardingAbgeschlossen()` (Result-Object; `update makler set onboarding_abgeschlossen=true`).
- **MODIFY** `src/app/makler/(shell)/page.tsx` (Dashboard-Entry, NICHT das Layout → sonst Loop mit /onboarding): wenn `onboarding_abgeschlossen=false` → `redirect('/makler/onboarding')`.

### T5: `/makler/promo`-Integration
- **MODIFY** `src/components/makler/MaklerPromo.tsx` — `ShareTools` (Signatur/Embed) ergänzen + Onboarding-Checkliste (wenn `onboarding_abgeschlossen=false`).

### Verify + PR
- `npm run build`/tsc + vitest (share-snippets) + Ratchets. E2E-Smoke prod (Registrierung→Wizard→Skip setzt Flag) mit Cleanup. PR base staging.
