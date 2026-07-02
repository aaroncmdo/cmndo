# Makler-Selbst-Registrierung (Säule B) — Design-Spec

**Datum:** 2026-06-30 · **Autor:** Session 4e248a04 (Brainstorming mit Aaron) · **Status:** Design freigegeben (Aaron) — Bau in frischer Session
**Säule:** B des kanonischen Partner-Landeseiten-Systems. **Säule A** (Makler-Kunden-Landeseite `claimondo.de/m/[code]`) = Session fbca7869, baut parallel (`kitta/makler-landeseite-hub`, Spec `2026-06-29-makler-landeseite-hub-design.md`). Diese Spec **konsumiert** A's Daten-Contract, baut A NICHT.

## Ziel (ein Satz)
Ein **offener Self-Signup**, über den sich ein Makler ohne Admin selbst registriert → **sofort** aktiver Makler + Promo-Code → seine `claimondo.de/m/[code]`-Landeseite (Säule A) ist sofort live — und der die heutige `mailto:`-Sackgasse der Recruiting-LP `/makler/partner-werden` durch einen echten, messbaren Funnel ersetzt.

## Kontext & Problem (Audit-Befund)
- Recruiting-LP `claimondo-marketing/app/[locale]/makler/partner-werden/page.tsx`: alle Haupt-CTAs sind `mailto:`/`tel:` → **kein Lead, kein Tracking, keine Registrierung**. Makler-Akquise ist eine Sackgasse → 0 echte Makler (Prod: beide aktiven Makler = Test-Accounts).
- Makler entstehen heute NUR via Admin (`/admin/makler` → `createMakler`). Kein Self-Service-Funnel.
- **Vorbild existiert:** SV-Self-Registrierung `/sv/registrieren` (App) — Muster für Makler-Self-Signup.

## Entscheidungen (Aaron, 30.06., Brainstorming)
1. **Offener Self-Signup, sofort live** (KEIN Admin-Gate): Makler registriert → sofort Account + Promo-Code + Live-Landeseite. (Aaron wählte „Offener Self-Signup" über „Self-Signup + Admin-Freigabe".)
2. **Vorbild `/sv/registrieren`** (App-Self-Registrierung), nicht neu erfinden.
3. **Leitplanken statt Gate** (Marken-/Missbrauchsschutz ohne Funnel-Bremse): Basis-Validierung, Email-Verifizierung, Rate-Limit, Deaktivierbarkeit. Die Landeseite (Säule A) ist template-gebunden → kein Freitext/Spam-Injection.
4. **Branding** der erzeugten Seite = Säule A's Entscheidung (Claimondo-Look + „Empfohlen von [Firma]", kein Whitelabel).

## Architektur

### Flow
```
Recruiting-LP /makler/partner-werden  (Marketing — mailto-CTA ERSETZEN)
   └─ CTA „Jetzt Makler-Partner werden" → /makler/registrieren
        │
        ▼
/makler/registrieren  (App, Vorbild /sv/registrieren)
   Formular: Firma, Vorname, Nachname, Email, Telefon, PLZ/Ort, Passwort, Einwilligung
        │  submit → Server-Action registriereMaklerSelf(...)
        ▼
   1. Validierung (Email/Firma/Pflichtfelder) + Rate-Limit
   2. createMakler-Self (reuse der admin-anlage-Logik, self-service-Variante):
        - auth.admin.createUser(email, pw) + email-verify-Flow
        - profiles { rolle:'makler' }
        - makler { firma, ansprechpartner, adresse, telefon, status:'aktiv', quelle:'self-signup' }
        - getOrCreateMaklerPromoCode(admin, maklerId) → MK-XXXX (aktiv=true)
   3. redirect → Makler-Portal mit „Deine Seite ist live: claimondo.de/m/{code}"
        │
        ▼
   Säule A (fbca7869): claimondo.de/m/{code} resolved jetzt (makler.status='aktiv' + promo aktiv) → live.
```

