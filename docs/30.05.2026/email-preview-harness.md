# Email-Preview-Harness (P4) + Smoke

**Datum:** 2026-05-30 · **Branch:** `kitta/email-p4-preview-harness` · **MVP-Scope:** 8 Tier-1-Kundenmails

## Was

Lokales Dev-Tool, das die transaktionalen E-Mail-Templates mit Sample-Props ohne echten
Versand (kein Resend/SMTP/DB) in eine Browser-Galerie rendert — zum Iterieren am Markenbild.

`npm run email:preview` → `email-preview/out/index.html`.

## Warum eigener Generator statt `email dev`

react-emails `email dev` braucht pro Datei default-Export + `PreviewProps`; unsere Templates
nutzen überwiegend named Exports und haben keine PreviewProps → es rendert sie nicht. Der
eigene Generator (`email-preview/generate.preview.tsx`) importiert die Komponenten direkt und
füttert sie aus `fixtures.tsx` — **kein Eingriff in die Templates**.

## Architektur / Isolation

- `email-preview/fixtures.tsx` — `PREVIEWS[]` (name, subject, gerendertes Element je Template).
- `email-preview/generate.preview.tsx` — rendert jedes Element → `out/<name>.html` + `index.html`
  (defensiv: ein Render-Fehler kippt nicht die Galerie).
- `email-preview/vitest.preview.ts` — **eigene** vitest-Config (eigener `@`-Alias). Läuft nur via
  `npm run email:preview`; die Haupt-Config (`vitest.config.ts`, include `src/**/*.{test,spec}`)
  greift den Generator **nie** → kein CI-/`npm test`-Effekt (verifiziert via `vitest list`).
- `email-preview` ist in `tsconfig.json` **exclude** → der Dev-Tool-Ordner (inkl. `vitest`-Import)
  ist nicht im `next build`-/Typecheck-Graph. `out/` ist gitignored.

## Fixtures

Sample-Props der 8 Tier-1-Templates wurden per Parallel-Workflow (8 Agents, je 1 Template,
text-return) erzeugt und anschließend gegen die echten Props-Typen + den Render verifiziert.
2 Nits beim Smoke gefixt: (1) `Müller &amp; Partner` → `Müller & Partner` (HTML-Entity im
JS-String), (2) `uhrzeit: '10:30 Uhr'` → `'10:30'` bei KundeWelcome + KundeTerminGegenvorschlag
(Template hängt selbst „ Uhr" an → sonst „Uhr Uhr"). FlowLink rendert `terminUhrzeit` roh →
dort bleibt „Uhr" im Wert.

## Smoke (Playwright, colorScheme light|dark)

Querschnitt gescreenshottet (KundeWelcome, DokumenteAnfrage, KundeTerminGegenvorschlag,
LeadReminder1) — Evidenz in `email-preview-smoke/`:
- **KundeWelcome** (Tier-1, reichste): Hero + Fall-StatGrid + cream BeraterCard + Termin-Block +
  Magic-Link-Button + Zugangsdaten + Trustbar — alle Felder korrekt, Umlaute sauber, Dark-Mode
  konsistent (Tier-1 ist by-design navy).
- **DokumenteAnfrage**: Checkliste (5 Slots ✓) + amber Hinweis + Upload-Link.
- **KundeTerminGegenvorschlag**: Termin-Vergleich (alt/neu) + Begründung + „Müller & Partner".
- **LeadReminder1**: schlanker dark Hero + CTA.

## Erweitern

Tier-2/3: weitere Einträge in `fixtures.tsx:PREVIEWS` ergänzen (Props werden von TS gegen den
Komponenten-Typ geprüft). Gate: `npm run email:preview` (Render) + Playwright-Smoke.
