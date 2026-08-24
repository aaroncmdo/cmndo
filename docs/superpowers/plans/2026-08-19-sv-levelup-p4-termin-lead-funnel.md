# SV-LevelUp P4 — Termin, Lead und Funnel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus einem Befund wird ein Vertriebsvorgang — der Sachverständige wählt einen Termin, dabei entsteht ein Lead in `sv_leads` und eine Aufgabe für den Vertrieb.

**Architecture:** Fachlogik in `lib/levelup/`, testbar ohne Next; die Server Actions unter `app/check/[token]/` bleiben dünne Wrapper. Der Lead entsteht in derselben Tabelle wie alle SV-Leads (`sv_leads`) — kein zweiter Topf. Die Benachrichtigung läuft über `tasks`, **nicht** über `notification_events` (Begründung unten).

**Tech Stack:** Next.js 16.2.1, React 19.2.4, Supabase (service_role, ungetypt), Vitest 4, TypeScript 5.

## Global Constraints

- **Ohne Einwilligung kein Lead.** `einwilligung !== true` → Abbruch, bevor irgendetwas geschrieben wird (F-06 Schritt 1).
- **Telefonnummern in E.164**, und **nie im Klartext geloggt** — auch nicht in `console.error`.
- **IP nur als SHA-256-Hash** (`hashIp` aus `lib/levelup/token.ts` existiert).
- **R-M:** Geschrieben wird ausschließlich in `sv_leads`, `levelup_*`, `tasks`, `consent_records`. **Niemals** in `leads`, `partner_leads`, `faelle`, `claims`.
- **R-E bleibt:** F-09 ist der **einzige** Endpunkt, der Maßnahmen ausliefert — und erst, wenn ein Termin existiert. F-05 bleibt unverändert maßnahmenfrei.
- Server Actions liefern `{ ok: true, … } | { ok: false, error: string }`.
- Jeder Write prüft `error` **und** die Zeilenzahl via `.select()`.
- DDL ausschließlich über `mcp__plugin_supabase_supabase__apply_migration`, danach `list_migrations` lesen und die Datei exakt nach der getrackten Version benennen (AGENTS.md Regel 2).

---

## Vier Befunde, die diesen Plan formen

**1 · `sv_leads.normalized_name` taugt NICHT für die Dublettenprüfung.**
`CONTEXT` §5 verlangt einen Namen ohne Gattungswörter (`kfz`, `sachverständigenbüro`, `gutachter`, `gmbh`). Die DB-Spalte ist aber `GENERATED ALWAYS` und macht nur `lower()` plus Whitespace-Normalisierung (geprüft 18.08.). Ein SQL-Vergleich `normalized_name = <bereinigter Name>` **trifft nie** — jeder Check legte einen neuen Lead an, und die Dublettenprüfung wäre eine Attrappe. Der Abgleich läuft deshalb **in TypeScript** über `kernName()` aus `lib/anreicherung/kern-name.ts`, gegen die Leads im PLZ-Umkreis.

**2 · `notification_events` ist claim-gekeyt und für diesen Fall unbrauchbar.**
`emitEvent()` ruft `resolveClaimId()` und der Fan-out lädt `loadClaimParticipants()` — beides setzt einen Schadenfall voraus. Ein SV-LevelUp-Termin hat keinen. Ein Event würde geschrieben und **nie verteilt**: ein toter Alarm, der schlechter ist als keiner. Deshalb gilt Design-Spec §5.2: die Benachrichtigung ist eine `tasks`-Zeile. Das weicht bewusst von `WELLEN_PLAN` Welle 4 Schritt 7 ab.

**3 · `consent_records` trägt keinen Bezug zum Vorgang.**
Die Tabelle hat `id, categories, policy_version, user_agent, created_at` — keine Lead- oder Check-Referenz, keinen IP-Hash. Der Bestand nutzt `categories` bereits als **Zweck-Array** (`melde-schaden`: `['mcp_schaden_melden','whatsapp_kontakt','drittland_llm']`), das Muster ist also etabliert. Für einen *zuordenbaren* Nachweis reicht es nicht: „Wer hat wann eingewilligt?" ließe sich nicht beantworten. Deshalb **beides** — der zentrale Eintrag nach dem Hausmuster **und** die Nachweisspalten am Termin (Task 1).

**4 · `tasks.lead_id` zeigt auf `public.leads` — Schadenfälle von Endkunden.**
Das Feld bleibt `NULL`. Der Bezug läuft über `entity_type='levelup_check'` / `entity_id`. Dies ist dieselbe Verwechslung, vor der `CONTEXT` §2 warnt.

---

