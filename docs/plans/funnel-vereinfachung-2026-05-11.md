# Funnel-Vereinfachung: gutachter-finden → kunde-onboarding

**Stand:** 2026-05-11 (v2 — korrigiert nach Aaron-Feedback zum Tier-Modell)
**Auftrag:** Karte = Matching-Ergebnis basierend auf Schadens-Standort.
SVs in drei Tiers; echte SVs immer bevorzugt. Termin auf der Karte wählen.
Detail-Erfassung wandert ins Kunde-Onboarding.

---

## 1. SV-Tier-Modell (Stand 2026-05-11)

| Tier | Tabelle | Anzahl | Kalender | Priorität |
|---|---|---|---|---|
| **Pro/Premium** | `sachverstaendige` | 9 (8 aktiv) | Google Cal / CalDAV-Sync (AAR-364/716), echte `gutachter_termine` | **immer zuerst** |
| **Free (Lead-Partner)** | `sv_leads` | 62 | "frei" — keine Sync, wir nutzen Standard-Verfügbarkeit | **Fallback wenn kein Pro/Premium die Region deckt** |
| **Basic** *(zukünftig)* | `sv_leads.tier='basic'` | 0 | Self-Onboarding, Termine per WhatsApp | nach Pro/Premium, vor Free |

**Konvertierungs-Pfad:** Free → Newsletter-CTA → Self-Onboarding → Basic.
Eigene Migration + Onboarding-Page, separater Plan.

---

## 2. Matching-Logik beim `/gutachter-finden`

### Input
- **Schadens-/Fahrzeug-Standort** als Koordinaten (Google Places oder Browser-Geolocation)
- *Optional:* Wunschtermin (Datum/Zeitfenster)

### Algorithmus (Server-Action)

```
1. Lade alle aktiven sachverstaendige mit isochrone_polygon
2. Filter: pointInPolygon(standort, iso) === true
3. Wenn ≥1 Treffer:
   → sortiere nach (findBestSV-Score):
     * Paket-Prio (premium > pro > standard)
     * Kontingent-Frei (paket_faelle_gesamt - paket_faelle_offen) desc
     * Wenig offene Fälle (Balance)
     * Wenig Ablehnungen
     * Distanz-Tiebreaker
   → Slots aus echtem Kalender (Google FreeBusy + gutachter_termine)
4. Wenn 0 Treffer aus Tier 1:
   → fallback zu sv_leads
   → Filter: pointInPolygon(standort, iso) === true ODER haversine ≤ 25km
   → Slots aus Standard-Verfügbarkeit (Mo-Fr 09:00/11:00/13:30/15:30)
5. Wunschtermin-Match: aus priorisiertem Pool den nächsten Slot zum Wunsch
```

### UI-Anzeige der Karte

- **Schadens-Marker** = großer Marker mit Pulse-Ring an der Standort-Koordinate
- **Tier-1-SVs** (sachverstaendige) = Premium-Look (Ondo-Border, Gold-Akzent, Avatar)
- **Tier-2-SVs** (sv_leads, free) = neutraler Look (Grau, Initialen)
- **Iso-Halos** nur für Tier-1 oder den ausgewählten SV, sonst zuviel visuelles Rauschen
- Wenn Standort in keiner Tier-1-Iso liegt: rote Info-Pille „In Ihrer Region nur Lead-Partner verfügbar — Termin wird manuell bestätigt"

---

## 3. Wizard `/gutachter-finden` (3 Phasen statt 5)

| # | phase_key | Felder | Notes |
|---|---|---|---|
| 1 | **standort** | `besichtigungsort` (Google-Place-Autocomplete, → lat/lng) | Pflichtfeld, ersetzt PLZ-only |
| 2 | **termin** | `zugeordneter_sv_id` ODER `zugeordneter_sv_lead_id` + `wunschtermin` (Slot-Picker) | Slots werden serverseitig aus Matching-Logik geladen |
| 3 | **kontakt** | `vorname`, `nachname`, `telefon`, `email`, `bevorzugter_kanal` + DSGVO | Submit → Konvertierung |

