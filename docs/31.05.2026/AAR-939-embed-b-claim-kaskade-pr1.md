# AAR-939 — embed-B Claim-Auflösungs-Kaskade · PR1 (Portal-Pfad)

**Datum:** 31.05.2026 · **Branch:** `kitta/aar-939-embed-b-claim-kaskade` (von `staging`)
**Vorgänger-Handoff:** `docs/31.05.2026/HANDOFF-embed-b-claim-resolution-kaskade.md`

## TL;DR

PR1 baut den **Portal-Pfad** der Claim-Auflösungs-Kaskade (Handoff §4.2/4.3/4.5, ohne WhatsApp):
Der Kunde meldet im Fall-Detail selbst, ob der Gutachter zum Termin kam. **Ja** schließt den
nur_gutachter-Claim terminal; **Nein** eskaliert an Dispatch. Ein Cron fängt Schweigen ab und
eskaliert nach 24h ebenfalls an Dispatch. Heute hängen 45 `nur_gutachter`-Claims stumm in
`dispatch_done` ohne jede Auflösung — PR1 schließt diese Lücke.

WhatsApp-Ping/Inbound (Handoff §4.3 WA) + die Dispatcher-Auflösungs-UI (`markSvNoShowEmbedB`-Trigger
+ Self-Service-Verlegung §4.4) sind bewusst **Folge-PR**.

## Aaron-Entscheidungen (31.05.)

1. **`status='durchgefuehrt'`-Bug:** beide Writer fixen, **kein DDL** (→ `'abgeschlossen'`).
2. **Kunde-Antwort-Semantik:** **Ja schließt direkt**, **Nein → Dispatcher-Task** (Mensch
   bestätigt SV-No-Show + Verlegung; Anti-Gaming, €70 bleibt per Default).
3. **Scope:** Portal-Kaskade zuerst, WhatsApp Folge-PR.

## Befund: latenter `status='durchgefuehrt'`-Bug (mitgefixt)

`gutachter_termine_status_check` erlaubt `'durchgefuehrt'` **nicht** (am 29.04. per
`cmm32_revert_termin_status_durchgefuehrt` bewusst entfernt; Anker ist die Timestamp-Spalte
`durchgefuehrt_am`, die `phase.ts` + der Billing-Trigger lesen). Trotzdem setzten **zwei**
Writer `status:'durchgefuehrt'`:

