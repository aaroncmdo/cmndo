# PROD-FIX-01: `/kunde` Root-Error-Boundary-Crash (Digest 3073205500)

**Branch:** `kitta/aar-prod-cj-fix-01-kunde-layout-crash`  
**Datum:** 13.05.2026  
**Autor:** aaroncmdo + Claude Sonnet 4.6  
**Priorität:** P0 — alle Kunden gesperrt  
**Status:** Fix implementiert, PR gegen `staging` ausstehend

---

## 1. Symptom

Alle authentifizierten Kunden sehen beim Aufruf von `https://app.claimondo.de/kunde` (und jeder Unterseite) statt ihres Portals den CMM-14-Diagnose-Screen:

```
🟣 APP ROOT CRASH (CMM-14 diag)
Digest: 3073205500
```

Hintergrundfarbe `#9900ff` (lila). Das ist `src/app/error.tsx` — der Root-Segment-Error-Boundary.

---

## 2. Root-Cause-Analyse

### 2.1 Next.js Error-Boundary-Kaskade

Nach Next.js 15 Regeln:
- `app/global-error.tsx` → fängt Fehler in `app/layout.tsx`
- `app/error.tsx` → fängt Fehler in `app/kunde/layout.tsx` (Layout-Fehler des Kinder-Segments werden vom Parent-Segment-Boundary gefangen)
- `app/kunde/error.tsx` (orange) → fängt nur Fehler aus Seiten unter `/kunde/**`, **nicht** aus `kunde/layout.tsx` selbst

Der lila Screen (`app/error.tsx`) zeigt eindeutig: der Throw passiert in `src/app/kunde/layout.tsx`.

### 2.2 Isolierter Throw-Pfad

`src/app/kunde/layout.tsx` Zeile 87 (vor Fix):

```ts
const adminForNav = createAdminClient()   // ← KEIN try/catch
const navFaelle = await getKundeFaelle(adminForNav, user.id, user.email ?? null)
```

`createAdminClient()` in `src/lib/supabase/admin.ts` wirft explizit:

```ts
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ist nicht konfiguriert. Bitte in .env.local setzen.')
  }
  return createClient(url, key, { auth: { ... } })
}
```

**Warum crasht das in Production für ALLE Kunden?**

Der `SUPABASE_SERVICE_ROLE_KEY` kommt zur Laufzeit aus `.env.local` auf dem VPS (wird beim Deploy via `cp /var/www/claimondo-v2/.env.local ...` kopiert). Das `cp`-Command im Deploy-Script ist `|| true` — bei einem fehlenden oder leeren `.env.local` schlägt es still durch. Nach Meinung der Analyse ist das der wahrscheinlichste Pfad.

Alternativ: Ein anderer unbekannter Runtime-Fehler im Layout (Digest `3073205500` konnte ohne direkte Server-Logs nicht definitiv einem spezifischen Error-String zugeordnet werden, da Next.js Production-Digests einen internen Hash-Mechanismus nutzen, nicht CRC32 der Error-Message).

### 2.3 Alle anderen potenziellen Throw-Quellen

Ausgeschlossen nach Analyse:

| Kandidat | Status |
|---|---|
| DB-Schema-Drift | Alle Spalten existieren in Production-DB (SQL verifiziert) |
| `requirePortalAccess()` | Gibt nur `redirect()` zurück — kein normaler Throw |
| `resolveKundenTheme()` | Gibt immer `fallback` zurück — kein Throw |
| `getKundeFaelle()` | Alle DB-Errors werden via `?? []` absorbiert |
| `claimFaelleByEmail()` | Bereits in `try/catch` gewrappt |
| i18n JSON-Dateien | Alle 6 Locale-JSONs valide |
| `SupportButton`-Import | `'use client'` — kein Server-Crash möglich |
| globals.css Backticks | Backticks in `origin/main` sind harmlos (nur in Kommentaren) |

### 2.4 Nebenthema: Dead-Import

`SupportButton` wurde in `kunde/layout.tsx` importiert, aber an keiner Stelle im JSX gerendert. Dead-Import entfernt.

---

## 3. Fix-Strategie

**Defensives Wrapping**: `createAdminClient()` + `getKundeFaelle()` in `try/catch` einschließen. Bei Fehler → leere `navFaelle`, alle Card-Queries werden übersprungen. Das Layout rendert ohne Sidebar-Cards statt in den Root-Error-Boundary zu fallen.

Zusätzlich: Alle `adminForNav.from(...)` Calls sind hinter `if (adminForNav && ...)` Guards gesetzt, sodass TypeScript-Sicherheit garantiert ist.

### 3.1 Geänderte Dateien

**`src/app/kunde/layout.tsx`**:
1. Dead-Import `SupportButton` entfernt (Zeile 9)
2. `createAdminClient()` + `getKundeFaelle()` in `try/catch` gewrappt (Zeilen 87–98)
3. Alle 3 `if (navFaelle.length > 0)` Guards zu `if (adminForNav && navFaelle.length > 0)` erweitert (Zeilen 110, 146, 190)

### 3.2 Nicht geändert in diesem PR

- `src/app/error.tsx` — Debug-Overlay (lila `#9900ff`) → separater PR #2
- `src/app/kunde/error.tsx` — Debug-Overlay (orange `#ff8800`) → separater PR #2
- `src/lib/supabase/admin.ts` — Throw-Verhalten bleibt (ist korrekt für fehlendem Key)

---

## 4. Verifikation

### 4.1 TypeScript

```bash
npx tsc --noEmit  # Exit 0, keine Fehler
```

### 4.2 Staging-Reproduction

