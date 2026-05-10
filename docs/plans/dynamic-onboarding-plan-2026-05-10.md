# Plan: Dynamisches DB-getriebenes Onboarding

**Stand:** 2026-05-10
**Trigger:** Aaron-Briefing — Terminierung-Strecke `/gutachter-finden` sauber DB-driven bauen, dynamisch wiederverwendbar für alle Onboarding-Flows.
**Mockup:** `docs/Pages/terminierung-flow.html` (iOS-Design, 5 Phasen)
**Audit:** `docs/audits/gutachter-finden-audit-2026-05-10.md`

---

## Zielbild

Ein **einziger generischer Wizard** (`<DynamicWizard flow="..." />`) der alle Onboarding-Strecken bedient:
- `/gutachter-finden` Terminierung (5 Phasen + 2 Conditional-Branches)
- SV-Onboarding (heute hardcoded in `/admin/sachverstaendige/anlegen`)
- Mandantenfragebogen (heute split auf `leads` + `faelle`)
- Kunde-Onboarding nach Magic-Link
- Künftige Flows ohne neue React-Komponenten

Phasen + Felder kommen aus zwei Konfig-Tabellen, der Wizard rendert nach `typ` und schreibt direkt in die `db_target`-Spalten via einer einzigen Server-Action.

---

## PR-Sequenz (4 PRs nach diesem PR 1)

### PR 1 — Audit + Plan _(dieser PR)_
- `docs/audits/gutachter-finden-audit-2026-05-10.md`
- `docs/plans/dynamic-onboarding-plan-2026-05-10.md`
- Keine Code-Änderungen.

### PR 2 — Foundation (Schema + ENUMs)
**Migration `onboarding_phasen`:**
```sql
CREATE TABLE onboarding_phasen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key text NOT NULL,                -- 'gutachter-finden', 'sv-onboarding', etc.
  reihenfolge int NOT NULL,
  phase_key text NOT NULL,               -- 'schaden', 'fahrzeug', 'termin', ...
  titel text NOT NULL,
  eyebrow text,
  beschreibung text,
  conditional_on jsonb,                  -- {feld: 'service_typ', equals: 'komplett'}
  erstellt_am timestamptz DEFAULT now(),
  UNIQUE (flow_key, reihenfolge),
  UNIQUE (flow_key, phase_key)
);
```

**Migration `onboarding_felder`:**
```sql
CREATE TABLE onboarding_felder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES onboarding_phasen(id) ON DELETE CASCADE,
  reihenfolge int NOT NULL,
  feld_key text NOT NULL,
  typ text NOT NULL CHECK (typ IN ('text','email','tel','number','textarea','segmented','toggle-cards','select','slot','signature','file')),
  label text NOT NULL,
  hint text,
  placeholder text,
  pflicht boolean DEFAULT false,
  optionen jsonb,                        -- für segmented/toggle-cards/select: [{value, label, icon}]
  validation jsonb,                      -- {pattern, min, max, minLength}
  db_target jsonb NOT NULL,              -- {tabelle: 'gutachter_finder_anfragen', spalte: 'schuldfrage'}
  conditional_on jsonb,
  UNIQUE (phase_id, feld_key)
);
```

**Schema-Cleanup `gutachter_finder_anfragen` (~7 neue Spalten):**
- `schuldfrage TEXT CHECK (schuldfrage IN ('gegner','unklar','teilschuld'))`
- `fahrzeug_fahrbereit BOOLEAN`
- `schadens_kurzbeschreibung TEXT`
- `fahrzeug_baujahr INT`, `fahrzeug_hersteller TEXT`, `fahrzeug_modell TEXT`
- `fahrzeugtyp TEXT CHECK (fahrzeugtyp IN ('pkw','motorrad','transporter','lkw','wohnmobil'))`
- `wunschtermin_wann TEXT CHECK (wunschtermin_wann IN ('sofort','heute','tage'))`
- `bevorzugter_kanal TEXT CHECK (bevorzugter_kanal IN ('whatsapp','email','anruf'))`
- `dsgvo_zustimmung_am TIMESTAMPTZ`

**RLS:** `onboarding_phasen` + `onboarding_felder` public-read (das ist Konfig, nicht User-Daten); writes nur für Admin-Service-Role.

### PR 3 — DynamicWizard React-Komponente

