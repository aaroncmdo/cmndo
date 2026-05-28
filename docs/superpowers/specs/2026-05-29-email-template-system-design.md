# Design: Claimondo Email-Template-System („impeccable")

**Datum:** 2026-05-29
**Status:** Design freigegeben (Brainstorming Aaron 29.05.) — bereit für Implementierungsplan
**Visuelle Referenz:** `docs/superpowers/specs/2026-05-29-email-template-v7-mockup.html` (im Browser öffnen — finales Mockup v7)

---

## Ziel & Problem

Die transaktionalen Emails (react-email/Resend, `src/lib/email/google/templates/`) funktionieren, wirken aber **nicht wie die Marke**: Text-„Claimondo" statt echtem Logo, generische Navy/Grau-Tokens, schmale weiße Box. Templates mischen das geteilte `EmailLayout` + Primitives mit **Ad-hoc-Inline-Markup** (z. B. die Zugangsdaten-Box in `KundeWelcome`) → uneinheitlich, schwer wartbar.

**Ziel:** Ein markentreues, datengetriebenes Email-System, das *alle* ~13 Mail-Typen auf eine konsistente Basis stellt — visuell premium, technisch robust (Outlook/Dark-Mode/Zustellbarkeit), und je nach Content/Empfänger adaptiv.

## Ausgangslage (Bestand)

- `src/lib/email/google/templates/layout.tsx` — `EmailLayout` + Primitives (`Heading`, `Paragraph`, `Button`, `InfoTable`, `Divider`), whitelabel-fähig (`EmailBrand`: primary/secondary/logoUrl/firmenname), Inline-Styles, Footer mit Legal-Links. Solide Basis.
- ~13 Templates: KundeWelcome, WillkommenSv, SvMahnungSaeumnis, SvAbrechnung, KanzleiZahlungBestaetigung, KanzleiMagicLinkAbrechnung, KanzleiAbrechnungReminder, KanzleiAbrechnungRechnung, DokumenteAnfrage, AbrechnungReminder, AbrechnungBezahltConfirmation, TwoFactorCode, (termine/bestaetigung).
- Branding-Resolver: `resolveEmailBranding({svId|fallId|leadId})` aus `src/lib/branding/token-theme.ts` → `EmailBrand | null`.
- Fahrzeug-Render: `buildImaginUrl()` aus `src/lib/fahrzeug/imagin.ts` (imagin.studio, ¾-Ansicht nach Marke/Modell/Farbe/Baujahr; `demo`-Customer = Wasserzeichen).
- Marken-Assets in `public/`: `claimondo-wortmarke.svg`, `claimondo-shield.svg`, `brand/logo-full.png`, `brand/team-headset.png`, `kfzgutachter-lp/berater.png`.
- OG-Generierung (`ImageResponse`) existiert mehrfach (`opengraph-image.tsx`); `sharp` 0.34 verfügbar.

## Design-Übersicht

### 1 · Drei-Schichten-Architektur

**(a) `src/lib/email/tokens.ts` — eine Quelle der Wahrheit.** Behebt „Tokens nicht eindeutig" im Code.
- **Farben:** `navy #0D1B3E`, `shield #1E3A5F`, `ondo #4573A2`, `lightBlue #7BA3CC`, `gold #C9A84C`, `goldOnLight #B68A2E`, `cream #F5F1E8`, `surface #f8f9fb`, `border #eef0f4`, `creamBorder #ece5d6`, `textBody #374151`, `textMuted #6b7280`, `success #1E7A46`, `footerDark #0a1429`, `white #ffffff`.
- **Spacing-Skala:** 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32.
- **Radien:** sm 8 · md 12 · lg 14 · xl 18 · pill 999.
- **Typo:** H1 28/800, H2 20/700, Label 12/700 uppercase +1.2px, Body 14–15/400, Small 12–13, Footer 11. Font-Stack `Montserrat, -apple-system, 'Segoe UI', Roboto, sans-serif` (Web-Font lädt nur Apple Mail → System-Fallback bewusst).
- Token-Audit-Skip-Header bleibt (Emails rendern ohne Tailwind/CSS-Vars).

**(b) Primitive-Set** (token-gebunden, **tabellen-basiert + Outlook-safe**, in `src/lib/email/components/`):
`Layout` · `Hero` · `GlasFahrzeugKarte` · `StatGrid`/`StatTile` · `StatusPill` · `BeraterCard` · `Timeline` · `Callout` · `Note` · `Button` (bulletproof, VML) · `Trustbar` · `Footer` · `InfoRow`. Jedes: ein Zweck, klare Props, token-gebunden, kein Inline beim Consumer.

**(c) Templates (~13)** = nur noch **Komposition** aus Primitives. Kein bespoke Inline mehr.

### 2 · Datengetrieben + Tiers

Jeder Block ist an DB-Daten gekoppelt, mit Fallback (nie kaputt, immer markig):

| Block | Bedingung (DB) → Fallback |
|---|---|
| Hero-Hintergrund | immer (geblurrte Autowelt-Basis) — stabiler Marken-Anker |
| Auto im Hero | `hersteller`+`modell`(+farbe/baujahr) → imagin; sonst nur Hintergrund |
| Schaden-/Fahrzeug-Foto | wenn Upload vorhanden → einbinden; sonst weg |
| Fall-Kacheln | je Kachel nur bei gesetztem Feld |
| Status-Pill / Timeline | aus `claim.status` |
| Berater-Block | zugewiesener SV/Berater (Name/Foto/Tel) → sonst generisches Team **oder** ausgeblendet |
| CTA | Account-Status (Magic-Link / Portal / Konto anlegen) |