## Warum P4 vor den restlichen 13 Modulen (P3b)

Der Check misst heute 116 von 150 Punkten und läuft end-to-end. Weitere Module machen den Befund reicher, aber sie folgen alle demselben Muster — das ist mechanische Arbeit auf einem bewiesenen Rahmen. **P4 schließt dagegen die Kette:** ohne Lead-Entstehung ist der Check ein Werkzeug ohne Geschäftsnutzen, und die Cold-Mail-Strategie hat kein Ziel, auf das sie zuläuft. Nach P4 kann ein Pilot mit echten Sachverständigen laufen; P3b hebt danach die Qualität.

---

## File Structure

```
sv-levelup/
├── lib/levelup/
│   ├── slots.ts              F-07 — sechs Werktags-Termine, belegte ausgenommen
│   ├── dubletten.ts          Abgleich über kernName + Umkreis (Befund 1)
│   ├── lead.ts               sv_leads verknüpfen oder anlegen
│   ├── termin.ts             F-06 — der Kern: Einwilligung → Consent → Lead → Termin → Task
│   ├── funnel.ts             F-08
│   ├── massnahmen.ts         F-11 — Plan aus Befunden ableiten
│   ├── freigabe.ts           F-09 — der EINZIGE Weg zu den Maßnahmen
│   └── __tests__/…
└── app/check/[token]/
    ├── actions.ts            + terminWaehlen, slotsHolen, funnelSpeichern, planHolen
    └── CheckClient.tsx       + Zustände 5–7
```

---

### Task 1: Migration — Einwilligung nachweisbar machen

**Files:**
- Create: `supabase/migrations/<version>_levelup_termine_einwilligung.sql`

**Interfaces:**
- Produces: `levelup_termine.einwilligung_am timestamptz`, `.einwilligung_ip_hash text`, `.einwilligung_text text`

- [ ] **Step 1: DDL über das Plugin anwenden**

```sql
alter table public.levelup_termine
  add column einwilligung_am      timestamptz,
  add column einwilligung_ip_hash text,
  add column einwilligung_text    text;

comment on column public.levelup_termine.einwilligung_am is
  'Zeitpunkt der Einwilligung in die Kontaktaufnahme. Ohne diesen Wert haette der Termin nicht entstehen duerfen (F-06 Schritt 1).';
comment on column public.levelup_termine.einwilligung_text is
  'Wortlaut, dem zugestimmt wurde — damit spaeter belegbar ist, WORIN eingewilligt wurde, nicht nur DASS.';
```

- [ ] **Step 2: `list_migrations` lesen und die Datei exakt nach der getrackten Version benennen** (Twin-Drift, AGENTS.md Regel 2)
- [ ] **Step 3: Spalten per `execute_sql` (READ) verifizieren**
- [ ] **Step 4: Typen regenerieren, wenn ein Consumer sie referenziert** — hier nicht nötig, der Client ist ungetypt
- [ ] **Step 5: Commit** — Migration + Datei

---

### Task 2: F-07 — freie Slots

**Files:**
- Create: `sv-levelup/lib/levelup/slots.ts`, `__tests__/slots.test.ts`

**Interfaces:**
- Produces: `export async function freieSlots(db: Db, jetzt: Date): Promise<{ start: string; label: string }[]>`

- [ ] **Step 1: Failing tests**

```ts
it('liefert sechs Termine', async () => {
  const s = await freieSlots(db, new Date('2026-08-19T10:00:00+02:00'))
  expect(s).toHaveLength(6)
})

it('nimmt nur Werktage', async () => {
  const s = await freieSlots(db, new Date('2026-08-21T10:00:00+02:00'))  // Freitag
  for (const x of s) {
    const tag = new Date(x.start).getDay()
    expect(tag).toBeGreaterThanOrEqual(1)
    expect(tag).toBeLessThanOrEqual(5)
  }
})

it('liegt immer in der Zukunft', async () => {
  const jetzt = new Date('2026-08-19T15:30:00+02:00')
  const s = await freieSlots(db, jetzt)
  for (const x of s) expect(new Date(x.start).getTime()).toBeGreaterThan(jetzt.getTime())
})

it('bleibt zwischen 08:00 und 18:00', async () => { /* Stunden prüfen */ })

// Ein bereits gewuenschter Termin darf nicht erneut angeboten werden — sonst
// sitzen zwei Sachverstaendige zur selben Zeit im selben Gespraech.
it('laesst belegte Slots aus', async () => {
  state.belegt = ['2026-08-20T09:00:00.000Z']
  const s = await freieSlots(db, new Date('2026-08-19T10:00:00Z'))
  expect(s.map((x) => x.start)).not.toContain('2026-08-20T09:00:00.000Z')
})

it('beschriftet deutsch und kurz', async () => {
  const s = await freieSlots(db, new Date('2026-08-19T10:00:00+02:00'))
  expect(s[0].label).toMatch(/^(Mo|Di|Mi|Do|Fr) · \d{2}:\d{2}$/)
})
```

