# Onboarding — Bestehender Code-Inventur (AAR-923)

**Datum:** 2026-05-15
**Scope:** Vor-Implementation-Audit für `docs/12.05.2026/DAT-SELF-ONBOARDING-KONZEPT.md`. Inventur aller bestehenden Onboarding-Pfade + Mapping zu den 11 Screens aus dem Konzept + Konflikt-Analyse + Paket-Rename-Plan.

---

## TL;DR

**Fundamentale Architektur-Klärung nötig vor Build-Start:**

Das DAT-Self-Onboarding-Konzept beschreibt einen **Self-Service-Onboarding-Flow**. Aber genau das wurde mit **ARCH-1 Phase 1 (2026-04-09) abgeschaltet** — `/gutachter/onboarding/page.tsx` ist seit dem nur noch ein Redirect zu `/gutachter/willkommen`, der eigentliche Onboarding-Flow läuft mit Admin-vorangelegten SVs.

**Drei Wege vorwärts:**
1. **Parallel-Pfad für DAT-Quelle** (empfohlen): Konzept-Self-Onboarding lebt nur unter neuer Route `/onboarding/dat/*`, der bestehende `/gutachter/willkommen`-Flow bleibt unverändert für admin-angelegte SVs. Routing-Weiche per `sv_leads.quelle = 'dat_expert'` + `claim_activations`-Token.
2. **Ersatz** des `/gutachter/willkommen`-Flows durch Konzept-Flow für ALLE neuen SVs. **Sehr invasiv**, viel Regression-Risiko (Büro-Inhaber + Sub-Mitarbeiter + Akademie + Community + Solo werden alle gerade dort behandelt).
3. **Erweiterung** des bestehenden `/gutachter/willkommen` um die neuen Konzept-Screens (Profil-Quali, Fahrzeuge, Schaden, Radius, Tier-Auswahl). DAT-Pfad nutzt extended-`willkommen`, Admin-angelegte SVs überspringen.

Empfehlung: **Option 1**. Reduziert Blast-Radius, lässt sich ohne Regression ausrollen, DAT-Funnel hat eigene saubere Code-Base.

---

## 1. Ist-Zustand — bestehende Onboarding-Pfade

### 1.1 `/gutachter/onboarding/page.tsx` — DEPRECATED Redirect
Status: **Redirect-Logic seit ARCH-1 Phase 1 (2026-04-09)**. Keine echte Logik, leitet nur weiter:
- Kein SV-Eintrag → `/login` mit Fehler
- vom Admin angelegt + kein Vertrag → `/gutachter/willkommen`
- Vertrag unterzeichnet, nicht bezahlt → `/gutachter/willkommen?step=stripe`
- Bezahlt + freigeschaltet → `/gutachter` (Dashboard)

→ Empfehlung: **bleibt als Redirect**, Bookmarks/alte Links funktionieren weiter. Konzept-Routes kommen unter neuem Pfad.

### 1.2 `/gutachter/onboarding/buero/` — DEPRECATED Wizard-Reste
Files: `page.tsx`, `BueroOnboardingClient.tsx`, `actions.ts`, `constants.ts`.
Vermutlich Alt-Code aus pre-ARCH-1-Zeit. Müsste man auf Live-Verwendung prüfen — wenn ungenutzt, löschen. Wenn Aaron's `WillkommenClient` Subroutes davon nutzt: lassen.

### 1.3 `/gutachter/onboarding/_akademie/actions.ts`
Unterstrich-Prefix = nicht-routbar (Next-Konvention). Vermutlich nur Server-Actions für Akademie-Sub-Onboarding. Bleibt, wird nicht angefasst.

### 1.4 `/gutachter/willkommen/` — Aktueller Hauptflow (ARCH-1 Phase 1+)
Files: `page.tsx`, `WillkommenClient.tsx`, `WillkommenWaiting.tsx`, `actions.ts`, `LeadPreisOverlay.tsx`, `OrderSummaryCard.tsx`.
Behandelt 5 Rollen:
- `solo` — 3-Step (Konditionen, Vertrag+Signatur, Stripe)
- `buero_inhaber` — 3-Step mit Sub-Tabelle + Sammel-Anzahlung
- `akademie_verwalter` — Akademie-spezifisch
- `sub_mitarbeiter` — 2-Step Light-Flow
- `community_member` — Solo-Flow mit Community-Banner

→ Empfehlung: **unverändert lassen**. Konzept-DAT-Flow lebt separat.

### 1.5 Andere SV-Onboarding-Routes (KEIN Onboarding-Wizard, eher post-Onboarding)
- `/gutachter/vertrag/page.tsx` — Vertrag-Detail/Re-Signatur
- `/gutachter/gebiet/page.tsx` — Einsatzgebiet-Edit (Post-Setup)
- `/gutachter/team/page.tsx` — Team-Verwaltung (Büro-Inhaber)
- `/gutachter/verifizierung/`, `/gutachter/profil/`, etc.

