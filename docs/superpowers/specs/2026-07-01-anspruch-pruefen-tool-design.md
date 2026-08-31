# Anspruch prüfen — Design-Spec

> **Status:** Design (brainstormed, prod-validiert) — bereit für Implementation-Plan
> **Branch/Worktree:** `kitta/anspruch-pruefen-tool` (off `origin/staging`)
> **Datum:** 2026-07-01
> **Prod-Validierung:** `Claimondo-v2` (`paizkjajbuxxksdoycev`), read-only via Supabase-Plugin, 2026-06-30/07-01

---

## 1. Ziel & Positionierung

Ein **anonymes Top-Funnel-Tool**, das einen Interessenten von einem Schadenfoto bis in die kanonische Strecke (FlowLink) trägt:

1. Kunde lädt Schadenfotos hoch → **Claude-Vision** schätzt beschädigte Teile, Schweregrad, **Fahrzeug-Segment** und eine **Reparaturkosten-Spanne**.
2. Kunde bestätigt/korrigiert das Segment (Chip), gibt **fahrbereit? (ja/nein)** und **Erstzulassungs-Jahr** an.
3. Das Tool zeigt **einen** Anspruch mit allen zutreffenden Positionen (Nutzungsausfall nur wenn nicht fahrbereit, Wertminderung nur bei jüngerem Fahrzeug + Substanzschaden), durchgehend als **unverbindliche Spannen**.
4. Kunde geht **nahtlos** in den bestehenden Gutachter-Finder über und damit **vollständig in die kanonische Strecke** — er bekommt den FlowLink, alle Fotos + die Schätzung wandern DB-getrieben auf den entstehenden Lead/Claim.

### Leitprinzip (rechtlich + Conversion)

Eine Foto-Schätzung ist **grob (±50 %) und kein Gutachten**. Das Geschäftsmodell ist, dass der echte Sachverständige die bindende Zahl liefert. Deshalb: **durchgehend Spannen, nie ein Punktwert**, immer der Frame „unverbindliche Ersteinschätzung — den echten Anspruch ermittelt Ihr Gutachter". Das ist zugleich der stärkste Conversion-Hebel (Schätzung weckt Begehrlichkeit → Finder löst sie ein).

### Warum (Business-Case aus Prod)

Der Gutachter-Finder erhält **2392 Anfragen / 90 Tage**, von denen nur **85 (= 3,6 %)** zu einem Lead konvertieren. Der Finder ist der mit Abstand größte Top-Funnel und leakt ~96 %. „Anspruch prüfen" setzt als **Value-first-Hook genau an diesem Leak** an — selbst kleine Conversion-Hübe erzeugen große absolute Lead-Gewinne.

---

## 2. Prod-Realität (validiert)

### ✅ Bestätigt — Rückgrat steht

- **Alle Carry-over-Spalten existieren:** `leads` (`schadensfoto_urls` jsonb, `fahrzeug_fahrbereit`, `erstzulassung` *text*, `fahrzeugschaden_beschreibung`, `dat_einschaetzung` jsonb, `nutzungsausfall`, `schaden_sichtbar`) · `gutachten` (`ki_kalkulation` jsonb, `ki_geschaetzte_kosten_min/max`, `ki_kalkulation_am`, `gutachten_nutzungsausfall_tagessatz_eur`, `nutzungsausfall_tage`, `minderwert`) · `claims` (`fahrzeug_fahrbereit`, `hat_nutzungsausfall`, `hat_mietwagen`, `vehicle_id`) · `gutachter_finder_anfragen` (`id`, `konvertiert_zu_lead_id`, `erstellt_am`). → **Kein neues Hot-Path-Feld nötig.**
- **Pipeline live:** gfa 2392, flow_links 235, leads 384, claims 91.
- **Keine** Segment-/Tagessatz-/Wertminderungs-/Anspruch-Tabelle vorhanden → Greenfield für DB-getriebene Config.

### ⚠️ Korrigiert — „existiert & funktioniert" war zu optimistisch

- `/api/schadenkalkulation` hat Prod **nie befüllt** (`ki_kalkulation` 0×, `ki_geschaetzte_kosten` 0×). Code vorhanden, in Produktion nie gelaufen/persistiert.
- **0 echte Schadenfotos** auf Leads (alle `schadensfoto_urls` = leeres `[]`).
- Vision-Beschreibung nur 4× je gelaufen; `erstzulassung` 0×, `dat_einschaetzung` 0×, `fahrbereit` 13/384.

