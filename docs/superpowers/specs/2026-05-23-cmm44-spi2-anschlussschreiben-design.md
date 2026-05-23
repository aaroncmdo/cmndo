# CMM-44 SP-I2 — AS + Mandatsnummer → `kanzlei_faelle` + LexDrive-SV-Embed (Design)

> **Ticket:** CMM-44 / Sub-Projekt SP-I (Kanzleifall-LC), Slice 2.
> **Status:** Design — Richtung von Aaron freigegeben (2026-05-23, „so speccen, eine Spec, 4 PRs"). Zwei Punkte zur Review markiert (§4, §8).
> **Vorgänger:** SP-I1 (`lexdrive_case_id`/`lexdrive_ocr_*`/`klage_uebergeben_am` → `kanzlei_faelle`, gemergt #1559). Muster: SP-H/SP-D (Sweep), SP-J (`claim-payments.ts` upsert-Helper).

## Goal

Den Anschlussschreiben-(AS-)Lifecycle + die Kanzlei-Mandatsnummer von `faelle` auf die 1:1-Sub-Table `kanzlei_faelle` umziehen (**rein additiv**, DROP→Phase 6), die rollen-differenzierte Anzeige **lean** halten (Kunde bekommt das Detail über die Kanzlei-WhatsApp), und dem SV das Mandat sichtbar machen — inkl. **eingebettetem LexDrive-Vorgang** (iframe auf `aktendetailansicht?recordId={lexdrive_case_id}`, SV nutzt sein eigenes LexDrive-Login) mit New-Tab-Deep-Link als Fallback.

## Scope-Entscheidungen (Aaron, 2026-05-23)

1. **Vollständig in die DB** — alle AS-Spalten ziehen um, kein Trimmen (konservativ; was unnötig ist, stirbt eh in Phase 6).
2. **`mandatsnummer` ist drin** — die Kanzlei spielt sie zurück (kein no-API-Blocker), der SV bekommt sie.
3. **Anzeige so klein wie möglich** — der Kunde erhält Detail über die **Kanzlei-WhatsApp**; wir zeigen nur Status, keine Doppel-Kommunikation (Haftungs-/Scope-Risiko vermeiden).
4. **Embed in dieser Slice** — der SV verfolgt das Mandat über **unser** Portal via eingebettetem LexDrive-Vorgang; SV hat „immer sein eigenes Sign-in" → **keine** SSO/Föderation nötig.

## Spalten in Scope (11)

Live gemessen 2026-05-23 (`paizkjajbuxxksdoycev`). Alle nullable, Backfill **no-op** (kein echter Datenbestand außer Defaults).

| Spalte | Typ | cov | Notiz |
|---|---|--:|---|
| `anschlussschreiben_am` | timestamptz | 0 | **Phase/SLA-Treiber** (state-machine setzt, VS-Frist) |
| `anschlussschreiben_url` | text | 0 | AS-PDF (admin upload) |
| `anschlussschreiben_sendedatum` | date | 0 | Sendedatum (subphase-resolver) |
| `anschlussschreiben_unterschrift` | boolean | 49 | **default `false`** auf allen Rows → View `COALESCE(…, false)` |
| `anschlussschreiben_ocr_am` | timestamptz | 0 | OCR-Zeitpunkt |
| `as_geforderte_summe` | numeric | 0 | Quote-Berechnung (`Sections.tsx`) |
| `as_frist` | date | 0 | AS→VS-Frist |
| `as_vs_reaktion_text` | text | 0 | VS-Reaktionstext |
| `as_salesforce_id` | text | 0 | gekoppelt an `mandatsnummer_vergeben`-Event |
| `as_zuletzt_synced_am` | timestamptz | 0 | Sync-Zeitpunkt |
| `mandatsnummer` | text | 12 | **Kanzlei/Salesforce-Mandat-ID** (s. §4) |

## Current State (empirisch 2026-05-23)

- **`kanzlei_faelle`**: 1:1 pro claim **und** fall (beide UNIQUE), **0 Rows**, 8 Basis-Spalten, Trigger `kanzlei_faelle_sync_claim_fall` (leitet claim_id↔fall_id bei INSERT ab), `status` NOT NULL ohne Default (Type: `'versicherungskontakt' | 'auszahlung'`). **Heute kein Row-Creator** — SP-I2 führt den ersten ein.
- **Views mit AS/mandatsnummer-Exposure**: `v_faelle_mit_aktuellem_termin` (alle 10 AS + mandatsnummer), `v_claim_full` (`anschlussschreiben_am`). `faelle_sv_view` exponiert **keine** AS-Spalten + **kein** `mandatsnummer` → muss für die SV-Sicht erweitert werden.
- **Rollen-Anzeige heute** (`section-visibility.ts` `ROLLE_SECTION_WHITELIST`): Admin sieht `kanzlei`+`as`, Kunde sieht `kanzlei` (nicht `as` als Section, aber Status-Card via `anschlussschreiben_am`), **SV sieht weder `kanzlei` noch `as`** (blind).
- **iframe-Feasibility**: `aktendetailansicht?recordId=…` → HTTP 200, **kein `X-Frame-Options`, kein CSP `frame-ancestors`** → **nicht frame-geblockt**. Offene Variable: LexDrive-Session-Cookie ist im iframe „third-party" → Safari/Chrome können es blocken (Login-Persistenz). → New-Tab-Fallback + Spike (§7).

## §4 · `mandatsnummer`-Semantik (REVIEW-PUNKT)

Live-Daten: `faelle.mandatsnummer` = Salesforce-IDs (`001Jz00001…`, 12×); `claims.claim_nummer` = `CLM-2026-NNNNN`. `filmcheck.ts:44` generiert zwar `CLM-YYYY-NNNN` in `mandatsnummer`, aber **kein einziger** Live-Wert ist ein CLM-String → der Write ist tot/überschrieben (seit `claim_nummer` SP-A3-kanonisch ist).

**Vorschlag (zur Bestätigung):**
- `mandatsnummer` = **Kanzlei/Salesforce-Mandat-ID** → MOVE auf `kanzlei_faelle.mandatsnummer`. Writer: `push-mandat.ts:226` + `process-event.ts:255-259` (`mandatsnummer_vergeben`).
- **`filmcheck.ts` CLM-YYYY-Generierung entfernen** (redundant zu `claim_nummer`) — beseitigt den Doppel-Write.
- **Display-Labels (Aaron: „beides")**: primäres Listen-Label `claim_nummer ?? id` in `search`/`admin-faelle-hub`/`kanban`/`PDF` (statt der hässlichen `001Jz…`-SF-ID); die **`mandatsnummer` zusätzlich** als Sekundär-Detail (Admin-Fallakte Kanzlei-Sektion, SV-Mandatsanzeige, Kanzlei-Kontext). Beide sichtbar — nur die SF-ID nicht mehr als Listen-Hauptlabel.

## Architektur — 4 PRs

### PR1 — Schema + View-Repoints (additiv)
- `ALTER TABLE kanzlei_faelle ADD COLUMN` × 11 (Typen exakt gespiegelt).
- `CREATE OR REPLACE VIEW v_faelle_mit_aktuellem_termin`: die 10 AS + `mandatsnummer` aus `kf.<col>` (neuer `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id`, 1:1, kein LATERAL), `anschlussschreiben_unterschrift` via `COALESCE(kf.anschlussschreiben_unterschrift, false)`.
- `CREATE OR REPLACE VIEW v_claim_full`: `anschlussschreiben_am` aus `kf.`.
- `CREATE OR REPLACE VIEW faelle_sv_view`: **+`mandatsnummer`, +`lexdrive_case_id`** aus `kf.` (für SV-Mandatsanzeige + Embed-recordId). **Kein** anderes AS-Feld (SV bleibt sonst lean).
- Backfill: **no-op** (cov=0; `unterschrift`-Default via View-COALESCE). `kanzlei_faelle` bleibt nach PR1 leer.
- Server-seitige DDL-Generierung (`pg_get_viewdef` + `replace()`, SP-I1-Lesson) statt Hand-Transkription. Migration via CLI (`db query --linked` + `repair`), kein `db push`.

### PR2 — Reader/Writer-Sweep + lean Anzeige
- **Neuer Helper `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts`** (analog `claim-payments.ts`): `upsertKanzleiFall(db, claimId|fallId, fields)` — UPSERT auf `kanzlei_faelle` (by `claim_id`), legt Row an falls keine existiert, **`status='versicherungskontakt'` beim Create** (Sync-Trigger füllt die jeweils andere FK). **Das ist der erste Row-Creator für `kanzlei_faelle`.**
- **Writer umstellen** auf den Helper: `state-machine.ts` (`anschlussschreiben_am`), `process-event.ts` (`as_versendet` → `anschlussschreiben_am`; `mandatsnummer_vergeben` → `mandatsnummer`+`as_salesforce_id`), `AnschlussschreibenUploadBlock`-Action (`url`/`sendedatum`/`unterschrift`/`ocr_am`), `push-mandat.ts` (`mandatsnummer`).
- **`filmcheck.ts`**: CLM-YYYY-Block + `mandatsnummer`-Write **entfernen** (§4).
- **Reader umstellen** (faelle-Direktzugriff → `kanzlei_faelle` via `claims:claim_id(kanzlei_faelle(...))`-Embed bzw. repointete View): AS-Reader (~15 Sites: autoPhase, cron/vs-timer, section-visibility, subphase-resolver, sla/completion-signals + blocker-detection, stepper-state, kb/phase-audit, kunde-cards, get-kunde-faelle, Sections) + mandatsnummer-Reader (~10 Sites: search, admin-faelle-hub, kanban, PDF, kanzlei-wunsch) mit Display-Label-Umstellung (§4).
- **Lean Anzeige:**
  - **Kunde**: `FallStatusCard` bleibt (AS-versendet + 14-Tage-Frist aus `anschlussschreiben_am`) + **eine** Zeile „Die Kanzlei meldet sich bei dir per WhatsApp". Keine Akten-/Mandatsnummer, kein PDF, keine VS-Beträge.
  - **SV**: bekommt `mandatsnummer` (read-only) in der SV-Fallakte (`faelle_sv_view`) **nur ab Kanzlei-Phase** (`mandatsnummer` gesetzt bzw. `kanzlei_uebergeben_am`). Embed kommt in PR3.
  - **Admin**: unverändert (`AnschlussschreibenUploadBlock`).
- Pattern: 1:1-Embed → `Array.isArray`-Normalisierung; Writer error-geguarded; `revalidatePath` nachziehen.

### PR3 — LexDrive-SV-Embed (iframe + Fallback)
- **Spike zuerst** (§7): mit echtem LexDrive-SV-Login testen, ob die `aktendetailansicht`-Seite im iframe eingeloggt bleibt (Third-Party-Cookie). Ergebnis steuert Default-Darstellung.
- **Komponente `src/components/gutachter/LexDriveMandatEmbed.tsx`** (Web-only): rendert `<iframe src={getLexdriveDeepLink(lexdrive_case_id)}>` in der SV-Fallakte, NUR wenn `lexdrive_case_id` gesetzt (= ab Kanzlei-Phase, deckt sich mit der mandatsnummer-Sichtbarkeit). Darüber: `mandatsnummer` + Button **„Bei LexDrive anmelden / in neuem Tab öffnen"** (`getLexdriveLoginUrl()` / Deep-Link, First-Party-Tab). Loading/Empty/Fehler-States.
- **Fallback-Strategie**: ist die iframe-Session (Spike) unzuverlässig → iframe zeigt nur einen „Vorgang bei LexDrive öffnen"-Aufruf + den New-Tab-Deep-Link als primäre Aktion. Der SV kommt **immer** zum Vorgang (Deep-Link funktioniert ohne Cookie-Tricks).
- Token-Audit: keine Inline-Hex; LexDrive-Brand `#0e5be9` ist bereits in `external-brand-colors.ts` gewhitelistet.
- `lexdrive-link.ts` (`getLexdriveDeepLink`/`getLexdriveLoginUrl`) wird wiederverwendet (keine Duplikation).

### PR4 — Catch-up-Backfill
- Idempotenter `UPDATE`/Upsert für Daten, die zwischen PR1-Apply und PR2-Writer-Deploy noch auf `faelle` landeten (COALESCE-Pattern, IS-NULL-geguarded). Da cov=0 realistisch ~leer.

## §7 · Embed-Spike (Teil von PR3, Step 1)

Mit einem echten LexDrive-SV-Account in `app.staging.claimondo.de` testen:
1. Lädt die `aktendetailansicht?recordId=…` im iframe ohne `frame-ancestors`-Block? (Header sagt ja — live bestätigen.)
2. **Bleibt der SV nach Login im iframe eingeloggt** (Third-Party-Cookie)? Test in Chrome + Safari.
3. Hilft ein vorheriger First-Party-Login (Popup/Tab) + `document.requestStorageAccess()`?

Ergebnis-Matrix → Default: (a) iframe inline wenn stabil; (b) sonst „im Tab öffnen" als primär + iframe nur als opt-in. **Kein** Spec-Risiko: der Deep-Link-Fallback liefert die Funktion in jedem Fall.

## Display-Matrix (Soll)

| | Kunde | SV | Admin |
|---|---|---|---|
| AS-Status | Status-Card „AS versendet" + 14-Tage-Frist + WA-Hinweis | — (kein AS-Detail) | volle AS-Sektion (Upload/OCR/Felder) |
| `mandatsnummer` | — | **read-only, ab Kanzlei-Phase** | sichtbar (sekundär neben claim_nummer) |
| LexDrive-Vorgang | — (Kanzlei-WhatsApp) | **Embed/Deep-Link, ab Kanzlei-Phase** (PR3) | Deep-Link (bestehend) |
| Akten-Interna (PDF/Beträge) | — | — | ja |

## Risiken

| Risiko | Mitigation |
|---|---|
| `mandatsnummer`-Display zeigt Salesforce-ID statt CLM | §4 Label-Umstellung auf `claim_nummer` — **Review-Punkt** |
| `upsertKanzleiFall` legt Rows mit falschem `status` an | Default `'versicherungskontakt'` beim Create (erste Kanzlei-LC-Stufe); in der Spec/Plan dokumentiert |
| iframe-Session bricht (3rd-party-cookie) | New-Tab-Deep-Link-Fallback (immer funktional); Spike entscheidet Default |
| Großer Sweep (~25 Sites) übersieht Reader | paren-balanced Re-Grep (SP-G/H-Muster) je Spalte; voller Build |
| `CREATE OR REPLACE VIEW` Typ-Kollision | Precision/Bool-Casts (`COALESCE(...,false)`); Dry-Run gegen Live-DB |
| `anschlussschreiben_unterschrift` false→null | View-`COALESCE(...,false)` |
| Embed = neue Haftungsfläche | nur read-only Fremd-Portal-Einbettung; unsere Anzeige bleibt lean (Kunde via Kanzlei-WA) |

## §8 · Bestätigte Entscheidungen (Aaron, 2026-05-23)

1. **Label = „beides"** — `claim_nummer` als primäres Listen-Label, `mandatsnummer` (SF-ID) zusätzlich als Sekundär-Detail (§4). Nicht entweder/oder.
2. **`filmcheck.ts` CLM-Write entfernen** — `claim_nummer` (initial bei Claim-Anlage vergeben) ist die einzige Fallnummer; kein zweiter Generator.
3. **SV-`mandatsnummer` + LexDrive-Embed nur ab Kanzlei-Phase** (`mandatsnummer` gesetzt bzw. `kanzlei_uebergeben_am`) — nicht generell, nicht whitelabel-gated.

## Definition of Done

- [ ] 11 Spalten additiv auf `kanzlei_faelle`; 3 Views repointet (`unterschrift` COALESCE; `faelle_sv_view` +mandatsnummer/lexdrive_case_id).
- [ ] `upsertKanzleiFall`-Helper; alle AS+mandatsnummer-Writer darüber; `filmcheck` CLM-Write entfernt; Re-Grep 0 live `faelle`-Zugriffe der 11 Spalten.
- [ ] Display: Kunde lean + WA-Hinweis, SV sieht mandatsnummer + LexDrive-Embed/Deep-Link **ab Kanzlei-Phase**, Admin unverändert; Listen-Label `claim_nummer` (primär) + `mandatsnummer` sekundär.
- [ ] Embed-Spike dokumentiert; Deep-Link-Fallback funktioniert.
- [ ] Build grün; 4/5-Portal-Smoke (Kunde-Frist-Card, SV-Mandat+Embed, Admin-AS, public Sanity) mit Screenshots.
- [ ] Phase-1-Mapping + Handoff + Memory nachgezogen.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
