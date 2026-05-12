# Server-Actions Pattern-Audit

**Datum:** 2026-05-12
**Scope:** Konsistenz aller 'use server'-Files gegen die 6 verbindlichen Regeln aus AGENTS.md
**Methodik:** Static-Scan-Skript (`scripts/audit-server-actions.mjs`) auf 191 Files mit 470 Functions + 2 parallele Subagent-Tiefenbohrungen (Result-Pattern, Auth-Guard, revalidatePath)

---

## TL;DR

| Metrik | Wert | Bewertung |
|---|---:|---|
| 'use server'-Files | 191 | — |
| Exportierte Functions | 470 | — |
| `export const` aus 'use server' (AAR-664-Falle) | **0** | ✅ Regel eingehalten |
| `export type` aus 'use server' | 60 | ⚠️ Formal verboten, faktisch harmlos (TS-erased) |
| Mixed `ok`/`success` Return-Pattern | **15** | 🔴 Drift in einer Datei = Caller-Bugs |
| Throw aus Business-Logic (statt Result-Object) | ~13 | 🟠 |
| Echte Auth-Lücken (kein Guard, kein Token, kein RLS) | **2** | 🔴 |
| Stale-UI-Risiken (Write ohne `revalidatePath`) | **40** | 🟠 |
| Top-Outlier-Files (>700 Lines) | 5 | 🟡 Refactor-Kandidaten |

**Kernerkenntnis:** Die meisten "Lücken" sind False-Positives — die App lebt mit gemischten Patterns ohne akute Bugs. Die **2 echten Sicherheits-Lücken** und die **15 Mixed-Return-Files** sind die Akut-Liste; alles andere ist Hygiene + Konvention.

---

## 1. AAR-664 Konstanten-Falle — sauber

**Regel:** Niemals `export const` oder `export type` aus 'use server'-Files. Der Client-Bundler macht `undefined` daraus zur Laufzeit.

**Befund:**
- ✅ **0 Files mit `export const`** — Regel wird strikt eingehalten
- ⚠️ **60 Files mit `export type/interface`**

**Bewertung Type-Export:** TypeScript-Types werden beim Compile erased — sie landen nie im Client-Bundle. AGENTS.md formuliert die Regel breit, aber praktisch:
- `export const FOO = …` → Bundle bekommt `undefined`, Crash ✅ verhindert
- `export type Result = …` → Compile-time only, kein Bundle-Effekt ✅ harmlos

**Empfehlung:** AGENTS.md präzisieren: "Konstanten und **Werte** nie aus 'use server' exportieren — pure Types sind OK, weil TS sie erased." Alternativ: 60 Type-Exports in Sibling `.types.ts`-Files verschieben (Convention-Strenge, kein Bug-Fix).

---

## 2. Result-Pattern Drift (🔴 Akut)

**Regel:** Server-Actions liefern `{ ok: boolean; error?: string }` zurück. Caller checken `result.ok`. Helper-Auth-Guards dürfen werfen.

**Befund:**
- **63 Files nutzen `ok`** (neuer AGENTS.md-Standard)
- **101 Files nutzen `success`** (Pre-AAR-800-Pattern)
- **15 Files mixen beide** — silent Caller-Bug-Risiko

### Top-3 Mixed-Files (analysiert)

| Datei | `ok` | `success` | Was passiert |
|---|---:|---:|---|
| `admin/sachverstaendige/[id]/verifizierung-actions.ts` | 14 | 43 | `uploadAdminPflichtdokument()` liefert `ok`, alle anderen 8 Actions liefern `success`. Caller `VerifizierungsTab.tsx:882` prüft `.ok` korrekt — aber wenn jemand eine `success`-Action auf `ok` umzieht ohne den Caller anzufassen, bricht es silent |
| `admin/sachverstaendige/anlegen/actions.ts` | 3 | 61 | Helper `ensureAdmin()` liefert `ok`, alle 10 Main-Exports liefern `success`. 58 Caller-Sites |
| `kunde/onboarding/actions.ts` | 4 | 29 | `setzeVorschadenAbrechnung()` ist `ok`, `uploadKundenDokument()`/`uploadPflichtdokument()` sind `success`. OnboardingWizard.tsx prüft `.success` durchgängig — wenn jemand eine Upload-Func auf `ok` migriert, silent fail |

