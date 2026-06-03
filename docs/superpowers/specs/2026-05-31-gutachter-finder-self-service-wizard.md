# Gutachter-Finder → Self-Service: config-getriebene Anfrage-Strecke (Y-Modell)

**Status:** GELOCKT (Aaron approved 31.05./01.06.2026) — bereit zum Bauen
**Session:** 1601e3a6 · **Vorgänger:** AAR-940/941 Monika Self-Service (LIVE auf prod)
**Branch:** `kitta/gutachter-finder-self-service`

---

## 0. Ziel + gelockter Flow

Der native `/gutachter-finden`-Wizard wird auf dieselbe (config-getriebene) Self-Service-Logik gehoben wie AAR-940. **Reframe:** `/gutachter-finden` ist heute schon self-service (matcht, bucht, SA, konvertiert) — es ist also *Vereinheitlichung*, nicht Neubau. Der gelockte End-State ist ein **3-Stufen-Flow auf EINER Engine (DynamicWizard)**:

```
1) WIZARD (Köder, low-friction · flow_key=gutachter-finden)
     Standort → SV-Matching (leak-safe) → Termin RESERVIEREN → minimal Kontakt
     → "Termin reserviert, Link kommt per Mail"  +  FlowLink/Magic-Link ausgestellt
2) FLOWLINK / BEAUFTRAGUNG  (flow_key=beauftragung, NEU · /anfrage/[token])
     Magic-Link öffnen → Anfrage→Lead (Promotion) → Service/Kanzlei
     → Schuldfrage (LETZTER Schritt, "unverschuldet" vorgewählt) → SA/Vollmacht
     → wenn Lead VOLLSTÄNDIG → Convert Lead→Fall+Claim (claim-nativ)
3) ONBOARDING  (flow_key=kunde-onboarding, adaptiv)
     Login per Magic-Link → restliche Daten werden NACHGEZOGEN (getOnboardingSteps skippt Erledigtes)
```

---

## 1. Architektur-Prinzip (das Y-Modell)

Alle drei Stufen laufen auf dem **DynamicWizard** (`onboarding_phasen`/`onboarding_felder`, DB-getrieben). Damit reduziert sich jeder Flow — heutige UND künftige — auf **zwei Definitionen in der DB**:

1. **„Was macht einen Lead vollständig?"** = Conversion-Gate = **alle `pflicht`-Felder des `beauftragung`-flow_key gefüllt**. Fällt direkt aus den `pflicht`-Flags der Config — kein Hardcode.
2. **„Was wird nachgezogen?"** = der Rest, adaptiv über `/kunde/onboarding` (`getOnboardingSteps`).

**Alles aus der DB:** jedes `onboarding_felder`-Feld trägt `flow_key`, `reihenfolge`, `pflicht`, `conditional_on` und **`db_target = {tabelle, spalte}`**. → künftige Flows = nur Config, kein Code.

**db_target-Routing (wo Werte landen):**
| Stufe | db_target | Grund |
|---|---|---|
| Wizard-Front | `gutachter_finder_anfragen` (GFA) | Anfrage existiert vor dem Lead |
| FlowLink-Beauftragung (nach Promotion) | `leads` | Lead wird Feld-für-Feld aufgebaut → `pflicht` voll = vollständig |
| Onboarding | `faelle`/`claims`/… | nachgezogen |

**Termin = eigener Lifecycle (Aaron-Insight):** Die Anfrage bleibt **schlank**, weil der Termin als separate Strecke läuft — `gutachter_termine` + State-Machine (reserviert→bestätigt→durchgeführt/no-show/verlegt, AAR-864/865, SP-G2 `claim_id`-Trigger). Anfrage/Lead/Claim **referenzieren** nur einen Termin (`gutachter_termine.lead_id/fall_id/claim_id`), tragen seine Komplexität nicht. → „was eine Anfrage sein kann" ist überschaubar.

**Config-getriebene Promotion (Design-Punkt):** Die GFA→Lead-Promotion (`promoteAnfrageZuLead`/`createLead`) ist heute eine dünne Code-Mapping-Schicht. Soll künftig die `db_target`-Config bzw. eine GFA↔leads-Spalten-Konvention lesen statt hardcoded zu mappen → dann ist auch die Promotion DB-definiert.

---

## 2. „Lead vollständig" (Conversion-Gate) — GELOCKT

| ✅ Lead vollständig (vor Convert) | ⏭️ nachgezogen im Onboarding |
|---|---|
| Kontakt (Name, Tel, Mail) | Fahrzeug-Detail (FIN/HSN/TSN, Hersteller/Modell/Baujahr) |
| Schaden-Basics (Schadentyp + Kurzbeschreibung) | Halter-Daten (wenn ≠ Fahrer) |
| Besichtigungsort (Geo) | Dokumente (ZB1/Fahrzeugschein, Schadenfotos, Polizeibericht) |
| Termin + SV reserviert | Bankdaten / Vorsteuerabzug |
| Schuldfrage geklärt (≠ Eigenverschulden) | Unfallhergang-Detail / Skizze |
| Service-Wahl (+ Kanzlei) | … |
| SA / Vollmacht unterschrieben | |

