# Kunde-Portal — Architektur-Walkthrough

End-User-App für Geschädigte. URL: `/kunde/**`. Test-Login: `test-kunde@claimondo.de` / `Test1234!`.

## Layout

`src/app/kunde/layout.tsx` → solid Sidebar links (Desktop) + Bottom-Nav + Header (Mobile).
Sidebar enthält Cards für KB / SV / EskalierterAdmin / LexDrive (QR).

Auth-Guards:
- Rolle muss `kunde` sein
- Onboarding-Status: bei `onboarding_complete=false` → redirect `/kunde/onboarding`
- `claimFaelleByEmail` läuft im Layout (auto-claim via Email-Match)

## Routen

| Route | Zweck | Komponenten |
|---|---|---|
| `/kunde` | Dashboard mit Fallliste oder Single-Fall-Redirect | `FallKarte`, `FallStatusCard` |
| `/kunde/faelle` | Fallliste (Multi-Fall-Kunden) | |
| `/kunde/faelle/[id]` | Fall-Detail mit Stepper + Sektionen | `ClaimStepper`, `FallDetailSections`, `KarteHubClient` |
| `/kunde/faelle/[id]/kalender` | Termin-Kalender für den Fall | |
| `/kunde/termine` | Termine-Listing über alle Fälle | `KundeTermineClient` |
| `/kunde/termine/[id]` | Einzeltermin-Detail (Anfahrt, Tracking) | `KundeTerminDetailClient` |
| `/kunde/nachbesichtigung` + `/[fall_id]` | Nachbesichtigungs-Buchung | |
| `/kunde/chat` | Multi-Channel-Chat über alle Fälle | `MultiChannelChat` |
| `/kunde/onboarding` | Pflicht-Onboarding-Wizard nach Magic-Link-Login | `OnboardingWizard` |
| `/kunde/profil` | Stammdaten + Avatar-Upload | |
| `/kunde/einstellungen` | Sprache, Notifications | |
| `/kunde/re-termin/[token]` | Re-Termin-Booking nach No-Show (CMM-40) | `ReTerminPickerClient` |
| `/kunde/termin/[token]` | Public Live-Tracking-Page (kein Login) | `KundeTrackingClient`, `KundeLiveMap` |

## Datenfluss-Highlights

### Sidebar-Cards (Layout)

Layout lädt parallel:
- **KB-Card** — neuster Fall mit `kundenbetreuer_id` (Sticky-KB)
- **SV-Card** — neuster Fall mit `sv_id` + Google-Bewertung aus Cache
- **Admin-Card** — wenn `eskaliert_an_admin_id` gesetzt
- **LexDrive-Card** — sobald ein Fall mit `vollmacht_signiert_am`

Jede Card öffnet ein Chat-Modal mit `KundeKbChat` (Direkt-Chat oder Gruppenchat). Unread-Badge per `useKundeUnreadByKanal` (CMM-Badge).

### Fall-Stepper (Subphase-Resolver)

`src/lib/fall/subphase-resolver.ts` → `resolveSubphase()` ist eine pure function die aus DB-State (`faelle`, `lead`, `gutachter_termine`, `webhook_events`) die aktuelle Subphase berechnet. Output wird im `ClaimStepper` gerendert.

Subphasen: `vorbereitung → termin_bestaetigt → sv_unterwegs → sv_vor_ort → begutachtung_abgeschlossen → gutachten_eingetroffen → qc_bestanden → kanzlei_uebergabe → vs_kontakt → regulierung_eingegangen → abgeschlossen` (etwa).

### Live-Tracking (`/kunde/termin/[token]`)

Public-Page mit Token-Auth (kein Supabase-Auth nötig). Zeigt Live-GPS-Position des SVs auf Mapbox-Karte. Realtime-Sub auf `gutachter_termine.live_position`.

### Re-Termin-Flow (CMM-39/40/41)

Wenn der SV einen No-Show meldet, wird ein `re_termin_token` auf `faelle` gesetzt + WhatsApp + Email mit `/kunde/re-termin/{token}` versendet. Kunde wählt Slot → `gutachter_termine`-Insert mit `status='reserviert'` + Token entwertet.

### Branding (AAR-536 K4)

Wenn der zugewiesene SV verifiziert ist + `use_custom_branding=true` + Theme vorhanden → `resolveKundenTheme()` lädt Brand-Tokens, Layout setzt `style={cssVars}`. Sidebar-Background, Accent, Logo werden überschrieben.

## Bekannte Stolperstellen

- **Multi-Fall vs. Single-Fall:** Bei `navFaelle.length === 1` wird `/kunde` → `/kunde/faelle/[id]` geredirected (CMM-28)
- **Pflichtdokumente-Banner:** lebt jetzt in der Detail-Page als Click-Tile (CMM-22/33), nicht mehr global
- **PDF-Vorschau:** auf Mobile in IFrame, auf Desktop nativ (Browser-Stack-Differenz)
- **Avatar-Upload (AAR-369):** geht durch `avatare`-Bucket, schreibt `profiles.avatar_url`
- **Onboarding-Wizard:** Auto-Save pro Step, kein Wiederbeginn — falls Step rendert sich aber Werte nicht: Profile-Insert hat racte mit Layout-Redirect
- **2FA:** für E2E-Test-Account muss `twofa_aktiviert=false`

## Komponenten-Hierarchie

```
KundeLayout
├── Sidebar (desktop)
│   ├── KundenbetreuerCard
│   ├── GutachterCard (mit GoogleBewertungBadge)
│   ├── EskalierterAdminCard
│   └── LexDriveCard
├── KundeMobileDrawer (mit gleichen Cards)
└── {children}
    └── (z.B. /kunde/faelle/[id])
        └── FallDetail
            ├── ClaimStepper
            ├── PflichtdokumenteSection (Banner-Variante)
            ├── KarteHubClient (Live-Map wenn Termin aktiv)
            ├── MultiChannelChat
            └── FallRealtimeRefresh
```

## Wo Du anpassen würdest, wenn …

| Anpassungs-Wunsch | Touchpoint |
|---|---|
| Stepper-Phasen | `lib/fall/subphase-resolver.ts` (pure function) + `ClaimStepper` |
| Sidebar-Card-Order | `kunde/layout.tsx` (sidebarCards-Fragment) |
| Chat-Bubble-Style | `KundeKbChat.tsx` |
| Theme-Branding | `lib/branding/kunden-theme.ts` |
| Notifications | `useKundeUnreadByKanal` Hook + Card-Badges |
