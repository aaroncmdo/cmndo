# AAR-940 — Self-Service (Monika Schuh 2): Implementierungsplan

**Stand:** 31.05.2026 · **Status:** Plan (kein Code) · **Spec:** Linear AAR-940
**Verfasser:** Session 98044b6b (Billing/Monika)

## 0. Leitidee — übertragbar für JEDE Anfrage

Der gesamte Flow keyt auf dem **Anfrage-Layer** (`gutachter_finder_anfragen`), der **quelle-agnostisch** ist. Darum ist das Design **für jede Anfrage übertragbar** — egal ob:
- nativer Funnel (`source = NULL`)
- SV-Embed (`source = 'sv_embed'`)
- Cluster-LP (`source = 'kfz_gutachter_lp'`)

Jede Anfrage durchläuft dieselbe Kette: **Capture (Anfrage) → FlowLink → Klick = Promotion zu Lead → Selbst-Quali → SA → Termin.** Die **einzige Verzweigung** ist `sv_id` (zugeordnet ja/nein) — sie bestimmt nur die SV-Findung, nicht den Flow.

## 1. Die SV-Weiche (Aarons 3 Fragen, code-verifiziert)

### A) `sv_id IS NULL` → interne Anfrage → SV muss zugewiesen werden
- Native Funnel + Cluster-LP kommen **ohne** zugeordneten SV rein → das sind „unsere" internen Anfragen.
- Hier läuft die **globale SV-Findung**: `findBestSV(lat, lng, plz)` (src/lib/dispatch/findBestSV.ts) — sucht über **ALLE** aktiven+verifizierten SVs, nimmt den nächsten im Radius.
- Zuweisung passiert über **Dispatch** (manuell aufgreifen) ODER automatischer Round-Robin/findBestSV-Vorschlag. Der Dispatcher bleibt das Zuweisungs-Gate für interne Anfragen.

### B) `sv_id IS SET` (SV-Embed, kommt „von seiner Seite") → KEIN findBestSV, nur sein Kalender
- **Wichtige Präzisierung deiner Frage:** Bei zugeordnetem SV wird `findBestSV` **NICHT** getriggert — es gibt nichts zu „finden", der SV ist fix (via `embed_sites.sv_id`).
- Stattdessen läuft die **Slot-Verfügbarkeits-Logik gescoped auf genau diesen einen SV** (src/lib/onboarding/slots.ts + `reservierter_sv_id`/`reservierter_slot_von/bis`): „hat die Anfrage schon einen Gutachter, ist nur dessen Kalender wählbar" (bestehende Mechanik, Stream-0-Reuse-Plan).
- Also: **findBestSV = globaler Matcher für den NULL-Fall. Bei gesetztem sv_id → übersprungen → direkt Slot-Auswahl im SV-eigenen Kalender.** Dein „nur für seinen Kalender" stimmt — es ist die Slot-Funktion, nicht findBestSV.

**Tabelle:**

| `sv_id` | Bedeutung | SV-Findung | Kalender |
|---|---|---|---|
| `NULL` | intern (native/Cluster-LP) | `findBestSV` (global) ODER Dispatch-Zuweisung | nach Zuweisung der des zugewiesenen SV |
| gesetzt | SV-Embed (von SV-Seite) | **kein findBestSV** | **nur Kalender dieses SV** (slots.ts scoped) |

## 2. Architektur-Pfeiler (aus AAR-940, gelockt)

1. **Anfrage = read-only Capture · Lead = Arbeitsschicht.** Anfrage wird nie editiert; „gespeichert = Lead".
2. **Promotion-Punkt = FlowLink-Klick.** Nicht erst bei SA/Termin.
3. **Promotion-Akteur = token-gebundener Server-Pfad.** Anon schreibt nie in `leads`; Server validiert Token → Promotion via service_role.
4. **Quali-Gate = Wizard-Selbst-Quali im FlowLink.** Schuldfrage/Plausibilität wie Onboarding-Wizard; nur bestanden → Termin buchbar. Eigenverschulden → kein Termin.

## 3. Implementierungs-Phasen

### Phase 0 — Verifikation (vor Code, Pflicht)
- [ ] `flow_links`-Schema + RLS live ziehen: ist die Token-Strecke anon-tauglich? (Magic-Link-Kunden sind effektiv anon)
- [ ] `gutachter_termine`-Insert/Update-Policy für token-User prüfen (`/kunde-termin/[token]` als Vorlage)
- [ ] Bestätigen: `konvertiereAnfrageZuFall` ist aus token-/service_role-Kontext aufrufbar (heute aus Wizard `finalizeAnfrage` + Dispatch)
- [ ] `findBestSV` + `slots.ts` Signaturen final lesen (SV-gescopte vs. globale Slot-Funktion exakt benennen)