**Root-Cause:** Helper-Funktionen wurden auf `ok` umgezogen, aber die Main-Actions in derselben Datei blieben auf `success`. Copy-Paste-Drift.

### Throw aus Business-Logic (~13 Files)

| Datei | Stelle | Drift |
|---|---|---|
| `admin/team/actions.ts:36,43,53` | `throw new Error('Alle Felder…')`, `throw new Error('Benutzer erstellen fehlgeschlagen')` | Validierung + DB-Fehler werfen statt `{ success: false }` |
| `lib/actions/sv-verifizierung-actions.ts:49,53,59,80` | PDF-Upload-Fehler werfen | Business-Logic statt Result |

**Legitim (~18 Files):** Auth-Guard-Helper wie `requireAdmin()`, `ensureAdmin()`, `requireSvUser()` werfen — entspricht AGENTS.md-Ausnahme ("Auth-Guards dürfen werfen").

### Migration-Strategie

Big-Bang-Rename ist zu riskant (470 Functions, viele Caller-Sites). Stattdessen:

1. **`ok` als Forward-Standard** in neuen Actions (bereits AGENTS.md-Stand).
2. **`success` graten** in alten Files — kein Hard-Cutover.
3. **Mixed-Files (15) priorisiert vereinheitlichen** — entweder alle auf `success` (weniger Caller-Aufwand) oder alle auf `ok` (forward-konform). Datei für Datei.
4. **Linter-Rule:** "Neue Server-Action darf nicht `{ success: …}` returnen" — Build-Warning. Verhindert weitere Drift.
5. **Throw-Audit:** 13 Business-Logic-Throws auf Result-Object umstellen, Auth-Guards bleiben.

---

## 3. Auth-Guard-Coverage — Reality-Check (🔴 2 echte Lücken)

**Inventur-Stat:** 186 von 191 Files (97 %) nutzen weder `requireAuth(` noch `requireRole(`. **Aber das ist kein Bug, sondern False-Positive in der Statistik:**

| Kategorie | Files | Bewertung |
|---|---:|---|
| RLS-basiert (User implizit via `auth.getUser()`, Daten via DB-Policies) | 144 | ✅ By-design |
| Token-basiert (Magic-Link-Routes, Token ersetzt Auth) | 16 | ✅ By-design |
| Dezentrales `supabase.auth.getUser()` (kein zentraler Guard) | 10 | 🟡 Konsistenz, kein Bug |
| Custom-Guard (`ensureAdmin()`, `requireGutachter()`) | 6 | ✅ Semantisch äquivalent |
| Admin-Client-only (Service-Role, kein User-Context) | 4 | ✅ |
| **Echte Lücke (kein Guard, kein Token, kein Service-Role)** | **6** | 🔴 prüfen |
| **TOTAL** | 186 | |

### Die 6 "Echten Lücken" — gefiltert

| Datei | Status |
|---|---|
| `lib/actions/set-locale.ts` | Cookie-Setter, keine DB-Mutation → False-Positive |
| `lib/auth/logout.ts` | Cookie-Deletion → False-Positive |
| `dispatch/leads/[id]/_actions/geocode.ts` | Geocoding, keine DB-Mutation → False-Positive |
| `components/onboarding/finalizeAnfrage.ts` | Wrapper → delegiert zu `konvertiereAnfrageZuFall()` (hat `createAdminClient`) → False-Positive |
| **`lib/actions/update-lead-gegner.ts`** | 🔴 **Update `leads` ohne Auth-Check** |
| **`lib/actions/update-lead-zb1-manual.ts`** | 🔴 **Update `leads` ohne Auth-Check** |

