# C3-Prep — Notification-Outbox: Ist-Erhebung + C3a-Tranchenplan

> Fundament **C3** (`docs/fundament/FUNDAMENT.md` §5): *Eine Outbox für alles Ausgehende — mit Dedup-Key, Cron-Versand,
> sichtbarem Fehler-Task.* Prep (Ist-Erhebung + Plan), analog C1-/C2-Prep. **Ungated** (gründet auf A3 = done,
> `notification-matrix.md`); der **C3-Code** ist per §2-Deps auf **A3, C1** gegated (C3a hebt die `transitionClaim`-Sends
> → nach C1a). Docs-only → Regel-4-exempt. **Braucht Aaron-Review (§8)** bevor C3a-Code startet.
>
> Grundlage: A3-Notification-Matrix (`notification-matrix.md`, #4823) — die drei Sende-Welten + die LÜCKEN.

## 1 · Ist-Erhebung — drei überlappende Sende-Welten, Dedup nur in einer

| System | Kern | Achse | Empfänger | Dedup | Cron-Fallback |
|---|---|---|---|---|---|
| **1 · Kanonisch** | `emitEvent` → `notification_events` → `fan-out.ts` → `EVENT_MATRIX` → `channels/*` | Event (58) | alle Fall-Beteiligten (Gates) | ✓ `notification_deliveries` | ✓ Worker `*/5min` |
| **2 · Fall-Templates** | `sendFallCommunication` → `COMMUNICATION_REGISTRY` (~50 Trigger) | Trigger | EIN Empfänger | ✗ | ✗ fire-and-forget |
| **3 · Direkt-Helper** | `notifyNewLead`/`notifyFlottenmanager*`/`createNotification`→`benachrichtigungen`/`createGutachterMitteilung`→`mitteilungen`/direkte Inserts | ad-hoc | je Call-Site | ✗ (nur `erstelleVsDispatchTask`) | ✗ |

**System 1 ist die richtige Infrastruktur** (event-getrieben, fan-out, Dedup, Cron, Preferences, aktiv in 21 Files+Crons).
**System 2+3 laufen daran vorbei** — ohne Dedup, ohne Cron-Fallback. Das ist die C3-Rechtfertigung. Zwei In-App-Tabellen
(`mitteilungen` kanonisch vs. `benachrichtigungen` Legacy) fragmentieren die Bell zusätzlich.

**Die LÜCKEN-Klassen (A3 §5):**
- **P1a Dedup fehlt** (System 2 + fast ganz 3) — die drei bekannten Incidents (SA-signed, Schlussrechnung #4799, Nudge-30d) sind Symptome **dieser** Klasse.
- **P1b Stilles Sterben** — fire-and-forget; Twilio-/Resend-Fehlschlag verschwindet im Log, **kein** sichtbarer Task (Verfassung §8).
- **P1c Redundanz/Inkonsistenz** System 1↔2/3 — belegter Extremfall: der **SA-Konversionsmoment** feuert **6 Kunden-WhatsApp ohne gemeinsamen Dedup** (`flow/[token]/actions.ts:750/1306/1312/1421` + `:1554-1555`). Aaron-Entscheid P1.1 (DECISIONS 29.07.): **ein Willkommens-Set**.
- **P2** FM WhatsApp/Email-taub (Matrix `['in_app']`), kanzlei ohne Direkt-Netz, zwei In-App-Bells.

## 2 · Outbox-Modul-Design

**Additive Tabelle** `notifications_outbox` (DDL via Supabase-MCP `apply_migration`, Regel 2):
```
id · kanal · empfaenger (user_id/rolle) · template · payload(jsonb)
· dedup_key TEXT UNIQUE · status ('pending'|'sent'|'failed') · versuche · fehler · created_at · sent_at
```
**`enqueue()`-API** (`src/lib/notifications/outbox.ts`) mit **Dedup-Key-Pflicht** (Typ erzwingt ihn — kein enqueue ohne Key):
- INSERT `ON CONFLICT (dedup_key) DO NOTHING` → doppeltes enqueue = 1 Row = 1 Versand (schließt P1a strukturell).
- **Versand** über den bestehenden `*/5min`-Worker (der schon `notification_deliveries` fährt): `pending` → Kanal-Send → `sent`; Fehler → `versuche++`, Retry.
- **Retry erschöpft** → `status='failed'` **+ sichtbarer Task** (`create-task.ts`, Task-Board) — schließt P1b (Verfassung §8).

**Dedup-Key-Konvention:** `<event>:<empfaenger>:<kanal>:<claimId>[:<zeitfenster>]` — verallgemeinert das bewährte
`erstelleVsDispatchTask`-Muster (`task_code`+Existenz-Check) auf alle Sends.

## 3 · Umstellungs-Strategie (drei Systeme → eine Outbox)

- **System 1 (emit):** der `fan-out` ruft statt direkt `channels/*` künftig `enqueue()` — der Dedup wandert von `notification_deliveries` in die Outbox (oder Outbox wird die neue Delivery-Tabelle). Minimal-invasiv: das fan-out ist schon dedup-fähig.
- **System 2 (b-Klasse):** die Fall-Event-Trigger, die einen Anlass doppeln (termin_bestaetigt, gutachten_fertig, kanzlei_uebergabe, as_gesendet — A3 §3-Kollisionstabelle) werden auf das **Event-System gehoben** (emit→Outbox) ODER durch denselben Dedup-Key mit System 1 zusammengeführt. Die ~50 WA-**Templates** können als Template-Layer UNTER der Outbox bleiben (→ DECISIONS).
- **System 3:** Direkt-Helper → `enqueue()`. **Pre-claim-Sends** (FlowLink-Initial, Credential/Welcome, Gegner-Airdrop, Ops-Alerts — A3 §5 „off-taxonomy") gehen **auch** in die Outbox (Dedup + Fehler-Task), aber **nicht** in den claim-`fan-out`.
- **Zwei Bells:** `benachrichtigungen` (Legacy) → auf `mitteilungen` konsolidieren (C3/C4-nah).

## 4 · Tranchen

- **C3a** = `notifications_outbox`-Tabelle + `enqueue()` + Worker-Versand + Retry→Task **+ Umstellung der `transitionClaim`-Sends** (J1-Statuswechsel; hängt an C1a). Beweis: J1-Statuswechsel-Kommunikation läuft über die Outbox (SQL-Stichprobe); Dedup-Test (doppeltes enqueue → 1 Versand); simulierter Fehlschlag → Task sichtbar.
- **C3b** = der **SA-Moment** (P1c/P1.1 — 6-WA auf ein Willkommens-Set) + die A3-§3-Kollisionsanlässe.
- **C3c+** = restliche Sende-Pfade nach A3-Priorität; **0 offene P1-Zellen in A3** = DoD-Ziel.

## 5 · Berührungspunkte

- **C1 (`transitionClaim`):** feuert die Status-Events → C3a hebt genau diese Sends in die Outbox. **C3a nach C1a** (die Engine muss zuerst die Events sauber emittieren). Event-Achse mit A2 abgleichen.
- **C2 (`createCase`):** die Erstnotif (C2-Design §2 Schritt 5) ist ein `enqueue()`-Kandidat — ein Willkommens-Set je Meldung (P1.1-linientreu).
- **C4 (Eine Akte):** die In-App-Bell-Konsolidierung (`mitteilungen`) ist C3/C4-Naht.

## 6 · DECISIONS-Kandidaten (§8, für Aaron — A3-Fragen 1–3)

1. **Doppel-Send verifizieren:** feuern `termin bestätigt`/`gutachten fertig` **beide** Systeme (→ 2 WhatsApp)? C3 dedupliziert oder retiret eins. (Der `gutachten_fertig`-Doppel-Send-Verdacht in derselben Action `gutachter/fall/actions.ts:225/231` ist beim C3a-Bau zu verifizieren.)
2. **System 2-Ziel:** COMMUNICATION_REGISTRY komplett auf emit→Outbox heben, oder als Template-Layer UNTER der Outbox behalten (es trägt die ~50 WA-Templates)?
3. **FM/Kanzlei-Kanäle:** über In-App hinaus WA/Email im kanonischen fan-out (Matrix-Erweiterung), oder bleibt In-App bewusst?

## 7 · FG-/A2-Andocken
Notification-Preferences (N5) + Kanal-Flags berühren das FG-Programm — C3 ändert keine Preference-Semantik, konsumiert sie
nur. Die Event-Achse (58 Events) ist mit **A2** (`state-machine.md`) + **C1** (welche Events `transitionClaim` emittiert) abzugleichen.

## 8 · Offene Fragen an Aaron (max. 5)
§6 #1–#3. Zusätzlich: Wird die Outbox die **neue Delivery-Tabelle** (ersetzt `notification_deliveries`), oder liegt sie
**davor** (enqueue → Outbox → fan-out → deliveries)? (Empfehlung: Outbox davor, deliveries bleibt System-1-intern — minimal-invasiv.)

## 9 · Nächstes für C3a-Code (wenn C1a steht + Review)
Voller `writing-plans`-Plan; `notifications_outbox`-DDL final; den `gutachten_fertig`-Doppel-Send + die A3-§3-Kollisionen
gegen den **dann-aktuellen** Code verifizieren; Worker-Integration in den bestehenden `*/5min`-Cron.