Submit-Logik:
1. `INSERT gutachter_finder_anfragen` (status=entwurf)
2. `INSERT gutachter_termine` (status=reserviert, pre_flowlink=true)
3. `konvertiereAnfrageZuFall()` → Lead + Fall + Magic-Link
4. fall_id wird nachträglich auf gutachter_termine geschrieben
5. Bei sv_leads: zusätzliche Dispatcher-Task „Termin mit SV bestätigen"

**ZB1-OCR im Wizard?** NEIN — geht erst im `/kunde/onboarding` (Aaron 2026-05-11). Im Wizard reicht der Standort.

---

## 4. Kunde-Onboarding `/kunde/onboarding` — **datenabhängiger DynamicWizard**

**Wichtigster Punkt (Aaron 2026-05-11):** Die Phasen sind **nicht statisch 5**.
Sie werden zur **Render-Zeit gegen die DB geprüft** — was schon gefüllt ist,
wird übersprungen. **Je mehr OCR/Dispatch vorher abgegriffen hat, desto kürzer
das Onboarding.**

Dies ist eine Vereinheitlichung: `/kunde/onboarding` ersetzt FlowWizardKfz.
Ein Pfad für **alle** Kunden, egal woher sie kommen (Dispatch-Lead, Self-Service,
Magic-Link).

### Datenfluss — alles aus der DB

**Single Source of Truth: was die DB schon hat, fragen wir nicht mehr.**

```
                Page /kunde/onboarding (Server-Component)
                            │
                            ▼
        ┌───────────────────────────────────────────┐
        │ ladeNoetigePhasen(fallId)                 │
        │  - SELECT faelle, claims, leads,          │
        │    vehicles, fall_documents,              │
        │    claim_vehicle_involvements             │
        │  - berechneFehlendeFelder(lead+claim)     │
        │  - SELECT onboarding_phasen + felder      │
        │    WHERE flow_key='kunde-onboarding'      │
        │  - Pro Phase: completionCheck(dbData)     │
        │  - Pro Feld: dbData[feld_key] gesetzt? → skip │
        └─────────────────┬─────────────────────────┘
                          │
              { phases: [...], prefilledValues: {...} }
                          │
                          ▼
                  <WizardClient />
                  rendert nur was fehlt
```

### Loader-Schnittstelle

```ts
// src/lib/onboarding/load-needed-phases.ts (NEU)

export type WizardPhaseConfig = OnboardingPhase & {
  // Pro Feld ein "skip"-Flag wenn DB-Wert schon vorhanden
  felder: Array<OnboardingFeld & { dbValuePresent: boolean }>
}

export type WizardState = {
  phases: WizardPhaseConfig[]
  prefilledValues: Record<string, unknown>  // alle DB-Werte, pre-fillen Form
  fallId: string
}

export async function ladeNoetigePhasen(
  supabase: SupabaseClient,
  fallId: string
): Promise<WizardState> {
  // 1. Lade kompletten Fall-Snapshot
  const fall = await supabase.from('faelle').select('*').eq('id', fallId).single()
  const claim = await supabase.from('claims').select('*').eq('id', fall.claim_id).single()
  const lead  = await supabase.from('leads').select('*').eq('id', fall.lead_id).single()
  const vehicle = await loadVehicleViaCVI(claim.id)
  const docs  = await supabase.from('fall_documents').select('typ').eq('fall_id', fallId)

  // 2. Map zu Pre-fill-Values fuer den Wizard
  const prefilled = mapDbZuWizardValues({ fall, claim, lead, vehicle, docs })

  // 3. Lade Phasen-Config aus DB
  const phasen = await supabase
    .from('onboarding_phasen')
    .select('*, onboarding_felder(*)')
    .eq('flow_key', 'kunde-onboarding')
    .order('reihenfolge')

  // 4. Pro Phase + Feld pruefen: dbValuePresent?
  return {
    phases: phasen.map(p => ({
      ...p,
      felder: p.onboarding_felder
        .map(f => ({ ...f, dbValuePresent: !!prefilled[f.feld_key] }))
        // Phase wird komplett geskippt wenn ALLE Felder schon da sind
        .filter(f => !f.dbValuePresent || f.pflicht),
    })).filter(p => p.felder.length > 0),
    prefilledValues: prefilled,
    fallId,
  }
}
```

