# Monika — Chat schließbar + Inaktivitäts-Reaktivierung (Smoke, 07.06.2026)

Self-contained Playwright (`scripts/_monika-{close,reactivate}-smoke.mjs`, nicht committet).
Cluster-Modus. **Keine Page-Errors.**

## Chat schließbar (close-smoke)
1. FAB-Klick → Panel offen.
2. **X-Klick** → Panel zu, FAB da.
3. **System-Back** (`page.goBack()`) → Panel zu.
4. System-Back → **Host-Seite bleibt** (URL unverändert) — kein Loop, kein Seite-verlassen.

## Inaktivitäts-Reaktivierung (reactivate-smoke, echte 25s-Schwelle)
- **A — offen:** 27s ohne Klick an den Chips → Monika-Bubble „Sind Sie noch da? 😊 …" erscheint im Chat;
  Chips bleiben da + ein Chip-Klick führt zum nächsten Step (Flow funktional). Screenshot `A-open-reactivated.png`.
- **B — geschlossen:** Chat per X zu, 27s inaktiv → Reaktivierung als **Peek-Bubble** über dem FAB
  („… — weiter ↑"). Screenshot `B-closed-peek.png`.
- **C — nach Abschluss:** Flow abgesendet (done), 27s warten → **KEINE** Reaktivierungs-Bubble + **KEIN**
  Peek (Aaron-Anforderung: nach Abschluss keine Inaktivitäts-Nachrichten mehr). Screenshot `C-done-no-reactivate.png`.

## Mechanik
- System-Back: `history.pushState` beim Öffnen, `popstate` schließt, `closeWidget` konsumiert den State
  (`history.back`), Loop-sicher via Ref. X = rundes Tap-Target (weiß-transparent auf navy, accent-Focus).
- Reaktivierung: Timer (25s) gearmt wenn ein Schritt auf Input wartet, disarmt bei jeder Interaktion
  (Chip/Action/Submit) + re-armt bei Form-Eingabe. **Einmal pro Flow** (`reactivatedRef`). `done.value`-Guard
  in `armInactivity` + `doReactivate` → nach Abschluss keine weitere. build:embed 18.4 KB gz.