### A-Contract (mit fbca7869 abgestimmt — VERBINDLICH)
Säule A's `resolveMaklerByPromoCode` erwartet: `promotion_codes` (code `MK-XXXX`, `aktiv=true`, `makler_id`) join `makler` mit `status='aktiv'`. → Säule B MUSS bei Registrierung erzeugen: `makler.status='aktiv'` + ein aktiver Promo-Code. Reuse `getOrCreateMaklerPromoCode` (`src/lib/makler/promo-code.ts`) — derselbe Code, den die Landeseite + das Portal-`/makler/promo` nutzen. Kein eigener Slug (A nutzt den Promo-Code als URL).

### Build-Lanes
- **Registrierungs-Flow** (`/makler/registrieren` + Server-Action) → **App** (`src/app`), wie `/sv/registrieren`.
- **Recruiting-LP-CTA-Fix** (`/makler/partner-werden` mailto → Link auf `app.claimondo.de/makler/registrieren`) → **Marketing-Lane** (`claimondo-marketing/`). ⚠ Cross-Lane-Link via `NEXT_PUBLIC_EMBED_ORIGIN`.

## Komponenten (File-Struktur)
### NEU (App)
- `src/app/makler/registrieren/page.tsx` — öffentliche Registrierungs-Seite (Vorbild `src/app/sv/registrieren/page.tsx` lesen + spiegeln). Claimondo-Look, Umlaute, Provision-Transparenz (UWG-geklärt — s. offene Punkte).
- `src/app/makler/registrieren/actions.ts` — `registriereMaklerSelf(formData)`: Validierung + Rate-Limit + Makler-Self-Anlage + Promo. Result-Object (`{ ok, error?, code? }`), kein throw.
- `src/lib/makler/registriere-self.ts` (optional, wenn Logik aus der Action extrahiert) — die Self-Anlage-Logik, baut auf der admin-`createMakler`-Logik auf (gemeinsame Kern-Funktion extrahieren statt duplizieren).