Links = Wizard + FlowLink sammeln (`pflicht`); komplett → Convert. Rechts = optional/später, blockt die Beauftragung nicht.

---

## 3. SV-Tiers (Matching) — GELOCKT

3-Stufen-Leiter (Prio oben→unten): **paid > free-plan (claimed Standort) > leads (Bluff, dann disponiert)**. Leads = gewollte Abdeckung **mit Dispatch dahinter** (`dispatch/gutachter-finder`-Queue), kein totes Phantom.

**Thread-1 nutzt die HEUTIGEN Tiers** (paid `standard`/`pro` + leads-mit-Dispatch); **Free-Plan-Tier + Self-Claim-Standort = Thread 2** (net-new, s. §6.C).

---

## 4. Verifizierter Ist-Zustand

### 4.1 `/gutachter-finden`-Wizard (heute, DB-getrieben, 5 Phasen)
`DynamicWizard`→`WizardClient` · alle Felder → GFA. `flow_key='gutachter-finden'`:

| # | phase_key | Felder (→ GFA) | Bemerkung |
|---|---|---|---|
| 1 | `standort` | `besichtigungsort` → `besichtigungsort_adresse` | |
| 2 | `termin` | `wunschtermin_wann` + `wunschtermin` (slot) → `wunschtermin` | **Köder**; `reserviereSlot` (GFA-gekeyt) |
| 3 | `service` | `service_typ` (komplett/nur_gutachter) → `regulierungs_modus` | |
| 4 | `kanzlei` | `kanzlei_wunsch` → `kanzlei_wunsch` | `conditional_on: service_typ=komplett` |
| 5 | `kontakt` | vorname, nachname, telefon, email, `bevorzugter_kanal`, **`unterschrift`** (signature) → `unterschrift_data_url`, `dsgvo_zustimmung` | **KEIN Schuldfrage-Feld** → net-new |

Feld-Typen verfügbar: `text, tel, email, segmented, toggle-cards, slot, signature, checkbox`. → die Beauftragung (service_typ/kanzlei = toggle-cards, schuldfrage = segmented, SA = signature) braucht **keine neuen Feld-Typen**, nur Config + Gate + Finalize-Target.

### 4.2 `/anfrage` (AAR-940) = HARDCODED, nicht dynamisch
Bespoke Clients (`AnfrageStartClient`/`SelbstQualiClient`/`TerminBuchungClient`) + Server-Actions (`promoteAnfrageZuLead`, `speichereQuali`, `ladeMatching`, `bucheTermin`, `unterschreibeUndErstelleFall`→`signSAandCreateFall`). **Wird im Y-Modell auf den DynamicWizard migriert** (flow_key=`beauftragung`). Eligibility: `source ∈ {null, kfz_gutachter_lp}` → Wizard-Anfrage (`source=NULL`) ist schon eligible.

