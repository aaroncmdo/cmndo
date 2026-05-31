# Gutachter-Finder-Wizard → Self-Service (Vereinheitlichung mit AAR-940)

**Status:** PLANNING / in Abstimmung mit Aaron (31.05.2026)
**Session:** 1601e3a6 · **Vorgänger:** AAR-940/941 Monika Self-Service (LIVE auf prod)
**Worktree/Branch:** `kitta/gutachter-finder-self-service` (anzulegen)

---

## 0. Ziel (in einem Satz)

Der native `/gutachter-finden`-Wizard soll auf dieselbe Self-Service-Logik laufen wie das frisch live gestellte AAR-940 (`/anfrage/[token]`): Kunde macht eine **Anfrage**, der Wizard **ködert mit dem Termin**, bei **Termin-Reservierung** kommt **Anfrage→Lead**, und der Rest läuft **self-service** — ohne Dispatcher, claim-nativ.

**Reframe (wichtig):** `/gutachter-finden` ist **heute schon** self-service (matcht SV, bucht Slot, sammelt SA, konvertiert zu Fall+Claim+Account). Es ist also **kein „Self-Service hinzufügen", sondern „die ältere native Strecke auf das neue Modul vereinheitlichen"** + zwei echte Bugs fixen, die AAR-940 schon gelöst hat.

---

## 1. Verifizierte Fakten (Ist-Zustand)

### 1.1 Wizard-Struktur (`flow_key='gutachter-finden'`, DB-getrieben)
DynamicWizard (`src/components/onboarding/DynamicWizard.tsx` → `WizardClient.tsx`), Phasen/Felder aus `onboarding_phasen`/`onboarding_felder`. **5 Phasen**, alle Felder → `gutachter_finder_anfragen` (GFA):

| # | phase_key | Felder (feld_key → GFA-Spalte) | Bemerkung |
|---|---|---|---|
| 1 | `standort` | `besichtigungsort` → `besichtigungsort_adresse` | Geo-Eingabe |
| 2 | `termin` | `wunschtermin_wann` (sofort/morgen/tage) + `wunschtermin` (**slot**) → `wunschtermin` | **Der Köder** — Slot wird hier gewählt + reserviert |
| 3 | `service` | `service_typ` (komplett/nur_gutachter) → `regulierungs_modus` | |
| 4 | `kanzlei` | `kanzlei_wunsch` → `kanzlei_wunsch` | `conditional_on: service_typ=komplett` |
| 5 | `kontakt` | vorname, nachname, telefon, email, `bevorzugter_kanal`, **`unterschrift`** (signature) → `unterschrift_data_url`, `dsgvo_zustimmung` → `dsgvo_zustimmung_am` | SA-Canvas ist hier |

→ **KEIN Schuldfrage-Feld.** (Quali-Gate ist net-new.)

### 1.2 Submit + Conversion (heute)
- Submit-Action: `erstelleGutachterFinderAnfrage()` (`src/lib/actions/gutachter-finder-actions.ts`) → INSERT in `gutachter_finder_anfragen`, `status='neu'`.
- Finalize (letzte Phase): `finalizeGutachterFinderAnfrage()` (`src/components/onboarding/finalizeAnfrage.ts`) → **`konvertiereAnfrageZuFall(anfrageId, locale)`** (`src/lib/actions/konvertiere-anfrage-zu-fall.ts`).
- `konvertiereAnfrageZuFall` (claim-nativ, ~430 Z.): Auth-User + `createLead(source_channel='gutachter_finder_self_dispatch', status='quali-offen')` → **`convertLeadToClaim`** (Claim+Fall) → OCR-Felder → `notifyNewLead` + ggf. `pushMandatToKanzlei` + CarDentity → GFA `konvertiert_zu_fall_id`/`status='konvertiert'` → `dispatchMagicLink`.
- **→ Promotion + Fall passieren HEUTE am ENDE (Finalize), nicht bei der Reservierung.**

