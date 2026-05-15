# 🐞 BUG: Self-Dispatch-Flow ist gebrochen — Marker-Klick reicht SV nie zum Wizard

**Entdeckt:** 2026-05-15 im Vollstrecke-Smoke.
**Severity:** **CRITICAL** — der namensgebende Self-Dispatch-Pfad
(`gutachter_finder_self_dispatch`) tut nicht das, was er verspricht.

## Symptom

Kunde durchläuft den `/gutachter-finden`-Wizard komplett (Karten-SV-Klick,
Wunschtermin-Slot, Service, Kanzlei, Kontakt, Signatur). UI bestätigt
„Termin erfolgreich angefragt". Real entstanden in der DB:

| Tabelle | Erzeugt? | Konsequenz |
|---|---|---|
| `gutachter_finder_anfragen` | ✅ | Wizard-Daten gespeichert |
| `leads` (`source_channel='gutachter_finder_self_dispatch'`) | ✅ | Lead da |
| `faelle` | ✅ | Fall da |
| `auftraege` | ❌ | **Kein Auftrag** |
| `gutachter_termine` | ❌ | **Kein Termin** |
| `leads.zugewiesen_an` | NULL | **Kein SV-Assignment** |
| `leads.wunschtermin` | NULL | Verloren (siehe BUG-anfrage-lead-wunschtermin) |
| `nachrichten` (kanal=whatsapp) | ❌ | **Kein WA-Trigger an SV/Kunde** |

Dispatcher sieht den Lead in `qualifizierungs_phase='erstkontakt'` und
muss **alles erneut von Hand** machen — SV erneut suchen, Slot erneut
reservieren, obwohl der Kunde im Wizard alles erledigt hat.

## Root Cause (3 Sub-Bugs)

### 3a) `MapClient.hoveredId` wird nie zum Wizard gereicht

`src/app/gutachter-finden/GutachterFinderMapClient.tsx:333-338`:

```ts
function handleOpenWizard(e: Event) {
  const ce = e as CustomEvent<{ svId?: string }>
  if (ce.detail?.svId) setHoveredId(ce.detail.svId)   // ← State bleibt im MapClient
  sidebarScrollRef.current?.scrollTo({ top: 0 })
  setMobileSheetOpen(true)
}
```

Der `hoveredId` ist lokaler React-State. Der `<KartenWizardToggle>` und
sein `<DynamicWizard>` sind separate Komponenten und kennen ihn nicht.

**Fix:** State-Bridge nötig — z. B.:
- React-Context `SelectedSvContext` mit `useContext` im WizardClient
- `<DynamicWizard>` als Prop `preselectedSvId={hoveredId}` durchreichen
- Hidden Wizard-Feld (`zugeordneter_sv_id`) das vom Map per Custom-Event auf den Wizard-State zugreift

### 3b) Slot-Picker reserviert nicht — speichert nur Text

`gutachter_finder_anfragen.reservierter_slot_von` + `_bis` + `reservierter_sv_id`
existieren als Spalten, sind aber NULL. Nur `wunschtermin` ist als Text
gespeichert. Es fehlt eine echte Slot-Reservation (Soft-Lock auf SV-Kalender
für ~10 Min damit kein Second-Kunde den gleichen Slot bekommt).

Server-Action (`gutachter-finder-actions.ts:180-200`) schreibt
`zugeordneter_sv_id: payload.zugeordneter_sv_id ?? null` — wenn der Wizard
keinen schickt (siehe 3a), bleibt es null und die Slot-Reservation-Logic
(Zeile 233-237) wird gar nicht erst getriggert.

**Fix:** Wenn 3a behoben ist, läuft der Code-Pfad (`if payload.zugeordneter_sv_id) { ... }`)
automatisch durch. Plus: `reservierter_slot_von/_bis` aus dem
Slot-Picker-Wert in den Insert-Payload.

### 3c) `convertLeadToClaim` bekommt `svIdFromTermin=null` → kein Auftrag/Termin

`konvertiere-anfrage-zu-fall.ts:229-238`:

