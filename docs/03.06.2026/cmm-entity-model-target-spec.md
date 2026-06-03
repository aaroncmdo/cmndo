# Entity-Model Target Spec — Personen & Fahrzeuge als globale Entitäten

**Stand 2026-06-03. Status: DRAFT zur Entscheidung (Aaron).**
Capstone-Spec der Datenmodell-Konsolidierung. Hält das Ziel-Entitätsmodell fest + die **finalen Heimaten** jeder flachen Personen-/Fahrzeug-Spalte, damit jeder Reader/Writer **genau einmal** auf seine Endheimat verdrahtet wird (kein flat→claims→Entität-„nochmal").

## Prinzip (Aaron 2026-06-03)
> „Alles was eine semantische Dopplung ist muss raus. Der Claim ist SSoT/Rückgrat; einzelne **Entitäten** (Personen, Fahrzeuge, künftig Werkstätten/Mietwägen). Der Schädiger kann morgen unser Kunde sein → Entitäten müssen **wiederverwendbar** sein. Wenn wir eh umverteilen, gleich **einmal richtig** verdrahten."

Daraus zwei Leitsätze:
1. **Eine Entität, eine Zeile, claim-übergreifend wiederverwendbar.** Person = globaler User (`profiles`) + pro-Claim-Partei-Zeile (`claim_parties`). Fahrzeug = globale `vehicles`-Zeile + pro-Claim-Involvement (`claim_vehicle_involvements`).
2. **One-Pass-Wiring.** Jeder Consumer wird auf die **finale** Heimat umgestellt, nie auf eine Zwischenheimat.

---

## 1 · Ist-Zustand (Schema da, aber Skelett)

Die Ziel-Tabellen **existieren bereits** — sie sind nur fast leer; die Daten leben flach.

| Tabelle | Zweck | Spalten (relevant) | Befüllung heute |
|---|---|---|---|
| `claim_parties` | Personen pro Claim | `rolle`, `user_id`, `ist_halter/ist_fahrer/ist_fahrzeuginsasse/ist_gewerbe`, `beziehung_zum_halter`, `vehicle_id`, `vorname/nachname/email/telefon/adresse_*`, `versicherung_*`, `kennzeichen*` | **nur `geschaedigter` (73)**, alle ist_halter+ist_fahrer, 70 mit user_id; **0 gegner** |
| `vehicles` | Fahrzeug-Entität (global) | `fin` (Identität), `hersteller/modell_haupttyp/baujahr_monat/...`, `kennzeichen_aktuell`+Parts, `current_owner_id`, `cardentity_report` | **1 Row** |
| `claim_vehicle_involvements` | Link Claim↔Fahrzeug **mit Rolle** | `claim_id, vehicle_id, **rolle**, beschaedigung_grad, reihenfolge, notiz` | **1 Row** |
| `claims` | Rückgrat | `geschaedigter_user_id` (Pointer), `vehicle_id` (primäres Fahrzeug) | geschaedigter 75/75 (nach CMM-63-Reconcile); vehicle_id nur 1 |

Flache Daten, die in diese Entitäten gehören (heute auf `faelle`/`claims`):
`kunde_*`, `halter_*` (inkl. `claims.halter_*` aus #2315), `gegner_name/_versicherung/_kennzeichen/_fahrzeugtyp/_anzahl_beteiligte`, `fahrzeug_hersteller/modell/typ/baujahr/farbe/aufbau`, `kennzeichen*`, `hsn/tsn/fin_vin/erstzulassung/kilometerstand/lackfarbe_code`, `kanzlei_ansprechpartner_*`.

---

## 2 · Ziel-Modell

```
profiles (globaler User)  ◄── user_id ── claim_parties (Partei pro Claim: rolle + Flags)
                                              │ claim_id
                                              ▼
                                           claims (Rückgrat; geschaedigter_user_id = Schnell-Pointer)
                                              │ claim_id
                                              ▼
claim_vehicle_involvements (rolle: geschaedigter|gegner) ── vehicle_id ──► vehicles (global, Identität = FIN)
```

- **Person** = `profiles`-User (global, wiederverwendbar) **+** `claim_parties`-Zeile pro Claim (trägt die Rolle im konkreten Fall). Schädiger heute = `gegner`-Partei in Claim A; wird er Kunde = `geschaedigter`-Partei in Claim B — **dieselbe `user_id`**.
- **Fahrzeug** = eine `vehicles`-Zeile (Identität via `FIN`), claim-übergreifend. Pro Claim ein `claim_vehicle_involvements`-Row mit `rolle` (`geschaedigter`/`gegner`) — „die Dependenz als Gegner-Fahrzeug".
- **Rolle vs. Facette:** `claim_parties.rolle` = primäre Klassifikation (`geschaedigter`/`gegner`/…); `ist_halter`/`ist_fahrer`/`ist_fahrzeuginsasse`/`ist_gewerbe` = Facetten. Eine Person kann geschädigter **und** halter **und** fahrer sein (= eine Zeile, Flags gesetzt). Halter ≠ Geschädigter (Leasing/Firmenwagen) = `ist_halter=false` + separate Halter-Repräsentation (s. Offene Frage D).
- **`claims` behält nur denormalisierte Schnell-Pointer** (`geschaedigter_user_id`, `vehicle_id`) — bewusste Denormalisierung aus den Entitäten, **kein** Dupe-Wildwuchs.

---

## 3 · Finale Heimaten (One-Pass-Zielzuordnung)

| Flache Quelle (heute) | Finale Heimat | Art |
|---|---|---|
| `faelle.kunde_id` / `claims.geschaedigter_user_id` | **`claims.geschaedigter_user_id`** (1 Spalte) → Partei via `claim_parties[geschaedigter]` | Repoint + Drop flat |
| `faelle.halter_*` / `claims.halter_*` (#2315) | `claim_parties` (`ist_halter=true`-Partei) | Drop flat (Dupe) |
| `faelle.kunde_*` (vorname/nachname/adresse/telefon) | `claim_parties[geschaedigter]` | Drop flat (Dupe) |
| `faelle.gegner_name/_versicherung/_versicherungsnummer/_aktenzeichen` | **`claim_parties` `rolle='gegner'`** | **Neu-Normalisierung** (0 Parteien heute) |
| `faelle.gegner_kennzeichen/_fahrzeugtyp` | **`vehicles`** + `claim_vehicle_involvements.rolle='gegner'` | **Neu-Normalisierung** |
| `faelle.fahrzeug_*`/`kennzeichen*`/`hsn/tsn/fin_vin/erstzulassung/kilometerstand/lackfarbe_code` | `vehicles` + `involvement.rolle='geschaedigter'` | Repoint (vehicles existiert) |
| `claims.kanzlei_ansprechpartner_*` | **offen** (s. Frage C) | Entscheidung |
| `faelle.gegner_anzahl_beteiligte` | `claims` (Claim-Metadatum) oder ableitbar aus Parteien-Count | Entscheidung |

---

## 4 · Offene Design-Entscheidungen (VOR dem Wiring zu klären — sonst „nochmal")

**A · Fahrzeug-Identität / Dedup-Key.** Wann ist ein Fahrzeug „dasselbe" über Claims? → **`FIN`** (Kennzeichen ändert sich, FIN nicht; `upsert_vehicle_by_fin`-RPC existiert schon). Ohne FIN (Gegner-Auto ggf. nur Kennzeichen) → neue `vehicles`-Zeile ohne FIN, spätere Merge-Logik. **Vorschlag: FIN = Identität; FIN-los = eigene Zeile, Reuse erst wenn FIN bekannt.**

**B · Personen-Dedup-Key.** Wann ist eine Person „dieselbe"? → **`user_id`** (Account). Ohne Account (Gegner nur Name) → per-Claim-`claim_parties`-Zeile, `user_id=null`; Wiedererkennung erst, wenn die Person einen Account bekommt (Airdrop/Selbst-Onboarding). **Vorschlag: Dedup nur via user_id; Pre-Account-Parteien sind per-Claim, kein Namens-Matching.**

**C · Ansprechpartner.** Meinst du den **Kanzlei-Ansprechpartner** (Anwaltskontakt → bleibt Attribut auf `kanzlei_faelle`/`claims`) oder einen **fall-bezogenen Ansprechpartner-als-Person** (der zum Halter/Geschädigten werden kann → `claim_parties` mit Rolle/Flag)? **→ deine Entscheidung.** (Dein Halter-Hinweis deutet auf Person→`claim_parties`.)

**D · Halter ≠ Geschädigter (Leasing/Firmenwagen).** Heute 73/73 `ist_halter=true` auf der geschaedigter-Partei. Bei abweichendem Halter: (i) `ist_halter=false` auf geschaedigter + **separate Halter-Partei** (`rolle='halter'`? oder Partei mit `ist_halter=true`+`beziehung_zum_halter`), oder (ii) Halter als Org/Firma (`ist_gewerbe`). **Vorschlag: separate `claim_parties`-Zeile mit `ist_halter=true` + `beziehung_zum_halter`; `rolle` bleibt feingranular (geschaedigter/gegner), Halter ist Facette.**

**E · Reuse-Tiefe jetzt vs. später.** 1-Pass verdrahtet auf die **Entitäts-Zeilen** (gegner-Partei, vehicles, involvement). Die **claim-übergreifende Wiedererkennung** (gleicher user_id/FIN → gleiche Entität) ist eine **Logik-Schicht obendrauf**, die die Zeilen nicht neu anfasst → kann Folge-Phase sein, ohne „nochmal".

---

## 5 · One-Pass-Konsequenz + Phasen (koordiniert)

**Was 1-Pass bedeutet:** jeder gegner-/fahrzeug-/personen-Writer + -Reader wird **direkt** auf die Entitäts-Heimat umgestellt — nicht erst auf `claims`-Flach.

**Reihenfolge (jede Phase = eigener PR, Preview-grün, koordiniert mit aktiven Sessions):**
1. **Modell festziehen** (Frage A–E entschieden) + ggf. `claim_parties.rolle`-CHECK um `'gegner'` (und ggf. `'halter'`) erweitern; `claim_vehicle_involvements.rolle`-Domain bestätigen.
2. **Writer-Umbau (KOORDINIERT mit aar-939!):** Konversion/Embed (`convert-lead-to-claim`, gegner-Erfassung, Fahrzeug-Erfassung) schreiben **Entitäten** statt flach: geschaedigter+gegner-Parteien, `vehicles` (FIN-Upsert), `involvements` mit rolle. **Backfill** der bestehenden flachen Daten in die Entitäten.
3. **Reader-Repoint:** gegner/fahrzeug/personen-Reader → Entitäten/Views. Views (`v_claim_full` etc.) exposen Parteien/Fahrzeuge als jsonb_agg (Muster existiert: `parties`, `vehicle_involvements`).
4. **Flat-Drop:** `gegner_*`, `fahrzeug_*`, `halter_*`, `kunde_*` von `faelle`/`claims` droppen — **mit Pre-Drop-Consumer-Verifikation** ([[feedback_drop_verification_grep]]) + Post-Drop-Smoke.

**Verhältnis zum faelle-Drop:** Phasen 2–4 für gegner/fahrzeug/person **lösen zugleich** die entsprechenden faelle-Spalten-Heimaten → der faelle-Drop profitiert direkt. ABER: der faelle-Drop hat weitere Blocker (FK/Views/Policies/Bridge, s. `cmm49-faelle-column-dedup-decision.md` + Drop-Playbook) — er ist **nicht allein** durch dieses Modell entsperrt. Beide Strecken laufen koordiniert, nicht verschmolzen.

---

## 6 · Risiken / Caveats
- **Writer im aar-939-Hot-Path** (4 aktive Sessions auf Konversion/Embed) → Phase 2 zwingend koordiniert, nicht autonom. Branch-/File-Kollision real.
- **Post-Incident-Disziplin:** nach dem faelle_kunde/sv_view-Incident (03.06.) gilt: kein autonomer Drop/High-Blast-Radius-Repoint; Entitäts-Phasen als supervised Drafts + Smoke.
- **Daten sind dünn/Test** (75 mostly-smoke) → Backfill ist klein, aber die **Wiring**-Arbeit + Tests sind der eigentliche Aufwand.
- **Scope-Ehrlichkeit:** „einmal richtig" ist mehr Arbeit *jetzt*, spart aber das mehrfache Anfassen — vertretbar, weil Reuse (Schädiger→Kunde) flache Spalten ohnehin disqualifiziert.

---

## 7 · Nächster Schritt
Entscheide **A–E** (oben). Danach Phase 1 (Modell festziehen) als erste Migration; Phase 2 (Writer) koordiniert mit den aar-939-Sessions. Gehört zu [[cmm49-faelle-drop-runway]]; baut auf der Dedup-Decision (`cmm49-faelle-column-dedup-decision.md`).
