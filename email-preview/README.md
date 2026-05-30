# Email-Preview-Harness

Lokale Vorschau der transaktionalen E-Mail-Templates ohne echten Versand — zum
Iterieren am Markenbild (Hero/Card/Dark-Mode), ohne Resend/SMTP oder DB.

## Nutzung

```bash
npm run email:preview        # rendert alle Fixtures -> email-preview/out/index.html
```

Danach `email-preview/out/index.html` im Browser öffnen (die Galerie zeigt jede Mail
in einem iframe). `out/` ist gitignored (regenerierbar).

## Warum eigener Generator statt `email dev`

react-emails `email dev` erwartet pro Datei einen **default**-Export + `PreviewProps`.
Unsere Templates nutzen überwiegend **named** Exports (`KundeWelcomeEmail` …) und haben
keine `PreviewProps` → `email dev` rendert sie nicht. Dieser Generator importiert die
Komponenten direkt und füttert sie mit Sample-Props aus `fixtures.tsx` (kein Eingriff in
die Templates nötig).

Er läuft über eine **eigene** vitest-Config (`vitest.preview.ts`), die bewusst von der
Haupt-Config getrennt ist — so wird er **nie** von `npm test` / CI ausgeführt. `email-preview`
ist zusätzlich in `tsconfig.json` excludet (nicht im `next build`-Typecheck-Graph).

## Dark-Mode

Die Galerie zeigt die Mails im Hellmodus; für die Dark-Mode-Vorschau den **System-Darkmode**
umschalten (die Mails reagieren per `@media (prefers-color-scheme: dark)`). Eine verlässliche
Light/Dark-Gegenüberstellung über alle Clients hinweg liefert der Playwright-Smoke
(`colorScheme: light|dark`), siehe `docs/<datum>/email-darkmode-feinschliff.md`.

## Erweitern

`fixtures.tsx` ist der einzige Ort: weiteren Eintrag in `PREVIEWS` ergänzen (Tier-2/3-Templates
mit ihren Sample-Props). Die Props werden direkt von TypeScript gegen den Props-Typ der
Komponente geprüft — falsche/fehlende Felder fallen beim `email:preview`-Lauf auf.