**Konsequenz:** Der KI-Estimate ist **NICHT „reuse", sondern prod-unbewiesene Neuarbeit** — first-class Risiko mit Validierungspflicht (siehe §7). Die Eingaben (EZ, fahrbereit, Segment) sind Greenfield (keine Altlast, aber auch kein Bestandssignal).

### Vision-Machbarkeit — Live bewiesen

Live-Test an einem echten Schadenfoto (neutrale Quelle, kein Kundendaten-PII): korrekt erkannt = Mittelklasse-Limousine, Frontstoßstange/Kotflügel-Schürfschaden, Schweregrad leicht–mittel, Reparaturkosten-Spanne ~900–1.800 € brutto. Der Fall war **fahrbereit** → Nutzungsausfall entfiel automatisch, **kosmetisch** → Wertminderung gering/keine. Beweist: (a) Vision-Kern trägt, (b) Spannen sind zwingend (Riss unter Schürfung? Delle? = ±hunderte €), (c) konditionale Positions-Logik ist eine Feature-Stärke.

---

## 3. Nutzer-Reise (eine durchgehende Linie)

Der Trick: die Anspruch-Phasen sind ein **Vorspann** zum bestehenden Finder. Ab `ort` ist es bit-für-bit der heutige Finder — kein paralleler Buchungspfad, kein zweiter FlowLink-Writer.

```
 [ANSPRUCH-VORSPANN — neu]                 [FINDER — existiert]        [STRECKE — existiert]
  fotos ─► einschätzung ─► anspruch ─────► ort ─► termin ─► kontakt ─► gebucht ─► /flow/[token] ─► SA ─► Claim
   │           │            (ein €-        Wo    Slot     Name/Tel/    FlowLink    Feststellung
   ▼           ▼             Anspruch,     steht  beim     Email +      (WA/Email)  + echtes
 anon.      Claude-Vision    Spannen)      Auto?  Gutacht. DSGVO                    Gutachten
 Session    (Segment +       + CTA                          │
 (DB, TTL)  €-Spanne)       „verbindlich    reserviereEmbedTermin ─► gfa ─► issueCanonicalFlowLinkForAnfrage
                             machen"                                    └─► createLead + ensureCanonicalFlowLinkForLead
```

---

## 4. Architektur

### Surface

