# E-Mail Bild:Text-Ratio-Audit (P4 · Deliverability)

**Datum:** 2026-05-30 · **Branch:** `kitta/email-p4-bild-text-ratio` · **Scope:** alle ~41 Templates unter `src/lib/email/google/templates/` + Primitive-Set

## Verdikt

**Gesund — kein Code-Fix nötig.** Die Mails sind durchgehend text-dominant; es gibt kein
image-only- oder bildlastiges Template. Spam-Filter (Gmail/Outlook/SpamAssassin) strafen
bildlastige Mails (grobe Faustregel: nicht >~40 % Bildfläche, keine reinen Bild-Mails) —
dieses Risiko besteht hier nicht. Alle Content-Bilder haben `alt`. Dieser Audit dokumentiert
den Stand + die zwei Watch-Items; es werden **keine** Änderungen am Code vorgenommen.

## Methode

`grep` über alle `<Img>`/`<img>`-Vorkommen + `background-image`-Wiring im Email-Lib, je Quelle
geprüft: ist es ein blockierbares Content-`<img>` oder ein CSS-`background-image`? `alt`
vorhanden? Dimensionen? Bedingt gerendert (gated)? Wo genutzt?

## Bild-Inventur

| Quelle | Typ | Gerendert? | `alt` | Dim. | Bemerkung |
|---|---|---|---|---|---|
| **Hero (gebackenes Hero-Bild)** | CSS `background-image` (EmailShell `backgroundUrl`) | Tier-1, sobald imagin live | n/a | cover | **Kein `<img>`** → zählt nicht in die Bild-Ratio, kein Broken-Image-Placeholder bei Bild-Blockade. Text liegt darüber. |
| **MailHeader-Logo** | `<Img>` | nur wenn SV `logoUrl` liefert | ✓ | `height=22`, width:auto | **Text-Wortmarke „Claimondo" als Fallback**, wenn kein Logo → meist gar kein Bild. |
| **Hero-Logo-Chip** | `<Img>` | nur wenn `logoUrl` | ✓ | `height=20`, width:auto | dito Text-Fallback. |
| **BeraterCard-Avatar** | `<Img>` | nur wenn `photoUrl` | ✓ | `width=52 height=52` | kleines 52px-Rundbild, optional. |
| **VehicleCard (Fahrzeug-Render)** | `<Img>` | nur KundeWelcome **und** `fahrzeugBildUrl≠null` (= imagin/baked) | ✓ (`value`) | `width=100%`, height:auto | **Aktuell nicht gerendert** (imagin gated → null). Einziges echtes Content-Bild im Kundenkontext. |
| `layout.tsx` (Legacy `EmailLayout`) `<Img>` | `<Img>` | **NIE** — `<EmailLayout>` wird nirgends mehr gerendert (nur `APP_URL`/`EmailBrand` werden importiert) | (✓) | — | Toter Render-Pfad → shippt nicht. Cleanup = separater Handoff-Punkt, nicht dieser Audit. |

Keine rohen `<img>`-Tags, keine inline-base64-Bilder, keine weiteren CSS-`background-image`
außer dem Hero.

## Warum die Ratio sicher ist

1. **Signatur-Hero ist CSS-`background-image`, kein `<img>`** — der größte „Bild"-Anteil zählt
   weder in die Bild:Text-Heuristik noch erzeugt er einen Platzhalter bei Bild-Blockade.
2. **Text-Fallbacks** — Logos sind optional; ohne `logoUrl` rendert eine Text-Wortmarke. Der
   Default (Claimondo, ohne SV-Branding) hat damit **0 Content-Bilder** im Header.
3. **Templates sind aus Text-Primitives gebaut** — Heading/Paragraph/InfoRow/Tabellen/Buttons.
   Die text-leichtesten (TwoFactorCode, LeadReminder1-3) haben **0** Content-Bilder; die
   bild-reichste (KundeWelcome) hat max. 1 Fahrzeugbild + optional Avatar/Logo, eingebettet in
   Hero-Text + Card-Text + StatGrid + BeraterCard-Text + Button → klar text-dominant.
4. **Alle Content-`<Img>` haben `alt`** → Accessibility + sinnvoller Fallback bei Bild-Blockade.

## Watch-Items (kein Handlungsbedarf jetzt)

- **imagin-Freischaltung**: Sobald `NEXT_PUBLIC_IMAGIN_CUSTOMER` live ist, gewinnt KundeWelcome
  EIN Fahrzeugbild (VehicleCard). Mail bleibt text-dominant → unkritisch. Nach Freischaltung
  einmal real gegenchecken (Render-Smoke).
- **Logo-/Fahrzeug-Dimensionen** sind bewusst `width:auto` bzw. `width:100%` (aspect-erhaltend
  für variable SV-Logos / responsives Fahrzeugbild). Outlook bevorzugt feste Pixel-Maße, aber
  feste Breiten würden variable SV-Logos verzerren → **bewusst nicht** geändert. `height`/`width`
  als HTML-Attribut ist gesetzt, wo eine Dimension fix sein kann.

## Ergebnis

Bild:Text-Ratio ist über alle Templates gesund. Keine Änderung am Code. P4-Punkt
„Bild:Text-Ratio" damit abgeschlossen (Audit-only).
