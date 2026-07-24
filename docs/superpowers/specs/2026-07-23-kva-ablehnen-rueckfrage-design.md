# KVA ablehnen / Rückfrage (R1) — Design

**Datum:** 2026-07-23
**Lane:** b0e963b6 (Werkstatt+Kunde-Repair-Audit, R1)
**Branch:** `kitta/kva-ablehnen-rueckfrage`
**Status:** Aaron „ja" (R1). Kleiner Change → Plan in diese Spec gefaltet.

## Problem (Stuck-Risk)
`KostenvoranschlagCard` ist **sign-or-nothing** — der Kunde kann den Werkstatt-KVA nur per Unterschrift **freigeben** (`genehmigeKvaPortal`) oder nichts tun. Ein Kunde, dem der KVA zu teuer ist / der eine Zweitmeinung will, hat **null Aktion** → **permanenter Stuck-State** (die `kva_freigabe`-Aufgabe klärt nie).

## Vorhandene Infra (kein Migrations-Bedarf)
- `claims.kva_abgelehnt_am` + `claims.kva_abgelehnt_grund` **existieren** (verifiziert 23.07.).
- Der Werkstatt-KVA-Re-Upload **resettet beide** (`auftraege/actions.ts:429-430`: `reparatur_freigegeben_am:null, kva_abgelehnt_am:null`) → der Ablehn→Revidier-Loop ist werkstattseitig fertig.
- `notifyWerkstattKundenreaktion` (werkstatt→user_id→`createNotification`) ist die Notify-Bahn.

## Ziel
Der Kunde kann den KVA **ablehnen (mit Grund)** → `kva_abgelehnt_am`/`_grund` gesetzt → Werkstatt benachrichtigt → Werkstatt lädt einen revidierten KVA (resettet den State). Un-stuckt den Kunden.

## Design (customer-side; kein Migrations-/View-Change)
- **Neue Action `lehneKvaAbPortal(claimId, grund)`** in `kva-freigabe-actions.ts` (Kunde-Ownership wie `genehmigeKvaPortal`): liest Claim (RLS-Ownership) + `werkstatt_id`; via Service-Client `update({ kva_abgelehnt_am: now, kva_abgelehnt_grund: grund })`; `notifyWerkstattKundenreaktion({ ereignis:'kva_abgelehnt', werkstattId, svc })`; `revalidatePath`. Idempotent (schon abgelehnt → ok). Rückgabe `{ ok, error? }`.
- **`notify-werkstatt-kundenreaktion.ts`**: `WerkstattReaktionEreignis` + `'kva_abgelehnt'` → titel „Kostenvoranschlag abgelehnt" + text (mit Grund). Reuse `createNotification('reparatur_termin', …)` → **kein neuer Notification-Typ** (kein flag-drift).
- **`KostenvoranschlagCard.tsx`**: neben „Reparaturauftrag erteilen" ein **„Kostenvoranschlag ablehnen"**-Bereich (Grund-Textarea + Button `lehneKvaAbPortal`). Bei `kva_abgelehnt_am` gesetzt: State „**Abgelehnt am X — die Werkstatt überarbeitet den Kostenvoranschlag**" (+ Grund), Freigabe/Ablehnen ausgeblendet.
- **Plumbing (Kunde-Seite, liest `claims` direkt — kein View):** `get-kunde-faelle.ts` CLAIM_SELECT + Record + `kva_abgelehnt_am`, `kva_abgelehnt_grund`; `kunde-claim-view.ts` `geld` + `kvaAbgelehntAm`/`kvaAbgelehntGrund`; `GeldZone.tsx` reicht sie an die Card durch.

## Bewusst DEFERRED (Follow-up)
**Werkstatt-Detail zeigt „Vom Kunden abgelehnt: {Grund}".** Bräuchte `kva_abgelehnt_am`/`_grund` in `v_werkstatt_auftrag` (View-Change = Migration) ODER einen Direkt-Read. Die Werkstatt bekommt die **In-App-Notification** → der Loop funktioniert ohne. → Backlog.

## Betroffene Files & Koordination
- `kva-freigabe-actions.ts`, `notify-werkstatt-kundenreaktion.ts`, `KostenvoranschlagCard.tsx`, `GeldZone.tsx`, `kunde-claim-view.ts`, `get-kunde-faelle.ts`. **Alle disjunkt zu W1+K1 (#4743)** (das war werkstatt-queries + WerkstattAuftragDetail + Stepper/StatusZone).
- Kein DB-/i18n-Change.

## Testing
tsc/build + **Regel-4-Prod-Smoke**: Selbstzahler/Kasko-Kunde mit offenem KVA → „Kostenvoranschlag ablehnen" + Grund → Card zeigt „Abgelehnt am X"; Werkstatt bekommt In-App-Notification. Test-Konten.