- Neue Route `/embed/anspruch-pruefen` im **Haupt-App** (`app.claimondo.de`) — Claude-Key + Supabase bleiben serverseitig. `robots: noindex` (Marketing-LP ist die SEO-Fläche und iframe-t diese Route, analog zum bestehenden `/embed/gutachter-finder`).
- Claimondo-gebrandet (Pre-Lead, kein User-Context → kein Whitelabel; konsistent mit „Was NICHT gebrandet wird").

### Komponenten-Grenzen (kleine, testbare Units)

| Unit | Zweck | Abhängigkeiten |
|---|---|---|
| `AnspruchWizard` (client) | Orchestriert 3 neue Phasen, komponiert danach die Finder-Buchungsphasen | Phase-Komponenten, Finder-Phasen |
| `AnspruchFotoStep` | Multi-Foto-Upload (Kamera mobil), 3–5 Winkel aktiv einfordern | anon-Session-Action |
| `AnspruchEinschaetzungStep` | Segment-Chip (auto + korrigierbar), fahrbereit-Toggle, EZ-Jahr | — |
| `AnspruchSummaryStep` | „Ein Anspruch"-Karte (Positionsliste + Gesamt-Spanne + CTA) | shared Positions-Renderer |
| **reuse** `FinderWizard`-Phasen `ort`/`termin`/`kontakt`/`gebucht` | Standort, Slot, Kontakt, Bestätigung | bestehende Finder-Actions |
| `POST /api/anspruch/schaetzung` | Vision-Call + Positions-Berechnung, schreibt in anon-Session | `lib/ai/vision/client`, `lib/anspruch/*`, usage-log |
| `lib/anspruch/positionen.ts` | Positions-Katalog + Anwendbarkeit + Spannen-Rechenlogik (reine Funktion) | Rate-Config-Loader |
| `lib/anspruch/session.ts` | Anonyme Schätz-Session CRUD + Promotion auf Lead | admin supabase |
| `lib/anspruch/rates.ts` | Loader für DB-Rate-Tabellen (gecacht) | supabase |

### Reuse / Dead-Code-Revival (Audit: Redundanz + Dead-Code)

- Der **verwaiste** `ClaimSummary.AnspruchTab` (Positionsliste + „Ihr Gesamtanspruch") und `lib/claims/anspruch.ts` (`berechneAnspruchVs`) werden zu einem **geteilten Positions-Renderer** generalisiert, der **beide** Fälle bedient: Vor-Anspruch (Schätzung, Spannen) **und** echter Anspruch (post-Gutachten). Damit wird toter Code wiederbelebt statt dupliziert.
- Handoff nutzt **unverändert** `starteEmbedBuchung` / `reserviereEmbedTermin` / `issueCanonicalFlowLinkForAnfrage` / `ensureCanonicalFlowLinkForLead` / `convertLeadToClaim`.
- Vision nutzt den geteilten `lib/ai/vision/client.ts` + `AI_MODELS` + `lib/ai/usage-log.ts` (nicht den eigenen `new Anthropic()` von `/api/schadenkalkulation` — dessen Legacy-Pfad wird nicht kopiert).

---

## 5. Datenmodell (neu — via `apply_migration`, Regel 2)

**„DB-getrieben" konkret:** die *veränderlichen Daten* (Sätze, Faktoren, Schwellen, Pauschalen) liegen in DB-Tabellen (jährlich pflegbar ohne Deploy); die *Kontrollfluss-Regeln* (Anwendbarkeit) bleiben getesteter Code. Das ist die pragmatische Lesart von DB-getrieben.

### `anspruch_schaetzungen` — anonyme Schätz-Session (TTL)

```
id                uuid pk
session_token     text unique         -- anonym, Cookie/URL; keine PII
foto_pfade        jsonb               -- Temp-Storage-Pfade (fall-dokumente, anon-Prefix)
erkanntes_segment text
schweregrad       text                -- leicht|mittel|schwer
fahrbereit        boolean
ez_jahr           integer
vision_result     jsonb               -- rohes Claude-Ergebnis (Teile/Beschreibung/confidence)
positionen        jsonb               -- berechnete Positionen (Spannen)
lead_id           uuid null fk→leads  -- gesetzt bei Handoff (Promotion)
erstellt_am       timestamptz default now()
```
- **Keine Kontakt-PII.** Erst der Finder-`kontakt`-Schritt schreibt Name/Tel/Email — in den Lead, mit bestehendem DSGVO-Consent.
- **TTL-Cleanup** (Cron analog `slot-ttl-cleanup`): `lead_id IS NULL AND erstellt_am < now() - interval '30 days'` → Session + Temp-Fotos löschen.

### `nutzungsausfall_segment_saetze` — Segment → Tagessatz (seeded)

```
segment                   text pk     -- kleinwagen|kompakt|mittelklasse|oberklasse|suv|transporter
tagessatz_min_eur         numeric
tagessatz_max_eur         numeric
reparaturdauer_min_tage   integer
reparaturdauer_max_tage   integer
gueltig_ab                date
```

### `wertminderung_alter_faktoren` — Alters-Band → Faktor (seeded)

```
alter_bis_jahre   integer pk  -- z.B. 2, 5, 8; darüber = 0
faktor_min        numeric     -- Faktor auf Reparaturkosten
faktor_max        numeric
```

### `anspruch_config` — Schwellen/Pauschalen (seeded, key-value)

```
key    text pk   -- z.B. kostenpauschale_eur, wertminderung_min_reparatur_eur, wertminderung_max_alter_jahre, bagatelle_schwelle_eur, abschlepp_min_eur, abschlepp_max_eur
wert   numeric
```

*Kein* `anspruchspositionen_katalog` als Tabelle im MVP — die Positions-*Definition* (typ, Label, Reihenfolge, Anwendbarkeits-Regel) lebt als getippte Konstante in `lib/anspruch/positionen.ts` mit Unit-Tests. Die *Zahlen* darin kommen aus den DB-Tabellen. (Begründung: Anwendbarkeits-Regeln sind Logik, gehören in Tests, nicht in Daten. Bei späterem Admin-Editier-Bedarf → als Follow-up DB-ifizieren.)

---

## 6. Positions-Katalog & Rechenlogik

Alles als **Spanne** (min–max). Ausgabe = **ein** Anspruch mit Gesamt-Spanne.

| Position | `typ` | Anwendbarkeit | Berechnung |
|---|---|---|---|
| Reparaturkosten / WBW-Aufwand | `reparatur` | immer | Vision `geschaetzte_kosten_min/max` |
| Nutzungsausfall | `nutzungsausfall` | `fahrbereit = false` | Segment-Tagessatz-Band × Reparaturdauer-Band |
| Wertminderung | `wertminderung` | `alter ≤ config.max_alter` **und** `schweregrad ≥ mittel` **und** `reparatur ≥ config.min_reparatur` | Alters-Faktor-Band × Reparatur-Mitte |
| Sachverständigenkosten | `gutachterkosten` | immer (Haftpflicht) | Anzeige „trägt Gegnerversicherung" — **nicht** in „Ihre Auslagen", aber Teil des Anspruchs |
| Auslagenpauschale | `kostenpauschale` | immer | fix aus `anspruch_config` (~25–30 €) |
| Abschleppkosten | `abschleppkosten` | `fahrbereit = false` | fix-Band aus `anspruch_config` |

- **Bagatelle-Dämpfung:** liegt die Reparaturkosten-Mitte unter `config.bagatelle_schwelle_eur`, wird Wertminderung explizit als „gering/keine" ausgewiesen (nie überversprechen).
- **Totalschaden-Hinweis:** ist der Schaden schwer und die Reparatur nahe/über dem plausiblen Fahrzeugwert, Hinweis „ggf. wirtschaftlicher Totalschaden — der Gutachter klärt WBW/Restwert" (kein WBW pre-claim verfügbar).
- `positionen.ts` ist eine **reine Funktion** `berechneAnspruchsSpanne(input, rates, config) → { positionen[], gesamt_min, gesamt_max }` → vollständig TDD-bar.

---

## 7. KI-Estimate (first-class, Validierungspflicht)

- **Modell:** Sonnet-4-6 über den Key `AI_MODELS.vision_lead` (semantisch „Vision-Analyse Schadenfotos im Kunden-Flow") und `lib/ai/vision/client.ts`; jede Nutzung via `lib/ai/usage-log.ts` (Kosten-Tracking).
- **Output-Schema (strict JSON):** `{ beschaedigte_teile[], schweregrad, segment, geschaetzte_kosten_min, geschaetzte_kosten_max, beschreibung, confidence, bagatelle }`. System-Prompt erzwingt deutschen Reparatur-Markt + Spannen.
- **Multi-Winkel:** UI fordert 3–5 Perspektiven (Gesamtansicht + Nahaufnahmen + angrenzende Teile); ein Eckfoto unterschätzt.
- **Degradation:** Vision-Fail oder fehlender `ANTHROPIC_API_KEY` blockiert **nie** den Funnel → Kunde wählt Segment manuell + geht trotzdem in den Finder (Estimate optional). Server-Action liefert `{ ok, error? }` (kein throw), non-critical Vision im try/catch.
- **Kalibrierungs-Plan (Build-Arbeit):** (1) Estimate vs. später eingehendes echtes Gutachten in `anspruch_schaetzungen`/`ki_kalkulation` protokollieren; (2) gegen die (heute nur 3) echten Gutachten gegenprüfen; (3) SV-Feedback-Schleife als Follow-up. Bis Kalibrierung belastbar: Spannen bewusst weit + Disclaimer prominent.

---

## 8. Datenfluss & Carry-over (DB-getrieben)

1. **Foto-Upload (anon):** Temp-Storage `fall-dokumente` unter anon-Prefix (`anspruch/{session_token}/...`), Pfade → `anspruch_schaetzungen.foto_pfade`.
2. **Schätzung:** `/api/anspruch/schaetzung` → Vision + `berechneAnspruchsSpanne` → `vision_result` + `positionen` in die Session.
3. **Handoff (kontakt-Schritt):** `reserviereEmbedTermin` (bestehend) mit angehängter `schaetzung_session_id` → `gfa` → `issueCanonicalFlowLinkForAnfrage` → `createLead` + `ensureCanonicalFlowLinkForLead`. Der Promoter kopiert Carry-over:
   - Fotos: Temp → `leads/{leadId}/...`, `leads.schadensfoto_urls` + `fall_dokumente(dokument_typ='schadensfotos')`
   - `fahrbereit` → `leads.fahrzeug_fahrbereit`; `ez_jahr` → `leads.erstzulassung` (text); `beschreibung` → `leads.fahrzeugschaden_beschreibung`; `schaden_sichtbar=true`
   - `anspruch_schaetzungen.lead_id = leadId` (Session wird lead-gebunden, nicht mehr anonym)
4. **Claim-Konversion (SA):** `convertLeadToClaim` liest die lead-gebundene Session → schreibt Estimate in `gutachten.ki_kalkulation` + `ki_geschaetzte_kosten_min/max` + `ki_kalkulation_am` → **SV sieht die KI-Vorschätzung** in der Fallakte. Arbeit verpufft nirgends.

---

## 9. Fehlerbehandlung, Sicherheit, Konventionen

- **Server-Actions:** `{ ok: boolean; error?: string }` (AGENTS.md), kein throw; non-critical Sends/Vision im try/catch; `revalidatePath` wo nötig.
- **DDL:** ausschließlich `apply_migration` (Plugin), File-Name == getrackte Version (Twin-Drift-Regel). Types-Regen nach Migration.
- **RLS:** `anspruch_schaetzungen` per `session_token` (anon) — kein authenticated-Read auf fremde Sessions; Smoke mit `set local role authenticated` + JWT-claims (nicht nur GUC). Rate-Tabellen sind öffentlich lesbare Referenzdaten.
- **Branding/Tokens:** Claimondo-Tokens (`bg-claimondo-*`, Status-Tokens `bg-success`/`-soft`), keine Inline-Hex; `rounded-ios-*`, Typo-Tokens. Component-Set-Policy: `primitives/*` + `shared/*`.
- **Umlaute:** alle nutzersichtbaren Strings mit echten `ä/ö/ü/ß`.
- **DSGVO:** anon bis Consent; Foto = Art. 6(1)(b) vorvertraglich auf Wunsch; TTL + Hinweis; Third-Country (Anthropic) — bereits in DSE v2.2 §12a abgedeckt (verifizieren).

---

## 10. MVP-Schnitt (YAGNI)

**Drin:** Fotos + Segment (auto + Chip-Korrektur) + fahrbereit + EZ-Jahr → Positionen als Spannen → nahtloser Handoff → FlowLink. Rate-Tabellen als vereinfachte Segment-Bänder geseedet.

**Bewusst später:** exakte Sanden-Danner-Gruppen A–L; make/model→Gruppe-Autoklassifikation; Ruhkopf-Sahm-präzise Wertminderung; Kilometerstand-/Vorschaden-Eingabe; Retargeting abgesprungener anonymer Sessions; Whitelabel-Branding des Tools; DB-ifizierter Positions-Katalog.

---

## 11. Erfolgsmetrik

**North Star:** Lift der Finder/Tool→Lead-Conversion (Baseline 3,6 %). Funnel-Tracking: `tool_start → estimate_shown → handoff → lead → claim`.

---

## 12. Test-Plan

- **Unit (TDD):** `positionen.ts` — Anwendbarkeit + Spannen über Matrix (fahrbereit ja/nein × jung/alt × leicht/mittel/schwer × bagatelle/totalschaden-hint).
- **Vision:** Schema-Validierung + Fixture-Foto-Smoke (das getestete Bild als Fixture).
- **Integration:** Handoff erzeugt `gfa → lead → flow_link` mit vollständigem Carry-over; RLS-Sim als authenticated.
- **E2E:** durchgehender Wizard → FlowLink; Login-Fixtures `test-*@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>` (nie Realaccounts).
- **Kalibrier-Harness:** Estimate-vs-Gutachten-Log.

---

## 13. Koordination

- Worktree `kitta/anspruch-pruefen-tool` off `staging`. PR gegen `staging`.
- **Geteilte Files (additiv):** Finder-Actions (`embed/gutachter-finder/actions.ts`, `lib/actions/gutachter-finder-actions.ts`), `issue-canonical-flowlink.ts`, `convert-lead-to-claim.ts`, `ClaimSummary.tsx` (Revival → shared Renderer). Mit `aar-956`-Sessions (Finder-Embed-Zone) abstimmen — nur additiv.
- `database.types.ts`-Regen nach Migrationen.
- Migrationen: 4 neue Tabellen + Seeds + TTL-Cron-Route.

---

## 14. Offene Fragen / Risiken

1. **Estimate-Kalibrierung** (größtes Risiko) — Spannen-Weite + Disclaimer bis belastbar.
2. **Legal-Review** der Spannen-/Disclaimer-Copy (Aaron/Anwalt) vor Live.
3. **Segment-Taxonomie-Granularität** — reichen 6 Segmente?
4. **Rate-Quelle** — vereinfachte Bänder sind unsere Referenz; Methodik dokumentieren (Sanden-Danner ist veröffentlicht, aber lizenzrechtlich als exakte Tabelle nicht 1:1 übernehmen).
