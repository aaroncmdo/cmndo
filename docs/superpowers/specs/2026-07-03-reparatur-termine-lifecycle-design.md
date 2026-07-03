# SP2 — Reparaturtermin-Lifecycle (`reparatur_termine`) — Design

> Sub-Projekt 2 von 4 des Kunde→Werkstatt-Vermittlung-Ausbaus (SP1 = fachliches Matching, PR #3530). Dieses SP fügt den **Reparaturtermin** als eigenen DB-getriebenen Lifecycle hinzu: der Kunde schlägt im Flow direkt nach der Werkstatt-Wahl einen Wunschtermin vor, die Werkstatt bestätigt / bittet um Rückruf / lehnt ab. Die Claim-„Phase" wird aus dem Termin-Status **abgeleitet** (kein Eingriff in `operative_status`).

**Datum:** 2026-07-03 · **Session:** cec48090 · **Branch:** `kitta/reparatur-termine-lifecycle` (off `staging`)

---

## 1. Ziel & Abgrenzung

**Ziel:** Ein Reparaturtermin bekommt einen sauberen, eigenen Lebenszyklus in einer **neuen Tabelle** `reparatur_termine`, entkoppelt von SV-Terminen (`gutachter_termine`) und der Reparatur-*Freigabe* (`claims.reparatur_freigegeben_am`). Der Kunde gibt den Wunschtermin so unkompliziert wie möglich an (ein Datum/Uhrzeit, keine Slot-Kalender-Maschinerie); die Werkstatt reagiert mit einem von drei Schritten.

**In Scope (SP2):**
1. Tabelle `reparatur_termine` (+ RLS) und Spalte `leads.reparatur_wunschtermin`.
2. Reiner Phasen-Ableitungs-Helper (`reparaturTerminPhase`) + Tests.
3. Flow-Eingabe: `WunschterminPicker` direkt nach der Werkstatt-Wahl im `FlowWerkstattStep` → speichert `leads.reparatur_wunschtermin` (optional, überspringbar).
4. Lead→Claim-Conversion legt bei vorhandenem Wunschtermin die `reparatur_termine`-Zeile an (`status='angefragt'`).
5. `v_werkstatt_auftrag` bekommt den aktiven Reparaturtermin additiv angejoint.
6. Werkstatt-Fläche (`/werkstatt/auftraege`): Termin anzeigen + Aktionen **Bestätigen / Anrufen / Ablehnen** (Server-Actions, RLS-gegated) + In-App-Benachrichtigung an den Kunden.

**Out of Scope (spätere SP):**
- Kunde-Portal-Sicht des Termins (Fallakte-Card, Stepper-Phase) + Kunde-SELECT-RLS + Kunde-Storno → **SP4**.
- Gutachten/OCR an die Werkstatt → **SP3**.
- WhatsApp/Email an den Kunden bei Statuswechsel (SP2 macht In-App-Notification; WA/Email = Follow-up, um die Notification-Infra anderer Sessions nicht anzufassen).
- Kalender-Sync / freie Slots / Mehrfach-Terminvorschläge — bewusst nicht (Aaron: „so unkompliziert wie möglich").

---

## 2. Datenmodell

### 2.1 Neue Tabelle `reparatur_termine`

```sql
CREATE TABLE public.reparatur_termine (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id             uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  werkstatt_id         uuid NOT NULL REFERENCES public.werkstaetten(id),
  wunschtermin         timestamptz NOT NULL,              -- vom Kunden vorgeschlagen (UTC)
  bestaetigter_termin  timestamptz,                        -- von der Werkstatt bestätigt; NULL bis 'bestaetigt'
  status               text NOT NULL DEFAULT 'angefragt'
                         CHECK (status IN ('angefragt','bestaetigt','anruf_erbeten','abgelehnt','erledigt','storniert')),
  absage_grund         text,                               -- nur bei 'abgelehnt'
  erstellt_von         uuid,                               -- geschaedigter_user_id (nullable — Flow accountless)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reparatur_termine_claim_id_idx     ON public.reparatur_termine(claim_id);
CREATE INDEX reparatur_termine_werkstatt_id_idx ON public.reparatur_termine(werkstatt_id);
```

- **`claim_id`** ist die Anker-Beziehung. `ON DELETE CASCADE`: der Termin stirbt mit dem Claim (konsistent mit den `delete_fall_komplett`-Erwartungen). `werkstatt_id` = einfacher FK (Werkstätten werden praktisch nie gelöscht).
- **`updated_at`** wird von den Server-Actions bei jedem Write mitgesetzt (`updated_at: new Date().toISOString()`) — kein Trigger (das Projekt hat keinen einheitlichen `moddatetime`-Trigger; explizit im Action-Code ist DB-getrieben genug und vermeidet stille Trigger-Kopplung).
- Kein `_am`-Audit-Feld je Status — `status` + `updated_at` tragen den Audit-Signalwert (Regel „so unkompliziert").

### 2.2 RLS auf `reparatur_termine`

```sql
ALTER TABLE public.reparatur_termine ENABLE ROW LEVEL SECURITY;

-- Lesen: Staff + die für den Claim zuständige Werkstatt. (Kunde-SELECT folgt in SP4.)
CREATE POLICY reparatur_termine_select ON public.reparatur_termine
  FOR SELECT TO authenticated
  USING ( is_staff() OR is_werkstatt_for_claim(claim_id) );

-- Schreiben (INSERT): nur Staff. Die Conversion läuft über den Admin-Client (Service-Role bypassed RLS ohnehin).
CREATE POLICY reparatur_termine_insert ON public.reparatur_termine
  FOR INSERT TO authenticated
  WITH CHECK ( is_staff() );

-- Ändern (UPDATE): Staff + die zuständige Werkstatt (bestätigt/ruft an/lehnt ab).
CREATE POLICY reparatur_termine_update ON public.reparatur_termine
  FOR UPDATE TO authenticated
  USING ( is_staff() OR is_werkstatt_for_claim(claim_id) )
  WITH CHECK ( is_staff() OR is_werkstatt_for_claim(claim_id) );
```

Die Werkstatt-Confirm-Actions laufen über die **authentifizierte Werkstatt-Session** (`createClient()`), die RLS-UPDATE-Policy ist der eigentliche Schutz. Kein Admin-Client für die Confirm-Aktionen (kein RLS-Bypass, kein IDOR-Risiko).

### 2.3 Neue Spalte `leads.reparatur_wunschtermin`

```sql
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reparatur_wunschtermin timestamptz;
COMMENT ON COLUMN public.leads.reparatur_wunschtermin IS
  'Vom Kunden im Flow (nach Werkstatt-Wahl) vorgeschlagener Reparatur-Wunschtermin (UTC). Bei Lead->Claim-Conversion wird daraus die reparatur_termine-Zeile (status=angefragt) angelegt.';
```

Bewusst **eigene Spalte**, getrennt von `leads.wunschtermin` (das ist der SV-**Besichtigungs**-Wunschtermin aus der Flow-Wunschtermin-Arbeit) — Reparaturtermin ≠ Besichtigungstermin.

---

## 3. Lifecycle (Zustandsmaschine)

```
                    ┌─────────────┐
   Kunde (Flow) ───▶│  angefragt  │
                    └──────┬──────┘
         Werkstatt wählt einen von drei Wegen:
              │            │            │
        Bestätigen     Anrufen       Ablehnen
              ▼            ▼            ▼
        ┌───────────┐ ┌──────────────┐ ┌───────────┐
        │ bestaetigt│ │ anruf_erbeten│ │ abgelehnt │
        └─────┬─────┘ └──────┬───────┘ └───────────┘
              │              │  (nach Telefonat bestätigt die Werkstatt einen Termin)
              │              └──────────▶ bestaetigt
              │
      erledigt │ storniert  (Reparatur fertig / abgesagt — Werkstatt oder Staff)
```

| Übergang | Auslöser | Effekt |
|---|---|---|
| `→ angefragt` | Conversion (Kunde hat Wunschtermin gesetzt) | Zeile angelegt, `bestaetigter_termin=NULL` |
| `angefragt → bestaetigt` | Werkstatt „Bestätigen" | `bestaetigter_termin = wunschtermin`, Notify Kunde |
| `angefragt → anruf_erbeten` | Werkstatt „Anrufen" | Notify Kunde („Werkstatt meldet sich telefonisch") |
| `angefragt → abgelehnt` | Werkstatt „Ablehnen" (+ Grund) | `absage_grund` gesetzt, Notify Kunde |
| `anruf_erbeten → bestaetigt` | Werkstatt bestätigt nach Telefonat | `bestaetigter_termin` gesetzt, Notify Kunde |
| `bestaetigt → erledigt` | Werkstatt/Staff | Reparatur abgeschlossen |
| `* → storniert` | Staff (SP2) / Kunde (SP4) | Termin abgesagt |

Die Actions prüfen **keine** strikte Übergangs-Matrix per DB-Constraint (YAGNI) — die UI zeigt nur die im jeweiligen Status gültigen Buttons. Ein CHECK auf die erlaubten Status-Werte (s. 2.1) reicht.

---

## 4. Phasen-Ableitung (reiner Helper)

Statt eines neuen `operative_status`-Werts wird die „Reparaturtermin-Phase" **abgeleitet** — ein reiner, testbarer Helper, den sowohl die Werkstatt-Fläche (SP2) als auch der Kunde-Stepper (SP4) konsumieren.

```ts
// src/lib/werkstatt/reparatur-termin-phase.ts
export type ReparaturTerminStatus =
  | 'angefragt' | 'bestaetigt' | 'anruf_erbeten' | 'abgelehnt' | 'erledigt' | 'storniert'

export interface ReparaturTerminPhase {
  key: ReparaturTerminStatus | 'kein_termin'
  label: string            // kunden-/werkstatt-sichtbar, echte Umlaute
  ton: 'neutral' | 'info' | 'success' | 'warning'
}

/** Leitet die Anzeige-Phase aus dem Termin-Status ab. null = noch kein Termin. */
export function reparaturTerminPhase(status: ReparaturTerminStatus | null): ReparaturTerminPhase
```

Mapping (Labels final, echte Umlaute):

| status | key | label | ton |
|---|---|---|---|
| `null` | `kein_termin` | „Kein Reparaturtermin" | neutral |
| `angefragt` | `angefragt` | „Wunschtermin angefragt" | info |
| `anruf_erbeten` | `anruf_erbeten` | „Werkstatt meldet sich" | info |
| `bestaetigt` | `bestaetigt` | „Termin bestätigt" | success |
| `erledigt` | `erledigt` | „Reparatur abgeschlossen" | success |
| `abgelehnt` | `abgelehnt` | „Termin abgelehnt" | warning |
| `storniert` | `storniert` | „Termin storniert" | neutral |

Der Helper liegt in `src/lib/werkstatt/` (client-safe, kein `'use server'`), damit SP4 ihn ohne Server-Kopplung importieren kann.

---

## 5. Flow-Eingabe (Kunde schlägt Wunschtermin vor)

**Ort:** `src/app/flow/[token]/FlowWerkstattStep.tsx` (gehört #3433 / Session 1069c2a2 — **additiv** anfassen, s. §8).

**Ablauf:** Nachdem der Kunde eine Werkstatt gewählt hat und `assignReparaturWerkstatt` erfolgreich war, erscheint **im selben Step** (kein neuer Wizard-Step — die `FlowWizardKfz`-STEPS-Array wird von aar-956-Sessions bearbeitet und **nicht** angefasst):

> „Wann möchtest du dein Fahrzeug in die Werkstatt bringen? (optional)"
> `<WunschterminPicker>` + Button „Wunschtermin vorschlagen" + Link „Überspringen".

- Reuse: `WunschterminPicker` aus `src/app/embed/gutachter-finder/_components/WunschterminPicker.tsx` (liefert lokale Berlin-Wandzeit) und `resolveWunschterminIso` aus `src/app/flow/[token]/wunschtermin.ts` (Berlin-Wandzeit → UTC-ISO) — **read-only** wiederverwendet, keine Änderung an diesen Files.
- Neue Server-Action in `src/app/flow/[token]/self-service-actions.ts` (additiv):
  ```ts
  export async function speichereReparaturWunschterminFlow(
    token: string,
    wunschterminLokal: string,   // 'YYYY-MM-DDTHH:mm' Berlin-Wandzeit vom Picker
  ): Promise<{ ok: boolean; error?: string }>
  ```
  - Bindet `token → lead` über `flow_links` (Token-Bindung, **nicht** caller-geliefertes `leadId` vertrauen — F1-Lehre).
  - `resolveWunschterminIso(wunschterminLokal)` → UTC → `update leads set reparatur_wunschtermin = <utc>` (Admin-Client, da Flow accountless).
  - `revalidatePath` des Flow-Pfads. Result-Object, kein throw.
- Überspringen setzt nichts → kein Termin → bei Conversion keine `reparatur_termine`-Zeile. Vollkommen valide (der Kunde kann später über SP4 vorschlagen).

**Warum optional:** Aaron — „so unkompliziert wie möglich". Der Kunde darf sofort weiter; der Termin ist Kür, nicht Pflicht für die Vermittlung.

---

## 6. Lead→Claim-Conversion legt den Termin an

**Ort:** `src/lib/leads/convert-lead-to-claim.ts` (gehört #3433 — **additiv**, dieselbe Datei die SP1 um die `schadenskategorie`-Carry-over-Zeile ergänzt; s. §8).

Nach dem Claim-Insert (der Claim trägt via #3433 bereits `reparatur_werkstatt_id` vom Lead):

```ts
// Additiv, nach dem Claim-Insert & dem bestehenden Carry-over:
if (lead.reparatur_wunschtermin && claimReparaturWerkstattId) {
  const { error: rtErr } = await admin.from('reparatur_termine').insert({
    claim_id: claim.id,
    werkstatt_id: claimReparaturWerkstattId,
    wunschtermin: lead.reparatur_wunschtermin,
    status: 'angefragt',
    erstellt_von: geschaedigterUserId ?? null,
  })
  if (rtErr) console.error('[convert-lead] reparatur_termine insert failed (non-fatal):', rtErr)
}
```

- **Non-fatal** (try-lokal / geloggt): ein fehlgeschlagener Termin-Insert darf die Conversion nicht abbrechen — der Claim + die Werkstatt-Zuweisung sind wichtiger; der Kunde kann den Termin später erneut vorschlagen (SP4).
- Nutzt den in dieser Funktion bereits vorhandenen `admin`-Client + die schon ermittelte `geschaedigter_user_id`.

---

## 7. Werkstatt-Fläche: Termin sehen + reagieren

### 7.1 `v_werkstatt_auftrag` — aktiven Termin additiv anjoinen

Die View (meine, #3449/#3453, `SECURITY DEFINER`, 1 Zeile/Claim) bekommt den **jüngsten nicht-terminalen** Reparaturtermin per `LEFT JOIN LATERAL`:

```sql
LEFT JOIN LATERAL (
  SELECT rt.id, rt.status, rt.wunschtermin, rt.bestaetigter_termin, rt.absage_grund
  FROM public.reparatur_termine rt
  WHERE rt.claim_id = c.id
    AND rt.status <> 'storniert'
  ORDER BY rt.created_at DESC
  LIMIT 1
) rt ON true
```

Neue View-Spalten (additiv, brechen keine bestehenden Consumer): `reparatur_termin_id`, `reparatur_termin_status`, `reparatur_wunschtermin`, `reparatur_bestaetigter_termin`, `reparatur_absage_grund`. Das View-Gate (`is_staff() OR is_werkstatt_for_claim`) bleibt unverändert. (SP3 wird dieselbe View später um den Gutachten-Join erweitern — sequenziell, beide meine.)

### 7.2 Server-Actions (`src/app/werkstatt/(shell)/auftraege/actions.ts`, neu)

Muster: `src/app/gutachter/termine/[id]/actions.ts` (SV-Termin-Confirm/Ablehnen). Alle drei laufen über die **Werkstatt-Session** (`createClient()`, RLS-gegated), Result-Object:

```ts
export async function bestaetigeReparaturTermin(terminId: string): Promise<{ ok: boolean; error?: string }>
// status='bestaetigt', bestaetigter_termin=wunschtermin, updated_at=now → Notify Kunde

export async function erbitteReparaturAnruf(terminId: string): Promise<{ ok: boolean; error?: string }>
// status='anruf_erbeten', updated_at=now → Notify Kunde

export async function lehneReparaturTerminAb(terminId: string, grund: string): Promise<{ ok: boolean; error?: string }>
// status='abgelehnt', absage_grund=grund, updated_at=now → Notify Kunde
```

- Jede Action liest den Termin (RLS filtert auf die eigene Werkstatt), setzt den neuen Status, prüft `error` + `rowCount` (0 Zeilen = fremd/nicht erlaubt → `{ ok:false }`).
- **Notify** (non-critical, `try/catch`): In-App-Benachrichtigung an `erstellt_von` (falls gesetzt) bzw. den Claim-Kunden, dass die Werkstatt reagiert hat. Best-effort — ein Notify-Fail bricht den Status-Update nicht (atomar). Konkreter Notification-Insert-Pfad wird im Plan gegen die bestehende Notifications-Tabelle verifiziert. WA/Email = Follow-up.
- `revalidatePath('/werkstatt/auftraege')`.

### 7.3 Anzeige (`src/components/werkstatt/WerkstattAuftraege.tsx` + `queries.ts`)

- `getWerkstattAuftraege` (in `src/lib/werkstatt/queries.ts`) selektiert die neuen View-Spalten mit.
- Pro Auftrag mit `reparatur_termin_id`: eine `SectionCard` „Reparaturtermin" zeigt `reparaturTerminPhase(status).label` (Badge im passenden `ton`), den Wunschtermin (`bestaetigter_termin ?? wunschtermin`, formatiert Berlin via bestehendem `formatBerlin`).
- Bei `status ∈ {angefragt, anruf_erbeten}`: drei `primitives.Button` **Bestätigen / Anrufen / Ablehnen** (Ablehnen öffnet ein `Modal` mit Grund-Textarea). Bei `bestaetigt/erledigt/abgelehnt`: nur Status-Anzeige.
- Komponenten aus dem verbindlichen Set (`primitives.Button/Modal`, `shared/SectionCard`, `ui/textarea`), echte Umlaute, Claimondo-Tokens.

---

## 8. Koordination (heiße Zone)

Vier+ Sessions bearbeiten aktiv den Flow (aar-956 embed/reservierung/rueckruf) und die Vermittlung (#3433). SP2 fasst **drei fremde Dateien additiv** an:

| Datei | Owner | SP2-Änderung | Risiko |
|---|---|---|---|
| `flow/[token]/FlowWerkstattStep.tsx` | #3433 / 1069c2a2 | +Picker-Block nach erfolgreicher Zuweisung (~15 Z.) | Merge-Konflikt, additiv lösbar |
| `flow/[token]/self-service-actions.ts` | aar-956 | +1 neue Action `speichereReparaturWunschterminFlow` | additiv, neue Funktion |
| `lib/leads/convert-lead-to-claim.ts` | #3433 / 1069c2a2 | +Termin-Insert-Block (SP1 fasst dieselbe Datei um 1 Carry-over-Zeile an) | additiv |

**Regeln:** strikt additiv, keine bestehende Logik ändern, atomar committen, bei parallelem Push rebasen. **`FlowWizardKfz` STEPS-Array + `wunschtermin.ts` bleiben unberührt** (read-only reuse). Marker `COORDINATION-kunde-werkstatt-vermittlung-4sp` + `COORDINATION-reparaturwunsch-werkstatt-vermittlung` (1069c2a2) tragen die Absprache.

---

## 9. Testing

- **`reparaturTerminPhase`** (rein): je Status-Wert das erwartete `{key,label,ton}` + `null`-Fall. ~7 Fälle, vitest.
- **`speichereReparaturWunschterminFlow`**: Token-Bindung (fremder/fehlender Token → `{ok:false}`), gültiger Token → `leads.reparatur_wunschtermin` gesetzt. Berlin→UTC-Umrechnung über `resolveWunschterminIso` (dessen eigene Tests existieren).
- **Werkstatt-Actions**: Nicht-Werkstatt/fremder Termin → `{ok:false}` (RLS-0-Row); eigene Werkstatt → Status gesetzt. Fokus-Tests analog `admin/werkstaetten/__tests__/actions.test.ts`.
- **Conversion**: additiver Insert nur wenn `reparatur_wunschtermin` gesetzt (Branch-Test).
- **Prod-Verifikation** (READ, nach Deploy): `reparatur_termine`-Tabelle + `leads.reparatur_wunschtermin` existieren; ein manuell gesetzter Wunschtermin erzeugt bei Conversion die Zeile; die View liefert die neuen Spalten unter Werkstatt-JWT.

---

## 10. Migrationen (Regel 2 — nur Plugin)

1. `reparatur_termine`-Tabelle + Indizes + RLS-Policies (eine Migration).
2. `leads.reparatur_wunschtermin`-Spalte (eine Migration).
3. `v_werkstatt_auftrag` v-next mit LATERAL-Join (eine Migration; `CREATE OR REPLACE VIEW`).

Jeweils `apply_migration` → `list_migrations` (getrackte Version ablesen) → File `supabase/migrations/<V>_<name>.sql` **exakt** nach getrackter Version benennen (Twin-Drift vermeiden) → `execute_sql` (READ) verifizieren.

---

## 11. Definition of Done

- [ ] `reparatur_termine` + RLS + `leads.reparatur_wunschtermin` prod-live (Plugin-getrackt, Files == Version).
- [ ] `reparaturTerminPhase` rein + getestet.
- [ ] Flow: Picker nach Werkstatt-Wahl → `leads.reparatur_wunschtermin` (optional, Token-gebunden).
- [ ] Conversion legt `reparatur_termine` (angefragt) an, wenn Wunschtermin gesetzt.
- [ ] `v_werkstatt_auftrag` liefert den aktiven Termin additiv.
- [ ] `/werkstatt/auftraege` zeigt Termin + **Bestätigen/Anrufen/Ablehnen**, RLS-gegated, mit Kunden-Notify (best-effort).
- [ ] vitest grün, `tsc --noEmit` 0, `npm run build` (8 GB) grün, 3 Ratchets 0-neu.
- [ ] 7-Punkte-Audit je Commit; additive Koordination mit #3433/aar-956 dokumentiert.
