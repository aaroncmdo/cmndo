# Cold-Mailer — Variablen- & Aktions-Palette — Design

**Ziel:** Im Cold-Mail-Editor (Vorlagen-Editor **und** Einzel-Composer) werden **alle Merge-Variablen** sichtbar als Chips angezeigt und per Klick an der Cursor-Position eingefügt. Dazu eine erweiterbare **Aktions-Palette**: einfügbare CTAs (**Beratungsgespräch buchen**, **Registrierungslink**), die als gestylte Buttons in der Mail landen.

Approved by Aaron 2026-07-15 (Architektur + Buttons). Uncontested — reine Cold-Mailer-Lane.

## Kernmechanismus: Aktionen = Merge-Tokens, die zu Button-HTML auflösen

Statt statischer Links fügt die Palette **Tokens** ein (`{{Beratungslink}}`, `{{Registrierungslink}}`), die beim Versand pro Lead aufgelöst werden — zu einem **button-gestylten `<a>`-Schnipsel**.

Warum das in **beiden** Editoren ohne Rich-Text-Editor funktioniert: im Einzel-Composer läuft `textToHtml` (escaped Prosa) **vor** dem serverseitigen `renderMerge`. Der Token hat keine HTML-Sonderzeichen → übersteht das Escaping → `renderMerge` spritzt danach das rohe Button-`<a>` ein → klickbarer Button. Im Vorlagen-Editor (HTML-Body) greift `renderMerge` direkt. **Ein Mechanismus, beide Flächen, funktioniert automatisch auch in Sequenzen** (der Cron-Advancer nutzt dieselbe merge/render-Kette).

## Architektur (4 Einheiten)

### 1. `src/lib/cold-mail/merge-vars.ts` (NEU) — Single Source of Truth
`// Token-Audit-Skip:` Header (Email-HTML/Buttons brauchen inline-hex; Cold-Mail = Prospects ohne Brand-Theme, analog `ColdMailShell.tsx`).
- `MERGE_VARS: { token: string; label: string }[]` — Datenvariablen für die Palette: **Ansprechpartner, Vorname, Nachname, Firma, Position, Ort**.
- `ACTION_VARS: { token: string; label: string }[]` — Palette-Definition der Aktionen (erweiterbar: eine neue Aktion = ein Eintrag + ein Resolver-Zweig).
- `registrierungsUrl(rolle): string` — rollenbewusst: `makler`→`/makler/registrieren`, `werkstatt`→`/werkstatt-partner-werden`, `sachverstaendiger`→`/sv/registrieren`. Basis `NEXT_PUBLIC_APP_URL || https://app.claimondo.de`.
- `BERATUNG_URL = 'https://claimondo.de/beratung-anfragen'` (verifiziert 200; statisch).
- `button(url, label): string` — email-sicheres Button-`<a>` (inline-Styles: `display:inline-block; background-color:#0D1B3E; color:#ffffff; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600`).
- `resolveActionVars(lead: { rolle: string|null }): Record<string,string>` — `{ Beratungslink: button(BERATUNG_URL,'Beratungsgespräch buchen'), Registrierungslink: button(registrierungsUrl(rolle),'Jetzt registrieren') }`.

### 2. `src/lib/cold-mail/merge.ts` (EDIT) — buildMergeVars erweitern
- `buildMergeVars(lead)` nimmt zusätzlich `ansprechpartner_position` + `rolle`; liefert die Datenvariablen (Ansprechpartner, Vorname, Nachname, Position, Firma, Ort) **plus** `...resolveActionVars(lead)`.
- `ColdMailMergeVars` → `Record<string, string>` (die Menge ist jetzt daten-getrieben). `renderMerge` unverändert (`key in vars`-Check trägt das).

### 3. `src/app/admin/vertrieb/drawer/MergeVarPalette.tsx` (NEU) — geteilte UI
- Zwei Chip-Reihen („Variablen" / „Aktionen"), gerendert aus `MERGE_VARS`/`ACTION_VARS`.
- Prop `onInsert(token: string)`. Die Palette kennt keine Textareas — der Parent macht den Cursor-Splice (klare Grenze).
- `primitives.Button` (variant ghost, size sm) statt handgerolltem Markup.

### 4. Verdrahtung in beide Editoren (EDIT)
- `ColdMailComposer.tsx` + `SequenzenDrawerContent.tsx`: Palette über dem Body-Textfeld. `onInsert` fügt den Token an `selectionStart` des zuletzt fokussierten Feldes ein (Betreff **oder** Body — `activeField`-State via `onFocus`), Cursor danach hinter den Token. Aktionen dürfen nur in den Body (Betreff-Fokus → Aktions-Chips fügen in den Body).

### 5. Send-Pfade: `rolle` + `position` mitladen (EDIT)
- `cold-mail-send.ts` (`sendeColdMailAnLead`) + `api/cron/cold-mailer-advance/route.ts`: Lead-Select um `rolle, ansprechpartner_position` erweitern (heute nicht dabei) → `buildMergeVars` bekommt die vollen Daten. **Beide Selects gegen die prod-DB verifizieren** (ungetypter Admin-Client im Cron).

## Tests (TDD, reine Funktionen)
- `merge-vars.test.ts`: `registrierungsUrl` je Rolle; `resolveActionVars` liefert Button-HTML mit korrekter URL + Label; `button()` enthält href + Label + `display:inline-block`.
- `merge.test.ts` (UPDATE): `buildMergeVars` liefert jetzt die erweiterte Var-Menge inkl. aufgelöster Aktionen; `{{Feld}}`-Semantik unverändert.
- Palette-Insertion: UI (Prod-Smoke Regel 4).

## Bewusst nicht in v1
- Sanitisierung des Freitext-`bodyHtml` (separate, bestehende Baustelle) — die Aktions-Schnipsel sind admin-definierte Konstanten, kein User-Input.
- Konfigurierbare Button-Farbe/Label pro Vorlage (später; v1 = fixes Claimondo-Navy).

## Regeln
7-Punkte-Audit, `{ok,error}`-Result-Objects, Umlaute in UI/Mail, Komponenten-Set (`primitives`), TDD, PR gegen `staging`, Prod-Smoke nach Deploy.
