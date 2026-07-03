# Makler „Erste-Vermittlung"-Prompt — Design

**Datum:** 2026-07-03
**Kontext:** Der Onboarding-Wizard-Schritt 3 („passive Kanäle": E-Mail-Signatur + Website-Embed) wurde entfernt, weil er *vor* jedem Erfolg zu aufdringlich war (Session 617d27df). Aaron: den Vorschlag stattdessen **nach der ersten erfolgreichen Vermittlung aktiv noch einmal** vorlegen — dann ist er verdient und relevant.

## Ziel
Nach der 1. erfolgreichen Vermittlung eines Maklers (erster über den Makler-Link konvertierter Kunde) zeigt das Makler-Dashboard **einmalig** eine wegklickbare Erfolgs-Card, die die passiven Snippets (Signatur/Embed) aktiv anbietet. Nach Dismiss nie wieder.

## Nicht-Ziele
- Kein Modal, kein portalweiter Banner (bewusst verworfen — Erfolgs-Card auf dem Dashboard, aktiv aber nicht unterbrechend).
- Keine Wiederholung (Aaron: „noch **einmal**").
- Keine Kopplung an `convert-lead-to-claim.ts` (HOT, viele Sessions) — Trigger wird beim Dashboard-Load berechnet.

## Trigger & Datenfluss
1. **Migration** (Supabase-Plugin, Regel 2): `makler.vermittlung_prompt_gesehen boolean NOT NULL DEFAULT false`.
2. **`getMaklerDashboardData(maklerId)`** (`src/lib/makler/queries.ts`):
   - `promoRows`-Select um `code` erweitern → `promoCode` = erster Code (für `ShareTools`).
   - Neue Parallel-Count-Query `provTotalRes` = `makler_provisionen` (any status) für den Makler; `hatVermittlung = count >= 1`. RLS-sicher (Makler liest eigene Provisionen — Dashboard tut das bereits).
   - `DashboardData` += `hatVermittlung: boolean`, `promoCode: string | null`.
3. **`getCurrentMakler`** + `MaklerRow`: Select/Type um `vermittlung_prompt_gesehen: boolean` erweitern.
4. **Dashboard-Page** (`src/app/makler/(shell)/page.tsx`): `zeigeErsteVermittlungCard = data.hatVermittlung && !makler.vermittlung_prompt_gesehen`; reicht Flag + `promoCode` an `MaklerDashboard`.
5. **`ErsteVermittlungCard`** (NEU, Client): rendert oben im Dashboard, wenn Flag true. „🎉 Ihre erste Vermittlung!" + „So bleiben Sie dauerhaft präsent:" + `<ShareTools variant="passive" code={promoCode} firma={firma} />` + `[x]`-Dismiss. Optimistisches Ausblenden.
6. **Server-Action** `markiereVermittlungPromptGesehen()` (`src/app/makler/(shell)/actions.ts`, NEU): setzt `vermittlung_prompt_gesehen=true` für den eingeloggten Makler (RLS `makler_self_update`, wie `markiereOnboardingAbgeschlossen`), `revalidatePath('/makler')`, Result `{ ok: boolean; error?: string }`.

## Komponenten
- **NEU:** `src/components/makler/ErsteVermittlungCard.tsx` (einzige neue UI) — reused `ShareTools` (passive).
- **NEU:** `src/app/makler/(shell)/actions.ts` (Dismiss-Action).
- **NEU:** Migration + `database.types.ts`-Ergänzung.
- **ÄNDERN:** `queries.ts` (Flag+Code+Count), `MaklerDashboard.tsx` (2 neue Props + Card oben), `(shell)/page.tsx` (Props durchreichen).

## Konsistenz / Framing
- Kundennutzen-/„präsent-bleiben"-Framing, **kein** Provisions-Claim; formelles „Sie".
- `text-success-strong`-Akzent (wie StepLoslegen); `rounded-ios-*`; claimondo-Tokens; primitives `Button`/`CloseButton`.
- ShareTools (passive) unverändert wiederverwendet — keine Snippet-Duplikation.

## Error-Handling
Dismiss-Action liefert `{ ok }`; bei Fehler bleibt die Card sichtbar (Client-Toast). Nicht-kritisch → blockt nichts.

## Testing
- `npm run build` / `tsc --noEmit` grün.
- Bestehende vitest-Suites bleiben grün (kein neuer Unit-Test für das triviale `hatVermittlung && !gesehen`-Prädikat — YAGNI).
- **Prod-Smoke** (die echte Verifikation): Seed-Makler (2 Vermittlungen, Flag default false) → Card erscheint → Dismiss → Flag=true → Card weg, kein Re-Show. Danach Flag zurücksetzen (Cleanup).

## Regel-2-Migrationsablauf
`apply_migration` → `list_migrations` (getrackte Version <V> ablesen) → File committen als `supabase/migrations/<V>_makler_vermittlung_prompt_gesehen.sql` (Name == Version). Additive Spalte mit Default → unkritisch, kein Twin-Drift-/Regel-3-Risiko.
