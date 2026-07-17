# Werkstatt-Finder für Gutachter — Design-Spec

- **Datum:** 2026-07-17
- **Branch:** `kitta/werkstatt-finder-fuer-gutachter` (Worktree, Base `origin/main` @ `1e222ab34` R70)
- **Status:** Design abgeschlossen — wartet auf Review vor Implementierungsplan
- **Autor-Kontext:** Session 3f0a77b7

---

## 1. Ziel & Kontext

Der Sachverständige (SV/Gutachter) hat ein Fahrzeug besichtigt und sein **Gutachten hochgeladen**. Er ist der bestqualifizierte Vertrauensträger, um dem Kunden eine **passende Reparaturwerkstatt** vorzuschlagen. Diese Spec baut den SV-seitigen Weg: **Gutachten (vorhanden) → Werkstatt-Finder → Empfehlung (1–3) → Kunden-Bestätigung → Werkstatt-Auftrag** (KVA-frei, Gutachten-gespeist).

**Wichtige Abgrenzung zum Bestehenden:** Es gibt bereits einen *kunden-/flow-seitigen* Werkstatt-Auswahlweg (WIP in parallelen Lanes) und ein reiches Werkstatt-Auftrags-Datenmodell in der DB (`werkstaetten`, `v_werkstatt_auftrag`, Provisions-Trigger). Diese Spec **fügt den Gutachter-Einstieg hinzu** und **wiederverwendet** den bestehenden DB-Layer. Sie baut **kein** Werkstatt-Portal (das gehört den `werkstatt-*`-Lanes).

## 2. Akteure

| Akteur | Rolle im Flow |
|---|---|
| **SV / Gutachter** | lädt Gutachten hoch, öffnet Finder, empfiehlt 1–3 Werkstätten |
| **Kunde** | erhält Zugang per WhatsApp + Email, bestätigt genau eine Werkstatt (freie Werkstattwahl) |
| **Werkstatt** | erhält bei Bestätigung den Auftrag inkl. Gutachten-Briefing + Gutachten per Email; schlägt Termin vor (**delegiert** an Auftrags-/Portal-Lane) |
| **KB / Dispatch** | Sichtbarkeit/Eskalation (nutzt bestehende Auftrags-Views) |

## 3. End-to-End-Ablauf

1. **Gutachten hochladen** — SV, Bestand (`GutachtenUploadBanner` → Bucket `fall-dokumente`, Tabelle `fall_dokumente`, `auftraege.gutachten_url`).
2. **OCR** — Bestand (`gutachten`, `gutachten_positionen`, `gutachten_fotos`). Liefert Fahrzeugdaten, Positionen (Reparaturart/Kategorie), Kennzahlen (Reparaturkosten, Wertminderung, WBW, Restwert, Totalschaden).
3. **Werkstatt-Finder (SV)** — neue `WerkstattFinderCard` auf `/gutachter/fall/[id]`. Ranking **Gutachten-gespeist** (§6).
4. **Empfehlung** — SV markiert 1–3 Werkstätten (optional mit Begründung) → schreibt einen **Empfehlungs-Batch** (§5.1).
5. **Kunden-Zugang** — WhatsApp + Email mit Magic-Link auf `/werkstatt-empfehlung/[token]`. Kunde sieht die 1–3 Werkstätten, das **Gutachter-Profil** und eine **Gutachten-Kurzfassung**, und bestätigt eine (oder trägt eine eigene Werkstatt ein).
6. **Bestätigung → Auftrag** — kanonische Zuweisung (`claims.reparatur_werkstatt_id`, `reparatur_werkstatt_quelle='gutachter'`, `…_zugewiesen_von=SV`). Der bestehende Auftrag erscheint in `v_werkstatt_auftrag`; **Provisions-Trigger** feuert (nur inbound Haftpflicht). Werkstatt erhält **Dokumente + kuratierte Werte im Auftrag** (§7.3) **und das Gutachten per Email**.
7. **Terminvorschlag** — Werkstatt schlägt Reparaturtermin vor (**delegiert** an Auftrags-/Portal-Lane; `reparatur_termine` + Termin-Gegenvorschlag-Muster).