- [ ] **Step 2: Rot prüfen** — `npx vitest run lib/levelup/__tests__/slots.test.ts`
- [ ] **Step 3: Implementieren.** Raster: 09:00, 11:00, 14:00, 16:00 an den nächsten Werktagen, frühestens 2 Stunden nach `jetzt`. Belegte kommen aus `levelup_termine` mit `status in ('gewuenscht','bestaetigt')`. **Keine Reservierung** — F-07 bucht nichts.
- [ ] **Step 4: Grün prüfen** · **Step 5: Commit**

---

### Task 3: Dublettenprüfung und Lead-Anlage

Der Task, an dem Befund 1 hängt. Ohne ihn entstehen bei jedem Check neue Dubletten.

**Files:**
- Create: `sv-levelup/lib/levelup/dubletten.ts`, `lead.ts`, `__tests__/lead.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function istDublette(a: { firma: string; plz: string | null; lat: number; lng: number },
                              b: { firma: string; plz: string | null; lat: number; lng: number }): boolean
  export async function findeOderLegeAn(db: Db, e: {
    firma: string; plz: string | null; ort: string | null; lat: number; lng: number
    telefon: string; websiteUrl: string | null
  }): Promise<{ ok: true; leadId: string; neu: boolean } | { ok: false; error: string }>
  ```

- [ ] **Step 1: Failing tests für `istDublette`**

```ts
it('erkennt denselben Betrieb trotz verschiedener Gattungswoerter', () => {
  expect(istDublette(
    { firma: 'Kfz-Sachverständigenbüro Meyer GmbH', plz: '48143', lat: 51.96, lng: 7.62 },
    { firma: 'Gutachter Meyer', plz: '48145', lat: 51.97, lng: 7.63 },
  )).toBe(true)
})

it('haelt zwei gleichnamige Betriebe in verschiedenen Staedten auseinander', () => {
  expect(istDublette(
    { firma: 'Sachverständigenbüro Meyer', plz: '48143', lat: 51.96, lng: 7.62 },
    { firma: 'Sachverständigenbüro Meyer', plz: '10115', lat: 52.53, lng: 13.38 },
  )).toBe(false)
})

// ⚠ Dieselbe Falle wie in `wett`: ''.includes('') ist true
it('haelt zwei Betriebe mit leerem Namenskern NICHT fuer dieselben', () => {
  expect(istDublette(
    { firma: 'Sachverständigenbüro', plz: '48143', lat: 51.96, lng: 7.62 },
    { firma: 'Kfz-Gutachter', plz: '48143', lat: 51.96, lng: 7.62 },
  )).toBe(false)
})
```

- [ ] **Step 2: Failing tests für `findeOderLegeAn`** — Treffer verknüpft und ergänzt nur leere Felder; kein Treffer legt an mit `quelle='sv-levelup'`, `warteliste_status='neu'`, `ist_aktiv=true`; ein 0-Row-Update ist ein Fehler; `leads`/`partner_leads` werden nie berührt (Test prüft die angefassten Tabellennamen).
- [ ] **Step 3: Rot prüfen**
- [ ] **Step 4: Implementieren.** Kandidaten über einen groben Bounding-Box-Filter laden (±0,15° ≈ 15 km), dann in TypeScript mit `kernName()` und Haversine ≤ 10 km vergleichen. **Nicht** gegen `normalized_name` in SQL (Befund 1).
- [ ] **Step 5: Grün prüfen** · **Step 6: Commit**

---

### Task 4: F-06 — Termin wählen, hier entsteht der Lead

**Files:**
- Create: `sv-levelup/lib/levelup/termin.ts`, `__tests__/termin.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function waehleTermin(db: Db, e: {
    token: string; slotStart: string; telefon: string; einwilligung: boolean
    ipHash: string; userAgent?: string; einwilligungText: string
  }): Promise<{ ok: true; terminId: string; leadId: string } | { ok: false; error: string }>
  ```

- [ ] **Step 1: Failing tests — die Reihenfolge ist der Test**

