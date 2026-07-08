# Partner-Tier-Badge (Bronze/Silber/Gold) — Design-Spec

**Datum:** 2026-07-08
**Branch:** `kitta/partner-tier-badge`
**Status:** Design (brainstormed mit Aaron, alle tragenden Achsen entschieden)
**Session-Koordination:** [[coordination-partner-tier-badge]] · integriert mit #3857 (Session 8c2162b3, `MaklerEmpfehlungBadge`)

---

## 1 · Motivation & Auftrag

Aaron: „Wie promoten wir Werkstätten und Makler durch die Staffelung zu Bronze/Silber/Gold-Partnern, wie bekommen sie einen Badge, und wie machen wir das **wirklich wirksam für den Kunden** — dieselbe Gamification auch für die Gutachter."

Ein **einheitliches, verdientes Rang-System** für alle drei Partnertypen (Sachverständige/Gutachter, Makler, Werkstätten), das sich als **öffentlicher Reputations-Badge** überall zeigt, wo ein Partner öffentlich auftaucht — und das dem **Endkunden** eine ehrliche Vertrauens-/Wahlhilfe gibt, den **Partner** motiviert und an **Paket-Upsell** koppelt.

### 1.1 Verifizierte Ausgangslage (Code + Daten, 2026-07-08)

- **Keine bestehende Bronze/Silber/Gold-Staffelung** im Code. Was existiert: SV-`paket` (basic/standard/pro/premium = Abo-Tier), Leadpreis-Staffel nach Schadenshöhe (SV-Vertrag), flache Makler-Provisionssätze. → **Greenfield, einheitlich neu definiert.**
- **`istTopPartner = paket !== 'basic'`** (`src/lib/sv-matching-modul/projection.ts`) wird dem Kunden heute als **„Empfohlener Partner"** im Slot-Picker gezeigt. Das ist ein **unehrliches** Signal (bedeutet „zahlt mehr", nicht „ist besser") → wird durch den ehrlichen Rang **abgelöst**.
- **Matching:** `paket` wiegt **100** in `src/lib/termine/engine/matching-score.ts` → Premium-Partner bekommen ohnehin mehr Leads.
- **Reale Volumen-Daten sind im Kaltstart** (Prod, 2026-07-08): SV 14 (10 verifiziert, **6 Testaccounts**), nur **2 abgeschlossene Termine**. Makler 5, **1** mit Provisionen (2 Stück). Werkstatt **0 Orgs / 0 Reparaturen**. `community_leaderboard`-Tabelle **leer**. → **Es gibt keine Volumen-Verteilung zum Kalibrieren.**

Diese Datenlage prägt das Design (Cold-Start, §4).

---

## 2 · Grundentscheidungen (alle Aaron-approved)

| # | Entscheidung | Wahl |
|---|---|---|
| A | Was belohnt der Rang? | **Volumen bestimmt die Höhe, Qualität ist der Türsteher** (nicht rein-Volumen, nicht Loyalitäts-Eitelkeit) |
| B | Qualitäts-Schutz? | **Ja — Qualitäts-Gate** (Bewertung, No-Show, Reklamationen, verifiziert) als Türsteher für Silber/Gold |
| C | Paket-Beschleunigung? | **Organisch** — Paket → mehr Leads → mehr Volumen → schneller höher. **Kein** unehrlicher Score-Multiplikator |
| D | Kundenwirkung? | **Aktive Reihung im Finder** (+ sichtbarer, selbsterklärender Badge), **mit Entkopplung** gegen Pay-to-win |
| E | Sichtbarkeit? | **Universeller öffentlicher Badge** überall wo ein Partner öffentlich ist — Finder, Profil, nach Buchung, Emails, **Community-Kommentare + Posts**, für **alle 3 Typen** |
| F | Cold-Start (kein Volumen)? | **Composite Partner-Stärke** — Credentials + Rating + Tenure differenzieren jetzt, Volumen übernimmt automatisch, sobald es wächst |
| G | Zahl öffentlich? | **Nie die nackte Fallzahl** — nur der Rang + ehrlicher, komponenten-basierter Sinnsatz |

---

## 3 · Das Rang-Modell

Drei Stufen: **Bronze → Silber → Gold** (Platin bewusst zurückgestellt bis Volumen es rechtfertigt).

### 3.1 Zwei Schichten: Gate (binär) + Stärke (Score)