## 4. Scope-Grenze

**In Scope (dieses Feature baut):**
- SV-Finder-Card + Matching + Empfehlungs-Action
- Datenmodell für Empfehlungen (2 additive Tabellen)
- Kunde-Magic-Link-Seite + Bestätigungs-Action + In-App-Card (eingeloggt)
- Benachrichtigungen (WhatsApp + Email) an Kunde/Werkstatt/SV
- Werkstatt-**Datenkontrakt**: Dokumente-Sichtbarkeit (`sichtbar_fuer` += `werkstatt` + scoped RLS), Signed-URL-Accessor, kuratierte Werte, Gutachter-Profil
- Gutachten-Email an die Werkstatt
- Zuweisung über den bestehenden `reparatur_werkstatt_*`-Pfad (Provisions-korrekt)

**Out of Scope (delegiert / andere Lane):**
- Werkstatt-Portal-UI (`/werkstatt/*`) und die Termin-Vorschlags-Oberfläche
- KVA-Erfassung (entfällt — Gutachten-OCR ist die Basis)
- Verifizierung/Marken-Pflege der Werkstätten (Daten-Follow-up, Werkstatt-Onboarding-Lane)

## 5. Datenmodell

### 5.1 Neue Tabellen (additiv, DDL via `apply_migration`, Regel 2)

```sql
-- Ein Empfehlungs-"Batch" = ein SV-Empfehlungs-Ereignis = ein Magic-Link.
create table public.werkstatt_empfehlung_batches (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims(id) on delete cascade,
  fall_id       uuid references public.faelle(id) on delete set null,
  empfohlen_von uuid not null,                 -- SV auth user id
  token         text not null unique,          -- Magic-Link-Token (unguessbar)
  status        text not null default 'offen'
                check (status in ('offen','entschieden','zurueckgezogen','abgelaufen')),
  expires_at    timestamptz not null,
  entschieden_am   timestamptz,
  entschieden_von  uuid,                        -- Kunde auth user id (falls eingeloggt), sonst null
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.werkstatt_empfehlungen (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references public.werkstatt_empfehlung_batches(id) on delete cascade,
  werkstatt_id uuid not null references public.werkstaetten(id),
  rang         smallint not null default 1,     -- 1..3 Reihenfolge
  begruendung  text,                            -- optionaler SV-Kommentar
  distanz_km   numeric,                         -- Snapshot: Distanz Fall->Werkstatt zum Empfehlungszeitpunkt
  match_snapshot jsonb,                         -- Snapshot: Warum empfohlen (abgedeckte faehigkeiten, rating, marke_match) fuers Kunden-Frontend
  status       text not null default 'empfohlen'
               check (status in ('empfohlen','bestaetigt','abgelehnt')),
  created_at   timestamptz not null default now()
);
```

`claim_id` wird bei Batch-Anlage aus dem Fall via `resolveClaimId(admin, fallId)` aufgelöst (jeder begutachtete Fall hat einen Claim); `fall_id` bleibt als SV-Anker erhalten.

**Sicherheit (Pflicht, Wurzel-Regel anon-Grants):** beide Tabellen `revoke all on … from anon;` + fail-closed Verify (Muster Mig `20260716215805`). RLS:
- **SV** darf eigene Batches/Empfehlungen `insert`/`select`/`update(zurueckziehen)` (Gate über `sv_id` des Falls / `empfohlen_von = auth.uid()`).
- **Kunde** (eingeloggt) darf Batch+Empfehlungen seines eigenen Claims `select` + bestätigen (`update`).
- **Magic-Link-Bestätigung ohne Login** läuft über eine `security definer`-RPC / Server-Action, die den **Token** validiert (nicht RLS).
- **Werkstatt/anon:** kein Zugriff auf Empfehlungen (erst nach Bestätigung wird es ein Auftrag).

### 5.2 Wiederverwendete Spalten (keine DDL)