**Komponenten:**
- `src/components/onboarding/DynamicWizard.tsx` — Server-Component, lädt Phasen+Felder via `flow_key`, wrappt Client-Wizard
- `src/components/onboarding/WizardClient.tsx` — Client-Component, rendert Phase-Card + Step-Rail
- `src/components/onboarding/fields/*.tsx` — Pro `typ` eine Renderer-Komponente (TextField, SegmentedField, ToggleCardsField, SlotField, etc.)
- `src/components/onboarding/saveStep.ts` — Server-Action `saveOnboardingStep(anfrageId, phaseKey, values)` schreibt direkt in `db_target.tabelle/spalte`

**iOS-Tokens als Tailwind-Extension** in `tailwind.config.ts`:
- Radii: `r-xs/sm/md/lg/xl/2xl` mit 10/14/18/22/28/36 px
- Shadows: `shadow-1..4` als Multi-Layer-Stacks
- Easing-Tokens
- Surface-Farben mit rgba-Tints

**Skill-Konformität (frontend-design):** Montserrat, navy/ondo, Sheet-Animation, Activity-Ring-Steps, Translucent-NavBar.

### PR 4 — Slot-Engine (Echte Verfügbarkeit)

**Server-Action:** `ladeFreieSlots(svId, datumVon, datumBis)` in `src/lib/onboarding/slots.ts`
- Liest `gutachter_termine` (gebuchte Slots) + Arbeitszeit-Konfig pro SV (`sachverstaendige.arbeitszeiten` jsonb wenn vorhanden, sonst Default 08-18 Uhr Mo-Fr)
- Filtert Konflikte heraus
- Gibt 7-Tage-Strip zurück: `[{datum, frei: true|false, anzahl_slots, slots: [{uhrzeit, dauer}]}]`

**Slot-Reservierung-Lock:**
- Spalte `gutachter_finder_anfragen.reservierter_slot_von` + `_bis` (timestamptz, je 1)
- EXCLUSION CONSTRAINT analog zu AAR-865 verhindert Doppel-Reservierung
- TTL via Cron: nach 30 Min Slots ohne Submit-Abschluss freigeben

**Was NICHT in PR 4:** echte CalDAV-Sync (Aufwand zu hoch, kommt separat).

### PR 5 — Migration GutachterFinderClient → DynamicWizard

**Vorgehen:**
1. Phasen-Konfig in Migration seeden (`flow_key='gutachter-finden'`)
2. Map-Step (Mapbox) bleibt als eigene Komponente (kein generischer Wizard-Typ)
3. Wizard-Steps: `schaden → fahrzeug → termin → kontakt → bestaetigung`
4. Conditional-Branches als `conditional_on`:
   - Vor-Ort-Routing als alternativer Pfad ab Phase 0 (`am_unfallort_flag` = true zeigt vor_ort_fotos statt schaden)
   - Z35-Anspruchswahl als Phase nach Termin-Wahl
5. Alte `GutachterFinderClient.tsx` 1964 → ~200 Zeilen (nur Map-Logik)

**Smoke-Test:** Vor Merge — kompletter Flow von PLZ-Eingabe bis Termin-Bestätigung lokal durchspielen + DB-Inserts prüfen.

---

## Wiederverwendung — folgende PRs nach dem Sprint

- **SV-Onboarding** auf `flow_key='sv-onboarding'` umstellen (`/admin/sachverstaendige/anlegen`)
- **Mandantenfragebogen** auf `flow_key='mandantenfragebogen'` (heute hardcoded in `_phases/Phase1Mandantenfragebogen.tsx`)
- **Kunde-Onboarding** nach Magic-Link auf gleichem Pattern

Pro neuem Flow: nur Konfig in `onboarding_phasen` + `onboarding_felder` einfügen, keine neue React-Komponente.

---

## Risiken

1. **Slot-Engine PR 4 ist wirklich ein eigener Sprint** — Arbeitszeit-Konfig pro SV existiert heute nicht systematisch, müssen wir vor PR 5 lösen
2. **Resume-Pattern muss Edge-Cases abfangen** — wenn der User Browser schließt, muss Anfrage-ID in Cookie/LocalStorage damit der Resume klappt
3. **DSGVO-Phase muss vor erster DB-Write stehen** — PR 2 Schema bereits vorgesehen mit `dsgvo_zustimmung_am`, im Wizard muss die Logik vor `saveOnboardingStep` sitzen
