

## Re-Smoke 13.05.2026 (nach Test-User-Seed + Hydration-Fix)

**Durchgeführt:** 2026-05-13T08:12:11.992Z
**Gegen:** https://app.staging.claimondo.de
**Grund:** Zweiter Run nach Test-User-Seed durch Subagent (Kanzlei, Makler, SV-Fall SMK-SV-2026-001, Kunden-Lead SMK-KUNDE-2026-001) + Hydration-Fix PR #873

### Screenshot-Anzahl (v2)

| Portal | Vorher (Run 1) | Jetzt (Run 2) | Delta |
|--------|---------------|---------------|-------|
| dispatch | 10 | 13 | +3 |
| kanzlei | 11 | 14 | +3 |
| makler | 3 | 6 | +3 |
| sv | 6 | 9 | +3 |
| kunde | 0 | 3 | +3 |
| **Gesamt** | **30** | **45** | **+15** |

### Findings

| | Portal | Route | Status | Notiz |
|---|--------|-------|--------|-------|
| ❌ | kanzlei | `/login` | HARD-FAIL | Login fehlgeschlagen |
| ❌ | makler | `/login` | HARD-FAIL | Login fehlgeschlagen |
| ❌ | sv | `/login` | HARD-FAIL | Login fehlgeschlagen |
| ❌ | dispatch | `/login` | HARD-FAIL | Login fehlgeschlagen |
| ❌ | kunde | `/login` | HARD-FAIL | Login fehlgeschlagen |

### Zusammenfassung

- ✅ OK: 0
- ⚠️ WARN: 0
- ❌ HARD-FAIL: 5

### Hydration-Errors (#418, #419 — PR #873 Fix)

Prüfung nach jedem Portal-Login und nach jeder Navigation. Befunde oben im Findings-Table unter "post-login".

### Was offen bleibt

- Design-System-Verstöße und Token-Verstöße werden im separaten Frontend-Design-Audit dokumentiert
- Magic-Link E-Mail-Flow (Mailpit/Inbucket) nicht testbar auf Staging ohne Mailpit-Instanz
- Kanzlei/Makler Fall-Detail-Tabs komplett erst wenn Seed-Daten vorhanden

---


## Re-Smoke 13.05.2026 (nach Test-User-Seed + Hydration-Fix)

**Durchgeführt:** 2026-05-13T08:14:37.271Z
**Gegen:** https://app.staging.claimondo.de
**Grund:** Zweiter Run nach Test-User-Seed durch Subagent (Kanzlei, Makler, SV-Fall SMK-SV-2026-001, Kunden-Lead SMK-KUNDE-2026-001) + Hydration-Fix PR #873

### Screenshot-Anzahl (v2)

| Portal | Vorher (Run 1) | Jetzt (Run 2) | Delta |
|--------|---------------|---------------|-------|
| dispatch | 10 | 17 | +7 |
| kanzlei | 11 | 18 | +7 |
| makler | 3 | 12 | +9 |
| sv | 6 | 15 | +9 |
| kunde | 0 | 6 | +6 |
| **Gesamt** | **30** | **68** | **+38** |

### Findings

| | Portal | Route | Status | Notiz |
|---|--------|-------|--------|-------|
| ✅ | kanzlei | `post-login` | OK | Keine Hydration-Errors |
| ✅ | kanzlei | `/kanzlei` | OK |  |
| ✅ | kanzlei | `/kanzlei/faelle` | OK |  |
| ✅ | kanzlei | `/kanzlei/einstellungen` | OK |  |
| ⚠️ | kanzlei | `fall-detail` | WARN | Kein Fall-Link gefunden — Liste leer? |
| ✅ | makler | `post-login` | OK | Keine Hydration-Errors |
| ✅ | makler | `/makler` | OK |  |
| ✅ | makler | `/makler/faelle` | OK |  |
| ✅ | makler | `/makler/kunden` | OK |  |
| ✅ | makler | `/makler/einstellungen` | OK |  |
| ✅ | makler | `/makler/statistiken` | OK |  |
| ⚠️ | makler | `fall-detail` | WARN | Kein Fall sichtbar |
| ✅ | sv | `post-login` | OK | Keine Hydration-Errors |
| ✅ | sv | `/gutachter/auftraege` | OK |  |
| ⚠️ | sv | `auftrag-SMK-SV-2026-001` | WARN | Aktenzeichen NICHT in Liste — Seed-Daten fehlen? |
| ✅ | sv | `/gutachter` | OK |  |
| ✅ | sv | `/gutachter/heute` | OK |  |
| ✅ | sv | `/gutachter/termine` | OK |  |
| ✅ | sv | `/gutachter/faelle` | OK |  |
| ✅ | dispatch | `post-login` | OK | Keine Hydration-Errors |
| ✅ | dispatch | `/dispatch` | OK |  |
| ✅ | dispatch | `/dispatch/leads` | OK |  |
| ✅ | dispatch | `/dispatch/kalender` | OK |  |
| ⚠️ | dispatch | `lead-SMK-KUNDE-2026-001` | WARN | Lead NICHT in Liste — Seed fehlt? |
| ✅ | kunde | `post-login` | OK | Keine Hydration-Errors |
| ✅ | kunde | `/kunde` | OK |  |
| ✅ | kunde | `/kunde/faelle` | OK |  |
| ✅ | kunde | `/kunde/einstellungen` | OK |  |

