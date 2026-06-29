# Updates-Feld — Rebuild Design (DB-getriebenes Action-Modell)

**Datum:** 2026-06-29 · **Status:** Design (Brainstorm abgeschlossen, Aaron-freigegeben) · **Session:** 9540cc36
**Audit-Grundlage:** `memory/COORDINATION-updates-feld-audit.md` (3-Agenten-Audit + Live-Prod-SQL)

---

## 1. Motivation / Problem

Das heutige „Updates"-Feld (Bell `components/shared/updates/UpdatesNav.tsx` über Tabelle `mitteilungen`) ist faktisch nutzlos:

- **Unread-Katastrophe:** ~99–100 % ungelesen (admin **328 / 1** gelesen, dispatch **80 / 0**). `markAllAsRead` existiert im Hook, ist aber nicht in der UI verdrahtet. Alles landet als „unread", nichts wird abgearbeitet → Badge permanent riesig → wird ignoriert.
- **Strukturelle Fragilität (Kern-Ursache):** Updates werden **imperativ** via `emitEvent()` materialisiert. Vergisst ein Code-Pfad das Emit, fehlt die Rolle in `ROLE_MAP` (dispatch/kanzlei/werkstatt), oder fehlt das Event in der `EVENT_MATRIX`, erscheint die Notification **still nie**. Genau diese Klasse hat in dieser Session mehrfach zugeschlagen (`gutachter_mitteilungen.dringend`-Ghost, `pflicht_fotos` nicht in Matrix, 3 Rollen-Lücken).
- **Zwei Schreibpfade:** Event-Pipeline (ROLE_MAP-gegated, 5 Rollen) **+** ~15 direkte `createMitteilung`-Caller (ungegated) → inkonsistent.
- **Rollen-Lücken:** dispatch/kanzlei nicht in ROLE_MAP, werkstatt fehlt sogar im `EmpfaengerRolle`-Type → leere/kaputte Bells.
- **Kategorie-Sprawl:** `task` deprecated, aber noch geschrieben (120 Zeilen); `anruf` nur aus direkten Writes.
- **Redundante Systeme:** `gutachter_mitteilungen` (0 rows/tot), `nachrichten` (Chat, separat), `tasks` (separat), `web_push` (dormant, kein VAPID).

## 2. Ziele / Nicht-Ziele

**Ziele:** (1) Das Feld wieder nützlich machen — „was braucht mich" sofort sichtbar, kein Lärm. (2) **Coverage-Lücken strukturell unmöglich** machen. (3) Alle 8 effektiven Rollen vollständig + korrekt bedienen. (4) Redundanz konsolidieren.

**Nicht-Ziele:** Kein Rebuild des Chat-Systems (`nachrichten` bleibt) · kein Rebuild des Tasks-Systems (bleibt, wird nur abgeleitet gespiegelt) · keine generelle Rollen-Konsolidierung über Updates hinaus (nur das tote `leadbearbeiter` wird als `dispatch`-Alias behandelt) · Web-Push (VAPID) bleibt Follow-up.

## 3. Kern-Entscheidungen (Brainstorm-Ergebnis)

1. **Fundamentaler Rebuild** des Modells (nicht nur Patches).
2. **Hybrid: Info vs Handlungsbedarf** — jedes Update ist „nur Info" (auto-gesehen) oder „braucht dich" (bleibt bis gelöst).
3. **DB-getriebenes Action-Modell** — die „Braucht dich"-Worklist wird **aus dem DB-Feld-State abgeleitet**, nicht aus gefeuerten Events materialisiert. *Das* macht Coverage-Lücken unmöglich + liefert Auto-Resolve gratis.
4. **Tasks integriert via Ableitung** (nicht kopiert) — Tasks bleiben Single-Source-of-Truth.
5. **Primär-Achse = Modus** („Braucht dich" / „Verlauf"); Typ (Aktivität/Nachrichten/Anrufe/Aufgaben) wird Filter + Icon.
6. **`modus` ist per Rolle** — dasselbe Signal ist für die eine Rolle Action, für die andere Info. Lebt in der Derive-Schicht (kein Matrix-Flag).
7. **8 effektive Rollen** — `dispatch` = `leadbearbeiter` (tot, nur Enum-Wert, 0 Code/User) → ein logischer Dispatcher; werkstatt kommt in den Type.

## 4. Architektur — 3 Schichten

Jede Schicht nutzt das **passende** Muster:

### Schicht A — „Braucht dich" (Action-Worklist) = ABGELEITET (DB-getrieben)

Kein materialisiertes Notification-Log. Eine **per-Rolle Derive-Funktion** `get_updates_action(user_id, rolle)` UNIONt N benannte **Action-Source-Queries**, jede:
- selektiert aus einer **State-Tabelle**, wo der Feld-State „Handlungsbedarf" bedeutet,
- gefiltert auf den Scope des Users / der Rolle,
- gemappt auf das einheitliche **Item**-Shape (§5).

