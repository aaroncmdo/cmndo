# Restore-Plan: SV-UI-Regressionen aus dem `8f088031`-Merge

> Begleitdoc zu `glass-merge-regression-audit.md` (Forensik + Bilanz). Hier: der
> konkrete Wiederherstellungs-Plan pro Datei — was genau verloren ging, welche
> Feature-Arbeit *seitdem* auf der gegueteten Version gelandet ist, wie der
> 3-Wege-Merge je Datei aussieht, Reihenfolge, Status.

## Ausgangslage (Kurz)

`8f088031` ("merge: staging in iOS-Glass-Polish") hat Konflikte in ~30 SV-UI-Dateien
zur älteren `staging`-Seite hin aufgelöst → Glass-Polish-/Cinematic-Arbeit
zurückgerollt, kein TS-Fehler, auf `main` (= Production). `HeuteClient.tsx` ist
schon gefixt (PR #835), die Forensik ist PR #836. **Korrektur ggü. dem Audit-Doc:**
es ist *kein* simples „Block zurück-splicen" — auf den gegueteten Versionen ist
seit dem Merge `AAR-864` (SV-Termin-Verlegung / Feldmodus-Auto-Arrive), `#640`
(Fahrzeug-Render), `AvatarUpload` u. a. gelandet → **pro Datei 3-Wege-Merge von
Hand:** aktuelle `main`-Version als Basis, die verlorenen Glass-Polish-Blöcke aus
`8f088031^1` reinholen, mit der neuen Feature-Arbeit reconcilen, Component-Props
gegen den aktuellen Stand verifizieren, `tsc --noEmit` (+ voller `npm run build`
bei Routen, `NODE_OPTIONS=--max-old-space-size=8192`).

Methode pro Datei: `git diff 8f088031^1 origin/main -- <file>` lesen → `-`-Blöcke
= verloren (Feature/Layout, nicht token-Renames), `+`-Blöcke = seitdem dazugekommen
(behalten!). Dann beide vereinen.

## Per-Datei-Plan

### 🟢 0 · `heute/HeuteClient.tsx` — ERLEDIGT (PR #835)
Voller Restore aus `8f088031^1` möglich gewesen (dazwischen nur ein No-op-Commit).
Mapbox-Cockpit + Isochrone + GlassPanel-Sidebar + Pitch-Tween + `PrivatStopAddSheet` zurück.

### 🟠 1 · `fall/[id]/page.tsx` — ZUERST (tractabel)
- **Verloren:** `aktiverTerminVerstrichen`-IIFE (server-side, status='bestaetigt' + start+60min vorbei + durchgefuehrt/sv_angekommen/sv_unterwegs alle NULL) → `verstrichen`-Prop an `FallDetailClient`; `zuletztGesehenIds`/`hatNeueKundeVerlegung` (gutachter_termine als gesehen markieren, kunde-initiierte Verlegung erkennen) → amber-Banner „Termin durch Kunde verschoben"; `claimNoShow`-Query (claims.kunde_no_show_count) → rose-Banner „Termin(e) verpasst"; `geforderteGesamtsumme`+`geforderterGrundhonorarBetrag`-Props; `claim_id: claimIdForStorage`-Prop am `fall`-Objekt.
- **Seitdem dazu (behalten):** `VorOrtTriggerCard`-Import + `vorOrtCard`-Prop an `FallDetailClient` (`zeigeVorOrt ? <VorOrtTriggerCard …/> : null`); `geforderterBetrag`-Prop (statt der zwei alten Honorar-Props — `FallDetailClient`s aktuelle Prop-Signatur entscheidet, welche Variante gilt).
- **AAR-864 hat diese Datei NICHT angefasst** → kein Auto-Arrive-Konflikt hier.
- **Strategie:** aktuelle `main`-`page.tsx` als Basis. Die drei Banner-Blöcke + `aktiverTerminVerstrichen` + `zuletztGesehenIds`/`hatNeueKundeVerlegung` + `claimNoShow` aus `8f088031^1` reinkopieren. Bei den `FallDetailClient`-Props: `FallDetailClient`s **aktuelle** Prop-Signatur lesen — wenn sie `verstrichen` auf `aktiverTermin` erwartet, durchreichen; wenn sie `geforderterBetrag` (neu) statt `geforderteGesamtsumme`/`geforderterGrundhonorarBetrag` (alt) hat, die neue nehmen; `vorOrtCard` behalten. Imports prüfen (`VorOrtTriggerCard`, ggf. `admin`-Client für die claims-Query).
- **Build:** Route → voller `npm run build`.

### 🟠 2 · `auftraege/AuftragCard.tsx`
- **Verloren:** „Portal-Review SV4"-Layout — Mobile-Header (`<lg`: Name prominent oben + Kunde mit `UserIcon` + Kennzeichen-Badge `border-claimondo-navy/70` + Fahrzeug-Zeile + `font-mono text-[var(--brand-secondary)]`-Auftrag-Nr.); Desktop-Header; das Fahrzeug-Render-Panel mit Gradient-Overlay (`from-black/35 via-black/0 to-black/15`, bottom-zentriert).
- **Seitdem dazu (behalten):** `#640` „Fahrzeug-Render 45°-Winkel + größeres Auto" — `<FahrzeugRenderImage hersteller modell lackfarbe={…as LackfarbeCode} baujahr width={180} />` (das *neue* Render). `dd012921` TS-Fixes.
- **AAR-864 hat diese Datei NICHT angefasst.**
- **Strategie:** aktuelle `main`-Version als Basis (hat das neue 180px-Render). Den SV4-Mobile/Desktop-Header-Block aus `8f088031^1` reinholen; wo `8f088031^1` ein älteres `FahrzeugRenderImage` hatte → das aktuelle 180px-Render behalten, nur ins SV4-Layout einbetten. `LackfarbeCode`-Import prüfen.
- **Build:** Client-Component → `tsc --noEmit` reicht; trotzdem `npm run build` zur Sicherheit (AuftragCard wird in `auftraege/page.tsx` + evtl. anderswo gerendert).

### 🟠 3 · `profil/ProfilClient.tsx`
- **Verloren:** responsives Field-Layout (`flex-col sm:flex-row`, `sm:w-36 sm:shrink-0`, `sm:pt-2`); Anschrift-Row + Profiltext-Row (mehrzeilig); `FieldRow`-Variante mit `ROW_WRAPPER_CLS`/`ROW_LABEL_CLS`-Konstanten; die Edit-Buttons in der Row.
- **Seitdem dazu (behalten):** `AvatarUpload` (`currentUrl={profile.avatar_url}`) im Header; eine simplere Nicht-responsive Field-Liste mit `<FieldRow label=… value=… />`.
- **AAR-864 hat diese Datei NICHT angefasst** (`adc49a23 jsx-fix` / `693f97f8 ts-cleanup` ggf. minimal).
- **Strategie:** aktuelle `main`-Version als Basis (hat `AvatarUpload`). Das responsive Layout + die Anschrift/Profiltext-Rows aus `8f088031^1` zurückholen; `FieldRow` auf die responsive Variante umstellen. Achtung: `8f088031^1`s `FieldRow` evtl. mit anderer Prop-Signatur als mains — vereinheitlichen.
- **Build:** Client-Component → `tsc --noEmit`.

### 🔴 4 · `feldmodus/AktuellerStopCard.tsx` + `feldmodus/FeldmodusClient.tsx` — CLUSTER, eigene Session
- **Verloren (`AktuellerStopCard`):** die C9-Glass-Version der „aktueller Stop"-Card — expandierbar (Kennzeichen `font-mono`, Pflichtdoku-Liste mit `•`-Bullets, Kurz-Briefing-Accordion mit `Chevron`-Toggle, Amber-Warnungen `border-amber-200 bg-amber-50` mit `AlertTriangleIcon`), `bg` der Card transparent damit der Glass-Effekt vom umschließenden `GlassPanel` durchkommt (C9-Kommentar erklärt es). Teil von #617.
- **Verloren (`FeldmodusClient`):** `feldmodusTerminChannelSuffix = useId()` (Supabase-Realtime-Channel-ID — **ohne den kracht's bei Multi-Render**, siehe AGENTS/Memory), das Glass-Card-Overlay über der Map (`GlassPanel` mit `SvFallakteView` + `FokusHeader`, `navy/30 backdrop-blur-sm`-Layer).
- **Seitdem dazu (behalten — das ist der Knackpunkt):** `AAR-864` hat `AktuellerStopCard` *neu geschrieben* (253 Z. Δ) → die **Auto-Arrive-Architektur**: keine manuellen „Losfahren"/„Ich bin angekommen"-Buttons mehr, Ankunft via Geofence (100m + Kunde-Status) / Fallback Termin-Uhrzeit; neue Props `svInGeofence` / `permissionState` / `onArrived(lat,lng,via)`; `BriefingStrukturSections`-Import raus; Actions `markSvVorOrt`/`markBesichtigungGestartet`/`completeAndAdvance` statt `startStop`/`markArrived`/`completeAndAdvance`. `FeldmodusClient` hat die Geofence→`onArrived`-Verkabelung dazu (`arrivedFiredRef`, `setSvInGeofence`, …).
- **Strategie:** das ist **kein Restore, sondern Reimplementierung** — das C9-Glass-Styling/Layout (transparente Card, expandierbare Sections, Pflichtdoku-Liste, Briefing-Accordion, Amber-Warnungen, `GlassPanel`-Durchscheinen) auf der *aktuellen* Auto-Arrive-`AktuellerStopCard` neu aufbauen. `FeldmodusClient`: `useId()`-Channel-Suffix wieder rein (kleiner, isolierter Fix — ggf. **vorab als eigener Mini-PR**, weil Realtime-Crash-relevant) + das Glass-Card-Overlay über der Map wieder einbauen (mit `SvFallakteView` wie es heute heißt). Diff `8f088031^1 origin/main -- <file>` als Referenz für Styling-Details, nicht für Code-Übernahme. Build: `feldmodus/page.tsx` Route → voller Build.
- **Reihenfolge im Cluster:** (4a) `FeldmodusClient` `useId()`-Fix isoliert (schnell, hohe Prio — Realtime). (4b) C9-Reimplementierung `AktuellerStopCard` + Glass-Overlay in `FeldmodusClient`.

### 🔴 5 · `kalender/SVKalenderClient.tsx`
- **Verloren:** GCal-connected-Header-Badge (`<StatusBadge tone="success">Google Calendar verbunden</StatusBadge>` + Google-Logo-SVG, responsive sm/mobile-Varianten), Wochen-Navigation („← Zurück" / „Heute" / „Weiter →"), „Gebucht"-Labels in den Slots.
- **Seitdem dazu:** `AAR-864` hat 184 Z. geändert (Verlegungs-bezogene Kalender-Änderungen) → 3-Wege.
- **Strategie:** aktuelle `main`-Version als Basis. Header (GCal-Badge + Wochen-Nav) aus `8f088031^1` zurückholen, ohne AAR-864s Verlegungs-Logik zu zerstören. `StatusBadge`-Import prüfen (heißt heute evtl. `shared/StatusBadge`).
- **Build:** Client-Component → `tsc --noEmit`.

### 6 · Nicht-`gutachter`-Sweep — entwirrt (12.05.2026)

**Befund:** Die „Netto-Löschung ggü. glass-polish-tip"-Heuristik vermischte zwei Dinge — (a) `8f088031` hat glass-polish-Arbeit verloren [Regression], (b) der parallele Konsolidierungs-CC ersetzt gerade absichtlich Inline-Code durch Shared-Abstraktionen [Refactor, gut: `ProvisionenClient`→`lib/statusLabels.ts` #846, `ui/table`→`shared/DataTable` #847/#849, `MaklerShell`→`PortalNav`, `MaklerAkteDetail`→`shared/fall-*` #838]. → `components/makler/*`, `admin/finance/(hub)/*`, `admin/_components/*Widget.tsx`, `dispatch/leads/_components/LeadsViewToggle.tsx` = **dem anderen CC überlassen**, nicht anfassen.

**Echte `8f088031`-Regressionen außerhalb `gutachter/*` — und ob restaurierbar:**

| Datei | Befund | Status |
|---|---|---|
| `lib/dispatch/findBestSV.ts` | 🔴 **echte Regression — GEFIXT.** Git-Historie belegt: `40486fb4` (#449 „ETA-aware Matching — Mapbox-Score + Adjacent-Reachability") + `3a93881b` (#451 „Slot-Vorschläge ETA-aware") + `63ed19fd` (#562 „pro-SV Wochentag-Blocking") waren auf `main`, der `8f088031`-Merge (= „staging in iOS-Glass-Polish") hat den `findBestSV.ts`-Konflikt zur älteren `staging`-Seite (ohne diese 3 PRs) aufgelöst → ~232 Z. Dispatch-Matching-Intelligenz verloren; seither läuft Prod auf einem Stopgap (`bueroEtaMap = new Map()` leer → Fallback auf rohen `distanzKm` statt Mapbox-ETA; der Stopgap-Kommentar nennt es selbst „im Polish-Sweep verloren"). `reachability.ts` (`precomputeSvSlotEtas`/`isSlotReachable`) + `matrix.ts` (`mapboxEtaMatrix`) existieren noch. → die glass-polish-Version (602 Z., strikter Superset: ETA + #562 `blockierte_wochentage` + #234/#233 next-free-slot/private-cal + der richtige `findNextFreeSlotForSv`) wiederhergestellt, Stopgap raus. `npm run build` grün. **(PR folgt)** |
| `app/kunde/faelle/[id]/page.tsx` | ⚪ **keine simple Regression — nicht anfassen.** Der Merge hat sie gegutet (`8f088031^1→8f088031` = `+124 −645`), aber danach hat **CMM-28** (`869c437f`-Sammel-Commit) sie *absichtlich* neu geschrieben (komplett auf claim-Loader `getKundeFallDetailRecord` umgestellt, bewusste Cleanups: `EskalationsErgebnisCard`/`FaqBotCard`/`ReFrageKanzleiClient`/`SaeuleMeinAnwalt`/`KanzleiAnsprechpartnerBlock`-Render raus → „Meine Kanzlei"-Card). Ein Restore würde CMM-28 (Architektur-Migration der CMM-Claim-as-SSoT-Strecke) zurückrollen. → **kein mechanischer Restore.** |
| **Verwaiste Kunden-Cards** (`KundeAusfallEntschaedigungCard`, `KanzleiPfadCard`, `KundeBetreuerStrip`, `KundeAbschlussCard`, `GoogleReviewPrompt`, `BelegUploadCard` — existieren in `src/components/kunde/`, 0 Importe) | ⚪ **CMM-28-Follow-up-Frage:** hat CMM-28 sie bewusst weggelassen oder übersehen? → **Linear-Ticket** „CMM-28 Follow-up: verwaiste Kunden-Cards — wieder einbinden oder löschen?" |
| `app/faelle/[id]/page.tsx` (Admin/KB-Fallakte) | ⚪ **nicht anfassen** — auch von `869c437f` (CMM-28-Sammel-Commit, der explizit „Admin-Fallakte Features (QC-Modal, OCR)" erwähnt) stark berührt → verzahnt mit deliberatem Refactor. → eigenes spec-bewusstes Ticket. |
| `app/flow/[token]/FlowWizardKfz.tsx` (−163) | ⚪ **deprecated** — nicht restaurieren. |

**Fazit #6:** anders als #1–#5 (SV-UI, sauber weil nichts Deliberates obendrauf) — die Nicht-SV-UI-Dateien sind durchweg mit CMM-28/AAR-864-Refactors verzahnt → kein mechanischer Restore, gehören in eigene spec-bewusste Tickets. **Einzige saubere Restore-Möglichkeit war `findBestSV.ts`** (weil `869c437f`/CMM-28 die ETA-Logik dort *nicht* angefasst hat — die war rein durch den Merge verloren).

## Ausführungs-Reihenfolge & Status

- [x] **0** — `heute/HeuteClient.tsx` (PR #835)
- [x] **1** — `fall/[id]/page.tsx` — Warnbanner (rot „Termin verstrichen" + amber „Kunde verschoben" + rose „No-Show") + `aktiverTerminVerstrichen` + `zuletztGesehenIds` + `no_show_count` (aus `faelle`, nicht `claims` — Spalte ist umgezogen) zurück in `topServerBlocks`; `VorOrtTriggerCard`/`geforderterBetrag` (CMM-32) behalten. **(PR folgt)**
- [x] **2** — `auftraege/AuftragCard.tsx` — **Befund korrigiert:** der „SV4-Header" wurde *nicht* durch den Merge verloren, sondern bewusst durch **CMM-32** ersetzt (Kennzeichen prominent + Kunde, Fall-Nr klein) — ein Restore würde CMM-32 zurückrollen. Die *echte* Regression war ein **doppelter Header-Block** (Kennzeichen+Fahrzeug+Fall-Nr ein zweites Mal gerendert) = Merge-Artefakt → entfernt. #640-`FahrzeugRenderImage` (`width=180`, `LackfarbeCode`) unverändert. **(PR folgt)**
- [x] **3** — `profil/ProfilClient.tsx` — Field-Rows wieder responsiv (Mobile-Stack: `flex-col sm:flex-row gap-1 sm:gap-2`, Label `sm:w-36 sm:shrink-0` statt `w-36 shrink-0`) — der Merge hatte die `ROW_WRAPPER_CLS`/`ROW_LABEL_CLS`-Konstanten + den SV7-Kommentar behalten, aber die `EditRow`/`ControlledRow`/`SelectRow`/`FieldRow`-Bodies + die View-Rows (E-Mail/Anschrift/Profiltext) + den Avatar-Header auf die nicht-responsive Inline-Variante zurückgerollt. Konstanten jetzt benutzt; `AvatarUpload` + alle aktuellen Felder unverändert. **(PR folgt)**
- [x] **4a** — `feldmodus/FeldmodusClient.tsx` — `useId()`-Channel-Suffix wieder rein: `.channel(\`feldmodus-termin-${terminId}-${feldmodusTerminChannelSuffix}\`)` + Dependency. Verhindert den Crash bei Doppel-Mount des Consumers (`useId` war schon importiert, aber der Suffix war beim Merge rausgeflogen). **(PR folgt)**
- [x] **4a+** — `feldmodus/AktuellerStopCard.tsx` — derselbe Channel-ID-Bug wie #4a, in *dieser* Datei nochmal: `channelSuffix = useId()` war da + in den useEffect-Deps + im Kommentar, aber **nicht im Channel-Namen** (`sv-termin-state-${terminId}` statt `…-${channelSuffix}`) → Suffix appliziert. **(PR folgt)**
- [x] **4b** — `feldmodus/AktuellerStopCard.tsx` C9-Restore: Card-bg transparent (`bg-white shadow-sm` raus → der GlassPanel-Wrapper liefert das Frosted-Glass); Smart-Collapse-Compact-Variante verdrahtet (`isCompact` aus `autoCompact` [≥500 m / null] + `manualMode`-Override, eigener kompakter Render mit Expand-Tap); Vorschäden-Amber-Box (`hat_vorschaeden`/`vorschaden_anzahl`/`_letzter_datum`); „Einzusammeln vor Ort"-Pflichtdoku-Liste (`einzusammelnde_dokumente`); Auftrag-Typ-Badge (`auftrag_typ ≠ erstgutachten`); Briefing als Disclosure-Toggle (default collapsed) statt Plain-Text; Maps-Link `min-h-12`. Alle Daten waren schon in `FeldmodusStop` — kein Wiring nötig. **(PR folgt)**
- [ ] **4c** *(optional)* — `feldmodus/FeldmodusClient.tsx` arrived-State: `SvFallakteView` als zentrierter Modal-Popover über `bg-claimondo-navy/30 backdrop-blur-sm`-Backdrop (Aaron-Smoke MAP3) statt im 380px-Sidebar-Slot. Braucht ein Layout-Restructure + Check ob `SvFallakteView` noch `onBackToRoute`/`handleBackToRoute` kennt — der aktuelle Sidebar-Render ist evtl. ein Pre-C9-Layout, evtl. aber auch eine neuere bewusste Entscheidung. Erst klären.
- [x] **5** — `kalender/SVKalenderClient.tsx` — **Befund:** GCal-Badge + Wochen-Nav waren *nicht* weg, aber der Header-Bar hatte beim Merge die **responsive Variante** verloren (Mobile-Stack `flex-col gap-2 sm:flex-row`; kompakter GCal-Indikator `sm:hidden` [„Verbunden" bzw. 36px-Google-Logo-Button] vs. langer `hidden sm:block`; Wochen-Buttons `px-2.5 sm:px-3` + `← <span className="hidden sm:inline">Zurück</span>` — vorher alles in einem `flex items-center justify-between`, auf 390px überfüllt). Responsive Header zurück; AAR-864s Verlegungs-Logik unberührt. *(„Gebucht"-Labels auf externen GCal/CalDAV-Terminen separat — cosmetic, braucht Daten-Check.)* **(PR folgt)**
- [x] **6** — Nicht-`gutachter`-Sweep entwirrt (s. §6): `lib/dispatch/findBestSV.ts` 🔴 echte Merge-Regression (ETA-aware Matching #449/#451/#562 vom `8f088031`-Merge verloren, Prod auf Stopgap) → glass-polish-Version restauriert **(PR folgt)**. `kunde/faelle/[id]/page.tsx` + `faelle/[id]/page.tsx` = CMM-28-verzahnt → kein Restore, eigene Tickets. Verwaiste Kunden-Cards = CMM-28-Follow-up-Ticket. `makler/*`/`admin/finance`/`*Widget` = Konsolidierungs-CC (nicht anfassen).

Jeder Punkt = eigener PR off `origin/main`, Merge auf Aaron-OK. Koordination mit dem parallelen Konsolidierungs-CC: der fasst `gutachter/{heute,feldmodus,fall,auftraege,profil,kalender}/*` in keinem Plan an → kein Overlap.

## Lehre (für künftige Merges)

`staging` (zurückliegend) in einen Feature-Sprint-Branch (vorausliegend) zu mergen ist gefährlich — die Default-Konfliktauflösung rollt Feature-Arbeit zurück, ohne TS-Fehler. Künftig: `git merge -X ours <staging>` als Start + datei-weise Konflikt-Review, **oder** gar nicht `staging → feature`, sondern strikt `feature → main` und danach `main → staging`. Und: nach jedem großen Merge die Diff-Stats gegen den Pre-Merge-Branch-Tip prüfen (`git diff --numstat <branch-tip> <merge>` — große Netto-Löschungen in UI-Dateien sind ein Alarmsignal).