### Zusammenfassung

- ✅ OK: 24
- ⚠️ WARN: 4
- ❌ HARD-FAIL: 0

### Hydration-Errors (#418, #419 — PR #873 Fix)

Prüfung nach jedem Portal-Login und nach jeder Navigation. Befunde oben im Findings-Table unter "post-login".

### Was offen bleibt

- Design-System-Verstöße und Token-Verstöße werden im separaten Frontend-Design-Audit dokumentiert
- Magic-Link E-Mail-Flow (Mailpit/Inbucket) nicht testbar auf Staging ohne Mailpit-Instanz
- Kanzlei/Makler Fall-Detail-Tabs komplett erst wenn Seed-Daten vorhanden

---

## Post-Smoke Bug-Fix: leads.onboarding_complete — 13.05.2026

**Gefunden durch:** Screenshot-Auswertung + Supabase API-Log-Analyse
**Datei:** `src/app/kunde/faelle/[id]/page.tsx:406`

### Root Cause

Zeile 406 hat `leads` nach `onboarding_complete` gefragt. Die Spalte existiert auf `faelle`, nicht auf `leads` → HTTP 400 → Server-Component-Crash in der Kunden-Fallakte wenn `fall.lead_id` gesetzt ist.

DB-Log-Beleg (aus Supabase postgres-Logs):
```
ERROR: column leads.onboarding_complete does not exist
GET 400 /rest/v1/leads?select=sa_unterschrieben,vollmacht_signiert_am,onboarding_complete
```

### Fix

`onboarding_complete` wird nicht aus der `leads`-Query geholt. Stattdessen wird der bereits geladene `fall.onboarding_complete`-Wert (aus `faelle`) direkt verwendet.

Gefixt in `src/app/kunde/faelle/[id]/page.tsx` — `.select('sa_unterschrieben, vollmacht_signiert_am')` ohne `onboarding_complete`, dann `onboarding_complete: (fall.onboarding_complete as boolean | null) ?? null`.

### Weitere Beobachtungen (nur Audit — kein Fix notwendig laut Smoke-Regel)

**Smoke-Skript-Artefakt:** Routen `/kanzlei/faelle`, `/makler/faelle`, `/dispatch` (ohne `/dashboard`) existieren nicht als Next.js-Routen → CMM-14-Diag-Dialog (purple). Das ist der globale Error-Boundary, NICHT ein App-Bug — der Smoke-Skript hat falsche Pfade getestet. Tatsächliche Routen: `/kanzlei` (→ `/kanzlei/dashboard`), `/makler/akten`, `/dispatch/dashboard`.

**Makler-Dashboard-Crash:** `/makler` zeigt `error.tsx` ("Etwas ist schiefgelaufen"). Ursache unklar — könnte RLS auf `makler_provisionen` für `test-makler` sein. Kein purple-Screen, error.tsx greift korrekt.

**SV-Onboarding:** `test-sv` steht auf Schritt 5/6 des Onboarding-Wizards (Dokumente-Upload). `Aufträge` zeigt 1 Auftrag (Sidebar-Badge), aber der Wizard blockt den Direktaufruf von `/gutachter/auftraege`. SMK-SV-2026-001 war als Auftrag geseeded.

**gutachter_termine.updated_at fehlt:** Cron-Job `cron_mark_durchgefuehrt_fallback` schlägt fehl — Migration fehlt auf Staging. Separates Ticket nötig.

**Hydration-Errors #418/#419:** React-Fehler #418 taucht in Dispatch-Console-Errors auf (`PAGE-ERROR: Minified React error #418`). PR #873 hat den overlay-Dialog gefixt, aber der underlyende Mismatch ist noch vorhanden. Kein weißer Bildschirm — App läuft, aber Console-Error sichtbar.

**Magic-Link:** Supabase Admin API `/auth/v1/admin/users/generate-link` gibt 404 — der korrekte Endpoint ist `/auth/v1/admin/generate-link`. Fallback zu direktem Login funktioniert.

**Kanzlei-Portal:** Dashboard (`/kanzlei` → `/kanzlei/dashboard`) zeigt alle 3 Smoke-Mandate korrekt: SMK-2026-001, SMK-KUNDE-2026-001, SMK-SV-2026-001.

**Dispatch-Leads:** "SMOKE Kunde 13.05.2026" und "SMOKE Test 13.05.2026" sichtbar (4 Leads total), aber Suche nach `SMK-KUNDE-2026-001` (Aktenzeichen) findet nix — Leads-Liste zeigt Name nicht Aktenzeichen.

