# Interne 2FA-Self-Service-Surface (Design/Spec)

**Datum:** 2026-06-20
**Ticket:** AAR-939 (2FA-Erweiterung)
**Branch:** `kitta/aar-939-internal-2fa-surface`
**Kontext:** Phone-MFA live auf prod; TOTP (#3040) gemergt→staging + browser-validiert. Externe Rollen (kunde/gutachter) haben 2FA-Self-Service auf ihrer `profil`-Seite (`TwoFaPhoneChange` + `TotpEnrollCard`). **Interne Rollen (admin/dispatch/kanzlei/makler/kundenbetreuer = 11 Konten, alle Email-Auth, 0 Google) haben KEINE Surface** → können weder Phone noch TOTP einrichten. Genau diese Konten mit Vollzugriff auf Kundendaten/Akten/Finanzen sollen 2FA **opt-in** self-serven können.

## Ziel & Nicht-Ziel

**Ziel:** Eine Self-Service-2FA-Surface für die internen Rollen — Wiederverwendung der bestehenden, bereits validierten Cards. Jeder interne User KANN Phone und/oder TOTP einrichten/entfernen.

**Nicht-Ziel:**
- **Kein Enforcement-Gate** (Aaron-Entscheidung 20.06.: opt-in, kein Zwang). Niemand wird zum Enrollen gezwungen, kein Lockout-Risiko, keine Middleware-Änderung.
- **Keine Recovery-Codes** (eigener Folge-Ticket-Scope).
- **Keine Konsolidierung von kunde/gutachter** auf das neue Panel (funktionieren; spätere optionale Vereinheitlichung).
- **Kein neues Auth-/MFA-System** — native Supabase-MFA bleibt, die Cards sind unverändert.

## Sicherheitsmodell (Kern-Eigenschaft)

Supabase-MFA ist **session-scoped**: `listeFaktoren`, `TwoFaPhoneChange` und `TotpEnrollCard` operieren ausschließlich über `supabase.auth.mfa.*` des eingeloggten Users. Die Seite zeigt/ändert **nur die eigenen Faktoren** — es gibt **keine Cross-User-Daten**. Daraus folgt: die Seite ist für **jeden** authentifizierten User datensicher; der Portal-Role-Guard ist rein **kosmetisch** (richtige Portal-Chrome/Nav), kein Leak-Vektor. Das hält das Design simpel und robust — wir brauchen keinen neuen, dedizierten Guard.

## Architektur (Approach A — Shared Panel + dünne Pro-Portal-Seiten)

### 1. `KontoSicherheitPanel` (neu, Server-Component)
`src/components/auth/KontoSicherheitPanel.tsx`. Holt den eingeloggten User + dessen `profiles`-Row (`twofa_telefon`, `telefon`) und rendert unter einer „Zwei-Faktor-Authentifizierung"-Überschrift:
- `<TwoFaPhoneChange aktuelleTwofaTelefon={…} fallbackTelefon={…} />` (Phone-Faktor, **unverändert**)
- `<TotpEnrollCard />` (TOTP, self-fetcht eigene Faktoren, **unverändert**)

Das ist die **eine DRY-Einheit** — alle Konsumenten rendern dieses Panel; die Profil-Abfrage + Card-Komposition liegt genau hier (nicht 5× dupliziert).

### 2. Dünne Pro-Portal-Seiten
Jede Seite ist eine Server-Component, die `PageHeader` (Titel „Konto-Sicherheit") + `<KontoSicherheitPanel />` rendert. Sie liegt unter dem **existierenden, role-guarded Layout/Route-Group** des jeweiligen Portals → Guard + Chrome gratis.
- **NEU** `/admin/konto`, `/dispatch/konto`, `/kanzlei/konto`, `/makler/konto`
- **MODIFY** `/mitarbeiter/profil` (existiert bereits; kundenbetreuer) → Panel einfügen (analog kunde/gutachter, die 2FA auf ihrer `profil`-Seite haben)

### 3. Navigation (sichtbarer Einstiegspunkt — Audit-Punkt 2)
Ein „Sicherheit"-`PortalNavItem` (Shield-/Lock-Icon) wird in die Nav-Item-Liste jedes internen Portals eingehängt:
- admin / dispatch / kanzlei / mitarbeiter → via Shared `PortalNav` (dark- bzw. light-Variante)
- makler → via seine `(shell)`-Nav

## Was NICHT geändert wird
`lib/auth/mfa-gate.ts`, `middleware.ts`, `login/actions.ts` (Routing), `login/2fa/*` (TwoFaClient, TotpChallengeClient), `lib/auth/twofa/mfa.ts`, und die Cards selbst (`TwoFaPhoneChange`, `TotpEnrollCard`) — **0 Änderung**. Die Surface ist rein additiv: ein Panel, fünf Seiten-Touchpoints, fünf Nav-Items.

## Daten-/Kontroll-Fluss
Identisch zum bereits validierten kunde/gutachter-Pfad: enroll/challenge/verify laufen über `lib/auth/twofa/mfa.ts` (`enrollePhoneFaktor`/`enrolleTotpFaktor`/`challengePhoneFaktor`/`verifyPhoneFaktor`/`entferneFaktor`), Anzeige über `listeFaktoren`. Erfolgreiche Verifikation hebt die Session auf aal2 (für den Faktor-Besitz; das Login-Gate ist unberührt).

## Blast-Radius (Files)
- **NEU:** `src/components/auth/KontoSicherheitPanel.tsx`
- **NEU:** `src/app/admin/konto/page.tsx`, `src/app/dispatch/konto/page.tsx`, `src/app/kanzlei/konto/page.tsx`, `src/app/makler/(shell)/konto/page.tsx` (exakte Route-Group je Portal beim Implementieren verifizieren)
- **MODIFY:** `src/app/mitarbeiter/profil/page.tsx` (Panel einfügen)
- **MODIFY:** Nav-Item-Konfiguration je internem Portal (+ makler) — „Sicherheit"-Eintrag

## Testing
- Die Cards + der TOTP-Flow sind bereits **browser-validiert** (#3040 Staging-E2E: enroll-QR→Code→eingerichtet + Login-TOTP→aal2).
- Neue Logik ist minimal (dünne Seiten + ein Panel mit Profil-Fetch) → **keine neue pure-Funktion → kein neuer vitest** nötig.
- **Validierung = Browser-Smoke (Playwright) post-deploy:** Wegwerf-User mit `rolle='admin'` → Login → `/admin/konto` → „Authenticator-App"-Card sichtbar → enroll TOTP (Secret→Code→„eingerichtet"). Analog dem #3040-Staging-Smoke, nur interne Rolle + `/[portal]/konto`. Cleanup (User löschen).
- **Gates:** `check:component-set --ratchet` **NACH `git add`** laufen lassen (Lehre #3040: der Scanner sieht nur tracked Files — Net-New vor Commit unsichtbar). Die dünnen Seiten rendern nur Shared-Components (`PageHeader`/`KontoSicherheitPanel`) → **keine** neuen handgerollten Buttons/Cards erwartet. knip: Pages sind Route-Entries (keine unused files); das Panel wird von den Seiten importiert.

## Effort & Rollout
**Klein:** 1 Panel + 4 neue dünne Seiten + 1 Seiten-Edit + ~5 Nav-Items, alles additiv. **Rollout:** opt-in, kein Lockout-Risiko (kein Gate), Phone-MFA + TOTP unberührt. PR base `staging`; ridet den nächsten staging→main-Sync-Release mit der TOTP-Strecke nach prod. Kein Backend-/Config-Schritt (Supabase-MFA ist projekt-level aktiv).

## Verwandt
- Phone-MFA + TOTP: `memory/COORDINATION-2fa-supabase-migration-brief.md`
- TOTP-Spec: `docs/superpowers/specs/2026-06-19-totp-optional-second-factor-design.md`
- Ratchet-Lehre (Net-New vor Commit): `memory/feedback_ratchet_scans_tracked_files.md`
