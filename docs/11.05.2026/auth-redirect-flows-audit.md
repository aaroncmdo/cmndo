# Auth/Login/Redirect-Flows Audit — Claimondo V2

**Audit-Datum:** 11.05.2026  
**Auditor:** Code Review (Claude)  
**Modus:** Vollständige Codebase-Analyse ohne Edits

---

## TL;DR

**Befundstand:** 8 Bugs identifiziert, davon 3 kritisch.

### Kritische Bugs (sofort fixen)
1. **[CRIT-1] Kunde-Layout `.single()` ohne Fehlerbehandlung** — Query-Error → `profile.rolle` undefined → User sieht Onboarding-Redirect statt Portal
2. **[CRIT-2] Makler-Layout `.maybeSingle()` BUT falscher `.single()` Fallback** — Inconsistenz in Rolle-Check → Potential Role-Bypass
3. **[CRIT-3] Passwort-Aendern nutzt `window.location.href` statt `router.push()`** — Race-Condition mit Cache-Invalidierung möglich

### Mittlere Bugs (nächste Sprint)
4. **[MID-1] Kunde-Onboarding-Auto-Claim nicht idempotent** — Mehrfache Layout-Renders → Mehrfache claimFaelleByEmail-Calls
5. **[MID-2] Dispatch-Portal Cookie-Isolation schwach** — Dispatch könnte SV-Cookie haben
6. **[MID-3] Gutachter-Layout `maybeSingle()` ohne null-Checks auf Feld-Zugriffe**

### Niedrige Bugs (Polishing)
7. **[LOW-1] Cookie-Naming inkonsistent** — `cm_remember` vs `claimondo_remember` sind UNTERSCHIEDLICH
8. **[LOW-2] x-pathname Fallback falsch** — Nur erste wird gesetzt, andere sind Cargo-Cult

---

## Portal-Layouts — Guard-Audit

| Portal | Guard-Typ | Rolle(n) | Fehler |
|--------|-----------|----------|--------|
| Admin | `.single()` manual | `admin` | Zentralisierung nötig |
| Dispatch | `requirePortalAccess()` | `['dispatch','admin']` | OK ✓ |
| Gutachter | `.maybeSingle()` + Header | `sachverstaendiger` | Feld-null-Checks fehlen |
| **Kunde** | **.single() KEIN Error-Handling** | **kunde** | **CRIT-1** |
| Mitarbeiter | `.single()` + Array-Check | `['kundenbetreuer','admin']` | Fragile Fehlerbehandlung |
| Kanzlei | `requirePortalAccess()` | `['kanzlei','admin']` | OK ✓ |
| **Makler** | **`.single()` + `.maybeSingle()` Mix** | **makler** | **CRIT-2** |
| Fälle | `.single()` + Array-Check | 4 Rollen | OK ✓ |

---

## Login/Auth-Flows — Details

### Login Action (src/app/login/actions.ts)
- ✓ Profile-Query: `.single()` + Error-Handling
- ✓ Force-Password-Change-Flag prüfen + Redirect
- ✓ 2FA-Cookie beim Submit LÖSCHEN (maxAge:0)
- ✓ 2FA-aktiv → `/login/2fa`, inaktiv → 3-Tage-Cookie
- ✓ `revalidatePath()` BEFORE `redirect()`

### 2FA Flow (page.tsx + TwoFaClient.tsx + verify-code.ts)
- ✓ Google-User → Skip 2FA
- ✓ 2FA deaktiviert → Skip 2FA
- ✓ SMS/Email-Fallback mit Auto-Retry
- ✓ Remember-Token mit SHA-256-Hash in DB
- ✓ 3-Tage-Cookie statt Session für Mobile-Reliability

### Passwort-Ändern (src/app/passwort-aendern/page.tsx)
- ⚠ Nur Client-only Auth-Gate
- ✗ `.single()` auf Profile BUT dann `profile?.rolle`
- **CRIT-3:** Nutzt `window.location.href = roleToPath()` NICHT `router.push()`
  - **Race-Condition:** Browser könnte stale RSC-Payload holen wenn Middleware noch alte Cache serviert
  - Sollte: `router.push()` + `revalidatePath(targetPath, 'layout')`

