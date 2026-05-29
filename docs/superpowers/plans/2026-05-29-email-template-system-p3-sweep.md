# Email-Template-System P3 — Template-Sweep auf Primitive-Set · Implementation Plan

> **Status:** Entwurf zur Freigabe (2026-05-29). Baut auf P1a+P2 (auf staging gemergt) + P1b (#1998, gebackener Hero).
> **Quelle:** 37-Template-Klassifikation (Parallel-Workflow, 37 Agents) — Tier1=8, Tier2=26, Tier3=3.

**Goal:** Die verbleibenden **37 Live-Mail-Templates** vom alten `EmailLayout`/`InfoTable`-Set auf das neue Primitive-Set (`src/lib/email/components`) heben — markentreu nach Tier, Ad-hoc-Inline raus, **ohne** funktionalen Bruch (Branches, i18n, Whitelabel, PDF-Anhänge, Idempotenz, Magic-Links bleiben 1:1).

**Befund (verifiziert):** **Alle 37 importieren `./layout` (EmailLayout)** → einheitliches, mechanisches Muster, keine Sonderfall-Architektur. (Einzelne Agent-Notizen „bereits migriert" sind Fehleinschätzungen — sie verwechseln das Shared-`EmailLayout` mit dem neuen Set. Keins ist auf `components/` migriert.)

---

## Migrations-Rezept (für jedes Template gleich)

1. Import `from './layout'` → `from '../../components'` (+ `email`-Tokens wo nötig).
2. `EmailLayout` → `EmailShell` (Tier 1: `dark` + Hero; Tier 2/3: heller Header, kein Auto-Hero).
3. `Heading`/`Paragraph` aus `components` (statt layout); `Button` → neue API (`bg`-Prop statt `brand`-Prop; `bg = brand?.primary ?? navy`).
4. `InfoTable` → `Card` + `InfoRow[]` bzw. `StatGrid` (Vorbild: KundeWelcome).
5. `Divider`/`Hr` → Spacing/`Note`; Fußnoten → `Note`.
6. `Footer onDark={tier===1}` statt layout-Footer.
7. **Erhalten:** alle Conditional-Branches, Anrede-/Salutation-Logik, `locale`/i18n, `brand`-Whitelabel (Tier 1), PDF-Attachment-Handling (liegt in `flows.ts`/`actions.ts`, NICHT im Template — nicht anfassen), Idempotenz.
8. Token-Audit-Skip-Header bleibt in jeder `.tsx`.

**Gate je Batch:** `tsc --noEmit` + `vitest run src/lib/email` + **Render-Smoke** (repräsentative Zustände → Screenshot, im selben Turn ausgewertet). Jeder Batch = eigener PR `--base staging`.

---

## Batch 0 — Fundament (zuerst)

**0a · Tote Templates verifizieren + löschen** (nicht migrieren — Dead-Code):
| Template | Befund |
|---|---|
| `AnzahlungEingegangen` | deprecated, ersetzt durch `SvOnboardingRechnung` (Stripe-Webhook) |
| `KanzleiAbrechnungReminder` | verwaist — keine `sendXxx`-Funktion |
| `KanzleiZahlungBestaetigung` | nicht in `flows.ts` importiert |
| `ReklamationFristAbgelaufen` | unused legacy — nicht in `flows.ts` |
→ Pro Template `grep -rn` über `src/` bestätigen (kein Import/Aufruf), dann `git rm` + Import-Check. Spart 4 Migrationen.

**0b · Neue Primitives** (mit Tests, analog P1a):
- `DocumentList` — strukturierte Dokument-Liste (DokumenteAnfrage, KanzleiAuftragszusammenfassung).
- `PositionsTable` — Rechnungs-Positionen (Label/Betrag-Zeilen + Summe; KanzleiAbrechnungRechnung, SvAbrechnung).
- Warning-Box = bestehendes **`Callout`** (kein neues Primitive). Credentials-Block = KundeWelcome-Muster (Surface-`div` + `InfoRow`).

---

## Batch 1 — Tier 3 (System/Auth, 3 Stück, risikoärmstes → beweist Muster)

| Template | Empfänger | Komplex. | Hinweis |
|---|---|---|---|
| `AdminBackupFehlgeschlagen` | admin | trivial | Ops-Alert; minimal halten, Footer optional |
| `AdminEinzugFehlgeschlagen` | admin | trivial | hardcodiertes „Aaron" → generische Admin-Notiz |
| `TwoFactorCode` | system | trivial | ⚠️ **Auth-kritisch (OTP)** — kein Magic-Link (Phishing), monospace-Code-Block exakt erhalten, separat smoken |

Tier 3 = immer Claimondo, kein Whitelabel, kein Hero. Schlanker Header + Body.

## Batch 2 — Tier 2 trivial (B2B-intern, ~19 Stück)

`AbrechnungBezahltConfirmation`, `AbrechnungReminder`, `BueroSubSvEinladung`, `BueroVerwalterAbrechnungInfo`, `DispatcherGegenvorschlag`, `DispatcherTerminAbgelehnt`, `KanzleiMagicLinkAbrechnung`, `KanzleiMonatsAbrechnung`, `MarketingAbrechnung`, `ProvisionReleased`, `SvAuftragszusammenfassung`, `SvMahnungSaeumnis`, `SvMonatsabrechnungVersand`, `SvOnboardingRechnung`, `SvPortalFreigeschaltet`, `SvRechnung`, `SvTerminBestaetigung`, `WillkommenSvAnBuero`.
- Tier 2 = cleaner Logo-Header, **kein** Auto-Hero, kein Whitelabel, deutsch. `Card` + `InfoRow`/`StatGrid`.
- Besonderheiten: Anrede-/orgTyp-Logik (solo/buero/akademie) bei `BueroVerwalterAbrechnungInfo`/`SvOnboardingRechnung` erhalten; PDF-Anhänge (`SvRechnung`/`SvMonatsabrechnungVersand`/`BueroSubSvEinladung`) im Flow lassen; `SvMahnungSaeumnis` 3-Stufen-Logik; `SvTerminBestaetigung` Zweizweig (istVorreservierung) + `Card`/`InfoRow`.

## Batch 3 — Tier 2 medium (Positionen/Listen, 3 Stück)

`KanzleiAbrechnungRechnung` (+`SvAbrechnung`) → `PositionsTable`; `KanzleiAuftragszusammenfassung` + `WillkommenSv` → `DocumentList` bzw. Credentials-Block (KundeWelcome-Muster). `WillkommenSv` Sub-SV-Conditionals (organisation_name) + `buildSalutation()` erhalten.

## Batch 4 — Tier 1 (Kunde, 8 Stück, whitelabel + i18n) — zuletzt, wie KundeWelcome

| Template | i18n | Komplex. | Hinweis |
|---|---|---|---|
| `LeadReminder1/2/3` | nein | trivial | kein Login/Termin; `resumeUrl` erhalten; Subject extern (`lead-reminders.ts`) |
| `KundeTerminGegenvorschlag` | **ja** | trivial | Magic-Link (7-Tage-Token) im Button-href |
| `MiniWizardMagicLink` | **ja** | trivial | ⚠️ `MiniWizardMagicLink.i18n.ts` **fehlt** — anlegen |
| `FlowLinkVersand` | nein | trivial | whitelabel-ready; ⚠️ SV-Daten via Relation-Lookup im Flow — Props ggf. vorab auflösen |
| `AbrechnungManuellVersendet` | nein | trivial | kunden-gerichtet; `brand`-Prop nachrüsten (Whitelabel wie KundeWelcome) |
| `DokumenteAnfrage` | nein | **medium** | `Callout` (Warning) + `DocumentList`; whitelabel |

Tier 1 = voller `EmailShell dark` + Hero/Logo + `Card`, `brand`-Whitelabel + ggf. `heroBildUrl` (P1b), i18n wo `locale` vorhanden.

---

## Ausführung

Jeder Batch ist ein eigener PR `--base staging` mit Render-Smoke + 7-Punkte-Audit. **Empfohlen:** Batch je als Parallel-Workflow (ein Agent migriert + smoket ein Template nach dem Rezept) → ich reviewe/committe gebündelt. Reihenfolge **0 → 1 → 2 → 3 → 4** (Risiko aufsteigend). Tier 1 zuletzt, weil Whitelabel/i18n + P1b-Hero den meisten Care brauchen.

## Offene Entscheidungen
1. **Tote Templates** (Batch 0a): wirklich löschen — oder als Legacy behalten? (Empfehlung: löschen nach grep-Bestätigung.)
2. **`AbrechnungManuellVersendet`/`AbrechnungReminder`** Empfänger = Kunde oder SV? (Klassifikation: ManuellVersendet→Kunde/T1, Reminder→SV/T2 — bei Migration am Caller gegenprüfen.)
3. **Batch-Granularität:** 5 PRs (je Batch) oder feiner? (Empfehlung: 5.)

**Reststrecke nach P3:** P4 — Plain-Text-Multipart + Dark-Mode-Feinschliff + `react-email dev`-Preview-Harness + Bild:Text-Ratio.
