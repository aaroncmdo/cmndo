# Branding-Rollout — Spec & Audit

**Datum:** 2026-05-12 (erweitert 2026-05-12 um Email-Scope)
**Scope:** Whitelabel-Theming an "allen Ecken und Enden" der App + Vollthema für Kunden eines verifizierten SVs — **inkl. aller Kunden-gerichteten Emails**
**Status:** In Umsetzung — Phase 1 ✅, Phase 2-Basis ✅, Phase 2-Rest + Phase 4 + Phase 5 (Email) offen → diese Iteration

---

## TL;DR

Das Branding-System existiert **vollständig** (AAR-220, AAR-419/420/422/423/424/455/456, AAR-536). Was fehlt, ist **Coverage-Aktivierung**: die generierten 27 CSS-Vars werden im Code zu wenig konsumiert, weil viele Komponenten weiterhin hardcoded `claimondo-*`-Tailwind-Klassen oder Hex-Strings nutzen.

**Die zentrale Erkenntnis:** Eine **6-Zeilen-Änderung in `src/app/globals.css`** brandet automatisch ~60 % der App, weil Tailwind-Utility-Klassen (`bg-claimondo-navy`, `text-claimondo-ondo`, …) dann transitiv auf `var(--brand-*)` zeigen.

**Aaron-Entscheidungen (12.05.):**
1. Beides parallel: Smoke-Befund + Coverage-Audit
2. Kunde-Portal von `light` (4 Vars) auf `full` (27 Vars) upgraden — verifizierter SV propagiert volles Whitelabel zum Kunden
3. **Emails sind im Scope** — alle Kunden-gerichteten Mails (Welcome, Termin-Bestätigung/Gegenvorschlag, Dokumenten-Anfrage, Flow-Link-Versand, Lead-Reminder) übernehmen das Theme + Logo des verifizierten branded SVs; SV-gerichtete + interne Mails (Admin/Kanzlei/SV-eigene Abrechnung) bleiben Claimondo. Footer behält dezenten "Powered by Claimondo"-Hinweis.

---

## Was bereits existiert (AAR-220 → AAR-536)

### Backend — `src/lib/branding/`
- **`extract-colors.ts`** — Vibrant-Multi-Kandidaten + **Claude-Vision-Quality-Check** + Hintergrund-Detection (filtert Schwarz/Weiß/Grau, AAR-455) + triadische Fallbacks für Mono-Logos + WCAG-Cascade. *Besser als Adobe Color* — Claude prüft semantisch, ob die Extraktion plausibel ist.
- **`theme.ts`** — V2-Generator: 1 Primary-Hex → **24 Farb-Tokens + 2 Metadata** via HSL-Math (Hover/Active/Soft, Neutrale mit 3 % Primary-Tint, Sidebar-Variante, harmonisierte Status-Farben).
- **`claude-vision.ts`** — Logo-Analyse, empfiehlt Font-Kategorie (Racing/Elegance/Kanoo).
- **`resolve-theme.ts`** — Resolver für SV-Portal mit Org-Vorrang (Sub-SVs erben Büro-Theme).
- **`kunden-theme.ts`** — Kunden-Theme nur bei `verifiziert=true && use_custom_branding=true` (Anti-Versuchskaninchen-Gate).
- **`css-vars.ts`** — `generateCssVars(theme, mode)` mit Modi `full` (27 Vars) / `light` (4 Vars) / `none`.

### API — `/api/branding/{extract,save,upload,reset}`
End-to-End funktional. Rate-Limit 5 Calls/min auf `/extract`. Logos in dediziertem Bucket `gutachter-logos`. Org-Sync (Inhaber pflegt → Org + SV identisch).

### UI — `/gutachter/profil/branding`
`BrandingEditor` + `LogoUploader` + `ColorFineTuning` + `LivePreview` + `FontPicker`. Sub-SVs (`community_member`) auf Profil zurückgeleitet.

### DB-Schema (vollständig vorhanden)
`sachverstaendige` und `organisationen` haben jeweils:
`logo_url`, `brand_primary`, `brand_secondary`, `brand_accent`, `brand_theme` (JSONB), `brand_extracted_at`, `use_custom_branding`, `verifiziert` (nur SV).