### 4.3 Matching (heute)
`matcheSvFuerWizard` (2-stufig: jeder aktive `sachverstaendige` Prio-1 via Isochrone/80km → liefert **`firmenname` = LEAK**; dann `sv_leads` 30km). Slots: `ladeFreieSlots`. AAR-940 `matchAndSlots` = Tier-1-only + leak-safe `toOeffentlichesSvProfil` (vorname/avatar/beschreibung/Google-Bewertung/„ca. X km").

### 4.4 Conversion (heute)
Wizard-Finalize → `konvertiereAnfrageZuFall` (claim-nativ: `createLead`→`convertLeadToClaim`→Claim+Fall+OCR+`notifyNewLead`+Magic-Link). AAR-940 nutzt `signSAandCreateFall`→`convertLeadToClaim`. Beide enden claim-nativ.

### 4.5 SV-Schema (Tiers)
`sachverstaendige`: `paket` = `standard`(5)/`pro`(5) — **kein `free`-paket** (Free-Tier net-new); `stripe_*`, `verifiziert`, `portal_zugang_freigeschaltet`, `dat_nummer`. `sv_leads`: DAT-Import, kein Kalender, `warteliste_status`. Kein `sv_lead_id`-FK (weicher Link via `dat_nummer`↔`dat_id`). Lead→registriert heute admin (`BueroAnlegenWizard`). Leads-Dispatch existiert (`dispatch/gutachter-finder`).

---

## 5. Thread-1-Plan (Arbeitspakete)

- **P1 — `beauftragung`-flow_key (DynamicWizard):** neue `onboarding_phasen`/`felder` (Service-Typ, Kanzlei [conditional], Schuldfrage, SA), `db_target=leads`. i18n (5 Sprachen) wie Bestand.
- **P2 — Quali-Gate im DynamicWizard:** Mechanismus „Feld-Wert disqualifiziert → Abbruch-Screen" (Schuldfrage=eigenverschulden → kein Convert + fairer Hinweis, reservierten Slot stornieren). Default „unverschuldet/Gegner" vorgewählt.
- **P3 — Completeness-Gate + Finalize:** „alle `pflicht`-Felder des `beauftragung`-flow gefüllt" → Finalize-Hook → `signSAandCreateFall` (claim-nativ) statt `konvertiereAnfrageZuFall`.
- **P4 — Slot-Carry:** im Wizard reservierter Slot (GFA `reservierter_slot_*`) → Lead-Termin (`gutachter_termine.lead_id`); FlowLink überspringt eigenes Matching/Booking; `signSAandCreateFall` bestätigt + setzt `claim_id` (SP-G2-Fix). → klärt Verhältnis `reserviereSlot` ↔ AAR-940 `bucheTermin`.
- **P5 — Wizard trimmen + Handoff:** Wizard endet nach Termin+Kontakt → `issueSelfServiceFlowLink` (gebaut) + Magic-Link; Wizard-`finalize` (konvertiereAnfrageZuFall) entfernen.
- **P6 — Leak-Fix Matcher:** Wizard-SV-Anzeige `firmenname` → `vorname`-only (reuse `toOeffentlichesSvProfil`). Matcher bleibt leads-aware (≠ AAR-940 Tier-1-only — bewusst).
- **P7 — Promotion config-getrieben:** GFA→Lead-Mapping über `db_target`/Spalten-Konvention statt hardcoded.

**Reihenfolge:** P1+P2+P3 (Engine-Erweiterung, TDD) → P4 (Termin-Linking) → P5 (Wizard-Trim) → P6 (Leak) → P7. Build claim-nativ, primitives-only, Result-Object, Umlaute, Harte-Regeln.

---

## 6. OFFEN / ZU KLÄREN

### B · Code/Daten-Fakten (verifiziere ich bei Impl)
- **B1** `konvertiereAnfrageZuFall`-Internals vs `signSAandCreateFall` (SV/Slot/Termin-Handling) — welcher Pfad fürs Y-Finalize.
- **B2** `dispatch/gutachter-finder`-Disposition: wie lead-typ-Buchung an echten SV re-disponiert wird (Mechanik/Auslöser/Status).
- **B3** `reserviereSlot` ↔ GFA ↔ `gutachter_termine` exakt (P4-Slot-Carry).
- **B4** DynamicWizard-Action-Hooks: kann er Quali-Gate-Abbruch + Finalize-Target-Swap + „Slot schon reserviert"-Skip (WizardClient orchestriert heute Matching/Reserve/Finalize — Erweiterungspunkte prüfen).
- **B5** `getOnboardingSteps` (Deferral): was zieht es heute adaptiv nach, was fehlt für die rechte Spalte §2.
- **B6** Promotion-Mapping GFA↔leads-Spalten (P7) — Spalten-Deckung.

### C · Thread 2 (Folge-Track, net-new — NICHT in Thread 1)
- **C1** Free-Plan-`paket`-Wert (preis 0) + Onboarding-Logik.
- **C2** Self-Claim-Standort: DAT-Lead → `sachverstaendige` (free) + `sv_lead_id`-Link + `sv_leads` deaktivieren.
- **C3** 3-Wege-Matcher (paid > free > leads-mit-Dispatch) als Ablösung von `matcheSvFuerWizard`.

---

## 7. Betroffene Files

**Engine:** `src/components/onboarding/{DynamicWizard.tsx, WizardClient.tsx, finalizeAnfrage.ts, fields/*}` · `src/lib/onboarding/{slots.ts, svMatching.ts, getOnboardingSteps}`
**Wizard/Front:** `src/app/gutachter-finden/{page.tsx, GutachterFinderMapClient.tsx}` · `src/lib/actions/gutachter-finder-actions.ts`
**FlowLink/Beauftragung:** `src/app/anfrage/[token]/*` · `src/lib/self-service/{eligibility.ts, quali-gate.ts, issue-flowlink.ts}` · `src/lib/sv-matching-modul/*` (`matchAndSlots`, `toOeffentlichesSvProfil`)
**Conversion:** `src/lib/actions/konvertiere-anfrage-zu-fall.ts` · `src/app/flow/[token]/actions.ts` (`signSAandCreateFall`) · `src/lib/leads/convert-lead-to-claim.ts`
**Dispatch:** `src/app/dispatch/gutachter-finder/*`
**DB:** `onboarding_phasen`/`onboarding_felder` (neuer flow_key `beauftragung` + Schuldfrage-Feld) · `gutachter_finder_anfragen` · `leads` · `gutachter_termine` · `sachverstaendige` · `sv_leads`

---

## 8. Nächster Schritt

Spec gelockt → eigener Worktree → bauen nach P1…P7 (TDD, claim-nativ, primitives-only, Harte-Regeln). B-Punkte verifiziere ich beim Bauen; C = separater Track.