**Ergebnis: 2 echte Sicherheits-Lücken** — beide updaten `leads`-Daten ohne Auth. Da `leads` zusätzlich eine always-true-Policy `Flow anon update leads` hat (siehe RLS-Audit), summiert sich das zu einem Risiko: **anon-User könnte über diese Actions beliebige Lead-Daten manipulieren** wenn er einen Direct-Endpoint findet.

### Konsistenz-Issue: 10 Files mit dezentralem `getUser()`

Nicht buggy, aber 10 verschiedene Inline-Implementierungen statt 1 zentrale `requireAuth()`. Beispiele:
- `lib/profile/avatar.ts`
- `lib/gps/mark-arrival.ts`
- `app/kunde/profil/actions.ts`
- `app/gutachter/profil/actions.ts`
- `app/faelle/[id]/_actions/tasks.ts`
- `lib/faelle/mark-read-action.ts`

**Fix:** Konvention durchziehen — `await requireAuth()` als erste Zeile in mutating Actions. 10 Files × ~5 Zeilen Boilerplate sparen.

---

## 4. revalidatePath-Coverage (🟠 40 Stale-UI-Risiken)

**Regel:** Jede mutierende Server-Action muss die betroffenen Routen revalidieren.

**Inventur:** 65 von 191 Files (34 %) ohne `revalidatePath`.

### Klassifikation der 65 Files

| Kategorie | Files | Bewertung |
|---|---:|---|
| Read-only (Select-Loader) | 21 | ✅ Kein revalidate nötig |
| Admin-Client-only (Backend-Crons) | 4 | ✅ |
| **Write + UI-relevant, kein revalidate** | **40** | 🔴 Stale-UI-Bug |
| **TOTAL** | 65 | |

### Top-10 Stale-UI-Risiken

| Datei | Was wird mutiert | Stale-UI-Folge |
|---|---|---|
| `lib/termine/actions.ts` | `gutachter_termine` (ETA, Status, 6 Funcs) | SV/Kunde sieht alte Termin-Daten |
| `lib/sv/tages-session.ts` | `sv_tages_session` | Feldmodus-State nicht aktualisiert |
| `lib/dokumente/ad-hoc-anforderung.ts` | `dokument_upload_anfragen` Insert | Kunde sieht Anfrage nicht sofort |
| `dispatch/leads/[id]/_actions/schadentyp.ts` | `leads.schadentyp` | Lead-Detail zeigt alten Typ |
| `dispatch/leads/[id]/_actions/versicherungen.ts` | Versicherungs-Felder im Lead | Dito |
| `lib/onboarding/slots.ts` | Slot-Insert/Update | Slot-Picker zeigt veraltete Verfügbarkeit |
| `lib/actions/notification-preferences.ts` | `notification_preferences` | Settings zeigen alten Stand |
| `lib/actions/push-subscribe.ts` | `push_subscriptions` | Push-Status alt |
| `lib/actions/create-lead.ts` | `leads` Insert | Lead-Liste/Dashboard ohne neuen Lead |
| `lib/cardentity/enrich-fahrzeug.ts` | Fahrzeug-Daten | Fahrzeug-Card alt |

**Pattern:** Viele Lead-Mutations + Termin-Mutations fehlen — genau die UI-Bereiche, in denen Dispatch + SV täglich arbeiten.

**Fix:** Pro Datei → welche Route zeigt die Tabelle? `revalidatePath('/dispatch/leads')`, `revalidatePath('/dispatch/leads/${leadId}')`, `revalidatePath('/gutachter/heute')`, `revalidatePath('/admin/faelle')` etc.

---

## 5. File-Size-Outlier (🟡 Refactor-Kandidaten)

Files > 700 Lines deuten oft auf "Domain-God-File" hin — viele Funktionen in einer Datei, schwierig zu navigieren + zu reviewen.

