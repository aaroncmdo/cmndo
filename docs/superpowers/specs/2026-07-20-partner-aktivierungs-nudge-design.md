# Partner-Aktivierungs-Nudge — Design

**Datum:** 2026-07-20 · **Status:** Design (Aaron-approved) · **Branch:** `kitta/partner-aktivierungs-nudge`

## Problem

Der Health-Check `stuck-partner-accounts` meldet dauerhaft **crit** (metric 12): Partner-Accounts, die >7 Tage alt sind, `force_password_change=true` tragen und sich **nie eingeloggt** haben.

**Root-Cause (19.07., email_log-verifiziert): kein Code-Bug.** Alle 11 realen Werkstätten haben ihre `willkommen_werkstatt`-Zugangs-Mail bekommen (`email_log.status='sent'`, 07-07..07-10; bei 3 wurde sie am 07-14 sogar **erneut** gesendet) — und haben trotzdem nicht aktiviert. Der Anlage-Pfad funktioniert (`anlegePartnerKern` legt den Account an und überlässt die Mail bewusst dem Caller; `admin/partner-leads/actions.ts:358` ruft `sendWillkommenWerkstatt`). Der 02.07-Incident „createWerkstatt schickt keine Mail" ist gefixt.

**Die Lücke ist nicht die Mail, sondern die Nachverfolgung:** Der Check macht die toten Accounts nur *sichtbar* (ein aggregierter crit-Alert), er *heilt* sie nicht. Niemand bekommt eine nachverfolgbare Aufgabe. Und Mail konvertiert diese Cold-Outreach-Kohorte nachweislich nicht — es braucht einen Menschen.

## Ziel

Aus dem Monitoring-Befund wird **pro totem Partner eine nachverfolgbare Vertriebs-Aufgabe** — dedupliziert (kein Task-Spam) und selbstheilend (schließt sich, sobald der Partner sich einloggt).

## Entscheidungen (Aaron, 19./20.07.)

1. **Kadenz: sofort Anruf-Task.** Keine weitere Nudge-Mail — die Willkommens-Mail hatte inkl. Re-Send bereits zwei Chancen. → **kein neues Email-Template, kein Mail-Flow, kein rollen-spezifisches Mail-Routing.**
2. **Zielgruppe: alle *externen* Partner-Rollen** — `werkstatt`, `makler`, `sachverstaendiger`. `kundenbetreuer` bewusst **nicht**: interne Staff-Rolle, ein Vertriebs-Anruf-Task an eigenes Personal ergibt keinen Sinn (wird zusätzlich vom `istInterneEmail`-Filter erfasst).
3. **Eskalations-Ziel: Admin-Task** (`empfaenger_rolle='admin'`) — sichtbar in `/admin/aufgaben`, passend zum bestehenden Vertriebs-Surface (`admin/vertrieb/_actions/resend-werkstatt-welcome.ts`).

## Architektur