### Verkabelung
- **SV-Portal:** `gutachter/layout.tsx:92-100` ruft `resolveBrandTheme()`, `GutachterShell.tsx:166-172,301` injiziert `generateCssVars(theme, 'full')` auf Wrapper. ✅
- **Kunde-Portal:** `kunde/layout.tsx:252` ruft `resolveKundenTheme(user.id)` auf, generiert bereits `full`-Vars — **nutzt sie aber nur für 2 Inline-Styles** (`sidebarBg`, `accentBg`). ⚠️
- **Magic-Link-Routen** (`/flow/[token]`, `/upload/zb1/[token]`): **kein Branding**. ❌

---

## Lücken-Analyse

### Lücke 1 — Tailwind-Utility-Klassen sind hardcoded (zentraler Hebel)

**`src/app/globals.css:69-75`:**
```css
--color-claimondo-navy: var(--claimondo-navy);   /* zeigt auf statisches #0D1B3E */
--color-claimondo-ondo: var(--claimondo-ondo);
--color-claimondo-shield: var(--claimondo-shield);
--color-claimondo-light-blue: var(--claimondo-light-blue);
--color-claimondo-bg: var(--claimondo-bg);
--color-claimondo-card: var(--claimondo-card);
--color-claimondo-border: var(--claimondo-border);
```

Jede Komponente, die `bg-claimondo-navy` / `text-claimondo-ondo` / `border-claimondo-border` nutzt, bekommt **immer** Claimondo, nie das Brand-Theme — egal ob im SV-Portal mit Provider drumherum.

**Zusätzlich Zeile 101, 107, 112:**
```css
--primary: #0D1B3E;          /* shadcn-Primary, hardcoded Claimondo */
--accent: #4573A2;
--ring: #4573A2;
```

Alle shadcn-Komponenten (Button-Default-Variante, Switch, Checkbox, Slider, Input-Focus-Ring) sind dadurch hardcoded.

### Lücke 2 — SV-Portal: ~80 Files mit hardcoded Patterns

Top-Hotspots (geordnet nach Treffer-Anzahl):

| Datei | Treffer | Impact |
|---|---:|---|
| `src/app/gutachter/profil/ProfilClient.tsx` | 105 | Mittel |
| `src/app/gutachter/abrechnung/page.tsx` | 94 | Hoch (Finanz-Cockpit) |
| `src/app/gutachter/willkommen/WillkommenClient.tsx` | 82 | Hoch (First-Time-Experience) |
| `src/app/gutachter/gebiet/page.tsx` | 55 | Mittel |
| `src/app/gutachter/fall/[id]/_components/*.tsx` | ~12 Files | **Sehr hoch** (Fall-Detail) |
| `src/components/CookieBanner.tsx` | inline `#0D1B3E` | Mittel |
| `src/app/gutachter/GutachterShell.tsx:351,423,445` | 3 Logo-Fallback-Klassen | Trivial |

### Lücke 3 — Kunde-Portal: 630 hardcoded-Treffer + Provider-Wrapper fehlt

**Kritischer Befund:** `kunde/layout.tsx` lädt das volle 27-Var-Theme, aber `style={themeStyle}` wird nur auf 2 Inline-Styles angewendet — **es gibt keinen Wrapper-Div mit allen Vars**, sodass Kinder-Pages die Vars vererben könnten.

| Datei | Treffer |
|---|---:|
| `src/app/kunde/faelle/[id]/FallDetailSections.tsx` | 40 |
| `src/app/kunde/chat/page.tsx` | ~10 |
| `src/app/kunde/einstellungen/page.tsx` | ~10 |
| `src/app/kunde/faelle/page.tsx` | 8 |
| `src/app/kunde/layout.tsx` | 2 (`#0D1B3E`, `#4573A2`) |
| **Gesamt `kunde/**` + `faelle/**` (Kunden-Sicht)** | **630** |

`KundenLightBrandingProvider` ist nur in **einer Route** eingebunden (`kunde/termin/[token]/page.tsx:170-202`) und setzt nur 4 Vars. Aaron will `full` mit 27 Vars überall.

### Lücke 4 — Magic-Link-Routen ohne Branding

