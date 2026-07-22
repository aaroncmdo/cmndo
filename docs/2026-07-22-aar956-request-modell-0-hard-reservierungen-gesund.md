# AAR-956 — „0 harte Reservierungen im Embed" ist GESUND (Request-Modell), kein Bug

Stand 22.07.2026 (AAR-956 Owner-Abschluss, T5). Dieser Vermerk hält fest, warum die Kennzahl
„0 `gutachter_finder_anfragen.termin_id` / `reservierter_sv_id` über 30 Tage" **kein** stiller Bug
ist — damit sie nicht als Phantom-Bug wieder aufgemacht wird.

## Befund (prod, 30 Tage)
10 Embed-Anfragen (8 in der letzten Woche), **alle `status=konvertiert`**. Davon 0 mit harter
Terminreservierung (`termin_id`), 0 mit `reservierter_sv_id`. Trotzdem 100 % Conversion.

## Warum das gesund ist

1. **Request-Modell (Aaron, 12.06.).** Sobald der Kunde ein **Wunschtermin** setzt — und das ist im
   Wizard das **erste** Feld auf dem Einstiegsschritt — wird die Buchung eine **best-effort-Anfrage**:
   der Finder bietet 3 Zeiten an (Wunschzeit ±2 h, `actions.ts:143-165`), reserviert weich, und der
   dem Lead zugewiesene **Dispatcher bestätigt** final. Ein fehlgeschlagener harter Buchungsversuch
   wird im Request-Modus bewusst zum Soft-Hold heruntergestuft (`actions.ts:405-409`) + es entsteht
   genau ein Auto-Rückruf-Task (`actions.ts:369-384`). Der Kunde bekommt zusätzlich einen FlowLink und
   bucht/bestätigt final im `/flow`.

2. **Dead-Pin-Mehrheit ist per Definition soft.** 8 von 9 Embed-Anfragen liefen über den Dead-Pin-
   Fallback (keine isochron-abgedeckten verifizierten Partner am Ort) → `dispatch_pending`-Queue ohne
   `termin_id`. Das ist ein **Partner-Supply-/Coverage-Thema**, kein Code-Bug.

3. **`reservierter_sv_id` = 0 % ist strukturell ein Red Herring.** Diese Spalte wird **ausschließlich**
   vom **nativen** `/gutachter-finden`-Onboarding-Wizard geschrieben (`onboarding/slots.ts`), **nie**
   vom Embed. Für Embed-Anfragen ist sie also immer NULL — das misst nicht den Embed.

## Wann wäre es DOCH ein Bug?
Nur wenn ein **Partner**-Pick (nicht Dead-Pin) OHNE gesetzten Wunschtermin scheitert: dann greift
`if (!b.ok && !requestModus) return { … slotWeg:true }` (`actions.ts:407`) und der Kunde sieht „Slot
weg". Das ist der einzige Pfad, der eine harte Reservierung erzwingt — er ist in der Praxis selten,
weil das Wunschtermin-Feld zuerst kommt.

## Diagnose-Query (read-only)
```sql
select count(*) anfragen_30d,
  count(*) filter (where termin_id is not null) mit_harter_reservierung,
  count(*) filter (where wunschtermin is not null) mit_wunschtermin
from gutachter_finder_anfragen where erstellt_am > now() - interval '30 days';
```
Erwartung: `mit_harter_reservierung` ≈ 0, `mit_wunschtermin` ≈ alle, Conversion hoch = **gesund**.

Kontext: `COORDINATION-aar956-owner-claimed` + `AAR-956-CONVERSION-EMBEDDING-SETUP.md` (12.06.).