### Dispatcher-Hand ist auch DB-Hand

Was im Dispatch-Portal vom KB/Admin eingetragen wird, ist genauso Teil der
Wahrheit wie OCR-Resultate. **Der Dispatcher ist verantwortlich für den Lead**:

- KB erfasst per Telefon: Vorname, Nachname, Telefon, schaden_konstellation,
  polizei_vor_ort → schreibt in `leads`/`claims`/`faelle`
- KB im Admin-Portal nachträgt: gegner_versicherung, gegner_aktenzeichen,
  unfallhergang → schreibt in `claims`
- Beim Konvertieren-Klick: `convertLeadToClaim` migriert alle Lead-Felder
  in `claims` + `faelle`

→ Wenn der Kunde danach `/kunde/onboarding` öffnet, sieht der Loader:
"Polizei = bereits gesetzt", "Konstellation = bereits gesetzt",
"Gegner-VS = bereits gesetzt" → diese Felder werden geskippt.
Der Kunde sieht **nur** was wirklich noch fehlt — typisch nur SA-Signatur +
2-3 Fotos.

### Warum DB-getrieben statt code-getrieben

| Code-getrieben (jetzt) | DB-getrieben (Ziel) |
|---|---|
| Skip-Logic in TypeScript-Konstanten | Skip-Logic via DB-Query auf `faelle`, `claims`, `vehicles`, `fall_documents` |
| Neue Felder = Code-Deploy nötig | Neue Felder = INSERT in `onboarding_felder` |
| OCR-Resultate kommen nicht ins UI ohne Refresh | OCR schreibt direkt in DB → nächster Page-Render erkennt es |
| KB-Änderung im Admin-Portal triggert nicht das Onboarding-Update | Alles geht über DB → konsistent |

→ **Wizard liest live aus der DB beim Page-Open.** Wenn KB im Admin-Portal noch was nachträgt, sieht der Kunde beim nächsten Reload weniger Felder.

### Phasen-Definition mit Completion-Checks

| # | phase_key | Pflicht-Felder | Skip wenn... | Quelle |
|---|---|---|---|---|
| 1 | **fahrzeug** | kennzeichen, fahrzeug_modell, fahrzeug_hersteller, fahrzeug_baujahr, fin | faelle.kennzeichen IS NOT NULL **AND** vehicles.modell_haupttyp IS NOT NULL **AND** vehicles.baujahr IS NOT NULL | ZB1-OCR (`/api/admin/zb1-ocr`) füllt das in einem Rutsch |
| 2 | **schaden** | unfall_konstellation, polizei_vor_ort, schadens_datum | claims.kunden_konstellation + claims.polizei_vor_ort + claims.schadentag IS NOT NULL | Dispatch-Phase 1 wenn vorher Anruf |
| 3 | **hergang** | unfallhergang (≥50 Zeichen) | claims.hergang_kunde_text length ≥ 50 | Schaden-Melden-Form oder Dispatch |
| 4 | **polizeibericht** | nur sichtbar wenn polizei_vor_ort=true | fall_documents WHERE typ='polizeibericht' EXISTS | OCR-Upload |
| 5 | **gegner** | gegner_kennzeichen, gegner_versicherung, gegner_aktenzeichen | claims.gegner_versicherung IS NOT NULL | Grüne-Karte-OCR oder manuelle Eingabe |
| 6 | **fotos** | mind 4 Schadensfotos | fall_documents WHERE typ='schadensfoto' count ≥ 4 | Upload |
| 7 | **service** | service_typ + kanzlei_wunsch (bei komplett) | faelle.service_typ IS NOT NULL AND (service_typ='nur_gutachter' OR claims.kanzlei_wunsch IS NOT NULL) | nur User-Entscheidung |
| 8 | **sa** | SA-Signatur | faelle.sa_unterschrieben = true | nur User-Action |