- **Zuweisung** auf `claims` (+ `leads` analog): `reparatur_werkstatt_id`, `reparatur_werkstatt_zugewiesen_am`, `reparatur_werkstatt_zugewiesen_von`, `reparatur_werkstatt_quelle` (CHECK erlaubt **`gutachter`** bereits), `reparatur_werkstatt_extern`, `freie_werkstattwahl`.
- **Werkstatt-Stammdaten** `werkstaetten`: `lat`,`lng`,`isochrone`,`faehigkeiten[]`,`marken[]`,`fahrzeug_gruppen[]`,`ist_freie_werkstatt`,`verifiziert`,`partner`,`status`,`provision_betrag_netto`,`provision_aktiv`,`google_rating`,`google_review_count`,`user_id`,`ansprechpartner_name`.
- **Gutachten** `gutachten`, `gutachten_positionen` (`position_nr`,`bezeichnung`,`kategorie`,`reparaturart`,`schadensbetrag_netto/brutto`,`arbeitszeit_aw`), `gutachten_fotos`.
- **Auftrags-Sicht** `v_werkstatt_auftrag` (trägt bereits `gutachter_firmenname`, `gutachten_bericht_pdf_url`, `gutachten_reparaturkosten_*`, `gutachten_minderwert/restwert/wiederbeschaffungswert`, `gutachten_totalschaden`, `provision_*`). **Nicht** modifizieren (Lane-Eigentum) — bei Bedarf Companion-Accessor.
- **Provision** über bestehenden Trigger `create_werkstatt_provision` (nur inbound Haftpflicht).

### 5.3 Dokumente-Sichtbarkeit (kleine additive Migration)