`/flow/[token]`, `/upload/zb1/[token]` zeigen dem Kunden **immer Claimondo**, selbst wenn der zugewiesene SV verifiziert + branded ist. Kunde sieht im Termin-Magic-Link Branding, aber im Upload-Magic-Link nicht — Inkonsistenz.

### Lücke 5 — Kleine Bugs

- **`isBrandingV2Enabled()`** ist toter Code — wird nirgendwo aufgerufen, V2 läuft immer. Cleanup oder echtes Flag.
- **`organisationen.firmenname`** wird in `kunden-theme.ts:52` nicht selektiert → Kunde sieht kein Org-Name selbst wenn Org branded ist.
- **`CookieBanner.tsx`** nutzt inline-Hex statt Vars.

### Lücke 6 — Logo-Display-Coverage (offen)

`resolveBrandTheme()` und `resolveKundenTheme()` liefern beide `logoUrl` zurück, aber der Audit hat **nicht systematisch geprüft**, wo dieses Logo aktuell gerendert wird:

- SV-Portal: `GutachterShell` Sidebar-Header? Mobile-Topbar? Login-Page?
- Kunde-Portal: `kunde/layout.tsx` Header? `KundenbetreuerCard`?
- Magic-Links: Termin-Page Logo? Upload-Page Logo?
- PDF: `generate-pdf.tsx` nutzt Logo bereits? (siehe "Nicht in diesem Spec")
- Emails: bisher kein Branding (siehe "Nicht in diesem Spec")

**Action:** Im Rahmen von Phase 2 + 3 explizit pro Layout/Page checken: wenn `branding.useCustom && branding.logoUrl` → Logo statt Claimondo-Wortmarke rendern, mit Fallback.

### Lücke 7 — Sub-SV / Org-Vererbung im Smoke-Plan fehlt

Resolver hat Org-Vorrang (Sub-SVs erben Büro-Theme). Smoke-Tests in Phase 1+2 sollten **explizit** beide Cases abdecken:
1. Solo-SV (Standalone) mit Custom-Brand → eigenes Theme
2. Büro-Inhaber mit Custom-Brand → Theme greift bei Inhaber + allen Sub-SVs der Organisation
3. Sub-SV ohne Inhaber-Brand → Claimondo-Default

---

## Migration-Plan (4 Phasen)

**Vorbedingung:** Keine DB-Migration nötig. Alle Spalten + Buckets + APIs sind vorhanden. Reine Code-Änderung.

### Phase 1 — Tailwind-Tokens auf Brand-Vars umbiegen (1-2 h)

**Ziel:** Mit minimaler Änderung 60 % Coverage erreichen.

**`src/app/globals.css:69-75`** anpassen:
```css
--color-claimondo-navy: var(--brand-primary, var(--claimondo-navy));
--color-claimondo-ondo: var(--brand-secondary, var(--claimondo-ondo));
--color-claimondo-shield: var(--brand-sidebar-active, var(--claimondo-shield));
--color-claimondo-light-blue: var(--brand-accent, var(--claimondo-light-blue));
--color-claimondo-bg: var(--brand-background, var(--claimondo-bg));
--color-claimondo-card: var(--brand-surface, var(--claimondo-card));
--color-claimondo-border: var(--brand-border, var(--claimondo-border));
```

**`src/app/globals.css:101,107,112`** für shadcn-Tokens:
```css
--primary: var(--brand-primary, #0D1B3E);
--accent: var(--brand-accent, #4573A2);
--ring: var(--brand-secondary, #4573A2);
```

**Fallback-Mechanik:** Auf Marketing-Pages und Login (kein Provider, keine Brand-Vars gesetzt) greift der `var(…, fallback)`-Default — Claimondo bleibt Default. Auf gebrandeten Provider-Wrappern (SV-Portal-Shell, Kunde-Portal-Layout-Wrapper) wird das SV-Theme transitiv durchgereicht.

**Test-SV-Setup:**
Über `/gutachter/profil/branding` als Test-SV einloggen, Logo hochladen (z.B. eigenes Knallrot-Logo), oder direkt via `update sachverstaendige set use_custom_branding=true, brand_primary='#E11D48' where id=…` für Smoke-Speed.

