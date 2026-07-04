# SP4a+b — Kunde-Reparatur-Sicht + Wunschtermin-Vorschlag — Design

> Sub-Projekt 4 (Teil a+b) des Kunde→Werkstatt-Vermittlung-Ausbaus. Der Kunde sieht in seiner Fallakte die vermittelte Werkstatt + den Reparaturtermin-Status und kann — wenn kein aktiver Termin existiert (vorbelegte Werkstatt oder nach Ablehnung) — selbst einen Wunschtermin vorschlagen. Schließt den SP2-Loop auf der Kunde-Seite.

**Datum:** 2026-07-04 · **Session:** cec48090 · **Branch:** `kitta/kunde-reparatur-sicht` (gestackt auf `kitta/reparatur-termine-lifecycle`/SP2 #3555; rebase auf staging sobald SP2 merged)

---

## 1. Ziel & Abgrenzung

**Ziel:** Der Kunde bekommt im Portal (`/kunde/faelle/[id]`) eine **WerkstattCard**, die seine vermittelte Werkstatt (Name/Adresse/Telefon) und den aktuellen Reparaturtermin-Status zeigt (Wunsch angefragt / bestätigt / Werkstatt meldet sich / abgelehnt). Existiert **kein aktiver Termin** (weil die Werkstatt vom Dispatcher vorbelegt wurde und den Flow-Picker übersprang, ODER weil die Werkstatt einen Termin abgelehnt hat), kann der Kunde direkt einen **Wunschtermin vorschlagen**.

**In Scope (SP4a+b):**
1. **SP4a:** WerkstattCard in der Kunde-Fallakte + Server-seitiges Laden der Werkstatt-Stammdaten + des aktiven Reparaturtermins.
2. **SP4b:** Kunde-Wunschtermin-Vorschlag (Server-Action, legt `reparatur_termine`-Zeile `angefragt` an, benachrichtigt die Werkstatt) + Kunde-RLS (SELECT + INSERT) auf `reparatur_termine`.

**Out of Scope (spätere SP):**
- **SP4c:** fiktive-Abrechnung-Kundenansicht (`reparaturwunsch='fiktiv'`) — eigenes Thema (Beträge aus dem Gutachten).
- **SP4d:** SP1-Spezialisiert-Badge (`WerkstattFinder` liest `passt`) + Flow-Auszahlungs-Toggle.
- Kunde-**Storno** eines Termins, Kunde-Chat mit der Werkstatt, Re-Scheduling-Verhandlung — bewusst nicht (Aaron: „so unkompliziert wie möglich").

---

## 2. Datenmodell (1 additive Migration)

`reparatur_termine` hat aktuell nur Staff+Werkstatt-Policies (SP2). Der Kunde braucht **SELECT** (den eigenen Termin lesen — Defense-in-Depth + ermöglicht Kunde-Session-Reads) und **INSERT** (einen Wunschtermin vorschlagen).

```sql
-- Kunde liest den Reparaturtermin seines eigenen Claims.
CREATE POLICY reparatur_termine_kunde_select ON public.reparatur_termine
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );

-- Kunde schlaegt einen Wunschtermin vor (nur status='angefragt', nur eigener Claim).
CREATE POLICY reparatur_termine_kunde_insert ON public.reparatur_termine
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'angefragt'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = reparatur_termine.claim_id
        AND (c.geschaedigter_user_id = (SELECT auth.uid()) OR public.is_claim_user_party(c.id))
    )
  );
```

- Owner-Prädikat wörtlich aus der `claims`-Policy übernommen (`geschaedigter_user_id = auth.uid() OR is_claim_user_party(claim_id)` — beide prod-verifiziert). Deckt geschädigten Direkt-User **und** claim_parties-Mitglieder ab.
- INSERT-`WITH CHECK` härtet zusätzlich auf `status='angefragt'` — ein Kunde kann keinen Termin direkt auf `bestaetigt` setzen.
- **Kein** Kunde-UPDATE/DELETE (Storno = SP4d/später). Die Werkstatt-Statuswechsel bleiben Staff+Werkstatt (SP2).

Regel-2-Flow (Plugin): `apply_migration` → `list_migrations` → File `supabase/migrations/<V>_reparatur_termine_kunde_rls.sql` == getrackte Version → `execute_sql` (READ) verifizieren.

---

## 3. Lesepfad (SP4a) — Server-Component

`page.tsx` lädt die Fallakte bereits via `getKundeFallDetailRecord` (Ownership resolved). Additiv:

1. `claims.reparatur_werkstatt_id` beschaffen — entweder additiv in `CLAIM_SELECT` von `src/lib/claims/get-kunde-faelle.ts` aufnehmen, oder (bevorzugt, lokaler) im page.tsx-Nachlade-`claims`-Query (der schon existiert) ergänzen.
2. Wenn gesetzt: via **Admin-Client** (konsistent mit den anderen page.tsx-Reads, Ownership ist bereits verifiziert):
   ```ts
   const { data: werkstatt } = await admin.from('werkstaetten')
     .select('name, adresse_strasse, adresse_plz, adresse_ort, telefon')
     .eq('id', reparaturWerkstattId).maybeSingle()
   const { data: termin } = await admin.from('reparatur_termine')
     .select('id, status, wunschtermin, bestaetigter_termin, absage_grund')
     .eq('claim_id', claimId).neq('status', 'storniert')
     .order('created_at', { ascending: false }).limit(1).maybeSingle()
   ```
3. `<WerkstattCard werkstatt={…} termin={…} claimId={claimId} />` in den **Sidebar-Slot** zwischen `KanzleiPfadCard` (page.tsx:~875) und `KundeAusfallEntschaedigungCard` (page.tsx:~893) rendern. **Nur** rendern, wenn eine Werkstatt hinterlegt ist.

---

## 4. WerkstattCard (SP4a-Anzeige + SP4b-Trigger)

**Neu:** `src/components/kunde/WerkstattCard.tsx` (`'use client'`, `primitives.Card` — **nicht** handgerolltes Card-Markup, wegen component-set-Ratchet + laufender `kunde-primitives-migration`).

Props:
```ts
{
  claimId: string
  werkstatt: { name: string; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null; telefon: string | null }
  termin: { id: string; status: string; wunschtermin: string | null; bestaetigter_termin: string | null; absage_grund: string | null } | null
}
```

Darstellung:
- **Header** „Deine Werkstatt" (Icon Wrench/Building).
- Werkstatt-Name + Adresse. Telefon als `PhoneButton` (shared) falls vorhanden.
- **Termin-Zustand:**
  - `termin` mit Status ∈ {angefragt, anruf_erbeten, bestaetigt}: `StatusBadge` aus `reparaturTerminPhase(status as ReparaturTerminStatus)` (Label + ton) + Terminzeit (`bestaetigter_termin ?? wunschtermin`, formatiert Berlin). Bei `bestaetigt` „Bestätigt: …", sonst „Wunschtermin: …".
  - `termin` mit Status `abgelehnt`: Hinweis „Die Werkstatt konnte deinen Wunschtermin nicht annehmen." (+ `absage_grund` falls vorhanden) → **darunter die Vorschlags-UI** (neuer Versuch).
  - `termin === null` (Werkstatt vorbelegt, noch kein Termin): direkt die **Vorschlags-UI**.
- **Vorschlags-UI (SP4b):** `WunschterminPicker` (reuse aus `embed/gutachter-finder/_components`) + `primitives.Button` „Wunschtermin vorschlagen" → ruft `schlageReparaturTerminVorPortal(claimId, lokal)`; Result-Check → `toast` + `router.refresh()`. `useTransition` für loading.
- Echte Umlaute; Claimondo-Tokens; kein raw Status-Scale.

---

## 5. Server-Action (SP4b)

**Neu:** `src/app/kunde/faelle/[id]/actions.ts` erweitern (additiv) — oder falls die Datei zu heiß ist, `src/lib/werkstatt/kunde-reparatur-termin-actions.ts`. (Plan entscheidet nach Sichtung der bestehenden actions.ts.)

```ts
export async function schlageReparaturTerminVorPortal(
  claimId: string,
  wunschterminLokal: string,
): Promise<{ ok: boolean; error?: string }>
```

Ablauf (Kunde-Session = RLS-Auth-Grenze):
1. `createClient()` (Kunde-Session); `auth.getUser()` → uid; sonst `{ ok:false }`.
2. Claim via Kunde-Session lesen (`claims`-Owner-RLS): `reparatur_werkstatt_id`. Kein Claim / keine Werkstatt → `{ ok:false, 'Keine Werkstatt hinterlegt.' }`.
3. Aktiven Termin prüfen (Kunde-Session, neue SELECT-RLS): existiert `reparatur_termine` mit `status IN ('angefragt','anruf_erbeten','bestaetigt')` → `{ ok:false, 'Es liegt bereits ein Terminwunsch vor.' }`.
4. `resolveWunschterminIso(wunschterminLokal)` → UTC (try/catch → `{ ok:false, 'Ungültiger Wunschtermin.' }`).
5. Insert (Kunde-Session, neue INSERT-RLS): `{ claim_id, werkstatt_id: reparaturWerkstattId, wunschtermin, status:'angefragt', erstellt_von: uid }`. Fehler → `{ ok:false, error }`.
6. **Werkstatt benachrichtigen** (non-critical, `try/catch`, via Service-/Admin-Client — Kunde kann `werkstaetten.user_id` nicht lesen): `werkstaetten.user_id` auflösen → `createNotification(user_id, 'reparatur_termin', 'Neuer Terminwunsch', 'Ein Kunde hat einen Reparatur-Wunschtermin vorgeschlagen.', '/werkstatt/auftraege')`.
7. `revalidatePath('/kunde/faelle/${claimId}')`; `{ ok:true }`.

Result-Object, kein throw. Der Werkstatt-Notify spiegelt SP2 (dort Werkstatt→Kunde; hier Kunde→Werkstatt).

---

## 6. Koordination

- **`page.tsx`** ist heiß — **Session cfefdf75 (`kunde-primitives-migration`)** migriert Kunde-Portal-Komponenten. Gegenmaßnahme: WerkstattCard als `primitives.Card` bauen (kein Cleanup-Zyklus für die Migration), page.tsx-Änderung strikt additiv (nur Queries + 1 Render-Slot), atomar committen. Falls Konflikt: rebasen.
- **`reparatur_termine`** + `reparaturTerminPhase` stammen aus SP2 (#3555, gestackt). SP4-Branch rebased auf staging, sobald SP2 merged.
- **`WunschterminPicker`** + `resolveWunschterminIso` read-only reuse (SP2/flow-wunschtermin).

---

## 7. Testing

- **`schlageReparaturTerminVorPortal`**: kein User → ok:false; keine Werkstatt → ok:false; aktiver Termin existiert → ok:false; Erfolg → Insert `angefragt` + Werkstatt-Notify aufgerufen. Mock Supabase (Kunde-Session-Kette) + createNotification.
- **`WerkstattCard`** (optional, leichter Logik-Test): rendert Vorschlags-UI wenn `termin===null` oder `status='abgelehnt'`; zeigt Badge+Zeit wenn aktiver Termin.
- **Prod-Verifikation (READ, nach Deploy):** die 2 neuen Policies existieren; ein Kunde-JWT liest den eigenen `reparatur_termine`-Eintrag (nicht fremde); ein Vorschlag legt `angefragt` an + die Werkstatt sieht ihn in `/werkstatt/auftraege`.

---

## 8. Definition of Done

- [ ] 2 Kunde-RLS-Policies (SELECT+INSERT) prod-live (Plugin-getrackt, File==Version).
- [ ] `WerkstattCard` in der Kunde-Fallakte-Sidebar (nur bei hinterlegter Werkstatt), zeigt Werkstatt + Termin-Status via `reparaturTerminPhase`.
- [ ] Kunde kann bei fehlendem/abgelehntem Termin einen Wunschtermin vorschlagen → `angefragt` + Werkstatt-Notify.
- [ ] vitest grün, tsc 0, `npm run build` (8 GB) grün, 3 Ratchets 0-neu.
- [ ] 7-Punkte-Audit je Commit; additive Koordination mit cfefdf75 (page.tsx) dokumentiert.