- `fall_dokumente.sichtbar_fuer` (ARRAY) kennt aktuell `{admin,kanzlei,kunde,kundenbetreuer,sachverstaendiger}` — **`werkstatt` ergänzen** (Vokabular + bei Auftrag-Anlage auf den relevanten Docs setzen).
- **Scoped RLS SELECT** auf `fall_dokumente` für Werkstätten: `is_werkstatt_for_claim(claim_id)` (Funktion existiert) **und** `'werkstatt' = any(sichtbar_fuer)` **und** `kategorie/dokument_typ` im erlaubten Set (Gutachten + Anlagen + Fotos).
- Bucket `fall-dokumente` ist privat → **Signed-URLs zur Laufzeit** (Memory-Regel „gespeicherte URL ≠ abrufbare URL"), nie persistierte URLs.

## 6. Matching-Algorithmus (Gutachten-gespeist)

**Input** (aus `claimId`): Anker-Koordinate `faelle.besichtigungsort_lat/lng` → Fallback `claims.schadenort_lat/lng` → Fallback Geokodierung `faelle.kunde_plz`. Fahrzeug (Hersteller/Typ aus Claim + `gutachten`). Benötigte Fähigkeiten = Ableitung aus `gutachten_positionen.reparaturart`/`kategorie` (z. B. Lack, Karosserie, Mechanik, Glas). `gutachten_totalschaden`-Flag.

**Eignung (Filter):** `status` aktiv **und** `provision_aktiv` **und** `lat/lng not null`. Bewusst **nicht** hart auf `verifiziert` (nur 1 von 19 verifiziert → Finder sonst leer).

**Ranking (gewichtet):**
1. **Distanz** (primär) `besichtigungsort → werkstatt` aufsteigend (Haversine; `isochrone` optional als Fahrzeit-Verfeinerung).
2. **Fähigkeits-Abdeckung** — Anteil der benötigten `faehigkeiten`, den die Werkstatt abdeckt (17/19 gepflegt → wirkt heute).
3. **Marken-/Gruppen-Match** — `marken` enthält Hersteller **oder** `ist_freie_werkstatt`; `fahrzeug_gruppen`-Match (Boost; `marken` aktuell 0 gepflegt → neutral bis Datenpflege).
4. **Trust** — `verifiziert`, `google_rating`×`google_review_count` (Boost/Badge).

**Ausgabe:** Top-N (z. B. 8) an den SV; SV wählt 1–3.

**Graceful Degradation:** läuft OCR noch, entfällt die Fähigkeits-Ableitung → Ranking auf Distanz + bekannte Fahrzeugdaten, mit Hinweis „Gutachten wird noch ausgewertet". **Totalschaden:** Hinweis „wirtschaftlicher Totalschaden — Reparatur ggf. unwirtschaftlich", Liste bleibt sichtbar (Präzedenz: `fiktiv` zeigt Finder trotzdem).

**Finder-Logik ≠ Empfehlungen (Trennung der Zuständigkeiten):** Das Ranking ist ein eigenständiges, wiederverwendbares Server-Modul (`src/lib/werkstatt/finder.ts`), das **live** läuft und **nichts** persistiert. Erst bei „Empfehlen" wird das Ergebnis der SV-Auswahl (Werkstatt-IDs, Rang, `distanz_km`, `match_snapshot`) in `werkstatt_empfehlungen` eingefroren. So bleibt das Ranking Single-Source und ist mit einem künftigen kunden-/flow-seitigen Finder teilbar; der Snapshot hält die dem Kunden gezeigte Begründung stabil, auch wenn sich Werkstatt-Stammdaten später ändern.

## 7. Oberflächen

### 7.1 SV — `WerkstattFinderCard`
- Ort: `src/app/gutachter/fall/[id]/_components/WerkstattFinderCard.tsx` (client), Props aus `page.tsx`, gerendert in `FallDetailClient.tsx`.
- Gate: erscheint, sobald Gutachten vorhanden (`auftraege.gutachten_url` / `gutachten`-Row).
- Inhalt: gerankte Kartenliste (Top ~8: Name, Distanz, Google-Bewertung, Match-Badge „deckt Lack+Karosserie ab").
- Auswahl (so wählt der SV): antippen von bis zu **3** Karten → Rang 1/2/3 in Auswahl-Reihenfolge, optional je kurze Begründung; „Empfehlung senden" (min 1, max 3). Zusätzlich: Suche über **alle** Werkstätten (falls SV eine bestimmte im Kopf hat) + „externe Werkstatt eintragen". Liste-first; Map = optionale Ausbaustufe.
- Action: `src/app/gutachter/fall/[id]/_actions/werkstatt-empfehlung.ts` (`{ ok, error? }`-Pattern) → legt Batch + Zeilen an, triggert Kunden-Benachrichtigung, `revalidatePath('/gutachter/fall/${id}')`.
- Matching-Query als Server-Action, Analog zu `src/lib/actions/gutachter-finder-actions.ts`.
- Karte statt handgerolltem Markup: `primitives`/`shared` gemäß Komponenten-Set-Policy.

### 7.2 Kunde — Magic-Link-Empfehlungsseite
- Route: `src/app/werkstatt-empfehlung/[token]/` (öffentlich, kein Login; Muster `/kunde-termin/[token]`).
- `page.tsx` (server): Token → Batch + Empfehlungen (join `werkstaetten`) + **Gutachter-Profil** (§7.4) + **Gutachten-Kurzfassung** (Schadenhöhe, Reparaturdauer, Fahrzeug).
- Client: Auswahl einer Werkstatt → Bestätigung; alternativ „eigene Werkstatt eintragen" (`reparatur_werkstatt_extern` + `freie_werkstattwahl=true`).
- Bestätigungs-Action validiert Token (security-definer/service-role), setzt Batch/Empfehlungs-Status, ruft die **Zuweisung** auf (§6-Konsequenz).
- Zusätzlich für eingeloggte Kunden: dieselbe Empfehlung als Card in `/kunde/faelle/[id]`.

### 7.3 Werkstatt — Auftrags-Datenkontrakt (bereitgestellt, gerendert von der Portal-Lane)
Server-Accessor `getWerkstattGutachtenBriefing(claimId, werkstattId)`, guarded via `is_werkstatt_for_claim`, liefert:
- **Dokumente:** `[{ dokument_typ, name, signedUrl, groesse }]` aus `fall_dokumente` (Gutachten-PDF, Fotos, Anlagen) — Signed-URLs zur Laufzeit.
- **Kuratierte Werte:** Fahrzeug, Positionen (`nr, bezeichnung, kategorie, reparaturart, betrag_netto, arbeitszeit_aw`), Kennzahlen (Reparaturkosten, Wertminderung, WBW, Restwert, Totalschaden, Reparaturdauer). **Ausgeschlossen:** `gutachten_sv_honorar_*`, interne Notizen (Datensparsamkeit, §9).
- **Gutachter-Profil** (§7.4).
Zusätzlich **Gutachten-PDF per Email** an die Werkstatt bei Bestätigung (zuverlässiger Kanal, portal-unabhängig).

### 7.4 Gutachter-Profil (Kunde + Werkstatt)
- Für Kunde: Reuse `src/app/kunde/_components/GutachterCard.tsx`-Daten (Name, Avatar, Google-Bewertung, „Ihr Gutachter"). Auf der Empfehlungsseite als Vertrauensanker: „Ihr Gutachter [Firma] empfiehlt".
- Für Werkstatt: `{ firmenname, name, telefon, avatarUrl, verifiziert }` (Quelle `sachverstaendige`/`profiles`; `v_werkstatt_auftrag.gutachter_firmenname` als Anker).

## 8. Benachrichtigungen (Reuse `src/lib/notifications/*`, WhatsApp + Email-Templates)

| Ereignis | Empfänger | Kanal |
|---|---|---|
| SV empfiehlt | Kunde | **WhatsApp + Email** (Magic-Link) |
| Kunde bestätigt | Werkstatt | Email (Gutachten-PDF + Briefing) + In-App-Auftrag |
| Kunde bestätigt | SV | In-App („Kunde hat Werkstatt bestätigt") |
| Kunde reagiert nicht | Kunde | Reminder-Kadenz (bestehende Infra) |

Non-kritische Sends in `try/catch` (Twilio-/Email-Fehler dürfen die Status-Transition nicht atomar brechen — AGENTS.md Server-Action-Pattern).

## 9. Sicherheit & Datensparsamkeit

- **Kein SV-Honorar / keine internen Notizen** an die Werkstatt (kuratierter Subset). Das Gutachten-PDF selbst ist teilbar (enthält keine internen Honorar-DB-Felder).
- Neue Tabellen **`revoke all from anon`** + fail-closed Verify (anon-Grant-Wurzel).
- Dokumente-Zugriff der Werkstatt strikt scoped über `is_werkstatt_for_claim`.
- Magic-Link-Token unguessbar + `expires_at`; Bestätigung idempotent (Doppel-Klick/Reload sicher).
- Externe Werkstatt: DSGVO — Gutachten-Versand nur nach expliziter Kunden-Bestätigung.

## 10. Provision

Ausschließlich über den bestehenden Pfad: Setzen von `reparatur_werkstatt_id` (+ `quelle='gutachter'`, `zugewiesen_von=SV`) → Trigger `create_werkstatt_provision` (nur **inbound Haftpflicht**). **Keine** eigene Provisions-Logik, keine Doppel-Provision. Externe Werkstatt → keine Provision.

## 11. Sonderfälle

- **Totalschaden** (OCR) → Hinweis, Liste bleibt.
- **Fiktive Abrechnung / kein Reparaturwunsch** → Finder optional sichtbar (Präzedenz).
- **Freie Werkstattwahl / eigene Werkstatt** → `reparatur_werkstatt_extern`, keine Provision, Gutachten per Email dorthin.
- **Keine Treffer in Reichweite** → Radius erweitern / externe Werkstatt eintragen.
- **Kunde reagiert nicht** → Reminder; SV/KB sehen Status „Empfehlung ausstehend".
- **SV zieht Empfehlung zurück** → Batch `zurueckgezogen`, Magic-Link tot.
- **Werkstatt lehnt ab / Gegenvorschlag** → Termin-Verhandlung (delegierte Lane).

## 12. Wiederverwendungs-Karte

| Zweck | Bestehendes Artefakt |
|---|---|
| SV-Fallansicht | `src/app/gutachter/fall/[id]/` (page/FallDetailClient/_components) |
| Gutachten-Upload | `src/app/api/sv/upload-gutachten/` + `GutachtenUploadBanner` |
| OCR | `src/lib/ai/gutachten-ocr.ts`, `src/lib/gutachten/ocr-actions.ts` |
| Geo-Finder-Muster | `src/lib/actions/gutachter-finder-actions.ts`, `src/app/embed/gutachter-finder/` |
| Magic-Link-Muster | `src/app/kunde-termin/[token]/`, `src/app/sv/termin/[token]/`, `flow_links` |
| Termin-Gegenvorschlag | `KundeTerminGegenvorschlag`-Email + `reparatur_termine` |
| Gutachter-Profil-Card | `src/app/kunde/_components/GutachterCard.tsx` |
| Werkstatt-Auftrag-Sicht | `v_werkstatt_auftrag`, `is_werkstatt_for_claim`, `my_werkstatt_ids` |
| Comms | `src/lib/notifications/*`, WhatsApp/Email-Templates |

## 13. Offene Punkte / Follow-ups (nicht-blockierend, andere Lanes)

- **Datenpflege Werkstätten:** nur 1/19 verifiziert, 0/19 `marken` gepflegt → Verifizierung + Marken pflegen, damit Trust & Marken-Match voll greifen (Werkstatt-Onboarding-Lane).
- **Werkstatt-Portal-UI + Terminvorschlag** (delegiert).
- **DB-Types** nach Migration regenerieren (`generate_typescript_types`), da Types der DB hinterherhinken.

## 14. Koordination mit parallelen Werkstatt-Lanes

- Isolierter Worktree/Branch. **Memory-Marker** setzen, dass die SV-Empfehlungs-Lane in die geteilten `reparatur_werkstatt_*`-Spalten schreibt und `v_werkstatt_auftrag` speist.
- `v_werkstatt_auftrag` **nicht** modifizieren (Lane-Eigentum) — Companion-Accessor statt View-Änderung.
- Keine Werkstatt-Portal-Files anfassen.

## 15. Umsetzungs-Reihenfolge (Phasen — Detailplan folgt via writing-plans)

- **P0 — Migration:** 2 Empfehlungs-Tabellen + `sichtbar_fuer`-Vokabular `werkstatt` + scoped RLS + `revoke anon` + Verify; Types-Regen.
- **P1 — SV-Finder:** Matching-Query (Gutachten-gespeist) + `WerkstattFinderCard` + Empfehlungs-Action (Batch anlegen).
- **P2 — Kunde:** Magic-Link-Seite + Bestätigungs-Action + In-App-Card + WhatsApp/Email-Notify.
- **P3 — Auftrag/Werkstatt:** Zuweisung (`reparatur_werkstatt_*`) + Briefing-Accessor (Dokumente Signed-URL + kuratierte Werte + Gutachter-Profil) + Dokumente-Sichtbarkeit + Gutachten-Email + SV-Notify.
- **P4 — Sonderfälle & Smoke:** Totalschaden/extern/Reminder + Regel-4-Prod-Smoke (isolierte Testdaten, keine echte Person).

## 16. Akzeptanzkriterien

1. SV sieht auf `/gutachter/fall/[id]` nach Gutachten-Upload eine gerankte Werkstatt-Liste, deren Reihenfolge Distanz + Gutachten-abgeleitete Fähigkeiten widerspiegelt.
2. SV kann 1–3 Werkstätten empfehlen; ein Empfehlungs-Batch + Magic-Link entsteht.
3. Kunde erhält WhatsApp **und** Email mit funktionierendem Magic-Link; sieht Empfehlungen, Gutachter-Profil und Gutachten-Kurzfassung.
4. Kunde bestätigt genau eine Werkstatt (oder trägt eine externe ein); die Zuweisung landet in `claims.reparatur_werkstatt_id` mit `quelle='gutachter'`.
5. Bei Bestätigung erscheint der Auftrag in `v_werkstatt_auftrag`; die Werkstatt erhält Zugriff auf Dokumente (Signed-URL, scoped) + kuratierte Werte + Gutachter-Profil **und** das Gutachten per Email.
6. **Kein** SV-Honorar / interne Notiz ist für die Werkstatt sichtbar.
7. Provision entsteht ausschließlich über den bestehenden Trigger (inbound Haftpflicht); externe Werkstatt → keine Provision.
8. Neue Tabellen: `anon` hat keinerlei Zugriff (Verify grün).