**Vor Fix:** `https://staging.claimondo.de/kunde` → Purple Screen (Digest `3073205500`)  
**Nach Fix (erwartetes Verhalten):** Kunde-Portal rendert, Sidebar ohne Cards wenn Admin-Client fehlschlägt, oder vollständige Sidebar wenn Key verfügbar.

⚠️ **TODO für Aaron**: Staging-Smoke nach Merge bestätigen. Screenshot-Vergleich vorher/nachher obligatorisch.

---

## 5. Offene Risiken

| Risiko | Wahrscheinlichkeit | Maßnahme |
|---|---|---|
| Echter Root-Cause ist anders (anderer Throw im Layout) | Mittel | Fix macht Layout robuster auch gegen andere Fehler — worst-case rendert ohne Cards |
| `.env.local` auf VPS fehlt/ist unvollständig | Hoch | Aaron muss VPS-SSH-Check machen: `cat /var/www/claimondo-v2/.env.local | grep SUPABASE_SERVICE_ROLE_KEY` |
| Crash tritt auf anderen Portalen auf (Admin/Dispatch haben ähnliche `createAdminClient()`-Calls) | Mittel | Audit der anderen Layouts empfohlen in Iteration 3 |
| `SupportButton`-Dead-Import-Entfernung bricht Tree-Shaking-Ergebnis | Keine | Dead-Imports erzeugen größeres Client-Bundle — Entfernung ist positiv |

---

## 6. Iteration 3 — Verbindliche Methodik: CJ-Surface vs. CJ-Substance

### 6.1 Pflicht-Methodik für jede Customer-Journey-Verifikation

Pro UI-Schritt MUSS die DB-Verifikation als **stop-on-fail** Check laufen:

```
before_state = SQL(SELECT relevant_columns FROM table WHERE ...)
ui_action()  → Klick, Formular, Submit
after_state  = SQL(SELECT relevant_columns FROM table WHERE ...)
assert after_state != before_state  // STOP wenn gleich
```

**Verstöße sind Bugs** — ein UI-Save-Erfolg ohne DB-Sync ist ein klassischer Fehler-Vektor.

### 6.2 Token-Render-Pflicht-Tabelle (3 Schichten)

Pro Page MUSS verifiziert werden:

| DOM-Selector | Erwartete Klasse | Schicht 1: Code-Soll | Schicht 2: CSS-Bundle | Schicht 3: Computed-Style | Status |
|---|---|---|---|---|---|
| `.kunde-sidebar` | `bg-claimondo-navy` | Ja (layout.tsx) | ? | `background-color: #0d1b3e` | TODO |
| KundeNav Item | `text-white` | Ja | ? | ? | TODO |
| `/kunde` SheetCard | `shadow-sheet` | Ja (FallKarte) | ✓ (Bundle verifiziert) | ? | TODO |
| DynamicWizard Input | `shadow-focus-ondo` | Ja (liquidField) | ✓ (Bundle verifiziert) | ? | TODO |

**Referenz-Sets** (was sollte sichtbar sein):

- `/kunde` Dashboard: SheetCard mit `shadow-sheet`, Status-Stepper mit Claimondo-Tokens, KundeNav Navy-Sidebar
- `/kunde/onboarding-details` (DynamicWizard): Liquid-Field-Inputs mit `shadow-focus-ondo` bei Focus
- `/gutachter`: EmptyState wenn keine Aufträge
- `/dispatch`: Dashboard mit EmptyState-Cards

**Verstöße identifizieren** via `git blame` — Regression-Bug oder Token-System-Frage.

### 6.3 DB-State-Pflicht-Checks pro Journey-Step

| Step | Vor-State-Query | Erwarteter Nach-State |
|---|---|---|
| Kunde: Onboarding-Wizard ausfüllen | `SELECT onboarding_complete FROM faelle WHERE id=?` → `false` | `→ true` nach Submit |
| Dispatch: SA-Tool auslösen | `SELECT sa_unterschrieben FROM faelle WHERE id=?` → `false` | `→ true` nach Klick |
| SV: Gutachten hochladen | `SELECT gutachten_eingegangen_am FROM faelle WHERE id=?` → `null` | `→ timestamp` nach Upload |
| Admin: Status ändern | `SELECT status FROM faelle WHERE id=?` → `'ersterfassung'` | `→ 'in-bearbeitung'` |

---

## 7. Folge-PR: Debug-Overlays gaten (PR #2)

**Branch:** `kitta/aar-prod-cj-fix-02-debug-error-pages`  
**Status:** Noch nicht implementiert — Aaron entscheidet

Die folgenden Error-Boundaries sind CMM-14-Diagnose-Screens die Production-Kunden sehen:

| Datei | Farbe | Sichtbar wenn |
|---|---|---|
| `src/app/error.tsx` | `#9900ff` lila | `kunde/layout.tsx` crasht |
| `src/app/kunde/error.tsx` | `#ff8800` orange | Seiten unter `/kunde/**` crashen |
| `src/app/global-error.tsx` | schwarz | `app/layout.tsx` crasht |

**Empfohlener Fix:** Alle 3 hinter `process.env.NODE_ENV !== 'production'` gaten. In Production: user-freundlicher Reload-Button ohne Diagnose-Details.

---

## 8. Verbleibende Offene Fragen

1. **Was genau ist Digest `3073205500`?** — Kann nur mit direkten VPS-PM2-Logs oder Sentry verifiziert werden
2. **Ist `.env.local` auf VPS vollständig?** — Aaron: `ssh root@212.132.119.110 "grep SUPABASE_SERVICE_ROLE_KEY /var/www/claimondo-v2/.env.local"`
3. **Haben andere Portale ähnliche ungeschützte `createAdminClient()`-Calls?** — Grep-Audit empfohlen