Diese sind alle Post-Onboarding-Verwaltung — bleiben unverändert.

### 1.6 Komponenten — `/src/components/onboarding/`
Files: `DynamicWizard.tsx`, `WizardClient.tsx`, `KartenWizardToggle.tsx`, `saveStep.ts`, `finalizeAnfrage.ts`, `types.ts`, plus 9 Field-Components (`TextField`, `SelectField`, `CheckboxField`, `SegmentedField`, `SignatureField`, `SlotField`, `FileField`, `TextareaField`, `ToggleCardsField`, `Zb1UploadField`).

→ Das ist der **Kunden-Onboarding-Wizard** (Schadenmeldungs-Flow für Endkunden), NICHT der SV-Onboarding. Naming-Verwechslung im Codebase! Trotzdem: Field-Components sind universell wiederverwendbar — neue DAT-Screens können `DynamicWizard` + Fields nutzen, das spart >50% Build-Aufwand.

### 1.7 Admin-SV-Anlage
- `/admin/sachverstaendige/anlegen/SoloAnlegenWizard.tsx`
- `/admin/sachverstaendige/anlegen/BueroAnlegenWizard.tsx`
- `/admin/sachverstaendige/anlegen/AkademieAnlegenWizard.tsx`
- `/admin/sachverstaendige/anlegen/actions.ts` + `constants.ts`

Das ist das Admin-Tool um SVs manuell anzulegen. Wird NICHT von DAT-Flow berührt — bleibt.

### 1.8 Lib-Code
- `src/lib/onboarding/findSvsForLocation.ts` — Geocoding-Helper für SV-Matching
- `src/lib/actions/sv-onboarding-actions.ts` — Server-Actions für Onboarding (legacy)
- `src/lib/pakete.ts` — **Zentrale Paket-Definition** (siehe Abschnitt 3)
- `src/lib/stripe/{sv,buero,akademie}-checkout.ts` — Stripe-Pfade

---

## 2. Mapping Konzept-Screens → Bestehender Code