**Schicht 1 — Qualitäts-Türsteher (binär, muss bestanden sein):**
- **Bronze:** Grund-Eintritt — SV `verifiziert = true` / Makler+Werkstatt `status = aktiv`. (Unverifiziert/inaktiv = **kein** Rang, kein Badge.)
- **Silber/Gold zusätzlich:** keine offenen Reklamationen · No-Show-Quote ≤ Cap · `ablehnungen_30_tage` ≤ Cap · (SV) Google-Rating ≥ Schwelle *sofern genug Bewertungen*.
- Fällt ein Gate, wird der Partner **auf den höchsten gate-konformen Rang gedeckelt** (z.B. offene Reklamation → max. Bronze), unabhängig vom Score.

**Schicht 2 — Partner-Stärke-Score `S` (bestimmt die Höhe unter den gate-konformen Partnern):**

```
S = V (Volumen)  +  C (Credentials)  +  R (Rating)
```

Die Eleganz des Cold-Starts steckt in den **Wertebereichen**:
- **C (Credentials)** ist **gedeckelt** (~0–40): man kann nur begrenzt „bestellt & vereidigt + zertifiziert + langjährig" sein.
- **R (Rating)** ist **gedeckelt** (~0–30): eine Bewertung ist max. 5,0.
- **V (Volumen)** **wächst** mit den Fällen (mit sanft abnehmendem Grenzertrag via `sqrt`/`log`, damit ein Mega-Partner nicht davonrennt) — effektiv unbegrenzt.

→ **Im Kaltstart** (V≈0) entscheiden **C + R** den Tier: ein etablierter, top-bewerteter SV ist **sofort** Silber/Gold, ein neuer unbewährter SV ist Bronze.
→ **Sobald Volumen wächst**, dominiert **V** automatisch — **ohne** zeitbasierte Umgewichtung, ohne Magic-Reweighting.

### 3.2 Tier-Schwellen: absolut + getunt (nicht relativ)

Schwellen auf `S` sind **absolut** (nicht Perzentil-relativ) — damit **„Gold" immer dasselbe Reale bedeutet** und ein Kunde ihm trauen darf (ein relativer „Top-25%"-Tier verschöbe die Bedeutung mit der Population).

Die Schwellen sind **Config**, im Kaltstart **niedrig** gesetzt und werden **getunt, während die Plattform wächst** (der Compute-Job liefert die aktuelle `S`-Verteilung als Tuning-Input). Kein nächtliches Auto-Relativ.

**v1-Startwerte (tunbar, in `partner-rang/config.ts`):**
- Bronze: gate-konform, `S ≥ 0`
- Silber: Gates ok, `S ≥ 35`
- Gold: Gates ok, `S ≥ 60`

### 3.3 Öffentlich: nur der Rang, nie die Zahl

Der Badge zeigt **Bronze/Silber/Gold** + einen **komponenten-ehrlichen Sinnsatz**, der aus den **tatsächlich starken** Komponenten des Partners gebildet wird — **nie** eine (fabrizierte) Fallzahl:
- volumen-getrieben: „Gold-Partner · vielfach begutachtet · 4,7★ · verifiziert"
- credential-getrieben (Cold-Start, 0 Fälle): „Gold-Partner · öffentlich bestellt & vereidigt · 4,9★ · BVSK-Mitglied"