### MODIFY
- `claimondo-marketing/app/[locale]/makler/partner-werden/page.tsx` — Haupt-CTA `mailto:` → `${EMBED_ORIGIN}/makler/registrieren` („Jetzt Makler-Partner werden"). Optional: GA4 `generate_lead`-Tracking auf dem CTA. (Audit-Befunde mit-fixen: Provisionsmodell erwähnen, `serviceSchema`-Audience, Duplicate-File — siehe project-makler-landingpage-review-todo; mind. der CTA-Fix ist Kern.)
- `src/app/admin/makler/actions.ts` (`createMakler`) — falls Self-Variante die Kern-Logik teilt: gemeinsame Funktion extrahieren (Reuse, keine Duplikation; AAR-664 beachten — keine Konstanten/Types aus `'use server'` exportieren).

### REUSE (kein Eingriff)
- `src/app/sv/registrieren/*` (Muster), `getOrCreateMaklerPromoCode`, Auth/Email-Verify-Infra, Makler-Portal (Redirect-Ziel).

## Leitplanken (offener Signup)
- **Validierung:** Email-Format + Firma + Pflichtfelder; Duplikat-Check (Email bereits Makler?).
- **Email-Verifizierung:** Account erst nach Verify voll nutzbar (Standard-Auth-Flow). Entscheidung: Landeseite sofort live vs. erst nach Verify — **Aaron-Default „sofort live"**, daher Seite live ab Anlage; Email-Verify gatet nur den Portal-Login (Standard). (Im Plan verifizieren, wie `/sv/registrieren` es handhabt.)
- **Rate-Limit:** auf der Registrierungs-Action (z.B. pro IP/Email), gegen Massen-Anlage. Bestehende Rate-Limit-Utils prüfen (Session 6f9b2dea baute `auth-2fa-rate-limit` — ggf. wiederverwenden).
- **Deaktivierbarkeit:** `makler.status` (admin kann auf `gesperrt` setzen → Säule A's `resolveMaklerByPromoCode` liefert `aktiv:false` → Landeseite redirectet weg). Kein neuer Mechanismus nötig.
- **Template-gebunden:** die Landeseite (Säule A) zeigt nur Profilfelder, kein Freitext → kein Spam-Content möglich.

## Datenmodell
- **Voraussichtlich KEINE DDL** — `makler`, `promotion_codes`, Auth/Email-Verify existieren. Optional additiv: `makler.quelle` (text, z.B. 'self-signup'|'admin') für Attribution/Tracking — **nur wenn** das Tracking gebraucht wird; sonst weglassen (YAGNI). Falls DDL: via Supabase-Plugin (Regel 2), File==getrackte Version.
- Verifizieren (Plan): hat `makler` schon ein `status`-Feld mit 'aktiv'/'gesperrt' (Säule A nutzt `status='aktiv'`)? (Ja laut fbca7869-Spec.) Hat es Felder für firma/ansprechpartner/adresse/telefon (Formular-Mapping)?

## Error-Handling
- Server-Action `registriereMaklerSelf`: Result-Object `{ ok, error?, code? }`, kein throw. Auth-User-Anlage fehlschlägt → `{ ok:false, error }`, kein Teil-State (Transaktions-Reihenfolge: erst auth-user, dann profile/makler/promo; bei Fehler nachgelagert aufräumen oder idempotent).
- Promo-Anlage / Email-Send = non-critical try/catch (ein Send-Fail darf die Registrierung nicht brechen — Makler existiert, Promo via getOrCreate nachholbar).

## Testing
- **vitest:** Validierungs-/Mapping-Logik der Self-Anlage (Pflichtfelder, Email-Duplikat → Fehler; Erfolg → makler+promo-Payload korrekt). Rate-Limit-Logik.
- **E2E-Smoke (Bau-Session, gg. Prod mit Test-Daten + Cleanup):** Registrierung durchspielen → makler(status=aktiv)+promo entstehen → `claimondo.de/m/{code}` (Säule A) resolved + rendert → danach Test-Makler löschen (Regel 3). LP-CTA führt auf `/makler/registrieren` (kein mailto mehr).

## Koordination (VOR Bau prüfen)
- **fbca7869** (`kitta/makler-landeseite-hub`, Säule A) — Säule B's Output (makler+promo) ist A's Input. Vor Bau: ist A gemerged/in staging? Der `getOrCreateMaklerPromoCode` + `makler.status`-Contract muss identisch sein. **Diese Spec baut A NICHT.**
- **`/makler/partner-werden`** (Marketing) — ggf. andere Marketing-Sessions (89f501f6 war auf marketing-feed); `git log` vor Edit.
- **`src/app/admin/makler/actions.ts`** (`createMakler`) — geteilt; Self-Variante teilt die Kern-Logik (Reuse). Andere Makler-Sessions (fbca7869 makler-fall-consent) → additiv halten.
- **Rate-Limit-Utils** — Session 6f9b2dea (`auth-2fa-rate-limit`) ggf. wiederverwenden.

## OFFENE Punkte (Aaron / vor Bau klären)
1. **index vs noindex der Makler-Landeseite (Säule A):** Aaron sagte 4e248a04 „öffentliche SEO-Mikroseite" (→ index=true, auffindbar unterm Firmennamen), fbca7869s Säule-A-Spec setzt `robots: noindex`. **Widerspruch — Aaron muss entscheiden.** Empfehlung 4e248a04: index=true (sein erklärter „öffentlich/SEO"-Wille), mit Thin-Content-Vorsicht (echte Profildaten je Seite). Betrifft fbca7869s Spec (1-Zeilen-Änderung), nicht Säule B direkt — aber relevant fürs Gesamtbild.
2. **Provision-Transparenz auf der Recruiting-LP** (150€/80€ nennen?) — UWG mit Anwalt klären (Audit-Befund). Beeinflusst den LP-CTA-Text.
3. **Email-Verify-Gating:** Landeseite sofort live (Aaron) vs. erst nach Verify — wie handhabt `/sv/registrieren` das? Im Plan an der SV-Vorlage festmachen.

## Out of Scope
- Säule A (Makler-Kunden-Landeseite) = fbca7869.
- Säule C (per-Gutachter-Landeseiten) — Aaron hat sie für DIESES Projekt rausgenommen („NUR für Makler").
- Rich-Anspruch-Check (Fotos→Claude) = Session 3aba3976.
- Voll-Whitelabel der Makler-Seite (kein Logo-Feld; Säule A = Text-Personalisierung).

## Nächster Schritt (Bau-Session)
`superpowers:writing-plans` auf dieser Spec → Plan (TDD-Tasks) → `superpowers:subagent-driven-development`. Branch `kitta/makler-self-registrierung` (off staging, diese Spec committed). VOR Task 1: A-Contract + offene Punkte mit Aaron/fbca7869 final abgleichen.
