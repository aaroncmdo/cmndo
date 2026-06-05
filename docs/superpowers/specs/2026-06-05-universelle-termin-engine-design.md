# Universelle Termin-Engine — Design-Spec

**Datum:** 2026-06-05 · **Strecke:** `kitta/termine-engine-universal` · **Modus:** brainstorming → writing-plans (ein Plan pro Rollout-Phase) · **Rollout:** shadow-diff-first

> **Für agentische Worker:** Nach Spec-Approval → `superpowers:writing-plans`. Jede Risiko-Flip wird shadow-verifiziert (beide Pfade parallel, Diff beweisen) bevor ein Consumer umgeschaltet wird.

---

## Goal

EINE Termin-Engine für **alle Assignee-Typen** (Sachverständiger Tier-1, `sv_lead` Tier-3, Kundenbetreuer, Kanzlei) × **alle Use-Cases** (Dispatch-Auto-Match, Self-Service „egal wer", SV-Embed mit fixem SV, KB-Booking, Re-Termin, Spontan). Ein dünner Eingang routet die **2×2-Matrix** (Assignee bekannt/unbekannt × Slot bekannt/unbekannt). Der **Kunde** sieht max **3 verteilte Slots** (2 beim Best-Match + 1 beim Zweitbesten); **Dispatch** sieht die gerankte Kandidatenliste. Reachability korrekt über echte Mapbox-ETA (kein pauschaler 60-Blanket mehr). Rollout shadow-diff-first → **0 Blind-Regression** auf Live-Dispatch + aar-956-Funnel.

**Architektur in einem Satz:** Die Engine-Primitiven (`freieSlots` / `reserviere` / `bestaetige` / `findeBestePerson`) sind assignee-generisch; ein dünner Router `planeTermin` setzt sie zur 2×2-Buchung zusammen; jeder Consumer drückt nur aus *was er weiß*.

## Status quo (was schon steht — nicht neu bauen)

- `findeBestePerson` (`engine/matching.ts`): SV-Matching + Slot-Wahl + `reserviere`, **P2.4-partiell** (nur `assigneeTyp='sachverstaendiger'`); `nurVorschlag`-Modus existiert.
- `freieSlots` (`engine/slots.ts`): assignee-generisch, mit Reachability-Hook (`@/lib/dispatch/reachability`).
- `reserviere` / `bestaetige` / `sageAb` / `verlege` / `entscheideVerlegung`: assignee-generisch, **verdrahtet + deployed** (Phase-3).
- `matching-score.ts`: Score-Formel + Tenure-Tie-Break + Geometrie — **eine Quelle** (Mirror von `findBestSV`).
- `reachability.ts`: echte Mapbox-ETA zwischen Nachbar-Terminen (`precomputeSvSlotEtas`/`isSlotReachable`/`checkSvReachability`).
- `bestaetige`: **Geocoding-Garantie** (resolved+geocodet das Vor-Ort-Ziel beim Bestätigen).

Was fehlt → diese Strecke: Sticky-SV + reiche Felder in `findeBestePerson`, der `planeTermin`-Router + das 3-Slot-Modell, die korrigierte Reachability (40/10/50), das KB-Remote-Profil, der Tier-3-Fallback im Pool, und der shadow-verifizierte Consumer-Repoint.

---

## 1 · Die universelle Buchungs-Matrix (2×2)

| | **Slot unbekannt** | **Slot fix (Wunschzeit)** |
|---|---|---|
| **Assignee unbekannt** | match → 2+1-Slots verteilen → vorschlagen/buchen *(Dispatch, „egal wer")* | match → bester der zur Wunschzeit frei ist → buchen *(SS mit Wunsch)* |
| **Assignee fix** *(SV-Embed, KB)* | dessen freie Slots (max 3) → Kunde pickt → buchen | direkt diesen Slot bei diesem Assignee buchen (race-safe) |

Die Primitiven decken alle 4 Quadranten:
- `findeBestePerson` (nimmt `wunschzeit` optional) → obere Zeile.
- `freieSlots` → unten-links.
- `reserviere` + `pruefeBelegungStrict` → unten-rechts (race-safe via Exclusion-Constraint).

Heute ist dieses Routing **verstreut + dupliziert** (`match-and-slots` `fixerSvId`, Dispatch `sv-termin`, `kb-booking`, SV-Embed-Funnel je eigen). Der Router entdoppelt das.

## 2 · `planeTermin` — der universelle Eingang (Kunde-/Self-Service-/SV-Embed-/KB-Gesicht)

```ts
planeTermin(input: {
  bezug: { typ: BezugTyp; id: string }          // claim/fall/lead
  quelle: Quelle                                  // 'self_service' | 'dispatch' | 'manuell'
  assigneeTyp: 'sachverstaendiger' | 'kundenbetreuer'
  assignee?: Assignee | null                      // gesetzt = FIX; null = MATCH
  schadenort?: { lat: number; lng: number } | null// SV-Reachability; null → geocode-Versuch → sonst 50-Fallback
  wunschzeit?: WunschzeitFilter | null            // flexibler Filter (s. §3)
  modus: 'vorschlagen' | 'buchen'
  kanal?: 'vor_ort' | 'video' | 'telefon'         // KB → 'video'|'telefon' (remote, keine Reachability)
  // Match-Params (nur wenn assignee == null):
  organisationId?: string | null
  excludeAssigneeIds?: string[]
  stickyAssigneeId?: string | null                // Kontinuität (+Bonus)
  dauerMin?: number                               // default TERMIN_DAUER_MIN (40)
  fensterTage?: number
  db?: SupabaseClient
}): Promise<PlaneTerminResult>

type SlotVorschlag = {
  assignee: Assignee; name: string
  von: string; bis: string                        // ISO (echter UTC-Instant)
  score?: number; etaVomBueroMin?: number | null; reasons?: string[]
}
type PlaneTerminResult =
  | { ok: true; kind: 'slots'; vorschlaege: SlotVorschlag[] }          // max 3, verteilt (§3)
  | { ok: true; kind: 'gebucht'; terminId: string; assignee: Assignee; von: string; bis: string; reserviertBis: string }
  | { ok: false; code: 'kein_kandidat'|'kein_slot'|'belegt'|'kein_ziel'|'db'|'nicht_unterstuetzt'; error: string }
```

**Routing:**
- `modus:'buchen'` + `assignee` fix + `wunschzeit` konkret → `reserviere` → `kind:'gebucht'` | `code:'belegt'` (Race, §8).
- `modus:'vorschlagen'` + `assignee` fix → `freieSlots(assignee)` → Wunschzeit-Filter → max 3 → `kind:'slots'`.
- `modus:'vorschlagen'` + `assignee == null` → `findeBestePerson` (Match, `nurVorschlag`) → **2+1-Verteilung** (§3) → `kind:'slots'`.
- `modus:'buchen'` + `assignee == null` + `wunschzeit` → `findeBestePerson(wunschzeitIso)` → bester der frei ist → `reserviere` → `kind:'gebucht'`.

`planeTermin` ist die **Kunde-Seite**. Die **Dispatch-Seite** (gerankte Kandidatenliste, Mensch wählt) bleibt `findBestSV` → Thin-Wrapper über `findeBestePerson` (`kind:'kandidaten'`-Daten), siehe §7.

## 3 · Kunde-Slot-Modell — max 3, 2+1 verteilt

Die Engine rankt buchbare Assignees (Score: Paket/Kontingent/ETA + Tenure-Tie-Break, `matching-score.ts`) und füllt dann **greedy 3 Slots, diversifiziert für echte Wahl:**

```
verteile3Slots(rankedKandidaten, wunschzeitFilter, db):
  result = []
  best = rankedKandidaten[0]
  result += freieSlots(best).filter(wunschzeitFilter).take(2)     # bis zu 2 beim Best-Match
  for k in rankedKandidaten[1:]:                                  # je 1 beim Nächstbesten …
    if len(result) >= 3: break
    s = freieSlots(k).filter(wunschzeitFilter).first()
    if s: result += [s]
  if len(result) < 3:                                            # auffüllen (best hatte <2, oder nur 1 Kandidat)
    fülle aus best- dann übrigen Kandidaten bis 3 oder erschöpft
  return result.take(3)
```

**Adaptiv (Aarons Regel):**
- ≥2 SVs buchbar (Default) → **2 Best + 1 Zweitbester** (immer ein Alternativ-Gutachter zur Wahl — harter Default).
- Best-SV hat nur 1 Slot → 1 bei ihm + Rest aus den nächsten.
- Nur 1 SV buchbar → seine 3 frühesten.
- <3 buchbar gesamt → zeig weniger (graceful).

„Buchbar" = frei **und** erreichbar (§4) — außer KB (remote, keine Reachability).

**Wunschzeit = flexibler Filter** („eine Lösung für alles, die filtert"): ein optionales Prädikat über den Slot-Pool — **Tag** und/oder **Zeitfenster** und/oder **Zeitpunkt**.

```ts
type WunschzeitFilter = {
  tag?: string | null              // 'YYYY-MM-DD' oder Wochentag
  vonUhr?: string | null           // 'HH:mm' Tageszeit-Fenster-Start
  bisUhr?: string | null           // 'HH:mm' Tageszeit-Fenster-Ende
  naheZeitpunkt?: string | null    // ISO — wenn gesetzt: sortiere gefilterte Slots nach Nähe
}
```
Ohne Wunschzeit → kein Filter → die **frühesten** Slots. Mit → Pool filtern, bei `naheZeitpunkt` nach Nähe sortieren, dann 2+1 auf der gefilterten Menge.

## 4 · Reachability (Buchbar-Stage) — ETA + 10, kein-Standort = 50

**Ein Governor** ersetzt den pauschalen 60-Blanket. Erforderliche Lücke zu jedem Nachbar-Termin (vorne **und** hinten):

```
benötigteLücke = ETA + REACHABILITY_PUFFER_MIN(10)
  ETA = standort_auflösbar ? echte_Mapbox_ETA : NO_LOCATION_ETA_MIN(50)
```

- **Standort auflösbar** (gespeicherte Coords ODER geocodebar — „können wir ziehen"): echte Mapbox-ETA + 10.
- **Standort NICHT auflösbar:** ETA = **50** (konservativ) + 10 = 60-min-Lücke. **Kein fail-open mehr** bei „kein Standort".
- **Mapbox-API-down** bei *bekanntem* Standort: fail-open (reachable, geloggt) — transienter Ausfall blockt nicht das Geschäft. (Unterschieden von „kein Standort" = strukturell = 50.)

Der alte ±60-Blanket (`TERMIN_PUFFER_MIN`-Fenster in `slots.ts`/`findBestSV.ts`/`onboarding/slots.ts`) **doppelte** die echte ETA und über-blockte (zwei Termine 10 Fahrminuten auseinander → ~2,5 h Kalender). Er wird auf einen **10-min-Floor** reduziert; die echte ETA ist der standort-genaue Governor.

**KB/remote:** `kanal in {video, telefon}` → **keine Reachability** (kein Anfahrtsweg) → nur Verfügbarkeit + Wunschzeit-Filter.

## 5 · Geocoding-Garantie (Gebucht-Stage) — sauber getrennt von §4

| Stage | Mechanismus | Zweck |
|---|---|---|
| **Buchbarer Slot** (Angebot) | ETA-Reachability §4 (echt-oder-50) | welche Slots *angeboten* werden |
| **Gebuchter Slot** (Commit) | Geocoding-Garantie (`bestaetige`) | der echte, geocodete Besichtigungsort des bestätigten Termins |

**Bestätigt durch Aaron:** das sind verschiedene Stages, **keine Kollision**. „Kein Schadenort früh im Funnel" löst sich genau dadurch: beim **Angebot** greift die 50-Fallback (konservativ), beim **Commit** die Geocoding-Garantie (das Ziel MUSS geocoden, sonst kein `bestaetigt` — `code:'kein_ziel'`). Remote-Termine (video/telefon) sind von der Geocoding-Garantie ausgenommen.

## 6 · Assignee-Typen & Pools

- **SV Tier-1** (`sachverstaendige`): primärer Match-Pool. Score + Gebiet (Isochrone/Radius) + Reachability.
- **`sv_lead` Tier-3** (Fallback): wenn **kein** Tier-1-SV im Gebiet → Pool um `sv_leads` (Standard-Verfügbarkeit `getStandardSlots`, kein echter Kalender) erweitern. Im „egal wer"-Fall.
- **Kundenbetreuer (KB):** gleiches 3-Slot/2+1/Wunschzeit-Modell, aber **remote-only** (`video`/`telefon`, kein Vor-Ort) → **keine ETA/Reachability**. Dauer = `KB_BERATUNG_DURATION_MIN`. KB wird **gematcht** wenn keiner zugewiesen ist (2+1 über KBs), sonst 3 Slots des **zugewiesenen** KB (`claims.kundenbetreuer_id`). Nur-online-verfügbar = ok.
- **Kanzlei:** Slots/Buchung über die generischen Ops (kein Auto-Matching; admin-/zugewiesen). YAGNI: `findeBestePerson` bleibt SV/KB; Kanzlei nutzt `freieSlots`/`reserviere` direkt.

## 7 · Zwei Gesichter, eine Quelle

- **Kunde** (Self-Service, SV-Embed, KB-Booking): `planeTermin` → `kind:'slots'` (3 verteilt).
- **Dispatch** (Mensch wählt): `findBestSV` → Thin-Wrapper über `findeBestePerson(nurVorschlag)` → mappt auf `SvMatchCandidate[]` (gerankte Liste, jeder mit Verfügbarkeit/Wunschtermin-Status). Signatur + Rückgabetyp **unverändert** → alle bestehenden Consumer (sv-termin, match-and-slots, findSvsForLocation, flow, verlege-no-show) unberührt.

Beide aus derselben `findeBestePerson`-Rangliste, nur anders formatiert.

## 8 · Refresh & Race

- **Vorschläge sind NICHT geblockt** (kein Soft-Hold). Gibt der Kunde eine Wunschzeit ein → `planeTermin(...)` **stateless neu aufrufen** → neue 3 Slots.
- **Commit:** Kunde pickt → `reserviere` (race-safe via `gutachter_termine_no_assignee_overlap`-Exclusion-Constraint → 23P01). Ist der Slot zwischenzeitlich vergeben → **expliziter `code:'belegt'`** → UI „Slot gerade vergeben, bitte anderen wählen" + neu laden. Kein stilles Schlucken.

## 9 · Konstanten-Änderungen (`lib/dispatch/termin-konstanten.ts`)

| Konstante | Alt | Neu | Bedeutung |
|---|---|---|---|
| `TERMIN_DAUER_MIN` | 45 | **40** | Standard-Besichtigungsdauer |
| `TERMIN_PUFFER_MIN` | 60 | **10** | Fixer Floor/Privat-Event-Fenster (Blanket weg) |
| `ETA_SICHERHEITS_PUFFER_MIN` (reachability.ts + findBestSV.ts) | 5 | **10** | Wrap/Park-Marge auf echte ETA |
| `NO_LOCATION_ETA_MIN` (neu) | — | **50** | ETA-Annahme wenn Standort nicht auflösbar |

## 10 · Komponenten & Files

| File | Änderung |
|---|---|
| `engine/matching.ts` (`findeBestePerson`) | + `stickyAssigneeId`-Bonus, + reiche Felder im Kandidat (paket/kontingentFrei/ablehnungen/verfuegbarAmWunschtermin/naechsterFreierSlot), + Tier-3-Pool-Fallback, + KB-Profil (remote, keine Reachability) |
| `engine/plane-termin.ts` (NEU) | `planeTermin`-Router (2×2) + `verteile3Slots` + `WunschzeitFilter` |
| `engine/matching-score.ts` | evtl. Sticky-Gewicht zentralisieren |
| `lib/dispatch/reachability.ts` | no-loc → 50 statt fail-open; Puffer 5→10; Geocode-Resolve-Hook |
| `lib/dispatch/termin-konstanten.ts` | 40/10/10 + `NO_LOCATION_ETA_MIN` |
| `engine/slots.ts` | `pufferMin` Floor 60→10 (Blanket weg) |
| `lib/dispatch/findBestSV.ts` | → Thin-Wrapper über `findeBestePerson` (nach Shadow-Grün) |
| `lib/termine/shadow-match.ts` (NEU, temporär) | Shadow-Diff-Harness (beide Matcher parallel, Rangliste diffen, loggen) |
| Consumer (Sub-A2/B) | `match-and-slots`/`sv-termin`/`kb-booking`/SV-Embed/`spontan`/`ladeFreieSlots`/`getAvailableKbSlots` → engine |

## 11 · Fehlerbehandlung

- `reserviere`-Race → `code:'belegt'` → User-facing Error + Refresh (§8).
- Reachability **fail-conservative** bei kein-Standort (ETA=50) statt fail-open.
- Mapbox-API-down (bekannter Standort) → **fail-open** + log (transient).
- `bestaetige` ohne geocodebares Ziel → `code:'kein_ziel'`, kein `bestaetigt` (Geocoding-Garantie).
- Engine-Ops = Result-Objekte (`{ ok, code }`), kein `throw` (AGENTS.md).

## 12 · Testing

- **Shadow-Diff-Harness (Sub-A Kern):** `findBestSV` (alt) + `findBestSVviaEngine` (neu, über `findeBestePerson`) parallel auf **Live-Dispatch-Inputs** (echte Leads/Wunschtermine); Rangliste (svId-Reihenfolge, Score, reasons, verfuegbarAmWunschtermin) diffen + loggen. Resultat = der ALTE Pfad (kein Live-Impact). Flip erst wenn Diffs verstanden/null.
- **Unit (Vitest, pure):** `verteile3Slots` (2+1/adaptiv/<3), `WunschzeitFilter`, Reachability (ETA+10 / no-loc=50 / KB-skip), Score+Sticky.
- **Live-Verify (`scripts/verify-engine-*.mts`):** `planeTermin` 2×2-Pfade, Race-`belegt`, Parameter-Fix (neue Slots echt ETA-erreichbar).

## 13 · Rollout-Dekomposition (shadow-first, je eigene PR)

- **Phase 0 — Parameter-Fix** (eigener, *bewusster* Behavior-Change, NICHT in den 0-diff-Shadow): `TERMIN_DAUER` 45→40, `TERMIN_PUFFER` 60→10, Reachability ETA+10/no-loc=50. Live-Verify (neue Slots echt erreichbar) + **Aaron-Sign-off** (mehr buchbare Slots = sichtbarer Prod-Change). Zuerst, damit Alt+Neu im Shadow auf gleichen Parametern vergleichen.
- **Sub-A — `findeBestePerson` SV-Parität + `findBestSV` Thin-Wrapper** (shadow-diff). Schaltet alle 4 SV-Match-Use-Cases (Dispatch/SS/Finder/Re-Termin) via ein Wrapper auf die Engine.
- **Sub-A2 — `planeTermin`-Router + Kunde-3-Slot + Consumer-Repoint** (`match-and-slots`/SV-Embed/`kb-booking`). Shadow pro Consumer. **Koordination mit aar-956** (Funnel-Revier) vor dem Flip.
- **Sub-B — restliche Slot/Booking-Repoints** (`ladeFreieSlots`/`getAvailableKbSlots`/`spontan`/Kanzlei → engine).
- **Sub-C — Sync + Cleanup** (P2.5 `syncTerminToExternalCalendar` verdrahten, `cache-busy`→`v_belegung`, `sv_id`/Normalize-Trigger-Drop).

## 14 · Gated Abhängigkeiten (fremd, nicht mein Unblock)

- **aar-956** (Funnel-Revier): besitzt `flow/*` + `match-and-slots`/`findSvsForLocation` → Sub-A2-Consumer-Flip koordinieren.
- **CMM-49** (`fb34de27`): termine `re_termin_token`-WRITE (Entity-`v_claim_full`-Re-Source), fahrzeug-Reads.
- **CMM-50:** fahrzeug-Cutover.
- **Org-Modell:** `organisationen` ist Quelle; `gebiet_exklusivitaeten`/`rolle_in_organisation` sind DEFERRED (live 0 Daten → YAGNI, Hook bleibt).

---

## Erfolgskriterien

1. Ein Consumer drückt aus *was er weiß* (Assignee?, Slot?, Wunschzeit?) — die Engine macht den Rest (2×2).
2. Kunde sieht max 3 Slots, 2+1 verteilt, Wunschzeit-gefiltert, refresh-bar.
3. Reachability standort-genau (ETA+10), kein-Standort konservativ (50), KB remote ohne Fahrt-Check.
4. Dispatch-Rangliste **bit-identisch** zu heute (shadow-bewiesen) außer dem bewussten Parameter-Fix.
5. Termin-Dauer 40, Puffer 10. Geocoding-Garantie beim Commit unberührt.
6. Eine Quelle: `findBestSV` + `match-and-slots` + `kb-booking` rufen alle die Engine.