**Tiers** (das „je nach Content auch das Template"):
- **Tier 1 — Kunde** (kundengerichtet, whitelabel-fähig): voller Hero + Auto, Berater, Timeline. *(KundeWelcome, Termin-Bestätigung, kundengerichtete Dokument-Anfragen.)*
- **Tier 2 — SV/Kanzlei** (B2B, intern): cleaner Header (Logo-Leiste), kein Auto-Hero, fachlich/dicht. *(WillkommenSv, SV-/Kanzlei-Abrechnungen & Reminder.)*
- **Tier 3 — System/Auth** (minimal, schnell, **immer Claimondo**, kein Whitelabel): schlanker Header, kurzer Body. *(TwoFactorCode, reine Status-Confirmations.)*

Exaktes Template→Tier-Mapping wird in Migrations-Phase P3 finalisiert.

### 3 · Generiertes Hero-Bild (email-sicher, datengetrieben)

Statt Layer/Blur im Mail-Client (unzuverlässig) wird der Hero als **ein Bild** erzeugt:
- **Komposition (server-seitig, `sharp`):** vorab geblurrte Autowelt-Basis (statisches Asset in `public/brand/`, ~13 KB) + Glas-/Glow-Overlay + Kundenauto (imagin-Render, nach Marke/Modell/Farbe) → ein JPG.
- **Erzeugung zum Sende-Zeitpunkt**, Ergebnis in **Supabase Storage** (public Bucket) ablegen; **Cache-Key = (make, modell, farbe)** → kein Regenerieren pro Mail/Open. Email-`<img src>` zeigt auf die stabile Storage-URL.
- **Fallback:** kein Fahrzeug → nur Autowelt-Basis-Bild. Bilder im Client geblockt → Navy-Fallback-Hintergrund + Alt-Text + Headline bleiben (Hero-Bild ist Schmuck, nie Info-Träger).
- Logo-Chip, Headline, Karte bleiben **live** (selektierbar, accessible) über/um das Bild.

### 4 · Technik-Härtung
- **Dark-Mode** definiert (`color-scheme`, dunkle Varianten) — sonst zerlegen Apple/Gmail die weißen/Cream-Karten.
- **Plain-Text-Teil** (multipart) je Mail — Zustellbarkeit, Accessibility, Apple-Watch.
- **Bulletproof-Button** (VML für Outlook).
- **Preheader** versteckt + Spacer (kein Leak der Fallnummer in die Inbox-Vorschau).
- **Bild:Text-Ratio** beachten (großer Hero + wenig Text = Spam-Risiko).

### 5 · Trust / Conversion
- **Status-Timeline** (Gutachten → Anwalt → Auszahlung, aktueller Schritt markiert).
- **Social-Proof-Badge** (Bewertung/Anzahl — Quelle TBD).
- **Echtes weißes Logo-Asset** für dunkle Flächen (oder konsistentes Logo-Chip-Muster) + **Mini-Icon-Set** (Kacheln/Trust).
- **Footer:** LinkedIn-Company-Link (live), WhatsApp-Direktkontakt.

### 6 · Preview & QA
- **`react-email dev`-Harness** + Beispiel-Fixtures: jede Mail × Datenzustand (mit/ohne Auto, mit/ohne Berater, je Tier) lokal visuell prüfbar **vor** Versand.

## Migration (jede Phase = eigener PR gegen `staging`, mit Preview-Screenshots)

- **P1 — Fundament:** `tokens.ts` + Primitive-Set + Hero-Generierungs-Route/Helper + geblurrte Autowelt-Basis als Asset. Keine bestehende Mail geändert.
- **P2 — Flagship:** `KundeWelcome` (Tier 1) end-to-end auf das neue System — erster echter Beweis inkl. Hero, Berater, Timeline, datengetriebene Blöcke.
- **P3 — Sweep:** restliche ~12 Templates auf Primitives, nach Tier gebündelt; Ad-hoc-Inline raus; Template→Tier-Mapping final.
- **P4 — Härtung & QA:** Dark-Mode + Plain-Text-Multipart + Preview-Harness + Dead-Code-Cleanup.

## Offene Abhängigkeiten / Entscheidungen
1. **imagin Prod-Lizenz** (`NEXT_PUBLIC_IMAGIN_CUSTOMER`) — `demo` hat Wasserzeichen; für kundensichtbare Autos zwingend.
2. **Berater-Datenquelle:** woher Name/Foto/Telefon? Zugewiesener SV? Dispatch-Kontakt? Generisches Team als Fallback? → klären vor P2.
3. **Weißes Logo-Asset** für dunkle Flächen erstellen (oder Logo-Chip-Muster als Standard festlegen).
4. **Social-Proof-Zahlen:** echte Quelle (Google/Trustpilot) oder gepflegte Konstante?
5. **Supabase-Storage-Bucket** für generierte Hero-Bilder (public, Cache-Strategie).

## Nicht im Scope (YAGNI)
Native-App-Mails · Marketing-Newsletter · SMS/WhatsApp-Templates · Consent/CMP · Auth-Mails über Claimondo-Standard hinaus individualisieren.

## Referenz
- Finales Mockup: `docs/superpowers/specs/2026-05-29-email-template-v7-mockup.html`
- Bestand: `src/lib/email/google/templates/layout.tsx` + Templates · `src/lib/fahrzeug/imagin.ts` · `src/lib/branding/token-theme.ts`