**Smoke nach Phase 1:**
1. Test-Solo-SV mit Custom-Brand (Knallrot `#E11D48`) im SV-Portal → Sidebar + Cards + Buttons werden rot
2. Test-Büro-Inhaber mit Brand → Inhaber-Portal + Sub-SV-Portal beide gebrandet (Org-Vorrang funktioniert)
3. Marketing-Pages (`/`, `/faq`, `/gutachter-finden`) → unverändert claimondo-navy (Fallback greift)
4. Login-Page → Claimondo (kein User-Context, kein Provider)
5. Kunde-Portal mit unverifiziertem SV → Claimondo (Gate funktioniert)
6. Kunde-Portal mit verifiziertem branded SV → SV-Brand (vollständig erst nach Phase 2)

**Risiko:** Niedrig. Fallback-Hex schützt alle Stellen ohne Provider. Bei Regression: Single-File-Revert.

### Phase 2 — Kunde-Layout: Wrapper-Div + Magic-Link-Coverage (3-4 h)

**`src/app/kunde/layout.tsx:322`** — Wrapper-Div mit `style={themeStyle}` einziehen, damit alle Kinder-Pages die 27 Vars erben:
```tsx
<div style={themeStyle}>
  {/* existing children */}
</div>
```

`KundenLightBrandingProvider` deprecaten oder durch `KundenFullBrandingProvider` ersetzen (intern wrapper für `generateCssVars(theme, 'full')`).

**Magic-Link-Routen branden:**
- `/upload/zb1/[token]/page.tsx` — Token → Lead/Fall → SV → `resolveKundenTheme(svId)` direkt aufrufen + Wrapper-Div
- `/flow/[token]/page.tsx` — analog
- Ggf. Helper `resolveBrandingFromToken(token)` in `src/lib/branding/` extrahieren

**`organisationen.firmenname` in `kunden-theme.ts:52`** — Select-Liste ergänzen + Fallback `firmenname ?? org.firmenname`.

**Logo-Rendering verdrahten:** Pro Layout (SV-Shell, Kunde-Layout, Magic-Link-Pages) prüfen: wenn `branding.useCustom && branding.logoUrl` → Logo statt Claimondo-Wortmarke rendern. Component vermutlich schon vorhanden (`PortalNav` kennt Logo-Slot via `useBranding` — siehe `src/components/shared/PageHeader.tsx`).

**Smoke nach Phase 2:**
1. Verifizierter SV mit Brand → Kunden-Termin-Magic-Link, Upload-Magic-Link, Kunden-Portal: alle gebrandet, konsistent
2. SV ohne Verifizierung → alles Claimondo (Gate funktioniert)

### Phase 3 — Hardcoded-Sweep (parallel-bar, 4-6 h pro Portal)

**SV-Portal:** Top-5-Files mit Regex-Replace
- `text-claimondo-navy` → `text-[var(--brand-primary)]` (oder lass die Tailwind-Util durchgreifen, dann reicht Phase 1)
- Inline-Hex `#0D1B3E` → `var(--brand-primary)`
- `colors.navy` aus `@/lib/design-tokens` → `var(--brand-primary)` für Branding-relevante Stellen, **bleibt** für semantische Defaults (Status-Farben, statische Marketing)

**Kunde-Portal:** `FallDetailSections.tsx` zuerst (40 Treffer, höchster Impact) — `ROLLE_COLOR`-Map auf Brand-Status-Vars (`--brand-danger/warning/success`) umstellen.

**Strategie:** Pro Datei explizit prüfen — Marken-Farbe vs. semantische Farbe. Status-Grün muss grün bleiben (außer Aaron will gebrandete Status-Farben — die werden bereits in `theme.ts:generateStatus()` harmonisiert, also OK).

**Quick-Win-Reihenfolge:**
1. SV: `abrechnung`, `profil`, `willkommen`, `fall/[id]/_components`, `gebiet`
2. Kunde: `FallDetailSections`, `chat`, `einstellungen`, `faelle/page`
3. Shared: `CookieBanner`, `GutachterShell` (3 Zeilen)

### Phase 4 — Cleanup & Dokumentation (1 h)