```ts
it('bricht ohne Einwilligung ab, BEVOR irgendetwas geschrieben wird', async () => {
  const r = await waehleTermin(db, { ...basis, einwilligung: false })
  expect(r).toEqual({ ok: false, error: 'einwilligung_fehlt' })
  expect(state.geschrieben).toEqual([])        // keine einzige Tabelle angefasst
})

it('schreibt den Consent-Nachweis VOR dem Lead', async () => {
  await waehleTermin(db, basis)
  const i = state.geschrieben.indexOf('consent_records')
  const j = state.geschrieben.indexOf('sv_leads')
  expect(i).toBeGreaterThanOrEqual(0)
  expect(i).toBeLessThan(j)
})

it('normalisiert die Telefonnummer nach E.164', async () => {
  await waehleTermin(db, { ...basis, telefon: '0251 / 12 34 56' })
  expect(state.termin.telefon).toBe('+49251123456')
})

it('lehnt eine unbrauchbare Telefonnummer ab', async () => {
  const r = await waehleTermin(db, { ...basis, telefon: 'ruf mich an' })
  expect(r.ok).toBe(false)
})

it('lehnt einen Slot in der Vergangenheit ab', async () => { /* … */ })

// F-06: „Ein Check erzeugt hoechstens einen Lead. Zweiter Aufruf aktualisiert den Termin."
it('legt beim zweiten Aufruf keinen zweiten Lead an', async () => {
  await waehleTermin(db, basis)
  state.geschrieben = []
  await waehleTermin(db, { ...basis, slotStart: andererSlot })
  expect(state.geschrieben).not.toContain('sv_leads')
  expect(state.termin.slot_start).toBe(andererSlot)
})

it('spiegelt den Lead als Aufgabe fuer den Vertrieb', async () => {
  await waehleTermin(db, basis)
  expect(state.task).toMatchObject({
    typ: 'levelup_lead', entity_type: 'levelup_check', empfaenger_rolle: 'admin',
    prioritaet: 'hoch', auto_erstellt: true,
  })
  expect(state.task.lead_id).toBeUndefined()   // zeigt auf Schadenfaelle (Befund 4)
})

it('zieht den Rueckverweis am Check und am Lead nach', async () => {
  await waehleTermin(db, basis)
  expect(state.checkUpdate.sv_lead_id).toBeTruthy()
  expect(state.leadUpdate.levelup_letzter_check_id).toBeTruthy()
})

/** ⚠ Die Nummer darf in keinem Log landen — auch nicht im Fehlerfall. */
it('loggt die Telefonnummer nie im Klartext', async () => {
  const ausgaben: string[] = []
  const alt = console.error
  console.error = (...a) => ausgaben.push(a.join(' '))
  state.terminFehler = 'kaputt'
  await waehleTermin(db, { ...basis, telefon: '+4925112345678' })
  console.error = alt
  expect(ausgaben.join(' ')).not.toContain('4925112345678')
})
```

- [ ] **Step 2: Rot prüfen**
- [ ] **Step 3: Implementieren** in der Reihenfolge aus F-06. `zuE164` aus `lib/anreicherung/telefon-e164.ts` wiederverwenden (existiert). Consent-Eintrag mit `categories: ['sv_levelup_beratung','telefon_kontakt']` nach dem Hausmuster **plus** die Nachweisspalten am Termin.
- [ ] **Step 4: Grün prüfen** · **Step 5: Commit**

---

### Task 5: F-08 — Funnel

**Files:**
- Create: `sv-levelup/lib/levelup/funnel.ts`, `__tests__/funnel.test.ts`

- [ ] **Step 1: Failing tests** — Upsert auf `levelup_funnel`; `sv_leads.jahre_erfahrung` wird nur nachgezogen, **wenn dort leer**; ohne `sv_lead_id` am Check → Ablehnung (F-08-Regel: nur nach F-06); zweiter Aufruf überschreibt statt zu duplizieren.
- [ ] **Step 2: Rot prüfen** · **Step 3: Implementieren** · **Step 4: Grün** · **Step 5: Commit**

---

### Task 6: F-09 + F-11 — Maßnahmen ableiten und freigeben

**Files:**
- Create: `sv-levelup/lib/levelup/massnahmen.ts`, `freigabe.ts`, `__tests__/massnahmen.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Massnahme = {
    t: string; w: string; a: string; wi: 'hoch'|'mittel'|'gering'
    p: number; q: string; ph: 1|2|3
  }
  export function leiteAb(befunde: Record<string, ModulErgebnis>): Massnahme[]
  export async function gibFrei(db: Db, token: string): Promise<
    { ok: true; phasen: { nr: number; massnahmen: Massnahme[] }[] } | { ok: false; error: string }>
  ```

