# HANDOFF — Abrechnungen: doppelte Oberfläche mit divergenter Geldlogik

**Gefunden:** 14.07.2026, beim Detail-View-Programm (P1). **Nicht gebaut** — bewusst.
**Warum eigener PR:** geldkritisch (Stripe-Refunds), verlangt eine fachliche Entscheidung,
und überschneidet die Finance-Hub-Konsolidierung (Cat D / ops-cockpit-Lane).

---

## Der Kern-Befund

Es gibt **zwei parallele Abrechnungs-Oberflächen** mit **zwei divergenten
Implementierungen derselben Geld-Operationen**:

| Operation | `/admin/abrechnungen`<br>(`AbrechnungenListClient` + `abrechnungen/actions.ts`) | `/admin/finance`<br>(`AbrechnungenSection` + `finance/abrechnungen-actions.ts`) |
|---|---|---|
| **Storno** | `stornoAbrechnung(id, grund)` — Stripe-PI **cancel/refund** + negative **Storno-Rechnung** (`-S`) + E-Mail + Timeline-Einträge | `storniereAbrechnung(id)` — **nur Status-Flip.** Kein Refund, keine Storno-Rechnung, kein Grund. |
| **Bezahlt** | `markBezahlt(id, notiz?)` | `markiereAlsBezahlt(id, **betrag**)` + `resolveTasksForEntity('abrechnung', …)` |
| **Versand / PDF** | ❌ nicht vorhanden | `manuellVersenden(id)` (PDF erzeugen + senden) — **nur hier** |
| **Generieren** | ❌ | `manuellGenerieren(monat, typ)` — **nur hier** |

> ⚠️ **Zwei Stornos, von denen einer das Geld nicht zurückzahlt.** Welcher der beiden
> fachlich korrekt ist, ist eine **Produkt-Entscheidung**, keine Refactoring-Frage.
> Deshalb wurde hier nichts angefasst.

## Zweiter Befund — `revalidatePath` zeigt auf die falsche Route

**Alle vier** Server-Actions in `src/app/admin/abrechnungen/actions.ts`
(`retryEinzug`, `markBezahlt`, `stornoAbrechnung`, `reIssueAbrechnung`) rufen

```ts
revalidatePath('/admin/finance/abrechnungen', 'page')
```

— also **nie** `/admin/abrechnungen`, die Route, aus der sie tatsächlich aufgerufen
werden. Nach „Bezahlt markieren" auf `/admin/abrechnungen` aktualisiert sich die Liste
dort schlicht **nicht**. Cheap fix, unabhängig vom Rest.

*(Ursache vermutlich: die Liste hängt an zwei Routen — `/admin/abrechnungen` und, via
Re-Export `admin/finance/(hub)/abrechnungen/page.tsx`, an `/admin/finance/abrechnungen`.
Dasselbe Muster gab es bei den Versicherern; dort wurden beide Pfade revalidiert.)*

## Dritter Befund — Result-Shape

Die vier Actions liefern das **Legacy-`{ success, error? }`** statt des laut AGENTS.md
verbindlichen `{ ok, error? }`.

## Was ein Detail-View bringen würde

Das 672px-Modal ist am Anschlag: **4 zustandsbehaftete Action-Flows** (Retry / Bezahlt /
Storno / Neuausstellung) mit Inline-Confirm-Formularen in einer engen Box — während
**9 von 31 Spalten** gar nicht erst geladen werden, darunter:

- `pdf_path` — **die Rechnung selbst**
- `abrechnungs_zeitraum_start` / `_ende` — der Abrechnungszeitraum
- `ust_satz` / `ust_betrag` — die Steuer
- `whatsapp_gesendet_am`, `email_log_id`

Und die Kind-Tabellen sind **live, aber ungenutzt** im Modal:
`abrechnung_positionen` (die Positionen werden aus dem denormalisierten `positionen`-JSONB
gelesen statt aus der normalisierten Tabelle) und `abrechnung_reminders` (die ganze
Mahn-Historie wird auf **ein** Datum zusammengefaltet).

**Vorgeschlagene Tabs:** Übersicht (+ die versteckten Felder + PDF-Download) · Positionen
(`abrechnung_positionen`) · Fälle (`claims.abrechnung_id`) · Mahnungen
(`abrechnung_reminders`) · Zahlung (Stripe, Retry, `gutschriften`, Provisionen) · Aufgaben
(`'abrechnung'` **ist** ein erlaubter `chk_tasks_entity_type`-Wert).

## Empfohlene Reihenfolge

1. **Sofort & billig:** `revalidatePath` auf beide Routen (Bug, unabhängig).
2. **Entscheidung einholen:** welcher Storno ist der richtige? (Refund + Storno-Rechnung
   vs. Status-Flip)
3. **Dann** die beiden Oberflächen zu **einer** Detail-View konsolidieren — nach dem
   Rezept `docs/superpowers/detail-view-recipe.md`.

## Nebenbefund (nicht Teil dieses Handoffs)

`src/lib/tasks/create-adhoc.ts` typisiert `EntityType` als
`'kunde' | 'sachverstaendiger' | 'kanzlei' | 'versicherung'` — aber der DB-CHECK
`chk_tasks_entity_type` erlaubt keinen dieser vier außer über andere Wege. Drei davon
würden beim Insert **still von Postgres verworfen** (Flag-Drift-Klasse). Vorbestehend,
nicht durch dieses Programm verursacht.
