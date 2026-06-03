# E-Mail Dark-Mode-Feinschliff (P4) — "Marke schützen"

**Datum:** 2026-05-29 · **Branch:** `kitta/email-p4-darkmode` · **PR:** gegen `staging`

## Ziel

E-Mail-Clients (Apple Mail, Outlook, Gmail) färben Mails im Dark-Mode teils automatisch
um. Entscheidung Aaron: **"Marke schützen"** — das helle/Navy-Markenbild in allen Clients
erhalten, nur destruktive Auto-Inversion verhindern. Weiße Card bleibt weiß (signature look),
navy Wortmarke/Texte bleiben lesbar, kontrollierter dunkler Backdrop. KEIN bespoke Dark-Theme.

## Technik

- `<meta name="color-scheme">` + `supported-color-schemes` waren bereits da → compliante
  Clients (Apple) invertieren nicht.
- Neu im EmailShell-`<style>`:
  - `@media (prefers-color-scheme: dark)` (Apple Mail honoriert das) +
  - `[data-ogsc]` (Text) / `[data-ogsb]` (Hintergrund) für Outlooks Dark-Mode.
  - Alle Overrides mit `!important` (schlägt die Inline-Styles der Komponenten).
- Semantische Class-Hooks: `cl-bg-light`/`cl-bg-dark` (Backdrop), `cl-surface` (weiße Boxen
  bleiben weiß: Card + Hero-Logo-Chip), `cl-cream` (BeraterCard), `cl-wordmark`
  (MailHeader navy→weiß), `cl-footer` (Footer-Text→hell).
- `footerOnDark`-Token (`#8aa0bd`) zentralisiert (ersetzt Magic-Hex in Blocks.tsx).

## Gefundener Bug (durch Screenshot-Smoke, nicht durch Unit-Tests)

Erste Version legte den Backdrop auf `<Body className="cl-bg">`. **react-email's `<Body>`
kopiert den Body-Style aber auf ein internes Wrapper-`<td>` OHNE Klasse** — dieses td blieb
im Dark-Mode hellgrau und verdeckte den navy gewordenen Body. Ergebnis: weiße Wortmarke auf
hellgrauem td = unsichtbar.

**Fix:** Backdrop auf eine **eigene Full-Bleed-Wrapper-Tabelle** (`cl-bg-*` + Inline-bg) statt
auf `<Body>`. Body selbst bg-los → react-emails td transparent → eigener Backdrop scheint voll
durch. Inline-bg hält den Hellmodus auch wenn ein Client `<style>` strippt (Gmail); die
`!important`-Dark-Regel schlägt das Inline.

**Lesson:** Unit-Tests prüfen nur String-Presence (CSS/Klassen da) — die tatsächliche
Layer-/Render-Wirkung fängt nur der Screenshot-Smoke. Bei CSS-/Layout-Änderungen IMMER
visuell verifizieren.

## Verifikation

- `npx tsc --noEmit` → exit 0
- `npx vitest run src/lib/email` → grün (inkl. neuer `darkmode.test.tsx`: @media + Outlook-
  Selektoren + Class-Hooks an den richtigen Elementen).
- **Screenshot-Smoke** (Playwright, `colorScheme: light|dark`), Tier-2 (Abrechnung) + Tier-1
  (Welcome), je light/dark — siehe `darkmode-smoke/*.png`:
  - tier2-dark: navy Backdrop durchgehend, Wortmarke weiß+lesbar, Card weiß, Footer hell. ✓
  - tier1-dark: navy, weißer Logo-Chip (navy Text lesbar), cream BeraterCard erhalten. ✓
  - tier2-light / tier1-light: unverändert clean (keine Regression durch die Wrapper-Tabelle). ✓

## Grenzen

- Gmail-App (Android/iOS) strippt `<style>` + ignoriert `color-scheme` → dort greift nur der
  Inline-Hellmodus + Gmails eigener Smart-Invert (nicht steuerbar). Bekannt & akzeptiert.
- Outlook-Body-Hintergrund ist generell eigenwillig; die sichtbaren Brand-Anker
  (Wortmarke/Footer/Card/Cream) sind via `[data-ogsc]/[data-ogsb]` gepinnt.