- `completeBegutachtung` (KFZ-202, komplett-QC-Flow, produktiv)
- `markNurGutachterTerminDurchgefuehrt` (#2081, der vorgesehene JA-Pfad-Schließer)

Empirisch bestätigt (Rollback-Test): jeder echte UPDATE failt am CHECK. Passt zum Datenbild —
**kein einziger** Termin steht auf `durchgefuehrt`; die 5 durchgeführten Termine stehen auf
`abgeschlossen`/`bestaetigt` (via Geo/Cron, die nur `durchgefuehrt_am` setzen). Beide Writer auf
`'abgeschlossen'` umgestellt; `durchgefuehrt_am` bleibt der kanonische Anker.

## Geänderte/neue Dateien

| Datei | Art | Zweck |
|---|---|---|
| `src/lib/termine/actions.ts` | Fix + Refactor | `status` 'durchgefuehrt'→'abgeschlossen' (2×); `markNurGutachter…` nutzt geteilte Close-Logik |
| `src/lib/termine/close-nur-gutachter-termin.ts` | **neu** | geteilte Close-Logik + `CLAIM_TERMINAL_STATUSES` (SV- + Kunde-Pfad, keine Duplikation) |
| `src/lib/termine/embed-b-klaerung-task.ts` | **neu** | idempotenter Dispatcher-Klärungs-Task-Helper + Stale-Status-Konstanten |
| `src/lib/termine/kunde-termin-resolution.ts` | **neu** | Kunde-Actions `bestaetigeTerminAlsKunde` (JA) + `meldeSvNichtErschienenAlsKunde` (NEIN), owner-geschützt |
| `src/components/kunde/KundeTerminCheckBanner.tsx` | **neu** | „Kam dein Gutachter?"-Banner (primitives.Button, JA=success/NEIN=ghost) |
| `src/app/kunde/faelle/[id]/page.tsx` | Mount | server-seitiges Gating + Banner-Mount |
| `src/app/api/cron/embed-b-termin-resolution/route.ts` | **neu** | Cron: stale nur_gutachter-Termine → Dispatcher-Task |

## Mechanik

- **Banner-Gate (server, `page.tsx`):** Claim `service_typ='nur_gutachter'` **&&** Claim nicht
  terminal **&&** Termin `end_zeit < now` **&&** `durchgefuehrt_am/sv_no_show_am/sv_ablehnung_am
  IS NULL` **&&** Status nicht in `TERMIN_RESOLUTION_EXCLUDED_STATUSES` **&&** kein offener
  Klärungs-Task. Eng gegated → erscheint nicht bei Bestandsdaten/komplett-Claims.
- **JA** → `bestaetigeTerminAlsKunde` → `closeNurGutachterTerminAlsDurchgefuehrt`
  (`durchgefuehrt_am` + `claims.status='termin_durchgefuehrt'`). Banner verschwindet (durchgef.).
- **NEIN** → `meldeSvNichtErschienenAlsKunde` → Dispatcher-Klärungs-Task (kein direkter
  Claim-Move, **kein** `sv_no_show_am` — Team-only). Banner verschwindet (offener Task).
- **Cron** (24h Karenz) → für Termine ohne Reaktion denselben Task (idempotent, `grund=keine_rueckmeldung`).
- **Task-Sichtbarkeit:** `typ='dispatch'` → Dispatch-Dashboard-Queue; `task_typ='embed_b_termin_klaerung'`
  + `/admin/tasks` (zeigt alle). `prioritaet='dringend'`, `entity_type='termin'`, `entity_id=terminId`.

## VPS-Cron (KEIN vercel.json — Memory `feedback_vps_crons`)

Route: `GET /api/cron/embed-b-termin-resolution`, Auth `Authorization: Bearer $CRON_SECRET`.
Empfohlen stündlich. Crontab-Zeile (Aaron auf dem VPS):

```cron
# AAR-939 embed-B Termin-Resolution (stuendlich zur Minute 17)
17 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/embed-b-termin-resolution >> /var/log/claimondo/embed-b-resolution.log 2>&1
```

## Smoke (gated auf Daten)

**Stand:** 0 echte Monika-B-Anfragen (`gutachter_finder_anfragen source='sv_embed' variante='B'`),
aber **45 `nur_gutachter`-Claims** — die Kaskade gilt service-typ-weit (nicht embed-B-exklusiv).

Smoke-Pfad (staging):
1. Seed/finde einen `nur_gutachter`-Claim mit einem `gutachter_termine`-Eintrag, `end_zeit` in der
   Vergangenheit, `durchgefuehrt_am/sv_no_show_am/sv_ablehnung_am = NULL`, Status `bestaetigt`.
2. Kunde-Portal `/kunde/faelle/[claimId]` öffnen → Banner „Kam dein Gutachter?" muss erscheinen.
3. **JA** klicken → `claims.status='termin_durchgefuehrt'`, `gutachter_termine.status='abgeschlossen'`
   + `durchgefuehrt_am` gesetzt; Banner weg. Screenshot + DB-Check.
4. Zweiter Termin, **NEIN** klicken → Dispatcher-Task (`task_typ='embed_b_termin_klaerung'`) in
   `/admin/tasks` + Dispatch-Dashboard; Banner weg. Screenshot + DB-Check.
5. Cron manuell triggern (curl mit CRON_SECRET) → für einen 3. stale Termin entsteht der Task
   (`keine_rueckmeldung`), erneuter Lauf erzeugt KEINEN zweiten (Idempotenz). `{geprueft, tasksErstellt}`.

## Offen (Folge-PR)

- **WhatsApp-Ping + Inbound JA/NEIN** (Handoff §4.3 WA; Baileys-Worker, größtes Teilstück).
- **Dispatcher-Auflösungs-UI:** `markSvNoShowEmbedB` hat noch **keinen** UI-Trigger → 1-Klick-Resolve
  des Klärungs-Tasks (SV-No-Show bestätigen + Verlegung anstoßen) = §4.4/§4.5.
- **Self-Service-Verlegung** für embed-B (bestehende `re-termin`-Infra anpassen).

## 7-Punkte-Audit

1. **Build:** _(siehe Commit — `tsc --noEmit` + `npm run build`)_
2. **UI-Erreichbarkeit:** Banner im Kunde-Fall-Detail (gegated); Dispatcher-Task in Dispatch-Dashboard
   + `/admin/tasks`. Dispatcher-Resolve-UI bewusst Folge-PR (dokumentiert).
3. **Redundanz:** Close-Logik in geteiltem File (SV+Kunde), Owner-Check via `assertKundeOwnsClaim/-Fall`,
   Task-Helper + Stale-Status-Liste zentral — keine Duplikation.
4. **Dead-Code:** lokale `CLAIM_TERMINAL_STATUSES`-Dup in actions.ts entfernt (→ geteiltes File).
5. **Spec-Treue:** Handoff §4.2/4.3(Portal)/4.5; Aaron-Entscheidungen 1–3 umgesetzt; WA/§4.4 als Folge-PR markiert.
6. **Inkonsistenz:** `{ok}`-Result durchgängig, Umlaute in UI-Strings, Claimondo-Tokens (success/amber semantisch),
   Nested-FK `Array.isArray`-normalisiert, `revalidatePath` gesetzt.
7. **Regression:** `markNurGutachterTerminDurchgefuehrt`-Refactor verhaltensgleich (+Bug-Fix); enges
   Banner-Gating verhindert Auftauchen bei Bestandsdaten; `completeBegutachtung`-Fix repariert latenten Bug.