- `isBrandingV2Enabled()` entfernen oder echtes Flag draus machen (Default an)
- `KundenLightBrandingProvider` entfernen falls nicht mehr referenziert
- `AGENTS.md` ergänzen: "Neue Komponenten nutzen `var(--brand-*)` statt hardcoded `claimondo-*`. Tailwind-Klassen `bg-claimondo-*` greifen automatisch auf Brand."

### Phase 5 — Email-Branding (3-4 h)

**Ziel:** Kunden-gerichtete Emails sehen aus wie vom verifizierten branded SV — Header-Farbe, Button-Farbe, Logo + Firmenname statt Claimondo-Wortmarke. SV-gerichtete + interne Mails (Admin/Kanzlei/SV-eigene Abrechnung) bleiben Claimondo.

**Architektur:** `src/lib/email/google/templates/layout.tsx` (`EmailLayout` + `Heading` + `Button`) ist der zentrale Hebel — bekommt einen optionalen `brand?: { primary: string; secondary: string; logoUrl: string | null; firmenname: string | null }`-Prop:
- `brand` gesetzt → Header-`backgroundColor` = `brand.primary`, `Button`-`backgroundColor` = `brand.secondary`, `Heading`-Farbe = `brand.primary`; im Header `<Img src={brand.logoUrl}>` (Fallback: `brand.firmenname` als Text, Fallback: "Claimondo")
- Footer behält **immer** eine dezente Zeile "Powered by Claimondo · Impressum · Datenschutz" — Brand-Trust für Claimondo (Stripe-Pattern), auch im gebrandeten Fall
- `brand` nicht gesetzt → unverändert Claimondo (alle SV-/Admin-/Kanzlei-Mails)

**Resolver:** ein `resolveEmailBranding(opts: { fallId?: string; leadId?: string; svId?: string }): Promise<EmailBrand | null>` in `src/lib/branding/` — nutzt die gleiche Gate-Logik wie `resolveKundenTheme` (`verifiziert && use_custom_branding && (brand_primary || brand_theme)`), liefert `null` wenn kein Brand greift. Kein neuer DB-Touch (Spalten existieren).

**Customer-facing Flows in `src/lib/email/google/flows.ts` (+ deren Templates), die `brand` durchreichen:**
- `sendKundeWelcome` — Empfänger = Kunde, SV aus dem Fall
- `sendSvTerminBestaetigung` — die Kunden-Variante (an den Kunden, nicht den SV-Internal-Teil)
- `sendKundeTerminGegenvorschlag` / `KundeTerminGegenvorschlag.tsx`
- `sendDokumenteAnfrage` / `DokumenteAnfrage.tsx` — SV aus dem `dokument_upload_anfragen`→Lead→Fall
- `sendFlowLinkVersand` / `FlowLinkVersand.tsx` — SV aus dem Flow-Link-Fall
- Lead-Reminder 1/2/3 (`LeadReminder1/2/3.tsx`) — SV aus dem Lead, falls schon zugewiesen
- (`TwoFactorCode.tsx` bleibt Claimondo — Auth-Mail, kein Fall-Kontext)

**Smoke nach Phase 5:**
1. Knallrot-Test-SV (`#E11D48`, verifiziert, `use_custom_branding`) → Kunde-Welcome-Mail rendern (Dev-Preview oder echter Send an Test-Adresse): Header rot, Logo/Firmenname statt Claimondo, "Powered by Claimondo" im Footer
2. Termin-Bestätigung an Kunde dieses SVs → gebrandet
3. SV-eigene Abrechnungs-Mail (`sendSvAbrechnung`) → unverändert Claimondo
4. Admin-Backup-Fehler-Mail → unverändert Claimondo

**Risiko:** Niedrig-mittel. Email-Clients (Outlook!) sind zickig bei `<Img>` + dynamischen Farben — Inline-Styles, keine externen CSS, Logo mit fixer `width`/`height` + `alt`. `react-email`-Components rendern bereits Outlook-safe. Bei Regression: `brand`-Prop weglassen = sofort wieder Claimondo.

---

## Risiken & offene Fragen