### Beispiel-Szenarien

**Szenario A: Self-Service aus `/gutachter-finden`**
- Wizard hat nur: Standort + Termin + Kontakt + DSGVO erfasst
- Im Onboarding noch alle 8 Phasen offen (außer #4 wenn polizei_vor_ort=false)
- Aber: User lädt ZB1-Foto hoch → OCR füllt Phase 1 → übersprungen
- Tatsächlich angezeigt: ZB1-Upload (1), Schaden (2), Hergang (3), Fotos (6), Service (7), SA (8) = **6 Phasen**

**Szenario B: Lead aus Dispatch (Telefon-Inbound, KB hat alles erfasst)**
- KB hat schon: Schaden, Hergang, Konstellation, Polizei, Gegner, Service, manchmal sogar Fahrzeug
- Onboarding zeigt nur: Fotos (6) + SA-Signatur (8) = **2 Phasen**
- Massive Friction-Reduktion für KB-bearbeitete Leads

**Szenario C: Direkter SA-Link (KB schickt Vollmacht raus für signed-only)**
- Alles schon erfasst, fehlt nur SA-Signatur
- Onboarding zeigt nur: SA (8) = **1 Phase**

### OCR-Integrationen (alle existieren bereits)

| Quelle | Endpoint | Liefert |
|---|---|---|
| ZB1-Fahrzeugschein | `/api/admin/zb1-ocr` oder `/upload/dokumente/[token]` | kennzeichen, fin, fahrzeug_modell, hersteller, baujahr, lackfarbe, halter_name |
| Polizeibericht | `/api/admin/ocr-polizei` (existiert?) | TBNR, schuldfrage, unfallhergang_zusammenfassung |
| Grüne Karte | `/api/admin/ocr-gruene-karte` | gegner_versicherung, gegner_aktenzeichen, gegner_kennzeichen |
| Personalausweis | `/api/admin/ocr-ausweis` (für Halter-Identität) | halter_name, halter_geburtsdatum |

**Pattern:** Jede OCR-Phase ist im Wizard als "Upload-Field-Typ" — beim Submit-Click läuft OCR, Ergebnis schreibt direkt in DB-Felder, Phase wird als "complete" markiert + übersprungen.

### Bei Submit (jeder Phase)
- Phase-spezifische Felder auf `claims`/`faelle`/`leads`/`vehicles`/`fall_documents` schreiben
- `completionCheck()` re-evaluieren — falls true: nächste Phase
- Bei Phase 7+8 (Service + SA): Side-Effects triggern
  - `service_typ=komplett` + `kanzlei_wunsch=partnerkanzlei` → `pushMandatToKanzlei` (PR #757)
  - `sa_unterschrieben=true` → SA-PDF generieren + Email senden

---

## 5. FlowWizardKfz `/flow/[token]` deprecaten

- Token aus alten Emails wird zu `/kunde/onboarding?flow_token=...` redirected
- Server-Component lookt Token in `flow_links`, lädt zugehörige fall_id, redirected nach Magic-Link-Login
- FlowWizardKfz-Code bleibt 2 Releases im Tree als Fallback, dann löschbar

---

## 6. Slot-Engine — Standard-Verfügbarkeit für sv_leads

Datei: `src/lib/slots/standard-availability.ts` (neu)

```ts
// Mo-Fr 09:00, 11:00, 13:30, 15:30 (4 Slots/Tag)
// Nächste 14 Werktage anbieten
// Konflikt-Check: kein anderer pre_flowlink-Termin für denselben sv_lead_id
//                im selben Slot ± Pufferzone
export async function getStandardSlots(
  svLeadId: string,
  tageInZukunft: number = 14
): Promise<Slot[]>
```

Bei Tier-1-SVs nutzen wir die bestehende `getNextFreeSlotsForSv` aus
`src/app/dispatch/leads/[id]/_actions/sv-termin.ts` (Google FreeBusy + DB).

---

## 7. Termin-Buchung beim Submit

Beide Tiers schreiben in `gutachter_termine`:

| Feld | Tier 1 (sachverstaendige) | Tier 2 (sv_leads) |
|---|---|---|
| sv_id | ✓ uuid | NULL |
| sv_lead_id | NULL | ✓ uuid |
| status | `reserviert` | `pre_flowlink_reserviert` |
| pre_flowlink | true (bis Magic-Link gelogged) | true |
| fall_id | NULL (kommt mit konvertiereAnfrageZuFall) | NULL |
| start_zeit | gewählter Slot | gewählter Slot |
| end_zeit | start + 45 Min | start + 45 Min |

Dispatcher bekommt **automatisch Task**:
- Tier-1: „Termin reserviert, SV automatisch via Calendar-Sync benachrichtigt"
- Tier-2: „Termin reserviert. Bitte SV [Firma] unter [Telefon] anrufen und Slot bestätigen."

---

## 8. PR-Plan (8 PRs, ~19h verteilt)

| PR | Was | Aufwand | Status |
|---|---|---|---|
| **#1** | DB-Migration: gutachter-finden-Phasen reduzieren auf 3 (standort, termin, kontakt) | 1h | bereit |
| **#2** | Matching-Server-Action `findSvsForLocation(lat, lng)` — wrappt findBestSV + sv_leads-Fallback | 3h | bereit |
| **#3** | Slot-Engine `lib/slots/standard-availability.ts` + Konflikt-Check | 2h | bereit |
| **#4** | `SlotField`-Erweiterung: Tier-aware (Tier-1 Cal-Slots, Tier-2 Standard-Slots) | 3h | bereit |
| **#5** | WizardClient.handleWeiter: `gutachter_termine` INSERT bei Submit | 2h | bereit |
| **#6** | `/kunde/onboarding` DB-Phasen + DynamicWizard-Route | 4h | bereit |
| **#7** | ZB1-OCR-Feld-Typ + Fahrzeug-Render-Preview im Wizard | 3h | bereit |
| **#8** | `/flow/[token]` → Redirect zu `/kunde/onboarding?fall_id=...` | 1h | bereit |

**Reihenfolge:** PR #1+#2+#3 zuerst (Backend), dann #4+#5 (Wizard-Integration), dann #6+#7 (Onboarding), dann #8 (Cleanup).

---

## 9. Karten-Anzeige beim Schadensort-Eingabe

Wenn User in Phase 1 die Adresse eingibt:

1. `map.flyTo(lat, lng, zoom=12)` — Animation zum Standort
2. Custom Marker am Standort mit Pulse-Ring (rot)
3. Backend-Call `findSvsForLocation(lat, lng)` → liefert priorisierte Liste
4. **Nur die Treffer anzeigen** (Tier-1 mit Iso-Halo, Tier-2 ohne)
5. Click auf Marker → öffnet Sidebar mit „Verfügbare Slots" + „Wunschtermin"

---

## 10. Was hier ausdrücklich NICHT in diesem Plan ist

- **Basic-Tier Onboarding** (kommt mit Newsletter-Konvertierung-Strecke)
- **WhatsApp-Termin-Push für Basic-Tier** (kommt mit Tier-3)
- **Anbieter-Karten-Visualisierung** für Premium-SV-Profile (Wertvolle-SVs-Page später)

---

**Aaron — gib OK zum überarbeiteten Plan, dann starte ich mit PR #1.**

---

## 11. Bestehende Infrastruktur (nicht neu bauen, vereinheitlichen)

Wir haben das meiste schon. Statt 8 neue Module bauen wir 5 Bridges:

| Was existiert | Wo | Verwendung im Plan |
|---|---|---|
| `DynamicWizard` Engine | `src/components/onboarding/DynamicWizard.tsx` + `WizardClient.tsx` | als Wizard-Renderer für beide Strecken (gutachter-finden + kunde-onboarding) |
| DB-Phasen-Config | `onboarding_phasen` + `onboarding_felder` + `conditional_on` | flow_key='kunde-onboarding' anlegen mit Skip-Conditions |
| Fehlende-Felder-Logic | `src/lib/flow/fehlende-felder.ts` | als Conditional-Resolver im Wizard nutzen |
| ZB1-OCR | `/upload/dokumente/[token]` + Cardentity-Enrichment | als File-Field-Type mit OCR-Trigger |
| Schaden-Konstellation-Form | `src/app/dispatch/leads/[id]/_phases/Phase1Qualifizierung.tsx` | Felder spiegeln, im Wizard wiederverwenden |
| SA-Signatur | `flow/[token]/FlowWizardKfz.tsx` (Signature-Canvas) | als Signature-Field-Type extrahieren |
| `findBestSV` Matching | `src/lib/dispatch/findBestSV.ts` | wrappen als Public-Server-Action für /gutachter-finden |
| sv_leads Fallback-Matching | `src/lib/onboarding/svMatching.ts` (`matcheSvFuerWizard`) | bereits Fallback-fähig |
| Standard-Verfügbarkeit | — **muss neu** | einziger neuer Code: `lib/slots/standard-availability.ts` |
| `pushMandatToKanzlei` | `src/lib/kanzlei/push-mandat.ts` | bereits triggered bei service_typ=komplett |
| `konvertiereAnfrageZuFall` | `src/lib/actions/konvertiere-anfrage-zu-fall.ts` | bereits einheitlicher Pfad |

### Vereinfachter PR-Plan (5 PRs statt 8)

| PR | Was | Aufwand |
|---|---|---|
| **#1** | DB: gutachter-finden auf 3 Phasen (standort, termin, kontakt). kunde-onboarding Phasen anlegen mit conditional_on aus fehlende-felder-Logic | 3h |
| **#2** | Server-Action `findSvsForLocation(lat, lng)` — wrappt findBestSV (Tier-1) + matcheSvFuerWizard (Tier-2) | 2h |
| **#3** | Slot-Engine `lib/slots/standard-availability.ts` + SlotField-Tier-Awareness | 3h |
| **#4** | `/kunde/onboarding` als DynamicWizard-Page mit `ladeNoetigePhasen(fallId)`-Loader | 4h |
| **#5** | `/flow/[token]` Redirect zu `/kunde/onboarding`, FlowWizardKfz als Fallback noch im Tree | 2h |

**Gesamt:** ~14h verteilt auf 2 Tage.

---

## 12. Tier 3 "Basic" — späterer Plan, hier nur skizziert

Nicht jetzt umsetzen. Hier nur Notiz für die Architektur:

- `sv_leads.tier` Spalte: `'free' | 'basic' | 'partner'` (default `'free'`)
- Newsletter-CTA → `/sv-onboarding-basic` Seite → DynamicWizard mit `flow_key='sv-onboarding-basic'`
- Basic-SV signt vereinfachten Vertrag, registriert WhatsApp-Nummer
- Cron pusht Termine an Basic-SVs per WhatsApp (Template-Approval-Workflow)
- Priorität im Matching: Pro/Premium > Basic > Free

→ Separater Plan in `docs/plans/sv-basic-tier.md` (TODO).