**Trennung Beobachter / Handelnder** — dieselbe Trennung, die der async-op-De-Noise (#4489) hergestellt hat: *Monitoring eskaliert nicht selbst.*

- Der **Health-Check** beobachtet (crit-Metrik auf `/admin/health`).
- Der **Cron** handelt (erzeugt und schließt Tasks).
- Beide teilen **einen** Detektor — keine duplizierte Query.

## Komponenten

### 1. `src/lib/partner/stuck-accounts.ts` (NEU)

```ts
export type StuckPartner = {
  userId: string
  email: string
  rolle: string
  /** `[vorname, nachname].filter(Boolean).join(' ') || null` — profiles.vorname trägt
   *  bei werkstatt/makler die FIRMA (nachname null), bei SV den Vornamen. */
  name: string | null
  telefon: string | null
  seit: string          // profiles.created_at (ISO)
}

export const EXTERNE_PARTNER_ROLLEN = ['werkstatt', 'makler', 'sachverstaendiger'] as const

export async function findStuckPartnerAccounts(
  admin: SupabaseClient,
  opts?: { rollen?: string[]; alterTage?: number },
): Promise<StuckPartner[]>
```

Logik (rein lesend, wirft nie). Defaults: `rollen = EXTERNE_PARTNER_ROLLEN`, `alterTage = 7`.

1. `profiles.select('id, email, rolle, vorname, nachname, telefon, created_at')` mit `.eq('force_password_change', true)`, `.in('rolle', rollen)`, `.lt('created_at', now − alterTage)`.
2. **Intern/Test raus:** `istInterneEmail(email)` aus `src/lib/testdaten/interne-identitaet` (SSoT). Ersetzt den heutigen, engeren `not ilike '%@claimondo.test'`-Filter und fängt zusätzlich `@claimondo.de` (z.B. `kb@claimondo.de`), `example.*`, `lex-drive.com` sowie `test`/`smoke`/`e2e`-Wortmarker.
3. Pro Kandidat `admin.auth.admin.getUserById(id)` → **nur behalten, wenn `!user.last_sign_in_at`**. Ein `getUserById`-Fehler → Kandidat **überspringen** (defensiv, exakt wie der Check heute: lieber unter- als übermelden).

### 2. `src/lib/health/checks/stuck-partner-accounts.ts` (REFACTOR)

Nutzt den Detektor statt der eigenen Query. Übergibt **weiterhin** seine bestehenden `PARTNER_ROLLEN` (inkl. `kundenbetreuer`) — der Check darf auch interne Onboarding-Löcher sehen; der `istInterneEmail`-Filter entfernt aber `kb@claimondo.de`.

**Verhaltens-Delta:** metric **12 → 11** (nur interne/Test fallen weg). Schwellen (`CRIT_AB=5`), Detail-Text, `sampleIds` und `STUCK_ALTER_TAGE=7` bleiben unverändert.

### 3. `src/app/api/cron/partner-aktivierung-nachfassen/route.ts` (NEU)

Muster: `gegner-invite-nachfassen` (Cron-Hausmuster).

```
GET(request):
  assertCronAuth(request)                       → sonst 401
  admin = createAdminClient()
  stuck  = await findStuckPartnerAccounts(admin)   // 3 externe Rollen, 7 Tage

  // A) Tasks erzeugen (dedupliziert, gedeckelt)
  für jeden p in stuck  (per-Item try/catch, max MAX_TASKS_PRO_LAUF):
    code = `partner-aktivierung:${p.userId}`
    → tasks.select('id').eq('task_code', code)  // JEDER Status, s. Nag-Loop-Hinweis
      → existiert? skip
    → createLinkedTask({
        titel:            `Partner aktivieren: ${p.name ?? p.email} (${p.rolle})`,
        beschreibung:     Kontakt (Telefon/Email) + „seit <seit> angelegt, nie eingeloggt;
                          Zugangs-Mail wurde gesendet — bitte telefonisch nachfassen."
        prioritaet:       'normal',
        empfaenger_rolle: 'admin',
        typ:              'partner_aktivierung',
        task_code:        code,
        trigger_event:    'partner_ohne_erstlogin',
        // KEIN entity_type/entity_id — s. Constraint-Fallen
      })

  // B) Selbstheilung
  tasks.select('id, task_code').like('task_code','partner-aktivierung:%').eq('status','offen')
    → userId aus task_code parsen → getUserById → last_sign_in_at gesetzt?
    → tasks.update({ status: 'erledigt' })

  return { geprueft, tasks_erstellt, tasks_geschlossen, uebersprungen_cap }
```

### Dedupe-Semantik: ein Task pro Partner, **jemals** (kein Nag-Loop)

Die Existenz-Prüfung ignoriert den Status **bewusst**. Würde nur auf `status='offen'` geprüft, entstünde ein **Nag-Loop**: Ein Mensch ruft den Partner an, hat keinen Erfolg, schließt den Task — und der nächste Cron-Lauf legt sofort einen neuen an, weil der Partner immer noch nicht eingeloggt ist. Der Vertrieb würde denselben toten Account endlos wiedervorgelegt bekommen.

Deshalb: **`task_code` existiert (egal in welchem Status) → nie wieder anlegen.** Ein bewusst erneutes Nachfassen ist eine menschliche Entscheidung (manueller Task oder die bestehende `resend-werkstatt-welcome`-Action), keine Cron-Automatik.

### Safety-Cap

`MAX_TASKS_PRO_LAUF = 25`. Ein Detektor-Fehler (z.B. versehentlich weggefallener Filter) darf nicht hunderte Vertriebs-Tasks fluten. Wird der Cap gezogen, wird das **explizit geloggt und im JSON-Summary als `uebersprungen_cap` zurückgegeben** — kein stilles Abschneiden (AGENTS-Prinzip „No silent caps"). Erwarteter Erstlauf: ~11, also weit unter dem Cap.

## ⚠ DB-Constraint-Fallen (20.07. gegen prod verifiziert)

- **`tasks.entity_type` hat einen CHECK**: `fall | lead | abrechnung | reklamation | sv_onboarding | gutachter | kunde | case | termin | gutschrift | fall_dokumente` — **kein `partner`/`werkstatt`**. Ein `entity_type='partner'` würde von Postgres **still verworfen** (genau die flag-drift-Silent-Fail-Klasse). → `entity_type`/`entity_id` bleiben **NULL** (der CHECK erlaubt NULL explizit); die Deduplizierung läuft über `task_code` (freie Spalte, kein CHECK). Konsequenz: der generische `autoCompleteTask`-Resolver (arbeitet über entity_type/entity_id) greift hier nicht — deshalb schließt **der Cron selbst** (Teil B).
- **`tasks.prioritaet` CHECK**: `normal | dringend | kritisch` → wir nutzen `normal` (Vertriebs-Nachfass, kein Incident; tunbar).
- **`tasks.status`**: **kein** CHECK; Bestand `offen` (61) / `erledigt` (1) → wir nutzen genau diese zwei Werte.

## Datenfluss

`profiles` + `auth.users` → Detektor → `StuckPartner[]` → Dedupe gegen `tasks.task_code` → `createLinkedTask` → `/admin/aufgaben` (Admin/Vertrieb).
Rückweg: Partner loggt ein → nächster Cron-Lauf setzt den Task auf `erledigt`.

## Error-Handling

Cron-Hausmuster (`gegner-invite-nachfassen`): Auth-Guard; **per-Partner `try/catch`** — ein Fehler stoppt den Lauf nie; kein `throw` aus der Route; JSON-Summary am Ende. Der Detektor schluckt `getUserById`-Fehler (überspringt den Kandidaten). `createLinkedTask` liefert bei Insert-Fehler `{ task_id: null }` → wird geloggt und gezählt, bricht den Lauf nicht.

## Testing

- **vitest Detektor** (gemockter Client): Altersschwelle · `force_password_change`-Filter · **interne Identität ausgeschlossen** · nie-eingeloggt-Filter · `getUserById`-Fehler → Kandidat übersprungen.
- **vitest Cron-Logik**: erzeugt Task für stuck-Partner · **kein Doppel-Task** im zweiten Lauf (Dedupe) · Selbstheilung schließt den Task, sobald `last_sign_in_at` gesetzt ist.
- **Health-Check**: Bestandstests bleiben grün + neuer Fall „interne/Test ausgeschlossen".
- **Regel-4-Prod-Smoke nach Deploy**: Cron mit `CRON_SECRET` triggern → Task für eine der 11 Werkstätten erscheint in `/admin/aufgaben`; zweiter Lauf erzeugt **kein** Duplikat; erzeugte Smoke-Tasks danach wieder schließen.

## Scope / YAGNI — bewusst NICHT enthalten

- Kein Nudge-Mail-Template, kein Mail-Flow, kein rollen-spezifisches Mail-Routing (Aaron: sofort Anruf-Task).
- Keine Ladder/Mehrfach-Kadenz (3/7/14).
- Kein automatisches Deaktivieren toter Accounts.
- Keine Migration für ein neues `entity_type` (DDL vermeiden — `task_code` genügt für Dedupe).
- `kundenbetreuer` nicht im Cron (bleibt nur im Health-Check sichtbar).

## Rollout

1. PR gegen `staging` (Regel 1), dann Release nach `main` → prod.
2. **VPS-crontab (Aaron trägt ein):** `0 7 * * * cron-call.sh /api/cron/partner-aktivierung-nachfassen` — täglich 07:00, wie `gegner-invite-nachfassen`.
3. Der erste Lauf erzeugt ~11 Tasks (die bekannte Kohorte) — gewollt: das ist der reale Backlog, den der Vertrieb abtelefoniert.

## Risiken

- **Task-Flut beim Erstlauf:** 11 Tasks auf einmal. Akzeptiert — endlicher, realer Backlog; danach nur noch Neuzugänge (~0–2/Woche).
- **Contention:** `src/lib/partner/` wird von Session `8c6de199` (`makler-anlage-kern-normalisierung`) angefasst — unsere Änderung dort ist ein **neues File**, keine Zeilen-Kollision.
- **Health-Check-Refactor** berührt die data-integrity-Lane; das Verhaltens-Delta (12 → 11) ist gewollt und wird im PR dokumentiert.
