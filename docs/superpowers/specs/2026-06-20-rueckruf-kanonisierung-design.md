# Rückruf-Kanonisierung — Write- & Notification-Layer (Scope B)

**Datum:** 2026-06-20
**Status:** Design (Spec) — genehmigt, Plan folgt
**Ticket:** AAR-956 (Self-Service/FlowLink) · Folge-Ticket „Rückruf-Kanonisierung" anzulegen
**Autor-Session:** 819dab90 (aar-956)

---

## 1. Kontext & Problem

Die **Speicher- und Lese-Ebene** der Rückrufe wurde bereits kanonisiert (**AAR-637**): die eine
Quelle der Wahrheit ist `admin_termine` mit `typ='rueckruf'`, `status ∈ ('offen','erledigt','abgesagt')`,
gebunden an `lead_id` ODER `fall_id`. Die Legacy-Spalten `leads.rueckruf_datum/notiz/erledigt`
wurden gedroppt. Dispatch-Rückrufliste, Admin-Kalender, Mitarbeiter-Kalender, Dashboard-Zähler und
Fallakte lesen alle **dieselbe** Tabelle — konsistent.

**Die Kanonisierung hörte beim Speicher auf.** Der **Schreib- und Benachrichtigungs-Layer** ist
nicht kanonisiert: jeder Entstehungsweg rollt seinen eigenen `admin_termine`-Insert + seine eigenen
Seiteneffekte von Hand. Ergebnis: dasselbe fachliche Ereignis („ein Rückruf entstand") verhält sich
je nach Eintrittspunkt völlig unterschiedlich.

### Die Schreibwege heute (8 + Test)

| # | Writer | Datei | Bell | Team-Mail/WA | Kunde-WA | GCal | Dauer | zugewiesen_an | Lead-Flag |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `saveRueckruf` | `dispatch/leads/[id]/_actions/rueckruf.ts` | ❌ | ❌ | ❌ | ✅ | 15m | user | phase + geplant_am |
| 2 | `saveFallRueckruf` | `faelle/[id]/_sidebar/rueckruf-actions.ts` | ❌ | ❌ | ❌ | ❌ | 15m | kundenbetreuer | — |
| 3 | `erstelleOeffentlichenRueckruf` | `lib/actions/public-rueckruf.ts` | ✅ alle | ✅ | ✅ | ❌ | 30m | **keiner** | status + phase |
| 4 | `upsertReservierungsRueckruf(false)` | `lib/embed/reservierungs-rueckruf.ts` | ❌ | (Lead-Create) | ❌ | ❌ | 30m | dispId | — |
| 5 | `upsertReservierungsRueckruf(true)` | (via `bucheRueckrufBeimDispatcher`) | ✅ | ❌ | ✅ | ❌ | 30m | dispId | — |
| 6 | `markRueckrufErledigtMitErgebnis` (Folgetermin) | `dispatch/rueckrufe/actions.ts` | ❌ | ❌ | ❌ | ✅* | 15m | user | phase + anruf_* |
| 7 | `aendereTerminFlow` (Termin-Abbruch) | `flow/[token]/self-service-actions.ts` | ❌ | ❌ | ❌ | ❌ | — | — | **status only, KEIN admin_termine** |
| 8 | `BeratungVereinbarenButton`/`BeratungModal` | `components/shared/glass/*` | ? | ? | ? | ? | ? | ? | ? |

(`api/seed-testdata` schreibt ebenfalls typ='rueckruf' — Test-only, nicht betroffen.
`lib/actions/admin-termine-actions.ts` ist ein generischer Admin-Kalender-CRUD mit
`typ:'rueckruf'|'kunde'|'intern'` — bleibt als manuelle Kalender-Anlage bestehen, ist kein
fachlicher Rückruf-Flow.)

### Die konkrete Unlogik

1. **Notification-Asymmetrie (Kern-Beschwerde):** Ob der Dispatcher eine Glocke (`mitteilungen`)
   bekommt, hängt **ausschließlich vom Entstehungsweg** ab, nicht vom Ereignis. Weg 3 & 5 klingeln,
   1/2/4/6/7 nicht. Es gibt keine Regel „Rückruf entstand → benachrichtige den Zuständigen".
2. **Weg 7 erzeugt gar kein `admin_termine`** → der Rückruf-Wunsch ist in `/dispatch/rueckrufe`
   **unsichtbar**, lebt nur als `leads.status='rueckruf'` + Notiz.
3. **Weg 4 missbraucht „rueckruf" als „Reservierung bestätigen"-Task** mit `start_zeit=jetzt+5min`
   → erscheint sofort rot als „überfällig", vermischt mit echten Callback-Wünschen.
4. **Willkür:** Dauer 15 vs 30 min · `zugewiesen_an` user/kundenbetreuer/**niemand**/dispId · GCal-Sync
   nur bei 1 & 6 — alles dieselbe Entität.
5. **Flag-Drift:** `status='rueckruf'` (Weg 3,7) vs `qualifizierungs_phase='rueckruf'` (1,3,6) vs nichts
   (Embed 4,5) · `rueckruf_geplant_am` als denormalisiertes Duplikat, das manche pflegen und Embed nicht.

---

## 2. Ziele / Nicht-Ziele

**Ziele:**
- Ein einziger Writer, durch den **alle** Rückruf-Entstehungswege funneln.
- Eine einzige, deterministische Notification-Policy (das „Mitteilungs-Thema" lösen).
- Eine konsistente Zuweisungs-/Verteilungsregel (kein `zugewiesen_an=niemand` mehr).
- „Reservierung bestätigen" semantisch vom echten Rückruf trennen.
- Weg 7 reparieren (Rückruf wird in der Liste sichtbar).
- Flag-Handhabung vereinheitlichen, ohne den Load-Balancer zu brechen.

**Nicht-Ziele (bewusst draußen — wären Scope C / Folge-Hygiene):**
- `rueckruf_geplant_am` ganz droppen → View-Ableitung.
- `anruf_log` / `anruf_versuche` / `letzter_anruf_*` umbauen (anderes Konzept: Anruf-Historie,
  nicht „wo ist der Rückruf"). Bleibt unangetastet.
- Generischer Admin-Kalender-CRUD (`admin-termine-actions.ts`).
- Keine DDL für den Kern (siehe §7). Nur ggf. eine Read-View/Filter für offene Reservierungen (WP3).

---

## 3. Architektur — zwei Helfer, eine Quelle

Neuer Ordner `src/lib/rueckruf/`:

### 3.1 `upsert-rueckruf.ts` — der einzige Writer

```ts
export async function upsertRueckruf(input: {
  bezug: { leadId: string } | { fallId: string }
  startIso: string | null            // null = unscheduled/ASAP-Hinweis (jetzt+5min)
  anlass: 'kunde_anfrage' | 'dispatcher_plan' | 'flow_abbruch' | 'public_form' | 'disposition_followup'
  vonKunde: boolean
  istNeuerLead?: boolean             // default false
  zuweisenAn?: string | null         // expliziter Owner (dispatcher_plan: handelnder user.id) — höchste Präzedenz
  notiz?: string | null
  quelle?: string | null             // Audit-Hinweis in beschreibung
}): Promise<{ ok: boolean; terminId?: string; dispId?: string; error?: string }>
```

Verantwortlich an **einer** Stelle:
1. **Zuweisung auflösen** (§5) → `zugewiesen_an`.
2. **Spalten bauen** über pure Funktion `buildRueckrufColumns(...)` in `upsert-rueckruf-columns.ts`
   (vitest-getestet, kein server-only/DB-Import — analog dem bestehenden
   `reservierungs-rueckruf-columns.ts`). Feste Dauer **30 min**, einheitlicher Titel.
3. **Dedup:** genau ein offener Rückruf pro Bezug — `find by (lead_id|fall_id) + typ='rueckruf' +
   status='offen' → update, sonst insert`. (App-seitig, kein Unique-Index — bewusst, wie heute.)
4. **Kanonisches Lead-Flag** setzen (§6).
5. **GCal-Sync** konsistent: wenn `zugewiesen_an` einen Kalender hat → `syncAdminTerminCalendarEvent`
   (`lib/google-calendar/admin-event-sync`, fail-silent). Für ALLE Wege gleich.
6. **`notifyRueckruf(...)`** aufrufen (§4).
7. **revalidate** der Standard-Pfade (`/dispatch/rueckrufe`, `/dispatch/dashboard`,
   `/dispatch/leads/${id}`, `/admin/kalender`, `/mitarbeiter`).

Der Helper nutzt `createAdminClient()` (service-role), weil er aus Public-/Embed-Kontext (ohne
User-Session) UND aus Dispatch-Kontext aufgerufen wird. Auth/Ownership prüft der Caller.

### 3.2 `notify-rueckruf.ts` — die einzige Notification-Policy

```ts
export async function notifyRueckruf(terminId: string, ctx: {
  dispId: string | null
  vonKunde: boolean
  istNeuerLead: boolean
  kundeName: string
  kundeVorname: string | null
  kundeTelefon: string | null
  zeitfenster?: string | null
}): Promise<void>   // non-critical, wirft NIE
```

**Policy (eine Regel, drei orthogonale Signale, gesteuert durch zwei Booleans):**

| Signal | Bedingung | Wirkung |
|---|---|---|
| **Glocke** (`mitteilungen`, kategorie='anruf', prio='hoch', icon='📞', route=`/dispatch/rueckrufe?open=…`) | **immer**, an `dispId` (zugewiesener Dispatcher) | Besitzer wird IMMER gepingt — egal woher der Rückruf kam |
| **Team-Mail/WA** (`notifyNewLead`) | nur `istNeuerLead` | nur wenn ein brandneuer Lead entstand (Public-Form). Nicht bei Embed (Lead-Create notifyt schon) |
| **Kunde-WA** („wir rufen zurück", `sendWhatsAppText`) | nur `vonKunde` | nur wenn der Kunde den Rückruf aktiv wollte |

Das ist der Kern-Fix: das „Mitteilungs-Thema" wird durch **Ereignis-Eigenschaften** bestimmt, nicht
durch die zufällig aufgerufene Funktion.

---

## 4. Verteilung — Runtime-Zuweisung (`zugewiesen_an`)

Eine **Präzedenz** statt vier Zufälle — der Resolver wählt das erste zutreffende:

1. **Expliziter `zuweisenAn`** (z.B. `anlass='dispatcher_plan'`: der handelnde `user.id`, den
   saveRueckruf durchreicht — der Dispatcher nimmt den Rückruf selbst). Höchste Präzedenz.
2. **Bezug hat schon einen Besitzer?** → Rückruf **erbt** ihn.
   - Lead: `leads.zugewiesen_an`
   - Fall: `claims.kundenbetreuer_id` (via `resolveClaimId`, wie `saveFallRueckruf` heute)
3. **Kein Besitzer** (z.B. Public-Form-Neulead vor Zuweisung)? → **fair verteilen** über den
   **bestehenden** `pickRoundRobinDispatcher(admin)` aus `lib/start-link/pick-dispatcher.ts`
   (least-loaded: zählt offene nicht-terminale Leads je echtem Dispatcher, filtert Test-Accounts).
   **Wiederverwenden, nicht neu bauen.**

Da der Embed dem Lead bei Anlage schon einen `pickRoundRobinDispatcher`-Owner gibt, greift für die
meisten Wege Regel 2; der einzige echte „niemand"-Fall (Public-Form) wird durch Regel 3 geschlossen.
**`zugewiesen_an=niemand` ist damit strukturell weg.**

---

## 5. Reservierung ≠ Rückruf (Semantik-Trennung)

**Problem:** Weg 4 (Embed-Reservierung, `vonKunde=false`) erzeugt einen „rueckruf" mit
`start=jetzt+5min` für das fachliche Anliegen „Dispatcher, bitte diese Reservierung bestätigen".
Das ist **kein** Callback-Wunsch — es ist der Lebenszyklus des `gutachter_termine`
(`status: reserviert → bestaetigt`).

**Lösung:** Der Auto-Rückruf bei Reservierung **entfällt**. „Offene Reservierung bestätigen" wird
über `gutachter_termine.status='reserviert'` geführt, nicht über `admin_termine(typ='rueckruf')`.
Existierende Basis: `v_lead_termin_gutachter` (#2959) + `LeadTerminGutachterBanner` zeigen Termin +
Status bereits pro Lead. WP3 ergänzt eine Dispatch-Sicht/Badge „offene Reservierungen" als Filter
auf `status='reserviert'` (analog dem bestehenden `dispatch_pending`-Handling für Dead-Pins).

Ein **echter** Rückruf entsteht im Embed dann nur noch bei `vonKunde=true` (Kunde wählt auf der
Danke-Seite explizit eine Wunschzeit) — Weg 5.

**Eigentümer:** Diese Trennung berührt `reservierungs-rueckruf.ts` + die Embed-Reservierungs-Sicht —
**Revier der aktiven `kitta/aar-956-embed-reservierung-rueckruf`-Linie**. Als WP3-Handoff dorthin
(siehe §9), nicht von der Kanonisierungs-Session selbst.

---

## 6. Datenmodell-Entscheidungen

- **Flag-Regel (eine, dokumentiert):** Der Helper setzt **immer** `leads.qualifizierungs_phase='rueckruf'`
  als kanonischen „dieser Lead hat einen offenen Rückruf"-Marker und pflegt `rueckruf_geplant_am=startIso`.
  Der Helper **fasst `leads.status` nicht an** (lässt die Pipeline-Stufe wie sie ist).
  - *Begründung:* `leads.status='rueckruf'` hat einen echten Consumer — `pickRoundRobinDispatcher`
    zählt `status IN ('neu','rueckruf','quali-offen','flow-gesendet')` als offene Last. Ein Lead, auf
    dem ein Rückruf entsteht, hat aber bereits einen nicht-terminalen Status (neu/quali-offen/…), zählt
    also schon als Last. Den Status NICHT auf 'rueckruf' zu zwingen bricht die Last-Zählung nicht und
    verhindert Pipeline-Regression (z.B. ein in-Qualifizierung-Lead, der einen Rückruf bekommt, soll
    nicht auf 'rueckruf' zurückfallen).
  - Public-Form: der **neue** Lead wird weiterhin in `createLead` mit `status='rueckruf'` angelegt
    (das ist die korrekte Pipeline-Startstufe für einen reinen Rückruf-Lead) — orthogonal zum Helper.
  - Weg 7 (`aendereTerminFlow`): der bisherige nackte `status='rueckruf'`-Write **entfällt**; stattdessen
    `upsertRueckruf({ anlass:'flow_abbruch', vonKunde:true })` → echtes admin_termine + qualifizierungs_phase.
- **`rueckruf_geplant_am`:** bleibt, vom Helper konsistent gepflegt (jetzt-Lösung). „Drop→View" ist Scope C.
- **`anruf_log` / `anruf_versuche` / `letzter_anruf_*` / `verpasste_anrufe`:** unangetastet (Anruf-Historie,
  eigenes Konzept). Die Disposition (`markRueckrufErledigtMitErgebnis`) pflegt sie weiter; nur ihr
  Folgetermin-Insert geht durch den Helper.

---

## 7. Migration der Wege

Alle fachlichen Rückruf-Wege rufen nur noch `upsertRueckruf(...)`:

| Weg | Aufruf | Effekt-Änderung |
|---|---|---|
| 1 saveRueckruf | `{leadId, startIso, anlass:'dispatcher_plan', vonKunde:false}` | + Glocke an Owner (neu) |
| 2 saveFallRueckruf | `{fallId, startIso, anlass:'dispatcher_plan', vonKunde:false}` | + GCal + Glocke (neu); Dauer 15→30 |
| 3 erstelleOeffentlichenRueckruf | createLead → `{leadId, startIso, anlass:'public_form', vonKunde:true, istNeuerLead:true}` | zugewiesen statt niemand (Fix) |
| 4 embed reservation (auto) | **entfällt** | → `gutachter_termine`-Sicht (§5, WP3) |
| 5 embed danke wunschzeit | `{leadId, startIso, anlass:'kunde_anfrage', vonKunde:true}` | konsistent über Helper |
| 6 disposition-followup | `{leadId, startIso, anlass:'disposition_followup', vonKunde:false}` | über Helper |
| 7 aendereTerminFlow | `{leadId, startIso:null, anlass:'flow_abbruch', vonKunde:true}` | **erzeugt echtes admin_termine → sichtbar** (Fix) |
| 8 BeratungModal | über erstelleOeffentlichenRueckruf ODER `{… anlass:'public_form', vonKunde:true}` | konsistent (Audit beim Umbau) |

**Kein DDL für den Kern.** Reine Code-Konsolidierung + ggf. eine Read-View/Filter in WP3.

---

## 8. Testing

- **`upsert-rueckruf-columns.test.ts`** (vitest, pure): Dauer, Titel, status='offen', typ='rueckruf',
  ASAP-Fallback bei `startIso=null`.
- **`notify-rueckruf`-Policy-Test:** die 3 Signale × {vonKunde, istNeuerLead}-Matrix — Glocke immer,
  Team nur bei Neulead, Kunde-WA nur bei vonKunde.
- **Zuweisungs-Resolver-Test:** erbt Owner / Fallback `pickRoundRobinDispatcher` / dispatcher_plan→user.
- **Integration (manuell/Smoke):** je Weg genau ein offener Rückruf, korrekte Zuweisung, korrekte
  Benachrichtigung; Weg 7 erscheint in `/dispatch/rueckrufe`.
- **Regression:** alle Lese-Consumer (`dispatch/rueckrufe`, `dispatch/dashboard`, `mitarbeiter`,
  `NeueTermineBadge`, `FallRueckrufSection`, `admin-kalender`, `RueckrufTerminPanel`, `flow/actions.ts`)
  unverändert grün — sie lesen weiter `admin_termine(typ='rueckruf', status='offen')`.

---

## 9. Arbeits-Verteilung (Work-Packages)

| WP | Inhalt | Dateien | Kollision |
|---|---|---|---|
| **WP1** (ich) | `upsert-rueckruf.ts` + `upsert-rueckruf-columns.ts` + `notify-rueckruf.ts` + Zuweisungs-Resolver + vitest | **neu** unter `lib/rueckruf/` | **keine** |
| **WP2** (ich) | 6 bestehende Wege auf den Helper umhängen (1,2,3,5,6,7,8) | bestehende Action-Files (Boy-Scout) | gering — koordiniert, sequenziell |
| **WP3** (Embed-Linie) | Reservierung-≠-Rückruf-Trennung (§5): Weg-4-Auto-Rückruf raus + „offene Reservierungen"-Dispatch-Sicht | `reservierungs-rueckruf.ts`, Embed-Reservierungs-Sicht | **deren Revier** — Handoff |

**Reihenfolge:** WP1 → WP2 (gated auf WP1, ein Weg pro PR, Build+Smoke je Schritt) → WP3 parallel/danach.
WP1 ist additiv und kollisionsfrei (neue Dateien) → kann sofort starten, auch während die
`embed-reservierung-rueckruf`-Linie idle ist.

**Koordinations-Marker:** vor WP2-Touch an `reservierungs-rueckruf.ts`/Embed-Actions mit der
`kitta/aar-956-embed-reservierung-rueckruf`-Linie abstimmen (Memory-Marker schreiben).

---

## 10. Risiken & offene Punkte

- **Weg 8 (BeratungModal)** ist noch nicht voll auditiert (Notification-Verhalten unklar) — beim
  WP2-Umbau verifizieren und auf den Helper ziehen.
- **GCal-Sync für alle Wege** kann Volumen im Kalender des Dispatchers erhöhen (jeder Rückruf = Event).
  Gewollt (Konsistenz), aber beobachten.
- **`vonKunde=true` Kunde-WA** braucht eine echte WA-Nummer; Baileys-Fail ist non-critical (nur Log).
- **WP3-Abhängigkeit:** Solange Weg 4 nicht entfernt ist, erzeugen Embed-Reservierungen weiter
  „überfällige" Auto-Rückrufe. WP1/WP2 sind davon unabhängig lieferbar; WP3 schließt die Semantik-Lücke.
- **DB-Last:** `pickRoundRobinDispatcher` macht N+1 Count-Queries je echtem Dispatcher — bei aktuell
  1 echtem Dispatcher irrelevant; bei Skalierung beobachten (ist bestehendes Verhalten, nicht neu).

---

## 11. Definition of Done

- Alle 8 Wege (außer Weg 4, der entfällt) gehen durch `upsertRueckruf`.
- Jeder Rückruf pingt seinen zugewiesenen Dispatcher (Glocke) — verifiziert je Weg.
- Kein `zugewiesen_an=niemand` mehr möglich.
- Weg 7 (Flow-Abbruch) erscheint in `/dispatch/rueckrufe`.
- Embed-Reservierungen erzeugen keine „überfälligen" Pseudo-Rückrufe mehr (WP3).
- Lese-Consumer unverändert grün; vitest + Build + 4 Ratchets grün.