### Brand-Trust für Claimondo
Bei voll-gebrandetem Kunden-Portal sieht der Kunde Claimondo nirgendwo mehr. Vorschlag:
- "Powered by Claimondo"-Footer (klein, unauffällig) auf jeder Kunden-Page
- Ggf. Claimondo-Logo neben SV-Logo im Header (analog Stripe-Branding-Pattern)
- → **Aaron-Entscheidung**

### Performance / SSR
Theme wird in `kunde/layout.tsx` (Server-Component) async geladen. Style-Object ist statisch im SSR-Markup → kein Hydration-Risk. Render-Cost vernachlässigbar (eine Supabase-Query pro Request).

### Color-Contrast
`generateTheme()` macht WCAG-Cascade nur für die Primary, nicht für andere Token-Paarungen. Bei extremen Brand-Farben (Neon-Pink, Sehr-Hell-Gelb) kann der Sidebar-Text auf Sidebar-BG schlecht lesbar werden. `ensureContrastSafe()` validiert das, aber blockiert nicht. **Vorschlag:** UI-Warnung im BrandingEditor wenn `contrastSafe=false`, ohne hard-block.

### Semantic vs. Brand
Status-Grün/Warning-Gelb/Danger-Rot werden in `generateStatus()` an die Brand-Saturation harmonisiert. Das ist der gewollte Look. Falls Aaron irgendwo "echtes" Material-Grün will (z.B. Trust-Marker, Verifizierungs-Badge), bleibt das mit hardcoded `text-emerald-600` etc.

---

## Empfohlene Reihenfolge

1. ✅ **Erledigt:** Phase 1 (Tailwind-Tokens umbiegen), Phase 2-Basis (Kunde-Layout-Wrapper, `/upload/dokumente/[token]`-Magic-Link, `firmenname`-Select, `isBrandingV2Enabled`-Cleanup)
2. **Diese Iteration:** Phase 2-Rest (`/upload/zb1/[token]` + `/flow/[token]` branden, `KundenLightBrandingProvider` → `full`), Phase 4 (`CookieBanner` → Brand-Vars, `AGENTS.md`-Notiz), **Phase 5 (Email-Branding)**
3. **Danach:** Phase 3 (Hardcoded-Sweep — größtenteils obsolet durch Phase 1, Rest = Inline-Hex in SV-Hotspots) + Lücke 6 (Logo-Display-Coverage pro Layout verifizieren)

**Geschätzter Aufwand total:** 1-2 Tage konzentriert, oder 3-4 Tage mit Reviews & Smoke pro Phase.

---

## Nicht in diesem Spec

- **Native-App** (`*.native.tsx`-Components in `src/components/primitives/`) — eigener Migrationspfad nötig, da kein Tailwind, sondern `StyleSheet.create()`
- **PDF-Generation** (`src/lib/abrechnung/kanzlei/generate-pdf.tsx`) — separater Theme-Pfad, eventuell direkt aus DB-Theme rendern
- **Marketing-Pages** (`/`, `/faq`, `/gutachter-finden`) — bleiben bewusst Claimondo (kein User-Context = kein Brand-Resolver)
- **Admin-/Dispatch-/Kanzlei-Portale** — Branding ist nur für SV+Kunde gedacht. Admin/Dispatch/Kanzlei sehen immer Claimondo (interne Tools). Falls Aaron das ändern will: separater Spec.
- **Mobile-Native** + **PDF-Branding** — siehe oben, eigene Tickets nach Web-Rollout
- ~~Email-Templates~~ → **jetzt im Scope (Phase 5)**, siehe oben

---

## Anhang: Audit-Quellen

Dieser Spec basiert auf 3 parallelen Subagent-Audits vom 2026-05-12:
- SV-Portal Branding-Coverage-Audit (80+ Files mit hardcoded Patterns identifiziert)
- Kunde-Portal Branding-Coverage-Audit (630 hardcoded-Treffer in `kunde/**` + `faelle/**`)
- Branding End-to-End Smoke-Test (Provider-Chain, API-Endpoints, DB-Schema verifiziert)

Plus Read-Through der Kern-Files: `src/lib/branding/{theme,extract-colors,resolve-theme,kunden-theme,css-vars}.ts`, `src/components/branding/KundenLightBrandingProvider.tsx`, `src/app/gutachter/profil/branding/page.tsx`, `src/app/globals.css:1-120`.