### Phase 1 — FlowLink-Ausgabe für Self-Service (server-seitig)
- [ ] Trigger-Bedingung definieren: welche Anfragen bekommen automatisch einen Self-Service-FlowLink? (z.B. native + Cluster-LP mit Kontakt; sv_embed hat eigenen Pfad)
- [ ] FlowLink im Webhook/`after()` (service_role) erzeugen — Reuse `dispatchMagicLink`-Versand (WA→Email)
- [ ] Idempotenz: 1 Link pro Anfrage; `magic_link_gesendet_am` setzen; `check_gfa_rate_limit` gegen Spam
- [ ] **KEIN** neuer anon-Schreibpfad — alles service_role

### Phase 2 — Promotion beim Klick (token → Lead, service_role)
- [ ] `/flow/[token]`: beim ersten Klick Token validieren → wenn Anfrage noch nicht promotet → `konvertiereAnfrageZuFall`-äquivalent via service_role
- [ ] SV-Weiche aus §1 anwenden: `sv_id` der Anfrage übernehmen (Embed) ODER NULL lassen (intern → Dispatch/findBestSV später)
- [ ] Anfrage-Marker setzen (`konvertiert_zu_lead_id`, `status='konvertiert'`) — Anfrage selbst bleibt sonst unverändert

### Phase 3 — Selbst-Quali im FlowLink (das Quali-Gate)
- [ ] `DynamicWizard`/`saveStep`-Logik in den Token-Flow einhängen — Schuldfrage, Schadenart, Plausibilität
- [ ] Disqualifizierende Pfade 1:1 zur Dispatcher-Prüfung: Eigenverschulden / ungeeignete Schuldfrage → Abbruch/Umleitung, **kein** Termin
- [ ] `service_typ`/`regulierungs_modus` aus Wizard-Wahl auf Lead setzen (wie heute `finalizeAnfrage`)

### Phase 4 — SA + Termin-Selbstbuchung (auf dem Lead)
- [ ] SA-Signatur im Token-Flow (Reuse bestehende `/flow/[token]`-SA-Mechanik)
- [ ] Termin-Selbstbuchung: bei gesetztem `sv_id` → Slots **nur dieses SV** (slots.ts scoped); bei NULL → erst Dispatch/findBestSV-Zuweisung, dann Slots
- [ ] Termin token-gescopt schreiben (RLS-Vorlage `/kunde-termin/[token]`)

### Phase 5 — Verifikation + Smoke
- [ ] Positiv-Smoke: anon-Anfrage → FlowLink-Klick → Lead → Quali bestanden → SA → Termin gebucht (ohne Dispatcher)
- [ ] Negativ-Smoke: Eigenverschulden → Wizard bricht ab, kein Termin, kein Lead-Müll-Termin
- [ ] RLS-Smoke: Token A kann nicht auf Daten von Token B zugreifen
- [ ] Embed-Fall: sv_id gesetzt → nur dessen Kalender; intern → Dispatch-Zuweisung greift

## 4. Wiederverwendbare Bausteine (kein Neubau)
- `dispatchMagicLink` (src/lib/magic-link/) — FlowLink-Versand
- `/flow/[token]` — Token-Self-Service-Strecke (SA)
- `DynamicWizard`/`saveStep`/`finalizeAnfrage` (src/components/onboarding/) — Quali-Logik
- `konvertiereAnfrageZuFall` (src/lib/actions/) — Promotion
- `findBestSV` (src/lib/dispatch/) — globaler Matcher (NULL-Fall)
- `slots.ts` + `reservierter_sv_id` (src/lib/onboarding/) — SV-gescopte Slot-Auswahl
- `/kunde-termin/[token]` — RLS-Vorlage token-Termin
- `check_gfa_rate_limit` — Abuse-Schutz

## 5. Risiken
- **Quali-Logik-Treue (Hauptrisiko):** die Selbst-Quali muss die Dispatcher-Prüfung vollständig spiegeln, sonst unqualifizierte SV-Termine. Adversarial gegen die heutige Dispatch-Quali testen.
- **RLS/Token-Scope:** kein Daten-Leak über Token-Grenze; FlowLink-Erzeugung nie roh-anon.
- **NULL-sv_id-Pfad:** interne Self-Service-Anfrage ohne SV — wann/wie greift die Dispatch-Zuweisung? (Self-Service bis Quali+SA, dann Dispatch weist SV zu, DANN Termin — oder findBestSV-Auto-Vorschlag im Flow). **Offene Detailentscheidung für Phase 4.**

## 6. Offene Entscheidung für Aaron (Phase 4)
Bei **internen** Self-Service-Anfragen (sv_id NULL): Soll der Kunde den Termin erst buchen **nachdem** ein SV zugewiesen ist (Dispatch/findBestSV dazwischen), oder bucht er einen Wunsch-Slot und die SV-Zuweisung passt sich an? → klärt sich an Phase 4.