| Konzept-Screen | Aktueller Pfad | Action |
|---|---|---|
| Screen 1 Welcome | `/gutachter/willkommen/WillkommenClient.tsx` (3-Mehrwert-Karten gibt's so nicht) | **NEU bauen** als `/onboarding/dat/willkommen` |
| Screen 2a Qualifikationen | nicht vorhanden | **NEU** — kann `ToggleCardsField` + `TextField` aus `/components/onboarding/fields` recyceln |
| Screen 2b Fahrzeugtypen | nicht vorhanden (Profil hat `spezifikationen[]`-Spalte) | **NEU** — `ToggleCardsField` |
| Screen 2c Schadenarten | nicht vorhanden | **NEU** — `ToggleCardsField` |
| Screen 2d Einsatzradius | bestehend in `WillkommenClient` als Step-1-Auswahl | Konzept-Variante: Radio-Pills statt Karten — minor variant |
| Screen 3 Reward (Map mit Pin) | nicht vorhanden | **NEU** — Mapbox-Komponente teilbar mit Claim-Map (AAR-922) |
| Screen 4 Tier-Auswahl | `OrderSummaryCard.tsx` + `LeadPreisOverlay.tsx` (anderes UX) | **NEU bauen**, alte Komponenten bleiben für admin-angelegte SVs |
| Screen 5 Kalender | Google-OAuth-Flow existiert (`gcal_connected`-Spalte) | **Wiederverwenden** der OAuth-Logik aus Profil-Settings |
| Screen 6 Verfügbarkeit | `arbeitszeiten` / `blockierte_wochentage` / `kapazitaeten_jsonb` existieren | **NEU** UI auf bestehende Spalten |
| Screen 7 Google Business | nicht vorhanden (`standort_place_id`-Spalte existiert) | **NEU** — Places-Autocomplete-Komponente |
| Screen 8 Abschluss | `WillkommenClient` finalisiert anders | **NEU** für DAT-Flow |
| Aktivierungs-Mail + `/aktivieren` | nicht vorhanden | **NEU** — Magic-Link-Landing + Resend-Flow |

---

## 3. Paket-Rename-Plan

### 3.1 Realität in `src/lib/pakete.ts`
```ts
export const PAKETE = {
  standard: { radius_km: 15, faelle: 10, preis: 1500, anzahlung: 750 },
  pro:      { radius_km: 40, faelle: 25, preis: 3750, anzahlung: 1875 },
  premium:  { radius_km: 70, faelle: 50, preis: 7500, anzahlung: 3750 },
}
```
Drei Pakete existieren — `standard` / `pro` / `premium`. Aktuell sind das **Kontingent-Pakete** mit Fallzahl-Limit, Anzahlung in Euro.

### 3.2 Konzept-Realität-Konflikt
Das DAT-Konzept will:
- `free` = Verzeichnis-Eintrag (0€)
- `basic` = Live-Termin-Vermittlung (24,90€/Monat, Gutschein DAT2026 = 0€)
- `premium` = Gebietsexklusivität (auf Anfrage)

**Naming-Kollision:**
- Konzept-`basic` ≠ Reality-`standard` — semantisch komplett anders (Monats-Abo vs. Kontingent-Vorauszahlung)
- Konzept-`premium` ≠ Reality-`premium` — Konzept = Gebietsexklusivität, Reality = großes Kontingent-Paket

→ **Konzept-Spec-Naming ändern** statt einfach Umbenennen der DB-Werte. Vorschlag:
- Konzept-`basic` → **`dat_basic`** oder **`vermittlung_monat`** (klar abgegrenzt)
- Konzept-`premium` → **`gebietsexklusiv`** oder **`enterprise`**
- Konzept-`free` → neuer Wert **`verzeichnis`**

Reality-`standard` / `pro` / `premium` bleiben unverändert — das sind separate, parallel laufende Onboarding-Pakete für admin-angelegte SVs.

**Migration:**
```sql
-- Vor Apply: alle Stellen mit 'standard'|'pro'|'premium' prüfen (26 Files laut grep)
-- KEINE Umbenennung der bestehenden Werte — nur Erweiterung um neue
ALTER TABLE sachverstaendige DROP CONSTRAINT IF EXISTS sachverstaendige_paket_check;
ALTER TABLE sachverstaendige ADD CONSTRAINT sachverstaendige_paket_check
  CHECK (paket IN ('standard', 'pro', 'premium', 'verzeichnis', 'dat_basic', 'gebietsexklusiv'));
```

→ Im Konzept-Doc explizit klarstellen: Die DAT-Pakete sind **eine separate Achse**, parallel zu den Kontingent-Paketen. Ein SV kann theoretisch beides haben (z.B. `paket='standard'` + `dat_basic_aktiv=true`).

### 3.3 26 Files mit `'standard'|'pro'` (grep-Befund)
- `src/lib/pakete.ts` — zentrale Definition (PFLICHT-Check)
- `src/scripts/seed-test-data.ts`, `src/app/api/seed-testdata/route.ts` — Test-Daten
- `src/app/admin/sachverstaendige/anlegen/{Solo,Buero,Akademie}AnlegenWizard.tsx` + `constants.ts`
- `src/app/admin/sachverstaendige/[id]/{SvDetailClient,actions}.ts`
- `src/app/gutachter/{vertrag,gebiet,team,willkommen,onboarding}/...`
- `src/lib/dispatch/{findBestSV,debugSvMatching}.ts`
- `src/lib/actions/sv-onboarding-actions.ts`
- `src/lib/email/google/templates/SvOnboardingRechnung.tsx`
- Plus `src/app/admin/communities/CommunityAnlegenWizard.tsx`, `src/lib/branding/claude-vision.ts`, `src/lib/actions/gutachter-finder-actions.ts`, `src/app/gutachter-finden/GutachterFinderMapClient.tsx`

→ Da `standard`/`pro`/`premium` **nicht** umbenannt werden (siehe oben), ist KEINE Migration dieser Files nötig. Nur neue DAT-Werte werden hinzugefügt.

---

## 4. `qualifikationen_neu[]` vs. `qualifikationen[]`

Konzept-Spec schlug eine neue Spalte `qualifikationen_neu[]` vor. **Live-Schema-Check nötig** (Memory ist 1-2 Tage stale, `feedback_information_schema_check.md`):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='sachverstaendige' AND column_name ILIKE '%qualifikat%';
```

Wenn `qualifikationen text[]` schon existiert: **NICHT** zweite parallele Spalte anlegen. Stattdessen:
- Bestehende `qualifikationen`-Spalte erweitern (Werte: `DAT`, `BVSK`, `ÖBuV`, `IHK`, plus berufliche Titel)
- Optional CHECK-Constraint via Whitelist
- DAT-spezifische Nummern (`dat_nummer`, `bvsk_mitgliedsnummer`, `oebuv_bestellungsnummer`, `ihk_zertifikat_nummer`) als separate `text`-Spalten — schema-cleaner als JSONB

Wenn `qualifikationen` noch nicht existiert: dann direkt richtig anlegen, kein `_neu`-Suffix.

---

## 5. `onboarding_step` mit CHECK-Constraint

Konzept-Spec sagt `onboarding_step text`. Aktuell: live-check ob Spalte existiert (20 Files referenzieren `onboarding_step|onboarding_status` per Grep). Stand: `onboarding_status text` ist bekannt (Werte z.B. `anzahlung_offen`, `bezahlt`).

Empfehlung:
```sql
ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS onboarding_step text
  CHECK (onboarding_step IS NULL OR onboarding_step IN (
    'welcome', 'profil_quali', 'profil_fahrzeuge', 'profil_schaden',
    'profil_radius', 'reward', 'tier', 'kalender', 'verfuegbarkeit',
    'bewertungen', 'fertig'
  ));
```

Damit fängt der CHECK Drift bei Typos sofort. Resume-Logik kann gegen die Whitelist matchen.

---

## 6. 2FA-Magic-Link-Kollision

Konzept Abschnitt 11 sagt: Magic-Link → Passwort setzen → Auto-Login → Redirect zu `/onboarding/willkommen`.

**Problem:** Production-Default ist 2FA-on (laut Memory `project_e2e_test_users.md` ist `twofa_aktiviert=false` Test-Setup). Bei Auto-Login nach Passwort-Setzen würde 2FA-Setup VOR Onboarding kommen → Onboarding-Flow bricht ab.

**Drei Lösungen:**
1. **2FA-Setup-Step 0.5** zwischen Passwort-Setzen und Welcome-Screen — 2FA wird im Onboarding gleich miterledigt
2. **2FA während Onboarding deaktiviert** — `twofa_aktiviert=false` als Default für DAT-Claim-Accounts, im Screen 8 (Abschluss) als optionale Aktion „Jetzt 2FA einrichten"
3. **2FA komplett überspringen** für DAT-Accounts — wird erst beim zweiten Login angeboten

Empfehlung: **Option 1** — 2FA gehört in den initialen Sicherheits-Setup. SV-Accounts sind sensibel (Schadenfälle, Geld), 2FA sollte direkt scharf sein. Konzept-Doc dann mit zusätzlichem Screen ergänzen.

---

## 7. Empfohlene Verzeichnis-Struktur für DAT-Flow

```
src/app/onboarding/dat/                  # NEU — DAT-Self-Onboarding-Pfad
├── willkommen/page.tsx                   # Screen 1
├── profil/
│   ├── qualifikationen/page.tsx          # Screen 2a
│   ├── fahrzeugtypen/page.tsx            # Screen 2b
│   ├── schadenarten/page.tsx             # Screen 2c
│   └── radius/page.tsx                   # Screen 2d
├── reward/page.tsx                       # Screen 3
├── tier/page.tsx                         # Screen 4
├── kalender/page.tsx                     # Screen 5
├── verfuegbarkeit/page.tsx               # Screen 6
├── bewertungen/page.tsx                  # Screen 7
└── fertig/page.tsx                       # Screen 8

src/app/aktivieren/page.tsx                # Magic-Link-Landing (separat von /onboarding/dat)

src/components/onboarding/dat/             # NEU — DAT-spezifische Components
src/lib/onboarding/dat/                    # NEU — Persistence, Resume-Logik
src/app/api/claim/send-activation-email/   # NEU — Edge-Function-Caller (siehe AAR-922 Spec)
```

`/gutachter/willkommen/*` bleibt unverändert — admin-angelegte SVs nutzen weiterhin diesen Pfad.

---

## 8. Verbleibende Klärungs-Fragen für Aaron

1. **Architektur-Wahl** Abschnitt TL;DR (Option 1 / 2 / 3)? Mein Vorschlag: 1.
2. **Paket-Naming**: `dat_basic` + `gebietsexklusiv` + `verzeichnis` OK? Oder Marketing-Namen anders?
3. **2FA-Flow**: Option 1 (Screen 0.5) OK?
4. **`/gutachter/onboarding/buero/`-Reste**: löschen oder behalten? (Bestätigung Live-Verwendung nötig)

---

## Akzeptanz aus AAR-923

- [x] Inventur des bestehenden Onboarding-Codes — Abschnitt 1
- [x] Mapping existierende Routes/Components → neue Screens 1-8 — Abschnitt 2
- [x] Paket-Rename-Plan — Abschnitt 3 (Empfehlung: NICHT umbenennen, sondern parallel)
- [x] `qualifikationen_neu[]` vs. `qualifikationen[]` geklärt — Abschnitt 4
- [x] `onboarding_step` mit CHECK-Constraint — Abschnitt 5
- [x] 2FA-Magic-Link-Kollision adressiert — Abschnitt 6

Nice-to-have (Konzept-Doc ergänzen wenn Aaron zustimmt):
- Google Places API Field-Mask
- Premium-Vormerkung-Tabelle separat
- Outlook-OAuth als „Coming Soon"
