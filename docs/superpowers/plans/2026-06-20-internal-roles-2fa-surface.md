# Interne 2FA-Self-Service-Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den internen Rollen (admin/dispatch/kanzlei/makler/kundenbetreuer) eine opt-in 2FA-Self-Service-Surface geben (Phone + TOTP), via Wiederverwendung der bestehenden Cards.

**Architecture:** Ein geteiltes `KontoSicherheitPanel` (Server-Component, holt das eigene profile, rendert die unveränderten `TwoFaPhoneChange` + `TotpEnrollCard`). Vier dünne `/[portal]/konto`-Seiten rendern es (role-guarded durch das jeweilige Portal-Layout); `mitarbeiter/profil` bekommt das Panel zusätzlich. Ein „Sicherheit"-Nav-Item pro internem Portal. 0 Änderung an gate/middleware/routing/Cards.

**Tech Stack:** Next 16 (App Router, Server Components), Supabase native MFA (`lib/auth/twofa/mfa.ts`), shared `PortalNav` + `PageHeader`.

**Branch:** `kitta/aar-939-internal-2fa-surface` (off staging — hat die TOTP-Strecke). Base für PR: `staging`.

**Hinweis zu Tests:** Diese Surface ist reines UI-Wiring über bereits validierte Bausteine (die Cards + der TOTP-Flow sind in #3040 staging-browser-validiert). Es gibt **keine neue pure-Logik** → kein neuer vitest (ein Unit-Test „rendert das Panel" würde das Framework testen, nicht uns). Verifikation = `tsc`/Build/Gates grün + **ein post-deploy Browser-Smoke** (interne Rolle → `/<portal>/konto` → enroll). Das ist die ehrliche Test-Ebene hier.

---

### Task 1: `KontoSicherheitPanel` (geteilte 2FA-Block-Component)

**Files:**
- Create: `src/components/auth/KontoSicherheitPanel.tsx`

- [ ] **Step 1: Component schreiben**

```tsx
// AAR-939: Geteilter 2FA-Self-Service-Block (Server-Component). Holt das eigene
// profile + rendert die unveränderten Cards. Session-scoped: zeigt/ändert NUR die
// Faktoren des eingeloggten Users (kein Cross-User-Daten) — daher für jeden
// authentifizierten User datensicher; der Portal-Role-Guard ist rein kosmetisch.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldCheckIcon } from 'lucide-react'
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'
import { TotpEnrollCard } from '@/components/auth/TotpEnrollCard'

export async function KontoSicherheitPanel() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_telefon, telefon')
    .eq('id', user.id)
    .single()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="w-4 h-4 text-claimondo-ondo" />
        <h2 className="text-sm font-semibold text-claimondo-navy">
          Zwei-Faktor-Authentifizierung
        </h2>
      </div>
      <p className="text-xs text-claimondo-ondo">
        Schütze dein Konto mit einem zweiten Faktor — SMS-Code oder Authenticator-App. Beides ist
        optional und kann jederzeit geändert oder entfernt werden.
      </p>
      <TwoFaPhoneChange
        aktuelleTwofaTelefon={profile?.twofa_telefon ?? null}
        fallbackTelefon={profile?.telefon ?? null}
      />
      <TotpEnrollCard />
    </div>
  )
}
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit 2>&1 | grep -i "KontoSicherheit"`
Expected: keine Ausgabe (0 Fehler).

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/KontoSicherheitPanel.tsx
git commit -m "feat(AAR-939): KontoSicherheitPanel — geteilter 2FA-Self-Service-Block"
```

---

### Task 2: Vier `/<portal>/konto`-Seiten

**Files:**
- Create: `src/app/admin/konto/page.tsx`
- Create: `src/app/dispatch/konto/page.tsx`
- Create: `src/app/kanzlei/konto/page.tsx`
- Create: `src/app/makler/(shell)/konto/page.tsx`

- [ ] **Step 1: Jede der vier Seiten mit GENAU diesem Inhalt anlegen** (identisch — die DRY-Einheit ist das Panel; der Wrapper ist präsentationaler Boilerplate, Next braucht je Route ein `page.tsx`):

```tsx
import PageHeader from '@/components/shared/PageHeader'
import { KontoSicherheitPanel } from '@/components/auth/KontoSicherheitPanel'

// AAR-939: Konto-Sicherheit (2FA-Self-Service) für interne Rollen. Role-guarded
// durch das Portal-Layout; das Panel ist session-scoped (eigene Faktoren).
export default function KontoSicherheitPage() {
  return (
    <div className="w-full px-4 py-6 max-w-xl mx-auto space-y-5">
      <PageHeader title="Konto-Sicherheit" size="lg" />
      <KontoSicherheitPanel />
    </div>
  )
}
```

- [ ] **Step 2: Build (Routen-Validierung — Next 16 findet Route-Fehler zur Build-Zeit)**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npm run build 2>&1 | grep -iE "/admin/konto|/dispatch/konto|/kanzlei/konto|/makler/konto|error" | head`
Expected: die vier Routen erscheinen im Manifest, keine `error`-Zeile.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/konto/page.tsx" "src/app/dispatch/konto/page.tsx" "src/app/kanzlei/konto/page.tsx" "src/app/makler/(shell)/konto/page.tsx"
git commit -m "feat(AAR-939): /[portal]/konto-Seiten (admin/dispatch/kanzlei/makler)"
```

---

### Task 3: `mitarbeiter/profil` — Panel einfügen (kundenbetreuer)

**Files:**
- Modify: `src/app/mitarbeiter/profil/page.tsx`

- [ ] **Step 1: Import ergänzen** (nach dem bestehenden `MitarbeiterProfilClient`-Import):

```tsx
import { KontoSicherheitPanel } from '@/components/auth/KontoSicherheitPanel'
```

- [ ] **Step 2: Panel unter den Client rendern.** Den `return (...)` so umbauen, dass nach `<MitarbeiterProfilClient .../>` das Panel folgt:

```tsx
  return (
    <>
      <MitarbeiterProfilClient
        email={user.email ?? ''}
        vorname={profile.vorname ?? ''}
        nachname={profile.nachname ?? ''}
        telefon={profile.telefon ?? null}
        rolle={profile.rolle}
        avatarUrl={profile.avatar_url ?? null}
        anzeigename={profile.anzeigename ?? ''}
        profilbeschreibung={profile.profilbeschreibung ?? ''}
      />
      <div className="w-full px-4 pb-6 max-w-xl mx-auto">
        <KontoSicherheitPanel />
      </div>
    </>
  )
```

- [ ] **Step 3: tsc + Commit**

Run: `npx tsc --noEmit 2>&1 | grep -i "mitarbeiter/profil"` → keine Ausgabe.

```bash
git add src/app/mitarbeiter/profil/page.tsx
git commit -m "feat(AAR-939): 2FA-Panel auf mitarbeiter/profil (kundenbetreuer)"
```

---

### Task 4: Nav-Items „Sicherheit" je internem Portal

**Files:**
- Modify: `src/app/admin/_components/AdminNav.tsx`
- Modify: `src/app/dispatch/_components/DispatchNav.tsx`
- Modify: `src/app/kanzlei/_components/KanzleiNav.tsx`
- Modify: `src/components/makler/MaklerShell.tsx`

(mitarbeiter: KEIN neues Item — die bestehende „Mein Profil"→`/mitarbeiter/profil` erreicht das Panel.)

- [ ] **Step 1: AdminNav** — `ShieldCheckIcon` zum lucide-Import ergänzen; im `NAV_ITEMS`-Array als letzten Eintrag (nach „Einstellungen", `src/app/admin/_components/AdminNav.tsx:31`) einfügen:

```tsx
  { href: '/admin/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
```

- [ ] **Step 2: DispatchNav** — `ShieldCheckIcon` importieren; in `NAV_NACHSCHLAGEN` (`src/app/dispatch/_components/DispatchNav.tsx:24-27`) als letzten Eintrag:

```tsx
  { href: '/dispatch/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
```

- [ ] **Step 3: KanzleiNav** — `ShieldCheckIcon` zum Import ergänzen; im inline `items`-Array (`src/app/kanzlei/_components/KanzleiNav.tsx:14-18`) als letzten Eintrag:

```tsx
          { href: '/kanzlei/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
```

- [ ] **Step 4: MaklerShell** — `ShieldCheckIcon` zum lucide-Import ergänzen; im `MAKLER_NAV_ITEMS`-Array (`src/components/makler/MaklerShell.tsx:36-42`) als letzten Eintrag:

```tsx
  { href: '/makler/konto', label: 'Sicherheit', icon: ShieldCheckIcon },
```

- [ ] **Step 5: tsc + Commit**

Run: `npx tsc --noEmit 2>&1 | grep -iE "AdminNav|DispatchNav|KanzleiNav|MaklerShell"` → keine Ausgabe.

```bash
git add src/app/admin/_components/AdminNav.tsx src/app/dispatch/_components/DispatchNav.tsx src/app/kanzlei/_components/KanzleiNav.tsx src/components/makler/MaklerShell.tsx
git commit -m "feat(AAR-939): Sicherheit-Nav-Item je internem Portal"
```

---

### Task 5: Gates + Build + PR

- [ ] **Step 1: Gates NACH git add** (Lehre #3040: `check:component-set` scannt nur tracked Files — die neuen Files müssen committed/added sein, was nach Task 1-4 der Fall ist):

```bash
npm run check:component-set -- --ratchet
npm run check:knip -- --ratchet
npm run check:token-audit
```
Expected: alle exit 0, „0 neue". Die Seiten rendern nur Shared-Components (`PageHeader`/`KontoSicherheitPanel`) → keine neuen handgerollten Buttons/Cards. **Falls** component-set doch flaggt: prüfen warum (sollte nicht), primär fixen statt Baseline-Bump.

- [ ] **Step 2: Voller Build** (Routen/Layout-Änderungen → Pflicht):

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```
Expected: grün, die 4 konto-Routen im Manifest.

- [ ] **Step 3: 7-Punkte-Audit im Kopf durchgehen** (Build grün · UI: „Sicherheit"-Nav je Portal + mitarbeiter „Mein Profil" · Redundanz: Panel = eine DRY-Einheit, Cards reused · Dead-Code: nichts gelöscht · Spec-Treue: Approach A opt-in · Inkonsistenz: claimondo-Tokens, Umlaute, Result-Pattern unberührt · Regression: 0 Änderung an gate/middleware/routing/Cards).

- [ ] **Step 4: Push + PR**

```bash
git push -u origin kitta/aar-939-internal-2fa-surface
gh pr create --base staging --title "feat(AAR-939): interne 2FA-Self-Service-Surface (admin/dispatch/kanzlei/makler/kundenbetreuer)" --body "<Zusammenfassung + Spec-Link + Post-Deploy-Smoke-Schritte>"
```

---

### Task 6: Post-Deploy Browser-Smoke (nach staging-Deploy)

- [ ] **Step 1:** Wegwerf-User mit `rolle='admin'` (+ profiles-Row, `force_password_change=false`) via Admin-API anlegen (wie der #3040-Staging-Smoke, Pflicht-Spalten id+email).
- [ ] **Step 2:** Playwright (Basic-Auth-Gate `aaroncmdo`/…) → Login → `/admin/konto` → „Authenticator-App"-Card sichtbar → Einrichten → Secret lesen → TOTP berechnen → eingerichtet ✓. Screenshot.
- [ ] **Step 3:** Cleanup (User löschen), 0-orphan verifizieren.
- [ ] **Step 4:** Memory-Update (Brief + Index): Surface live + validiert.

---

## Self-Review

**Spec-Coverage:** KontoSicherheitPanel (Task 1) ✓ · 4 konto-Seiten (Task 2) ✓ · mitarbeiter/profil (Task 3) ✓ · Nav (Task 4) ✓ · 0-Änderung gate/middleware/Cards (per Konstruktion) ✓ · opt-in/kein Gate ✓ · Testing/Smoke (Task 6) ✓ · component-set-nach-git-add (Task 5) ✓. Keine Gap.

**Placeholder-Scan:** Nur der PR-Body-Platzhalter in Task 5 (wird beim Erstellen gefüllt). Keine Code-Platzhalter.

**Typ-Konsistenz:** `KontoSicherheitPanel` (named export) konsistent in Task 1/2/3. `PortalNavItem`-Shape (`{href,label,icon}`) konsistent mit den bestehenden Arrays. `ShieldCheckIcon` (lucide) in allen vier Nav-Files.
