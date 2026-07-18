# Werkstatt-Finder für Gutachter — Design-Spec (v2, re-baselined gegen origin/main)

- **Datum:** 2026-07-17
- **Branch:** `kitta/werkstatt-finder-fuer-gutachter` (Worktree, Base `origin/main` @ `1e222ab34` R70)
- **Status:** Design (v2) — wartet auf Review vor Implementierungsplan

## 0. Re-Baseline-Notiz (WICHTIG — warum v2)

v1 dieser Spec entstand auf einem **veralteten** geteilten Branch und beschrieb den Neubau eines Finders/Matchings/Assign, das auf `origin/main` **längst existiert** („Spec B", Aaron 14.07.). v2 baut ausschließlich den **Delta**, den der Bestand nicht hat.

**Bereits live auf main (wird WIEDERVERWENDET, nicht neu gebaut):**
- **Matching-Engine** `src/lib/werkstatt/matching/rank-vorschlaege.ts` — rankt Marke > Gewerke > Fahrzeuggruppe > verifiziert > Distanz, mit sichtbaren Gründen (`gruende: MatchGrund[]`), GBP-Trust-Chips. Pure + vitest-getestet.
- **Loader** `src/lib/werkstatt/matching/lade-vorschlaege.ts` → `findWerkstattVorschlaegeFuer({target:'lead'|'claim', id, nurEchte?})` — lädt Kandidaten, Anker = Fahrzeugstandort, **Bedarf Gutachten-gespeist** über `src/lib/werkstatt/bedarf/ermittle-bedarf.ts` (Gutachten conf 100 > Foto-KI > manuell). → **erfüllt „extrahierte Werte steuern die Suche".**
- **Finder-UI** `src/components/werkstatt/finder/WerkstattFinder.tsx` — Liste + Gründe-Chips + `onSelect`.
- **SV-Zuweisung** `vermittleWerkstattAlsGutachter` (`src/app/gutachter/fall/[id]/actions.ts`) → `assignReparaturWerkstatt({target,id,werkstattId,quelle:'gutachter',actorUserId})` (`src/lib/werkstatt/vermittlung-server.ts`) → setzt `reparatur_werkstatt_*` + benachrichtigt den Kunden. **Provisions-Trigger** hängt daran (inbound Haftpflicht).
- **Werkstatt-Portal** `src/app/werkstatt/(shell)/auftraege/` inkl. `[claimId]/page.tsx`, `WerkstattAuftragDetail.tsx`, **Gutachten-PDF** (`__tests__/gutachten-pdf.test.ts`), Reparatur-Abschluss.
- **Dokument-Sichtbarkeit** `src/lib/dokumente/sichtbarkeit.ts` (getestet).
- **Vermittlungs-Kern** `src/lib/werkstatt/vermittlung-core.ts`: `brauchtWerkstattVermittlung`, `buildZuweisungPatch`, `VermittlungQuelle` (`'gutachter'` etc.).

## 1. Ziel & der genaue Delta

Bestand = **SV weist direkt zu** (SV wählt *eine* Werkstatt → sofort zugewiesen, Kunde nur *informiert*).
Ziel (Aaron, Option 1) = **SV empfiehlt 1–3 → Kunde wählt selbst → dann Portal.**

**Der Delta:**
1. SV wählt **bis zu 3** statt genau 1, und die Auswahl ist eine **Empfehlung** (kein sofortiges Assign).
2. Kunde bekommt **WhatsApp + Email** mit einer **eigenen Route** (adaptierter `WerkstattFinder`, kein Login), auf der er **eine** der empfohlenen Werkstätten wählt.
3. Erst die **Kundenwahl** feuert die **bestehende** `assignReparaturWerkstatt`-Kette.
4. Danach **loggt der Kunde sich ein und sieht alles im Portal** (bestehende Fallakte + Werkstatt-Portal).

## 2. Flow (End-to-End)

```
SV: Gutachten hochgeladen (Bestand) → OCR (Bestand) → Bedarf (Bestand, Gutachten-gespeist)
 └─ SV-Card "Werkstatt empfehlen": findWerkstattVorschlaegeFuer(top 5) → SV wählt 1–3 → "Empfehlung senden"
     └─ persistiert Empfehlungs-Batch (+ Token) → WhatsApp + Email an Kunde (Magic-Link)
Kunde: /werkstatt-empfehlung/[token] (kein Login) → adaptierter WerkstattFinder zeigt die 1–3
       + Gutachter-Profil + Gutachten-Kurzfassung → Kunde wählt EINE → confirm
     └─ assignReparaturWerkstatt({target:'claim', werkstattId, quelle:'gutachter'})  ← BESTAND
Kunde: loggt sich ein → /kunde/faelle/[id] zeigt die gewählte Werkstatt + Auftrag/Termin  ← BESTAND
Werkstatt: /werkstatt/(shell)/auftraege — Auftrag + Gutachten-PDF + schlägt Termin vor  ← BESTAND
```

## 3. Was NEU gebaut wird (nur das)

| # | Neu | Datei(en) |
|---|-----|-----------|
| N1 | Empfehlungs-Persistenz (Batch + 1–3 Kandidaten + Token) | Migration (2 additive Tabellen) |
| N2 | SV-Action „empfehlen" (1–3 statt Direkt-Assign) | `src/app/gutachter/fall/[id]/_actions/werkstatt-empfehlung.ts` |
| N3 | SV-Card: Mehrfachauswahl + „Empfehlung senden" | adapt `WerkstattVermittelnCard` → `WerkstattEmpfehlenCard` |
| N4 | Kunde-Magic-Link-Route (adaptierter Finder + Gutachter-Profil + Gutachten-Kurzfassung) | `src/app/werkstatt-empfehlung/[token]/page.tsx` + Client |
| N5 | Confirm-Action (Token-validiert) → `assignReparaturWerkstatt` | `src/app/werkstatt-empfehlung/[token]/actions.ts` |
| N6 | Benachrichtigung „Werkstatt-Empfehlung" (WhatsApp + Email) | Template + Send im N2-Pfad |

## 4. SV-seitige Auswahl (adapt, kein Neubau)

`WerkstattFinder` liefert `onSelect(id)` (Single). Für den SV-Empfehlen-Modus umhüllt die neue `WerkstattEmpfehlenCard` denselben Finder mit **Mehrfach-Auswahl-State** (bis zu 3, Rang = Auswahl-Reihenfolge) + einem **„Empfehlung senden"**-Button. Die Karten/Gründe-Chips bleiben identisch (Reuse). Der bestehende `vermittleWerkstattAlsGutachter` (Direkt-Assign) bleibt für Dispatch/Flow unangetastet; die **SV-Fallseite** rendert künftig die Empfehlen-Card statt der Direkt-Vermittel-Card (gleiche Gate-Bedingung `brauchtWerkstattVermittlung`).

## 5. Datenmodell (2 additive Tabellen, DDL via `apply_migration`, Regel 2)

```sql
create table public.werkstatt_empfehlung_batches (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims(id) on delete cascade,
  fall_id       uuid references public.faelle(id) on delete set null,
  empfohlen_von uuid not null,                 -- SV auth user id
  token         text not null unique,          -- Magic-Link (unguessbar)
  status        text not null default 'offen'
                check (status in ('offen','entschieden','zurueckgezogen','abgelaufen')),
  gewaehlte_werkstatt_id uuid references public.werkstaetten(id),
  expires_at    timestamptz not null,
  entschieden_am   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.werkstatt_empfehlungen (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.werkstatt_empfehlung_batches(id) on delete cascade,
  werkstatt_id   uuid not null references public.werkstaetten(id),
  rang           smallint not null default 1,   -- 1..3 Auswahl-Reihenfolge des SV
  distanz_km     numeric,                        -- Snapshot fürs Kunden-Frontend
  match_snapshot jsonb,                          -- Snapshot der gruende (Warum empfohlen)
  created_at     timestamptz not null default now()
);
```

`claim_id` via `resolveClaimId(admin, fallId)` bei Batch-Anlage.

**Sicherheit (Pflicht):** `revoke all on … from anon` + fail-closed Verify (Wurzel-Regel, Muster Mig `20260716215805`). RLS: SV `insert/select/update(zurueckziehen)` eigener Batches (`empfohlen_von = auth.uid()`); Kunde eingeloggt `select` eigener (Claim-Ownership). **Magic-Link-Confirm ohne Login** über security-definer-RPC/Server-Action mit **Token-Validierung** (nicht RLS). `anon`/Werkstatt: kein Zugriff auf Empfehlungen.

## 6. Kunde-Route (adaptierter Finder, kein Login)

- Route: `src/app/werkstatt-empfehlung/[token]/` (öffentlich; Muster `src/app/kunde-termin/[token]/`).
- `page.tsx` (server): Token → Batch (offen? nicht abgelaufen?) → 1–3 Empfehlungen (join `werkstaetten` via `findWerkstaetten`-Projektion) + **Gutachter-Profil** (Name/Firma/Avatar/Google-Bewertung, Reuse `GutachterCard`-Daten) + **Gutachten-Kurzfassung** (Schadenhöhe/Reparaturdauer aus `v_gutachten_werte`).
- Client: rendert **`WerkstattFinder`** (Reuse) mit `onSelect` = Wahl bestätigen → `waehleWerkstattAusEmpfehlung(token, werkstattId)`.
- Danach: „Danke — melden Sie sich in Ihrem Portal an, um alles zu verfolgen" + Login-Link → Fallakte (Bestand).

## 7. Confirm → Bestand feuert

`waehleWerkstattAusEmpfehlung(token, werkstattId)`:
1. Token → Batch validieren (offen, nicht abgelaufen, werkstattId ∈ Empfehlungen).
2. Batch → `entschieden` + `gewaehlte_werkstatt_id`.
3. **`assignReparaturWerkstatt({target:'claim', id: claim_id, werkstattId, quelle:'gutachter', actorUserId: null})`** (Bestand — setzt `reparatur_werkstatt_*`, benachrichtigt, Provisions-Trigger).
4. Idempotent (Doppel-Klick/Reload sicher: bereits entschieden → freundlicher Hinweis).

## 8. Benachrichtigung (WhatsApp + Email)

Im N2-Pfad nach Batch-Anlage: WhatsApp (Muster `sendCommunication`) + Email (Muster `src/lib/email`) an den Kunden mit dem Magic-Link. Non-critical in try/catch (Send-Fehler bricht die Empfehlung nicht). Test-/interne Identitäten (SSoT `interne-identitaet.ts`) unterdrücken echte Sends.

## 9. Requirements 5/6/8 — verifizieren statt bauen

Diese sind laut Bestand großteils erfüllt; im Plan als **Verifikationspunkte** (nicht Neubau):
- **Dokumente + extrahierte Werte im Auftrag** → `WerkstattAuftragDetail.tsx` + `gutachten-pdf.test.ts` prüfen; nur falls Lücke → schließen (kuratiert, **ohne** `gutachten_sv_honorar_*`).
- **Gutachten per Email an Werkstatt** → prüfen ob im Auftrags-/Assign-Pfad vorhanden; sonst ergänzen.
- **Gutachter-Profil** → im Werkstatt-Auftrag (`v_werkstatt_auftrag.gutachter_firmenname` vorhanden) + auf der Kunde-Route (N4) sicherstellen.

## 10. Provision (unverändert)

Über den bestehenden Pfad (`assignReparaturWerkstatt` → Trigger, inbound Haftpflicht). **Keine** eigene Logik. Externe Werkstatt (`reparatur_werkstatt_extern`) → keine Provision.

## 11. Sonderfälle

- Batch abgelaufen / bereits entschieden → freundlicher Zustand auf der Route.
- SV zieht zurück → Batch `zurueckgezogen`, Link tot.
- Kunde reagiert nicht → Reminder-Kadenz (Bestand); SV sieht „Empfehlung ausstehend".
- Nur 1 Werkstatt sinnvoll → SV darf auch 1 empfehlen (min 1, max 3).
- Totalschaden/fiktiv → Bestand zeigt Finder trotzdem (`brauchtWerkstattVermittlung` deckt `fiktiv`).

## 12. Sicherheit & Datensparsamkeit

Token unguessbar + `expires_at`; Confirm idempotent; neue Tabellen `revoke anon` + Verify; **kein** SV-Honorar/interne Notiz an Kunde/Werkstatt; DSGVO — Assign/Comms erst nach Kundenwahl.

## 13. Akzeptanzkriterien

1. SV sieht auf `/gutachter/fall/[id]` (Gate `brauchtWerkstattVermittlung`) die gerankte Liste und kann **1–3** als Empfehlung senden (nicht mehr Direkt-Assign).
2. Empfehlungs-Batch + Token entstehen; Kunde erhält WhatsApp **und** Email mit funktionierendem Magic-Link.
3. `/werkstatt-empfehlung/[token]` zeigt (ohne Login) die 1–3 Empfehlungen + Gutachter-Profil + Gutachten-Kurzfassung; Kunde wählt **eine**.
4. Die Wahl setzt via **bestehender** `assignReparaturWerkstatt` `claims.reparatur_werkstatt_id` (+ `quelle='gutachter'`); Provisions-Trigger feuert (inbound Haftpflicht).
5. Eingeloggt sieht der Kunde die gewählte Werkstatt + Auftrag im Portal (Bestand); die Werkstatt sieht den Auftrag inkl. Gutachten-PDF (Bestand).
6. Neue Tabellen: `anon` ohne Zugriff (Verify grün). Kein SV-Honorar an Kunde/Werkstatt sichtbar.

## 14. Phasen (Detailplan via writing-plans)

- **P0 — Migration:** 2 Empfehlungs-Tabellen + RLS + `revoke anon` + Verify; Types-Regen (Regel 2, inkl. `check:query-drift`).
- **P1 — SV empfehlen:** `WerkstattEmpfehlenCard` (Mehrfachauswahl, Reuse `WerkstattFinder`) + `empfehleWerkstaettenAlsGutachter` (Batch anlegen) + WhatsApp/Email-Notify. Fallseite auf Empfehlen-Card umstellen.
- **P2 — Kunde-Route:** `/werkstatt-empfehlung/[token]` (adaptierter Finder + Gutachter-Profil + Gutachten-Kurzfassung) + `waehleWerkstattAusEmpfehlung` → `assignReparaturWerkstatt`.
- **P3 — Verifikation Portal/Werkstatt:** Requirements 5/6/8 im Bestand prüfen, Lücken schließen (Gutachten-Email, Gutachter-Profil).
- **P4 — Regel-4-Prod-Smoke:** isolierte Testdaten (telefon=NULL), End-to-End SV→Kunde→Werkstatt.