So bleibt der Badge **auch im Cold-Start ehrlich** (keine „500+ Fälle"-Behauptung, wenn es 0 sind).

---

## 4 · Score-Zusammensetzung je Partnertyp

Reine Funktion `computePartnerStrength(signals) → { score, gate_ok, gate_cap, tier }` — **isoliert testbar (TDD)**, keine DB-Zugriffe im Kern.

### 4.1 Sachverständige (SV) — reichste Signale
- **V (Volumen):** abgeschlossene Gutachten/Termine (`gutachter_termine` status `abgeschlossen` + `durchgefuehrt_am`, per `assignee_id`, `assignee_typ='sachverstaendiger'`), `sqrt`-skaliert.
- **C (Credentials):** `oeffentlich_bestellt` (+), Zertifikatsnummern vorhanden (`bvsk_mitgliedsnummer`, `dat_nummer`, `ihk_zertifikat_nummer`, `oebuv_bestellungsnummer`) (+ je), Tenure aus `partner_seit` (+/Jahr, gedeckelt).
- **R (Rating):** `google_bewertungen_cache.durchschnitt` (skaliert), nur bei `anzahl_bewertungen ≥` Mindestzahl, sonst neutral.
- **Gates:** `verifiziert` · No-Show (`sv_no_show_am`-Quote) · `ablehnungen_30_tage` · offene `reklamationen` (FK `sv_id`).

### 4.2 Makler — volumen-geführt (dünne Qualitätsdaten)
- **V:** vermittelte Fälle (`makler_provisionen` per `makler_id`, Status `freigegeben`/`ausgezahlt`; ggf. distinct `claim_id`).
- **C:** Tenure aus `aktiviert_am`; `onboarding_abgeschlossen`.
- **R:** — (heute nicht erfasst → neutral).
- **Gates:** `status = aktiv`, nicht `gesperrt_am`; Storno-Quote (`makler_provisionen.storniert_am`) als Frühindikator.
- **Label ehrlich:** „aktiver Partner", **nicht** „Qualität", bis Qualitätsdaten existieren.

### 4.3 Werkstätten — dormant bis Vertical-Start
- **0 Orgs / 0 Reparaturen** heute → Tier **scaffolded, aber inaktiv**. Struktur bereit; aktiviert, sobald `repairs`/`organisationen typ='werkstatt'` Volumen tragen.
- **V (später):** `repairs` per `werkstatt_id` (`abgeschlossen_am`). **Quali (später):** Kostengenauigkeit (`kostenvoranschlag` vs `tatsaechliche_kosten`).
- **Koordination:** Werkstatt-Finder (Session 3724ced2) + Werkstatt-Auftrag ([[coordination-werkstatt-auftrag-ansicht]]).

### 4.4 Testdaten-Ausschluss (Pflicht)
`ist_testaccount = true` (6/14 SV!) + bekannte Seed-/Test-Muster **immer** aus Compute UND Reihung ausschließen (analog Orchestrator-Hygiene). Sonst verzerren Testaccounts die Schwellen-Tuning-Verteilung.

---

## 5 · Kundenwirkung — aktive Reihung OHNE Pay-to-win

1. **Sichtbarer, selbsterklärender Badge** an allen Kunden-Kontaktpunkten (§6).
2. **Ablöse** des unehrlichen `istTopPartner`/„Empfohlener Partner" durch den ehrlichen Rang.
3. **Reihung im Finder — mit Entkopplung:**
   - **Primär bleiben Distanz + Verfügbarkeit** (Machbarkeit — ein Gold-Partner 80 km weg darf einen Silber-Partner 5 km weg **nicht** überholen).
   - Der **Rang ersetzt das rohe Paket-Gewicht (100)** in `matching-score.ts` als **Sekundär-Sortierung innerhalb des Machbarkeits-Bandes**.
   - → Paket wirkt nur noch **verdient** (mediiert über den Rang), **nicht doppelt** roh auf die Sichtbarkeit. Kein nacktes Pay-to-win.
   - **Hinter Feature-Flag** ausrollen (Live-Kundenfläche, mehrere Sessions in der Matching-/Finder-Zone).

---

## 6 · Universeller öffentlicher Badge

### 6.1 `PartnerRangBadge` (shared, reine Komponente)
`src/components/shared/PartnerRangBadge.tsx` — nimmt `{ tier, sinnsatz?, size? }`, rendert Medaille (Bronze/Silber/Gold, token-gebunden, `var(--brand-*)`-fähig) + optionalen Sinnsatz. Web+ggf. Native (primitives-Muster). **Kein** neuer Hardcoded-Hex (Token-Audit).

### 6.2 Alle Flächen
- **SV, kundenseitig:** Finder-Karte / `SvProfilePopup` · Slot-Picker (`SvSlotAuswahl`) · nach Buchung (`GutachterCard`) · Emails.
- **Community (alle Typen):** Kommentare + Posts — via Erweiterung von `_community_author` (liefert Tier mit) → Badge neben dem Firmennamen. ([[coordination-community-partner-identity]])
- **Makler/Werkstatt:** über den **bestehenden `MaklerEmpfehlungBadge` (#3857)** → **„Empfohlen von <Firma> · Gold-Partner"**; Partner-Profile; gebrandete Flächen.

### 6.3 Integration mit #3857 (NICHT doppelt bauen)
- `getMaklerEmpfehlung(m)` (#3857) wird erweitert, um den **Tier mitzuliefern** (promotion_codes → makler → rang).
- `MaklerEmpfehlungBadge` **komponiert** `PartnerRangBadge` — kein Zweitbau des Funnel-Badges (er lebt in #3857).
- Generischer Resolver → **Werkstatt-reuse** (Session 3724ced2).

---

## 7 · Partner-Gamification-UX (Motivation)

- **Fortschritts-Ring** im Partner-Portal: „Noch X Fälle bis Gold" — die Zahl ist hier **privat für den Partner selbst** sichtbar (nur *kundenöffentlich* bleibt sie verborgen).
- **Tier-Up-Moment:** Feier-Screen + Email bei Aufstieg.
- **Org-Leaderboard:** die leere `community_leaderboard`-Tabelle wird vom Compute-Job **befüllt** und im Partner-/Org-Portal angezeigt. ([[coordination-ops-cockpit-rebuild]] — `community_leaderboard`-Ownership abstimmen)

---

## 8 · Datenmodell & Berechnung

### 8.1 Tabelle `partner_rang` (DDL nur via Supabase-Plugin, AGENTS.md Regel 2)
```
partner_rang (
  id            uuid pk,
  partner_typ   text  check in ('sachverstaendiger','makler','werkstatt'),
  partner_id    uuid,               -- sachverstaendige.id / makler.id / organisationen.id
  volumen       int,                -- kumulierte abgeschlossene Fälle
  score         numeric,            -- Partner-Stärke S
  credential_score numeric,
  rating_score  numeric,
  gate_ok       boolean,
  gate_cap      text,               -- höchster gate-konformer Tier
  rang          text,               -- 'bronze' | 'silber' | 'gold' | null
  sinnsatz      text,               -- komponenten-ehrlicher Public-Sinnsatz
  stand         timestamptz,
  unique(partner_typ, partner_id)
)
```
Präzedenz: `community_leaderboard`. RLS: public-read für gate-konforme Ränge (Badge ist öffentlich), Write nur service-role (Cron).

### 8.2 Nächtlicher Compute-Cron
- Cron (VPS-Crontab-Muster) → ruft eine Route/Funktion, die je Partner die Signale liest, `computePartnerStrength` (rein) anwendet, `partner_rang` **upsertet** + `community_leaderboard` befüllt.
- Testaccounts/Seed ausgeschlossen.
- Gecacht → Finder liest `partner_rang` (kein Live-Recompute pro Query).

### 8.3 Komponenten-Schnitt (isoliert, testbar)
- `src/lib/partner-rang/config.ts` — Gewichte, Caps, Schwellen (tunbar, KEINE `'use server'`-Exporte).
- `src/lib/partner-rang/compute.ts` — **reine** `computePartnerStrength(signals)` + `deriveTier`. TDD.
- `src/lib/partner-rang/signals.ts` — DB-Reader je Typ (liefert Signale).
- `src/lib/partner-rang/get.ts` — `getPartnerRang(typ,id)` Reader (Badge/Finder).
- `src/app/api/cron/compute-partner-rang/route.ts` — Cron-Orchestrierung.
- `src/components/shared/PartnerRangBadge.tsx` — Präsentation.

---

## 9 · Phasen

- **Phase 0 — Fundament:** `partner_rang`-Tabelle + `config`/`compute` (TDD) + `signals` + Cron + `getPartnerRang`. Keine UI. (Compute läuft, Ränge existieren.)
- **Phase 1 — SV kundenseitig:** `PartnerRangBadge` + Finder-Badge + Reihungs-Entkopplung (Flag) + `SvProfilePopup` + `GutachterCard`/Post-Buchung + Ablöse `istTopPartner`.
- **Phase 2 — Universell + Community:** `_community_author`-Erweiterung (Badge an Kommentaren/Posts) + `getMaklerEmpfehlung`-Tier + `MaklerEmpfehlungBadge`-Komposition + Partner-Portal-Fortschritt/Tier-Up.
- **Phase 3 — Makler/Werkstatt-Aktivierung:** sobald Verticals Volumen tragen; Koordination mit Werkstatt-Sessions.

---

## 10 · Risiken & Koordination

- **Hot Files (mehrere Sessions):** `matching-score.ts` + `sv-matching-modul/*` (Reihung) · `FinderWizard/FinderMap/SvSlotAuswahl/SvProfilePopup` (aar-956 + #3857) · `src/lib/makler/*` (#3857) · `_community_author`/`article_comments` (community-identity) · `community_leaderboard` (ops-cockpit 470d55c9). → **Worktree** (erledigt), **additiv**, Reihungs-Änderung **hinter Flag**, Marker gepflegt.
- **#3857 muss zuerst in staging** sein, bevor Phase-2-Makler-Badge darauf aufsetzt.
- **Live-Kundenfläche:** `istTopPartner`-Ablöse behutsam (Verhaltensänderung im Slot-Picker).
- **DDL** ausschließlich via Supabase-Plugin + Twin-Drift-korrekte Migration-Datei.

---

## 11 · Offene Tuning-Punkte (Implementierung)

- Konkrete Gewichte/Caps/Schwellen (v1-Startwerte oben) an realer Verteilung nachziehen, sobald Volumen wächst.
- No-Show-/Ablehnungs-/Reklamations-Caps festlegen.
- Google-Rating-Mindest-Bewertungszahl.
- Medaillen-Visual („geilste Lösung") — separater Design-Schritt (ggf. visuelles Mockup).