Das Item existiert **genau dann**, wenn der Zustand es sagt → **Auto-Resolve gratis** (Feld füllt sich → Item fällt raus), **keine Coverage-Lücke möglich** (kein „vergessenes Emit"). Jede Source ist klein, benannt, einzeln testbar; eine neue Action = eine neue Query (statt Emit-Sites anzufassen).

**Action-Source-Registry** (Auszug — exakte Felder/Prädikate im Plan gegen Live-Schema verifizieren):

| Source | abgeleitet aus (Feld-State) | Rolle(n) | prioritaet |
|---|---|---|---|
| `offene_aufgabe` | `tasks.status` ∉ {erledigt,canceled,blockiert} ∧ (zugewiesen_an=user ∨ empfaenger_user_id=user) | je Empfänger | aus task |
| `dok_fehlt` | `pflichtdokumente.status='ausstehend'` ∧ claim.kunde=user | kunde | normal/hoch |
| `gutachten_ueberfaellig` | Termin durch ∧ `gutachten_eingegangen_am IS NULL` | sachverständiger | hoch |
| `nachbesserung` | `gutachten.qc_status='nachbesserung'` | sachverständiger | hoch |
| `einzug_fehlgeschlagen` | `abrechnungen.status='fehlgeschlagen'` ∧ ¬bezahlt | admin | dringend |
| `verifizierung_offen` | `sachverstaendige.verifizierung_status='pending'` | admin | normal |
| `vs_frist` | Frist-Feld < heute ∧ ¬erledigt | kanzlei/admin | dringend |
| `unbeantw_nachricht` | `nachrichten.gelesen=false` ∧ empfaenger=user | je Empfänger | normal |
| `neuer_lead` | `leads.zugewiesen_an IS NULL` (bzw. Dispatch-Regel) | dispatch | hoch |
| `neuer_auftrag` | `repairs/auftraege.status='neu'` ∧ werkstatt=user | werkstatt | hoch |
| `offener_rueckruf` | `admin_termine` Rückruf pending | dispatch/KB | hoch |
| `re_termin_wahl` | Termin mit Kunden-Gegenvorschlag offen | sachverständiger | hoch |
| … | (erweiterbar: Provision, Konsultation, Reklamation, Mietwagen-Frist) | | |

### Schicht B — „Verlauf" (Info-Feed) = leichter Log (event-getrieben, low-stakes)

Momente ohne Dauer-State („Fall reguliert", „Termin bestätigt", „SV zugewiesen") werden materialisiert: der **in-app-Channel der Pipeline** schreibt **nur noch Info-Items** in eine schlanke `mitteilungen` (auf Info reduziert). Eine fehlende Info ist akzeptabel (FYI, kein Schaden) — anders als eine fehlende Action. Read-State = **ein** `updates_last_seen_at` pro User; „neu seit zuletzt gesehen" als dezenter Indikator (treibt **nicht** den Badge).

### Schicht C — Externe Kanäle (Email/WA/Push) = Event-getrieben (unverändert)

Ein Versand ist ein Moment, nicht ableitbar → die `emit → fan-out → EVENT_MATRIX → email/whatsapp/web_push`-Pipeline bleibt **dafür** bestehen. Die Matrix routet weiter per-Rolle-Kanäle (extern + in-app-Info). **Kein** `modus`-Flag in der Matrix nötig — Action lebt komplett in der Derive-Schicht.

→ Netto: die Pipeline schrumpft auf „externe Kanäle + in-app-Info-Log"; die **kritische** Action-Worklist ist vollständig abgeleitet/robust.

## 5. Read-API + Item-Modell

**Ein Read-Endpoint** `get_updates(user_id, rolle)` mergt Schicht A (abgeleitete Actions) + Schicht B (Info-Log) zum einheitlichen **Item**:

```
Item = {
  id, typ: event | message | call | task,
  modus: info | action,
  prioritaet: normal | hoch | dringend,
  titel, inhalt?, kontext_typ + kontext_id, route_url, icon, created_at,
  source            // welche action-source bzw. event_type (Resolve + Debug)
}
```

- **Action-Items:** `modus=action`, **kein** per-User-Read (objektiv offen / weg).
- **Info-Items:** `modus=info`, gelesen via `updates_last_seen_at`.
- **Badge = COUNT(action-items)** für den User. Punkt.

## 6. Read-Modell (löst die Unread-Katastrophe an der Wurzel)

- Badge zählt **nur** offene Action-Items (objektiv aus State). Info zählt **nie**.
- „Alles gesehen" setzt `updates_last_seen_at = now()` → Info-Indikator weg; Action-Items bleiben (müssen via State gelöst werden — Dok hochladen, Task erledigen …).
- Kein `markAsRead`-Friedhof mehr; 99 %-unread ist strukturell unmöglich.

## 7. UI

- **Bell** (8 Rollen): Badge = offene Action-Items; rot wenn dringend dabei.
- **Popover:** oben **„Braucht dich"** (Action, nach prio+zeit) · darunter **„Verlauf"** (Info, ausgegraut, collapsed) · **Typ-Filter-Chips** (Alle/Aktivität/Nachrichten/Anrufe/Aufgaben) · Item: Icon + Titel + Kontext + Zeit; Klick → `route_url`. **„Alles gesehen"**-Button (nur Info).
- **Optional `/updates`-Vollseite** (operative Rollen: dispatch/SV/KB/kanzlei/werkstatt) — Worklist mit Sortieren/Filtern; Kunde/makler: Popover reicht. (Spätere Phase.)

## 8. Rollen-Coverage (8 effektive Rollen)

`dispatch` (= `leadbearbeiter`-Alias) · `sachverstaendiger` · `kundenbetreuer` · `kunde` · `kanzlei` · `makler` · `werkstatt` · `admin`.

Jede Rolle hat (a) ein **Action-Source-Set** (Schicht A — die per-Rolle-Business-Logic) + (b) **Info-Events** (Schicht B/C, Matrix). Konkret:

- werkstatt → in den `EmpfaengerRolle`-Type aufnehmen.
- `leadbearbeiter → dispatch`-Alias defensiv in der Rollen-Auflösung (nie fragmentieren).
- ROLE_MAP (für die externe Pipeline) + dispatch / kanzlei / werkstatt.
- Charakter: kunde/makler = ruhiger Info-Feed + wenige Actions; SV/dispatch/KB/kanzlei/werkstatt = echte Worklists; admin = action-gefiltert (Info zählt nicht → kein Ertrinken mehr).

## 9. Migration (6 Phasen, jede shipbar + koordiniert)

| Phase | Inhalt | Effekt |
|---|---|---|
| **0** | Derive-Fundament: `get_updates_action` (View/RPC) + erste Action-Sources (Tasks, Docs, Messages); `updates_last_seen`-Spalte | DB-getriebene Worklist steht |
| **1** | Rollen-Fix: werkstatt in Type · `leadbearbeiter→dispatch`-Alias · ROLE_MAP +dispatch/kanzlei/werkstatt | 3 kaputte Bells dicht (Quick-Win) |
| **2** | Read-Modell: Badge = Action-Count · „alles gesehen" · `mitteilungen` auf Info-Log reduziert | **Unread-Katastrophe tot** |
| **3** | UI-Rebuild: „Braucht dich" / „Verlauf" + Typ-Filter im Popover | sichtbarer Payoff |
| **4** | Action-Sources erweitern: Fristen · Finanzen (Einzug/Provision/Mahnung) · Verifizierung · Re-Termin · Konsultation · Auftrag | Vollständigkeit |
| **5** | Cleanup: `gutachter_mitteilungen` retiren · `task`-Kategorie raus · direkte Caller normalisieren · `leadbearbeiter`-Enum dokumentieren · optional `/updates`-Vollseite | Konsolidierung |

## 10. Risiken / Koordination

- **Geteilte Infra:** `EVENT_MATRIX` / `ROLE_MAP` / `mitteilungen` / `UpdatesNav` + viele aktive Sessions (werkstatt/kanzlei/dispatch/aar-956) emittieren Events bzw. bauen Rollen-Features. Der Rebuild muss um die laufenden Wellen koordiniert werden. Phasen 0/1 sind additiv + isoliert → guter Einstieg.
- **Perf:** die Derive-Worklist = N State-Queries pro Load. Bei niedrigem Volumen unkritisch; bei Skalierung gezielte Indizes (dann FK-/Predicate-Indizes mit `pg_stat`-Evidenz) bzw. materialized view / Caching. Im Plan messen.
- **Action-Source-Korrektheit:** jede Derive-Query muss die Business-Logik exakt treffen (falsch-positive Items nerven, falsch-negative verstecken Arbeit) → jede Source im Plan gegen Live-Schema + Beispiel-Daten verifizieren.
- **Info-Feed-Fragilität bleibt** (bewusst akzeptiert): fehlende Info = kein Schaden; die kritische Action-Schicht ist robust.

## 11. Offene Punkte (im Plan / später)

- `/updates`-Vollseite: ja/nein + Umfang.
- Info-Feed-Quelle: schlanke `mitteilungen` (empfohlen) vs. aus `timeline` ableiten.
- Genaue Felder/Prädikate je Action-Source (Schema-Verifikation).
- Web-Push (VAPID) reaktivieren.