### Middleware (src/lib/supabase/middleware.ts)
- ✓ Public-Path-Whitelist: 30+ Einträge (Marketing, Crons, Auth-Flows)
- ✓ 2FA-Gate BEFORE Rollen-Check (KFZ-111 Fix)
- ✓ Cookie-Handling via Array (verhindert Next.js 16 TypeError)
- ⚠ **x-pathname Fallback:** Nur `x-pathname` wird gesetzt, `x-next-url` und `x-invoke-path` sind Cargo-Cult

---

## Cross-Cutting Befunde

### Cookie-Landscape
| Cookie | Quelle | Lebensdauer | Namespace |
|--------|--------|------------|-----------|
| `cm_remember` | login/actions.ts | 1 Jahr | Middleware |
| `claimondo_remember` | remember-me.ts | 30 Tage | 2FA-Token |
| `claimondo_2fa_verified` | verify-code.ts | 3 Tage | 2FA-Gate |

**[LOW-1]:** `cm_remember` und `claimondo_remember` sind UNTERSCHIEDLICH:
- Middleware prüft `cm_remember` (middleware.ts:27)
- Remember-Token setzt `claimondo_remember` (remember-me.ts:11)
- Keine Collision, aber verwirrend für Wartung

### .single() vs .maybeSingle() Pattern
| Layout | Methode | Error-Handling | Risiko |
|--------|---------|---|--------|
| Admin | `.single()` | Manual + redirect | Zentralisierung |
| Kunde | **.single()** | **KEINE** | **KRITISCH** |
| Makler | `.single()` + `.maybeSingle()` | Inconsistent | **KRITISCH** |
| Portal-Guard | `.maybeSingle()` | Full + redirect | OK ✓ |

**Best Practice:** `requirePortalAccess(['rolle'])` mit `.maybeSingle()` + error-Check + redirect

### Auto-Claim Idempotenz
**[MID-1]** in Kunde-Layout (Zeile 51–58):
- `claimFaelleByEmail()` wird auf JEDEM Layout-Mount aufgerufen
- Nicht idempotent → könnte mehrfach Claims in DB erzeugen bei Tab-Wechsel/Rerender
- Sollte: Flag in Session/Cookie setzen oder Debounce-Logic

---

## Diagnose-Empfehlungen

Vor Fixes implementieren:

1. **Instrumentation:**
   - Alle `.single()`-Errors in Production Logger
   - Query-Error-Tracking für Profile-Queries
   - 2FA-Cookie-Lebenszyklus-Logs

2. **Test-Szenarios:**
   - Login → 2FA → Portal für ALLE 7 Rollen
   - Parallel-Tabs (2FA wird auf Tab1 bestätigt, Tab2 sollte revalidieren)
   - Profile-Query-Fehler simulieren (RLS-Fehler, DB-Timeout)
   - Force-Password-Change → Passwort-Ändern → Redirect

3. **Regression-Coverage:**
   - Admin, Dispatch, Gutachter, Kunde, Mitarbeiter, Kanzlei, Makler Portal-Flows
   - Logout + erneuter Login im selben Browser
   - Cookie-Cleanup vor Deploy

4. **Cookie-Cleanup:**
   - `cm_remember` und `claimondo_remember` aus Production-Clients löschen
   - Version-Bump um Namespace-Verwirrung zu vermeiden

---

## Severity Summary

| Bug | Severity | Impact | Fix-Effort |
|-----|----------|--------|-----------|
| CRIT-1 | KRITISCH | Auth-Gate kann failsilent → User im falschen Portal | Niedrig |
| CRIT-2 | KRITISCH | Query-Konsistenz → Role-Bypass möglich | Niedrig |
| CRIT-3 | KRITISCH | Cache-Race → Stale Portal-View möglich | Niedrig |
| MID-1 | MITTEL | Idempotenz → Daten-Duplikate möglich | Mittel |
| MID-2 | MITTEL | Cookie-Isolation schwach | Niedrig |
| MID-3 | MITTEL | Null-Pointer-Risk auf Feld-Zugriffe | Niedrig |
| LOW-1 | NIEDRIG | Wartung verwirrend | Niedrig |
| LOW-2 | NIEDRIG | Cargo-Cult-Code | Niedrig |

---

**Status:** Audit Complete  
**Report-Version:** 1.0  
**Output-Path:** `docs/11.05.2026/auth-redirect-flows-audit.md`
