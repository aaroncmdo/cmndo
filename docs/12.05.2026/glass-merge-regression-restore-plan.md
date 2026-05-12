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

### ⚪ 6 · Nicht-`gutachter`-Sweep — separates Ticket, niedrige Prio
Die ~20 Konflikt-Dateien aus der Schnittmenge außerhalb `app/gutachter/*` (`app/dispatch/leads/[id]/_phases/*` + `DispatchShell.tsx`, `app/admin/_components/*Widget.tsx`, `lib/claims/lifecycle.ts`, `lib/dispatch/findBestSV.ts -240`, `lib/leads/convert-lead-to-claim.ts -375`, `lib/kalender/caldav/client.ts -281`, `lib/google-calendar/busy-slots.ts`, …) — pro Datei `git diff 8f088031^1 origin/main -- <file>` durchgehen, prüfen ob die großen `lib/*`-Netto-Löschungen Regressionen oder legitime staging-Refactors sind. Eigenes Ticket.

## Ausführungs-Reihenfolge & Status

- [x] **0** — `heute/HeuteClient.tsx` (PR #835)
- [x] **1** — `fall/[id]/page.tsx` — Warnbanner (rot „Termin verstrichen" + amber „Kunde verschoben" + rose „No-Show") + `aktiverTerminVerstrichen` + `zuletztGesehenIds` + `no_show_count` (aus `faelle`, nicht `claims` — Spalte ist umgezogen) zurück in `topServerBlocks`; `VorOrtTriggerCard`/`geforderterBetrag` (CMM-32) behalten. **(PR folgt)**
- [x] **2** — `auftraege/AuftragCard.tsx` — **Befund korrigiert:** der „SV4-Header" wurde *nicht* durch den Merge verloren, sondern bewusst durch **CMM-32** ersetzt (Kennzeichen prominent + Kunde, Fall-Nr klein) — ein Restore würde CMM-32 zurückrollen. Die *echte* Regression war ein **doppelter Header-Block** (Kennzeichen+Fahrzeug+Fall-Nr ein zweites Mal gerendert) = Merge-Artefakt → entfernt. #640-`FahrzeugRenderImage` (`width=180`, `LackfarbeCode`) unverändert. **(PR folgt)**
- [ ] **3** — `profil/ProfilClient.tsx` (responsive Felder + Anschrift/Profiltext; `AvatarUpload` behalten) ← *als nächstes*
- [ ] **4a** — `feldmodus/FeldmodusClient.tsx` `useId()`-Channel-Fix isoliert (Realtime-Crash)
- [ ] **4b** — `feldmodus/AktuellerStopCard.tsx` C9-Reimplementierung + Glass-Overlay in `FeldmodusClient` (eigene Session)
- [ ] **5** — `kalender/SVKalenderClient.tsx` (GCal-Badge + Wochen-Nav)
- [ ] **6** — Nicht-`gutachter`-Sweep (separates Ticket)

Jeder Punkt = eigener PR off `origin/main`, Merge auf Aaron-OK. Koordination mit dem parallelen Konsolidierungs-CC: der fasst `gutachter/{heute,feldmodus,fall,auftraege,profil,kalender}/*` in keinem Plan an → kein Overlap.

## Lehre (für künftige Merges)

`staging` (zurückliegend) in einen Feature-Sprint-Branch (vorausliegend) zu mergen ist gefährlich — die Default-Konfliktauflösung rollt Feature-Arbeit zurück, ohne TS-Fehler. Künftig: `git merge -X ours <staging>` als Start + datei-weise Konflikt-Review, **oder** gar nicht `staging → feature`, sondern strikt `feature → main` und danach `main → staging`. Und: nach jedem großen Merge die Diff-Stats gegen den Pre-Merge-Branch-Tip prüfen (`git diff --numstat <branch-tip> <merge>` — große Netto-Löschungen in UI-Dateien sind ein Alarmsignal).