### 1.3 Matching (heute)
- `matcheSvFuerWizard(lat,lng)` (`src/lib/onboarding/svMatching.ts`): **2-stufig** —
  - Prio 1: **jeder** aktive `sachverstaendige` (Isochrone-Polygon-Hit ODER 80-km-Fallback), nächster gewinnt → liefert **`firmenname`** als `svName` ⚠️ **Leak**.
  - Prio 2: `sv_leads` (30-km-Radius, „Kalender immer frei") → `matching_typ='lead_fallback'`.
- Slot-Picker: `ladeFreieSlots()` (`src/lib/onboarding/slots.ts`) — arbeitszeiten − blockierte − gutachter_termine − GFA-Reservierungen − Google/CalDAV − ETA-Reachability.
- Reservierung: `reserviereSlot()` keyt auf GFA (`reservierter_slot_von/bis`, `reservierter_sv_id`) — setzt **kein** `lead_id`/`fall_id` am `gutachter_termine`.

### 1.4 SV-Tiers im echten Schema
| Tier | Quelle | Status heute |
|---|---|---|
| **Paid** (oben) | `sachverstaendige`, paket `standard`(5)/`pro`(5) + `stripe_*` + `paket_faelle_gesamt`-Kontingent | ✅ existiert (Preise NULL = Test-DB) |
| **Free-Plan** (Mitte) | `sachverstaendige` mit kostenlosem paket | ❌ **net-new** (kein `free`-paket; Mechanismus via paket-Spalte da) |
| **Leads** (unten, Bluff) | `sv_leads` (DAT-Import, kein Kalender, `warteliste_status`) | ✅ existiert; **immer „frei" als Bluff**, dann **disponiert** |

- Kein `sv_lead_id`-FK auf `sachverstaendige`; weicher Link via `dat_nummer` (SV) ↔ `dat_id`/`dat_expert_nr` (Lead).
- Lead→registriert heute **admin-getrieben** (`admin/sachverstaendige/anlegen/BueroAnlegenWizard`), kein Self-Claim.
- **Leads-Dispatch existiert:** `dispatch/gutachter-finder/` (Übersicht + Detail + actions) — Dispatcher disponiert Anfragen inkl. lead-typ-Buchungen an echte SVs. (Genaue Re-Dispo-Mechanik = ZU-VERIFIZIEREN.)

### 1.5 AAR-940-Pfad (zum Wiederverwenden)
`/anfrage/[token]` + `src/lib/self-service/*` + `src/lib/sv-matching-modul/*`:
- `eligibility.ts`: `source ∈ {null, kfz_gutachter_lp}` + Kontakt + nicht promotet + nicht-terminal. **`source=NULL` (= nativer Wizard) ist schon self-service-eligible.**
- `matchAndSlots()`: **Tier-1-only**, leak-safe `toOeffentlichesSvProfil` (nur vorname/avatar/beschreibung/Google-Bewertung/„ca. X km"), TZ-neutral.
- Flow: `promoteAnfrageZuLead` (createLead) → `speichereQuali` (Schuldfrage-Gate) → `ladeMatching` → `bucheTermin` (Termin mit **nur lead_id**) → `unterschreibeUndErstelleFall` → `signSAandCreateFall` (claim-nativ).

---

## 2. Gelockte Entscheidungen (Aaron, 31.05.)

1. **3-Tier-SV-Leiter** (Matching-Prio oben→unten): **paid > free-plan (claimed standort) > leads (Bluff, dann disponiert)**. Leads sind **gewollte Abdeckung mit Dispatch dahinter**, kein totes Phantom.
2. **Scope-Schnitt:** **Thread 1 jetzt** (Flow-Vereinheitlichung mit heutigen Tiers) · **Thread 2 später** (Free-Tier + Self-Claim-Standort, net-new Feature).
3. **Flow-Prinzip:** Wizard = Anfrage + Termin-Köder; **Anfrage→Lead bei Termin-Reservierung**; Rest self-service per FlowLink (AAR-940-Logik).

---

## 3. Thread-1-Plan (Soll)

**Soll-Flow:** Wizard (standort → **termin=Köder → reservieren → Anfrage→Lead**) → Rest self-service (quali/SA → claim-nativer Fall) per FlowLink-Logik.

**Arbeitspakete (Entwurf, abhängig von §4-Entscheidungen):**
- **P1 — Promotion-Trigger verschieben:** Anfrage→Lead bei Slot-Reservierung (Phase 2) statt am Finalize-Ende. Reuse `createLead`/`promoteAnfrageZuLead`-Muster; GFA-Marker (`konvertiert_zu_lead_id`) bei Reservierung.
- **P2 — Termin claim-nativ verknüpfen:** Reservierung muss `lead_id` an `gutachter_termine` setzen (statt nur GFA `reservierter_slot_*`), damit der spätere claim-native Convert (`signSAandCreateFall` via `.eq('lead_id')`) den Termin findet (= AAR-940-Muster). Klärt das Verhältnis zu `reserviereSlot`.
- **P3 — Quali-Gate (Schuldfrage) einführen:** net-new Feld/Phase in `onboarding_phasen` (gutachter-finden) + Gate-Logik (Eigenverschulden → kein Termin/Hinweis, wie AAR-940 `bewerteSchuldfrage`). **Platzierung = Entscheidung §4.**
- **P4 — Leak-Fix:** SV-Anzeige im Wizard von `firmenname` auf leak-safe (`vorname`-only + Bewertung) umstellen — `toOeffentlichesSvProfil` wiederverwenden.
- **P5 — Matcher angleichen:** leak-safe Projektion + ggf. Tier-Logik. **`matchAndSlots` ist Tier-1-only → NICHT 1:1 für den nativen Wizard** (verlöre Leads-Coverage). Optionen in §4.
- **P6 — Conversion:** `konvertiereAnfrageZuFall` behalten vs `signSAandCreateFall` angleichen — §4.

---

## 4. OFFENE FRAGEN / ZU KLÄREN (vollständig)

### A · Produkt-/Design-Entscheidungen (Aaron)
- **A1 — Flow-Schnitt (DIE Strukturfrage):** Bleibt der Wizard **eine** Session (5 Phasen, nur Promotion-Zeitpunkt + Convert-Reihenfolge geändert)? **Oder** wird er **gesplittet**: Wizard = standort+termin-bait → reserve+promote+**FlowLink ausstellen**, und service/kanzlei/quali/SA/Convert läuft über `/anfrage/[token]` (AAR-940)? (Letzteres = echte Vereinheitlichung, aber größerer Umbau.)
- **A2 — Quali-Gate-Platzierung vs Köder-Logik:** Der Wizard *ködert mit dem Termin* (Phase 2 früh). Eine Schuldfrage *vor* dem Termin würde Eigenverschulden früh aussortieren — aber den Köder schwächen. **Wo sitzt die Schuldfrage** (vor Matching / nach Termin / im Self-Service-Teil nach Promotion)? Und bei Eigenverschulden: kein Termin + fairer Hinweis (wie AAR-940) — auch wenn schon ein Slot reserviert war (dann stornieren)?
- **A3 — Leads-Coverage im nativen Wizard:** Bestätigt — Leads bleiben buchbar (Bluff + Dispatch), **anders** als AAR-940 (Tier-1-only)? D.h. die zwei Flows haben **bewusst unterschiedliche Tier-Inklusion**?
- **A4 — Matcher-Strategie (P5):** (a) `matcheSvFuerWizard` behalten (leads-aware) + nur Leak-Fix, **oder** (b) `matchAndSlots` um einen „Coverage-Modus" (inkl. Leads) erweitern und beide Flows darauf vereinheitlichen? (b) ist sauberer, aber mehr Arbeit.
- **A5 — Leak-Fix (P4):** SV-Name im Wizard künftig **`vorname`-only** (Konsistenz mit AAR-940) — bestätigt?
- **A6 — Conversion (P6):** `konvertiereAnfrageZuFall` behalten (läuft, claim-nativ, macht Account+Magic-Link) **oder** auf `signSAandCreateFall` angleichen? (Beide enden bei `convertLeadToClaim`.)
- **A7 — Promotion-Zeitpunkt (P1):** Anfrage→Lead **exakt bei Slot-Reservierung** — bestätigt? Was, wenn der Kunde danach abbricht (Lead bleibt „quali-offen" für Dispatcher-Nachfass)?

### B · Code/Daten-Fakten (verifiziere ich bei Implementierung)
- **B1 —** `konvertiereAnfrageZuFall`-Internals: was passiert mit `zugeordneter_sv_id`/`_sv_lead_id` + dem reservierten Slot? Erzeugt es einen `gutachter_termine`, und wie hängt der an lead/fall/claim (vs AAR-940 `bucheTermin`+SP-G2-Trigger)?
- **B2 —** `dispatch/gutachter-finder`-Disposition: wie wird eine lead-typ-Buchung an einen echten SV re-disponiert (Mechanik, Auslöser, Status-Übergänge)?
- **B3 —** `reserviereSlot` ↔ GFA ↔ `gutachter_termine`: heute GFA-gekeyt (kein lead_id am Termin) — exakter Umbau auf das AAR-940-Termin-Linking (P2).
- **B4 —** `onboarding_phasen`-Mechanik für ein neues Schuldfrage-Feld: `conditional_on`, `db_target` (auf GFA wie die anderen Felder? oder auf den Lead nach Promotion?), i18n-Pflege (5 Sprachen wie der Rest).
- **B5 —** WizardClient-Matching-Trigger (`claimondo:select-sv`, Geo-Match beim Slot-Phase-Mount) — wie greift der Promotion-bei-Reservierung-Umbau dort ein.

### C · Thread 2 (Folge-Track, net-new — NICHT in Thread 1)
- **C1 —** Free-Plan-`paket`-Wert definieren (preis 0) + Onboarding-Logik, die es setzt.
- **C2 —** Self-Claim-Standort-Flow: DAT-Lead → meldet sich an → wird `sachverstaendige` (free) + `sv_leads`-Row deaktivieren/linken (`sv_lead_id`-FK + `dat_nummer`-Abgleich).
- **C3 —** 3-Wege-Matcher-Split: paid > free > leads (mit Dispatch) — als Ablösung von `matcheSvFuerWizard`s 2-Stufen-Logik.

---

## 5. Betroffene Files (Karte)

**Wizard/Front:** `src/app/gutachter-finden/{page.tsx, GutachterFinderMapClient.tsx}` · `src/components/onboarding/{DynamicWizard.tsx, WizardClient.tsx, finalizeAnfrage.ts, fields/SlotField.tsx, fields/*}`
**Actions/Logik:** `src/lib/actions/gutachter-finder-actions.ts` · `src/lib/actions/konvertiere-anfrage-zu-fall.ts` · `src/lib/onboarding/{svMatching.ts, slots.ts, findSvsForLocation.ts}`
**AAR-940 (reuse):** `src/lib/sv-matching-modul/*` (matchAndSlots, toOeffentlichesSvProfil) · `src/lib/self-service/{eligibility.ts, quali-gate.ts, issue-flowlink.ts}` · `src/app/anfrage/[token]/actions.ts`
**Dispatch:** `src/app/dispatch/gutachter-finder/{actions.ts, [id]/*, GutachterFinderUebersichtClient.tsx}`
**DB:** `onboarding_phasen`/`onboarding_felder` (Schuldfrage-Feld) · `gutachter_finder_anfragen` · `gutachter_termine` · `sachverstaendige` · `sv_leads`

---

## 6. Nächster Schritt

Aaron beantwortet §4.A (Design-Entscheidungen) → ich schneide den finalen Thread-1-Plan (Arbeitspakete + Reihenfolge) + lege den Worktree an + baue (TDD, primitives-only, claim-nativ, Harte-Regeln). §4.B verifiziere ich beim Bauen, §4.C ist separater Track.