| Datei | Lines | Functions |
|---|---:|---:|
| `app/admin/sachverstaendige/anlegen/actions.ts` | 1479 | 10 |
| `app/flow/[token]/actions.ts` | 1345 | 8 |
| `lib/kanzlei-wunsch/actions.ts` | 747 | 10 |
| `app/gutachter/fall/[id]/actions.ts` | 746 | 8 |
| `app/kunde/onboarding/actions.ts` | 632 | 8 |
| `lib/actions/dispatch-fall-actions.ts` | 915 | 5 |
| `lib/actions/termin-verlegung-actions.ts` | 832 | 6 |

**Empfehlung:** Nicht zwingend refactoren — aber bei neuem Feature in dieser Domain: gezielt extrahieren statt nochmal anfügen. AGENTS.md-Hinweis "Drei ähnliche Zeilen sind besser als eine voreilige Abstraktion" gilt hier nicht — die Files sind über die Schwelle.

---

## Empfohlene Sofort-Fixes (priorisiert)

### Fix 1 — 2 Auth-Lücken schließen (15 Min)
- `lib/actions/update-lead-gegner.ts`: `await requireAuth()` + `requireRole(['dispatch','admin'])` als erste Zeile
- `lib/actions/update-lead-zb1-manual.ts`: dito

### Fix 2 — Top-3 Mixed-Return-Files vereinheitlichen (2-3 h)
- `admin/sachverstaendige/[id]/verifizierung-actions.ts`: alle 9 Funktionen auf `success` (weniger Caller-Aufwand)
- `admin/sachverstaendige/anlegen/actions.ts`: dito
- `kunde/onboarding/actions.ts`: dito
- Caller-Smoke nach Migration

### Fix 3 — Top-10 Stale-UI-Risiken revalidate ergänzen (2-3 h)
Pro Datei: passende `revalidatePath()` ergänzen. Schwerpunkt: Termine + Leads + Slots.

### Fix 4 — Business-Logic-Throws ersetzen (1 h)
- `admin/team/actions.ts`: `throw` raus, `{ success: false, error: '…' }` rein
- `lib/actions/sv-verifizierung-actions.ts`: PDF-Upload-Throws auf Result-Object

### Fix 5 — Linter-Rule für Forward-Standard (1-2 h)
Custom-ESLint-Rule oder `claude-code`-Check:
- `'use server'` + `export const FOO =` → Error (verhindert AAR-664-Falle)
- `'use server'` + `return { success: ` in neuer Action → Warning ("nutze ok")
- `'use server'` + Schreib-Op ohne `revalidatePath` in derselben Funktion → Warning

---

## Backlog (nicht akut)

- **`export type` aus 'use server' — 60 Files in Sibling `.types.ts` verschieben** (Convention)
- **10 dezentrale `getUser()` auf `requireAuth()` konsolidieren** (Konsistenz)
- **AGENTS.md präzisieren:** Type-Exports sind OK, nur Value-Exports verboten
- **Top-7 große Action-Files splitten** (>700 Lines)

---

## Nicht in diesem Audit

- **Caller-Side-Pattern:** Wie viele Caller wrappen Server-Actions noch fälschlich in try/catch? (Stichproben in Result-Drift-Analyse zeigten Gemisch — eigenes Audit lohnt nicht, weil Caller-Driven via #4-Sweep mit-saniert wird)
- **Custom-Action-Guards vs. zentrale Guards:** Konsolidierungs-Spec könnte `ensureAdmin/requireGutachter` → `requireRole(['admin'])` migrieren — Backlog
- **Server-Action Performance** (Round-Trips, Bundle-Size) — eigener Audit

---

## Anhang: Audit-Quellen

- `scripts/audit-server-actions.mjs` (Static-Scan) → `scripts/audit-server-actions-output.json`
- 2 Subagent-Tiefenbohrungen 2026-05-12:
  - Result-Pattern Drift (3 Top-Mixed-Files vollständig + 12 Stichproben)
  - Auth-Guard Reality + revalidatePath-Klassifikation (186 + 65 Files)
- AGENTS.md (Server-Actions-Pattern), AAR-664-Memory, RLS-Audit 2026-05-12 (Cross-Reference Lead-Permissions)