```ts
const conv = await convertLeadToClaim({
  leadId: lead.id as string,
  triggerByUserId: userId,
  kundeUserIdOverride: userId,
  svIdFromTermin: (anfrage.zugeordneter_sv_id as string | null) ?? null,  // ← null
  signatureUrl: ...,
})
```

Wenn `svIdFromTermin=null`, erzeugt `convertLeadToClaim` weder einen
`auftraege`-Insert noch einen `gutachter_termine`-Insert. Der Dispatcher
muss das später manuell triggern.

**Fix:** Wenn 3a + 3b behoben sind, ist `anfrage.zugeordneter_sv_id`
gesetzt und der Auto-Auftrag passiert.

### 3d) Plus: `leads.wunschtermin` wird im Insert vergessen

Siehe `BUG-anfrage-lead-wunschtermin-lost.md`. Eigenständiger Bug — auch
ohne 3a-c sollte der Wunschtermin im Lead landen.

## Reproduktion (frischer Smoke heute)

```sql
SELECT id, reservierter_sv_id, zugeordneter_sv_id,
       reservierter_slot_von, reservierter_slot_bis,
       wunschtermin, konvertiert_am, magic_link_gesendet_am
FROM gutachter_finder_anfragen
WHERE id = '34f02e36-f959-44bf-a5b2-f0d4c81f4d68';
-- → reservierter_sv_id=null, zugeordneter_sv_id=null,
--   reservierter_slot_von=null, reservierter_slot_bis=null,
--   wunschtermin='2026-05-14 09:00:00+00' (nur Text),
--   konvertiert_am=2026-05-15 09:47:48,
--   magic_link_gesendet_am=2026-05-15 09:47:48

SELECT count(*) FROM auftraege WHERE erstellt_am > now() - interval '1 hour';
-- → 0 (kein Auftrag entstanden)

SELECT count(*) FROM gutachter_termine WHERE created_at > now() - interval '1 hour';
-- → 0 (kein Termin entstanden)
```

## Auswirkung im Geschäft

- **Marketing-Versprechen** auf `/gutachter-finden`: „Termin in unter 48 h gebucht"
  ist Lüge — der Kunde bekommt nur eine Anfrage-Bestätigung, der Termin
  entsteht erst nach manueller Dispatch-Bearbeitung (heute Std bis Tage Lag)
- **Dispatch-Doppelarbeit**: jeder Self-Dispatch-Lead = manuelle
  Termin-Reservierung obwohl der Wizard alles abgefragt hat
- **WA-Trigger fehlt**: SV bekommt keine Benachrichtigung über den
  angefragten Termin → Reaktionszeit hängt von Dispatch-Schicht

## Fix-Plan (Phasen)

1. **Sofort-Fix (Tagesarbeit):**
   - 3a: Context-Bridge MapClient↔Wizard für `hoveredId → zugeordneter_sv_id`
   - 3b: Slot-Picker schreibt `reservierter_slot_von/_bis` mit
   - 3d: `konvertiere-anfrage-zu-fall.ts:148` Insert ergänzen
     (`wunschtermin: anfrage.wunschtermin`)

2. **Verifikation:** End-to-End-Smoke wie hier — nach Submit muss
   `auftraege`+1, `gutachter_termine`+1, `nachrichten[whatsapp]`+1 sein.

3. **Cleanup:** Frontend-Defense für `isochrone_polygon`
   (separat — siehe BUG-mapbox-iso-polygon-malformed.md).

## Linear-Ticket (Vorschlag)

> **Titel:** `[KFZ-AAR-???] CRITICAL: Self-Dispatch /gutachter-finden erzeugt KEINEN Auftrag/Termin — Marker-SV-Auswahl wird zum Wizard nicht propagiert`
> **Labels:** bug, frontend, backend, critical, customer-facing
> **Priorität:** **P0** (Marketing-Versprechen vs. Reality-Mismatch)
> **Parent für Sub-Tasks:** BUG-anfrage-lead-wunschtermin-lost.md