- [ ] **Step 1: Failing tests für `leiteAb`** — je Befund unter Maximum genau eine Maßnahme; ein Befund auf Maximum erzeugt keine; ein **nicht erhobener** Befund erzeugt keine (man kann nichts verbessern, was nicht gemessen wurde — R-B); jede Maßnahme trägt `q` (Quelle = welches Modul, welches Kriterium) und `p` (erreichbare Punkte); Phase 1 sind die Maßnahmen mit dem besten Verhältnis Punkte/Aufwand.
- [ ] **Step 2: Failing tests für `gibFrei`** — **403 ohne Termin** (der Kern von R-E); mit Termin kommt der Plan; `massnahmen` wird in `levelup_checks` gespeichert; Ereignis `plan_gesendet`.
- [ ] **Step 3: Der Gegentest zu F-05**

```ts
// F-09 ist der EINZIGE Weg zu den Massnahmen — F-05 bleibt dicht.
it('liefert nach der Freigabe Massnahmen, F-05 aber weiterhin nicht', async () => {
  await gibFrei(db, 'T1')
  const befund = await baueBefund(db, 'T1')
  expect(JSON.stringify(befund).toLowerCase()).not.toContain('massnahme')
})
```

- [ ] **Step 4: Rot prüfen** · **Step 5: Implementieren** · **Step 6: Grün** · **Step 7: Commit**

---

### Task 7: Zustände 5 bis 7 in der Oberfläche

**Files:**
- Modify: `sv-levelup/app/check/[token]/actions.ts`, `CheckClient.tsx`

- [ ] **Step 1: Server Actions ergänzen** — `slotsHolen`, `terminWaehlen`, `funnelSpeichern`, `planHolen`. Die IP kommt wie in `app/actions.ts` aus `x-forwarded-for`.
- [ ] **Step 2: Zustand 5 — Terminwahl.** Sechs Slots als Karten, Telefonfeld, **Einwilligungs-Kästchen mit ausgeschriebenem Text** (der Wortlaut wird gespeichert, Task 1). Der Absende-Knopf bleibt gesperrt, solange das Kästchen leer ist.
- [ ] **Step 3: Zustand 6 — Funnel**, drei Fragen, überspringbar.
- [ ] **Step 4: Zustand 7 — Plan.** Nach Terminwahl erreichbar; zeigt die Maßnahmen nach Phasen mit Aufwand und erreichbaren Punkten.
- [ ] **Step 5: `npm run build`** (nicht nur `tsc` — Next findet Routen-Fehler erst im vollen Build)
- [ ] **Step 6: Klick-Durchlauf** gegen den Produktions-Build wie in P3 Task 7: Check → Befund → Termin → Funnel → Plan.
- [ ] **Step 7: Commit**

---

## Abnahme P4

- [ ] Ohne Einwilligung entsteht **kein** Lead, und es wird **keine** Tabelle angefasst (Test)
- [ ] Ein zweiter Terminwunsch erzeugt keinen zweiten Lead
- [ ] Die Dublettenprüfung findet einen Bestandslead über verschiedene Gattungswörter hinweg (Test **und** gegen die echten 62 Leads geprüft)
- [ ] Telefonnummern stehen in E.164 in der DB und in keinem Log
- [ ] `tasks`-Zeile entsteht mit `entity_type='levelup_check'` und `lead_id IS NULL`
- [ ] F-09 gibt ohne Termin **403**; F-05 bleibt auch nach der Freigabe maßnahmenfrei
- [ ] `leads` = 78 und `partner_leads` = 126 unverändert; `sv_leads` wächst **nur** um echte Neuanlagen
- [ ] `npm run build`, `tsc`, `eslint`, `vitest` grün
- [ ] Klick-Durchlauf bis zum Plan grün
- [ ] **Regel 4:** Prod-Smoke bleibt an A-3 gebunden (Domain fehlt) — die Pflicht geht mit ausformuliertem Soll an die Deploy-Session

## Was P4 nicht tut

- **Keine echte Kalender-Anbindung.** F-07 sagt ausdrücklich „keine Belegung reservieren". Die Slots sind ein Raster, das bereits gewünschte Zeiten auslässt — mehr nicht. Eine Anbindung an einen realen Vertriebskalender ist eine eigene Entscheidung.
- **Kein Mailversand.** Der Vertrieb sieht den Lead als Aufgabe. Ob zusätzlich eine Mail rausgeht, hängt an einer Benachrichtigungs-Strecke, die es für claim-lose Vorgänge noch nicht gibt (Befund 2).
- **Keine Konvertierung Lead → Partner.** Der Weg existiert fertig in `claimondo-marketing/lib/sv-basic/claim-actions.ts` und wird in P5 angedockt, nicht neu gebaut.
