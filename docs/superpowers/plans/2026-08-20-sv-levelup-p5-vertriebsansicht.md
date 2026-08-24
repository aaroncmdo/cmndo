# SV-LevelUp P5 — die Vertriebsansicht

> **Für agentische Arbeiter:** PFLICHT-SUB-SKILL: `superpowers:executing-plans`.

**Ziel:** Aus dem Befund wird ein geführtes Verkaufsgespräch. Aaron sieht, was der Sachverständige nicht sieht — Maßnahmenplan mit Aufwand, Minutenplan, Einwandbehandlung — und kann den Lead am Ende zum Partner machen.

**Aufbau:** Drei neue Routen in `sv-levelup` (eigener Build, konfliktfrei zum Haupt-Repo). Alle Fachlogik kommt aus den bestehenden Bibliotheken; neu sind die Ansichten, das Staff-Gate und die Vertriebstexte.

## Weltweite Vorgaben

Wie in P3/P4 — R-A, R-B, Umlaute in allen nutzersichtbaren Texten, `{ ok, error }` statt `throw`, `.select()` + Zeilenprüfung bei jedem Write, Server-Actions als dünne Wrapper über testbarer Bibliothek.

---

## Drei gemessene Tatsachen, die den Aufbau bestimmen

**1 · Das Cookie-SSO funktioniert nicht.** `sv-levelup/lib/supabase/server.ts` behauptet in einem Kommentar, das Staff-Gate brauche kein eigenes Login, weil die Portal-Sitzung subdomain-übergreifend gelte. Nachgemessen: `src/lib/supabase/client.ts:54` setzt `cookieOptions` **ohne** `domain` — der Cookie gilt nur für `app.claimondo.de`. sv-levelup sieht ihn nie.

Die Haupt-App umzustellen wäre ein Eingriff in die Kern-Anmeldung, der **jede laufende Sitzung invalidiert** (alle Nutzer ausgeloggt) — und läge in `src/`, das auf diesem Branch 6470 Commits hinter `staging` steht. Deshalb: **eigene Anmeldung auf sv-levelup**, dieselben Konten, dieselbe Datenbank. Der falsche Kommentar wird korrigiert.

**2 · Ein Login ohne MFA-Prüfung wäre eine latente Lücke.** Gemessen: 12 Staff-Konten, davon **1** mit verifiziertem Faktor (ein Dispatch-Konto); die vier Admin-Konten haben keinen. Ein einfaches `signInWithPassword` umgeht heute also nichts — aber sobald jemand MFA aktiviert, umginge es das still. Die Anmeldung prüft deshalb `getAuthenticatorAssuranceLevel()` und verlangt den Code, wenn `nextLevel === 'aal2'`.

**3 · `beanspracheSvLead` ist nicht importierbar.** Die gehärtete Konvertierung (268 Zeilen, `'use server'`, marketing-eigene Alias-Importe) lebt in `claimondo-marketing` — einem anderen Build. Kopieren wäre eine zweite Wahrheit für einen Pfad mit vierstufiger Rollback-Kette und optimistischem Lock; genau davor warnt die Spec. **Deshalb Spec-Option 2:** der Knopf führt in den bestehenden Claim-Flow (`/gutachter-partner`), die Auswertung zeigt Name, E-Mail und Telefon direkt daneben zum Übernehmen. Ein Klick mehr, aber **eine** Wahrheit.

⚠ Option 1 (ein Klick, Admin löst direkt aus) bleibt möglich und ist ein kleiner Folgeschritt: ein neuer Endpunkt in `claimondo-marketing/app/api/…` — eine **neue Datei**, also ebenfalls konfliktfrei — der `beanspracheSvLead` aufruft. Das ist eine Aaron-Entscheidung, weil sie ein geteiltes Geheimnis zwischen zwei Diensten einführt.

---

### Aufgabe 1: Tabelle `levelup_auswertungslinks`

**Dateien:** Migration über das Supabase-Plugin, danach `supabase/migrations/<V>_levelup_auswertungslinks.sql` committen.

```sql
create table public.levelup_auswertungslinks (
  id             uuid primary key default gen_random_uuid(),
  check_id       uuid not null references public.levelup_checks(id) on delete cascade,
  token          text not null unique,
  erstellt_von   uuid references public.profiles(id),
  erstellt_am    timestamptz not null default now(),
  letzter_aufruf timestamptz,
  aufrufe        integer not null default 0
);

alter table public.levelup_auswertungslinks enable row level security;

-- Nur Staff liest. KEINE anon-Policy, KEIN anon-Grant: der Link traegt den
-- Gespraechsleitfaden samt Einwandbehandlung — saehe der Sachverstaendige ihn,
-- waere das Gespraech verbrannt.
create policy levelup_auswertungslinks_sel_staff
  on public.levelup_auswertungslinks for select to authenticated
  using (public.is_staff());

create index levelup_auswertungslinks_check_idx
  on public.levelup_auswertungslinks(check_id);
```

- [ ] **Schritt 1:** `apply_migration({ name: 'levelup_auswertungslinks', query: … })`
- [ ] **Schritt 2:** `list_migrations` → die vom Plugin vergebene Version ablesen
- [ ] **Schritt 3:** Migration-Datei exakt unter dieser Version committen (Regel 2, Twin-Drift)
- [ ] **Schritt 4:** `execute_sql` (READ) — Tabelle, Policy und Index verifizieren
- [ ] **Schritt 5:** Prüfen, dass `anon` **keinen** Grant hat:
  `select has_table_privilege('anon','public.levelup_auswertungslinks','select')` → muss `false` sein

---

### Aufgabe 2: Anmeldung mit MFA-Prüfung

**Dateien:**
- Anlegen: `sv-levelup/lib/levelup/staff.ts`, `sv-levelup/app/anmelden/{page,AnmeldenClient}.tsx`, `sv-levelup/app/anmelden/actions.ts`
- Ändern: `sv-levelup/lib/supabase/server.ts` (falscher Kommentar)
- Test: `sv-levelup/lib/levelup/__tests__/staff.test.ts`

**Schnittstellen:**
- Erzeugt: `pruefeStaff(db): Promise<{ ok: true; userId: string } | { ok: false; grund: 'keine_sitzung' | 'kein_staff' }>`

- [ ] **Schritt 1: Test schreiben** — Fälle: keine Sitzung · Sitzung ohne Staff-Rolle · Staff · `is_staff`-Aufruf schlägt fehl (→ `kein_staff`, **nie** durchlassen)

```ts
// Der wichtigste Fall: ein Fehler beim Pruefen darf NIE Zugang geben.
it('verweigert, wenn die Staff-Pruefung selbst fehlschlaegt', async () => {
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
               rpc: async () => ({ data: null, error: { message: 'kaputt' } }) }
  const r = await pruefeStaff(db as never)
  expect(r.ok).toBe(false)
})
```

- [ ] **Schritt 2: Rot bestätigen**

- [ ] **Schritt 3: Umsetzen.** `pruefeStaff` liest `auth.getUser()` und ruft `rpc('is_staff')`. **Fehlt die Sitzung oder wirft der Aufruf, ist die Antwort „nein"** — ein Gate, das bei Störung öffnet, ist kein Gate.

Die Anmeldung selbst:
```ts
const { error } = await db.auth.signInWithPassword({ email, password })
if (error) return { ok: false, error: 'E-Mail oder Passwort stimmen nicht.' }

// ⚠ Ohne diese Pruefung umgeht die Anmeldung die Zwei-Faktor-Sicherung still,
// sobald ein Staff-Konto einen Faktor aktiviert. Heute betrifft das eines von
// zwoelf — das ist ein Grund fuer die Pruefung, keiner dagegen.
const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel()
if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
  return { ok: false, mfaNoetig: true }
}
```
Bei `mfaNoetig` zeigt der Client ein Code-Feld und ruft `mfa.challengeAndVerify`.

- [ ] **Schritt 4: Grün** — `npx vitest run lib/levelup/__tests__/staff.test.ts`
- [ ] **Schritt 5: Kommentar in `server.ts` korrigieren** — er behauptet ein SSO, das nicht existiert
- [ ] **Schritt 6: Festschreiben**

---

### Aufgabe 3: Übersicht `/auswertung`

Ohne sie ist die Auswertung nicht erreichbar (Audit-Punkt 2): Aaron braucht eine Liste, aus der heraus er den Link erzeugt.

**Dateien:** `sv-levelup/app/auswertung/{page.tsx,actions.ts}`, `sv-levelup/lib/levelup/auswertung.ts`, Test dazu.

**Schnittstellen:**
- Erzeugt: `ladeChecksFuerVertrieb(db)`, `erzeugeAuswertungslink(db, checkId, userId)`, `ladeAuswertung(db, token)`

**Inhalt der Liste**, je Check eine Zeile: Firmenname · Ort · Datum · Score bzw. „Teilbefund" · Termin (Datum, wenn angefragt) · Lead verknüpft (ja/nein) · Knopf „Auswertung öffnen".

**Reihenfolge:** Checks **mit Terminwunsch zuerst**, danach nach Datum absteigend. Wer einen Termin will, ist der Vorgang, der als Nächstes ansteht — nicht der jüngste Check.

- [ ] **Schritt 1–6:** Test → rot → bauen → grün → Staff-Gate davor → Festschreiben

⚠ `erzeugeAuswertungslink` ist **idempotent**: existiert für den Check schon ein Link, wird er zurückgegeben statt ein zweiter erzeugt. Sonst sammeln sich pro Aufruf Tokens, die alle gültig bleiben und einzeln widerrufen werden müssten.

---

### Aufgabe 4: Die Auswertung — Gesamtbild und Maßnahmenplan

**Dateien:** `sv-levelup/app/auswertung/[token]/{page.tsx,AuswertungClient.tsx}`

**Drei Ansichten als Reiter** (Mockup `mockup-levelup-auswertung.html`): Gesamtauswertung · Maßnahmenplan · Verkaufsgespräch. Eine Modulleiste filtert **alle drei gleichzeitig** — ein abgewähltes Modul verschwindet auch aus dem Leitfaden, sonst nennt Aaron im Gespräch eine Zahl, die er gerade ausgeblendet hat.

**Gesamtauswertung:** Score bzw. Teilbefund-Begründung · je Modul ist/max mit Ampel · jeder Befund mit Wert, Einordnung, **Quelle und Datum**. Fehlstellen ausdrücklich als solche, nie als Null.

**Maßnahmenplan:** die drei Phasen aus `leiteAb`, je Maßnahme Titel, Begründung, Aufwand, Punkte, Wirkung, Quelle.

**Zusätzlich rechts:** Kontaktdaten des Leads (Name, E-Mail, Telefon) mit Herkunft je Feld aus `levelup_anreicherung` — „woher stammt diese Adresse" ist im Gespräch die Frage, die zuerst kommt.

- [ ] **Schritt 1–6** wie gehabt.

---

### Aufgabe 5: Der Gesprächsleitfaden

**Dateien:** `sv-levelup/lib/levelup/gespraech.ts` + Test, Ansicht in `AuswertungClient.tsx`

Der Minutenplan steht im Mockup ausformuliert und wird übernommen (0–3 Ankommen · 3–8 Die Lage · 8–18 Drei Zahlen · 18–25 Nur Phase 1 · 25–30 Die Entscheidung). Dynamisch sind:

| Platzhalter | Herkunft |
|---|---|
| Modulzahl im Einstiegssatz | `Object.keys(befunde).length` |
| Lage-Satz | `wett`-Befunde: Marktgröße, Median, eigener Rang |
| Die drei Zahlen | die drei Befunde mit dem **größten Punktabstand** zum Maximum |
| Phase 1 | `leiteAb(...).filter(m => m.ph === 1)` |
| Dauer Phase 1 | Summe der Minuten, in Wochen gerundet |
| Zahlen mit Quelle | Anzahl Befunde mit `wert !== null` |

**Einwände.** Je Modul ein wahrscheinlicher Einwand samt Antwort — die Antwort stützt sich **auf eine gemessene Zahl aus diesem Befund**, nie auf eine Meinung. Neue Textsammlung `EINWAENDE` neben `VORLAGEN`, derselbe Prüfstandard (Umlaute, Abdeckung).

⚠ **Ein Befund, der nicht erhoben wurde, erzeugt keinen Einwand** — dieselbe Regel wie bei den Maßnahmen. Sonst behauptet der Leitfaden eine Schwäche, die niemand gemessen hat.

- [ ] **Schritt 1–6** wie gehabt.

---

### Aufgabe 6: Konvertierung zum Partner

**Dateien:** Abschnitt in `AuswertungClient.tsx`

Der Abschnitt zeigt:
- ob der Check überhaupt einen Lead hat (`sv_lead_id`)
- dessen `claim_status` — nur `'offen'` ist konvertierbar
- Name, E-Mail, Telefon zum Übernehmen
- Knopf „Im Partner-Portal beanspruchen" → öffnet `/gutachter-partner` in neuem Tab

⚠ **Keine Kopie von `beanspracheSvLead`.** Der Ablauf dort hat eine vierstufige Rollback-Kette, einen optimistischen Lock gegen Doppel-Claim, umgeht bewusst den Tier-2-Cron und lässt die Cold-Pin aktiv. Eine zweite Fassung davon wäre genau die zweite Wahrheit, vor der die Spec warnt.

⚠ Ist `claim_status` bereits `beansprucht_pending` oder liegt `konvertiert_zu_sv_id` vor, zeigt der Abschnitt **das** statt des Knopfes — sonst klickt Aaron im Gespräch auf etwas, das ins Leere läuft.

- [ ] **Schritt 1–6** wie gehabt.

---

### Aufgabe 7: Durchlauf

- [ ] **Schritt 1:** Bauen, Standalone starten (erst den Port räumen — ein laufender Server sperrt `.next`, und der Build bricht mit einer Dateisperre ab, die wie ein Codefehler aussieht)
- [ ] **Schritt 2:** Ohne Anmeldung `/auswertung` öffnen → muss zur Anmeldung führen, **nicht** zum Inhalt
- [ ] **Schritt 3:** Mit `test-admin@claimondo.de` anmelden → Liste erscheint
- [ ] **Schritt 4:** Auswertung eines echten Checks öffnen, alle drei Reiter lesen — **stimmt jede Zahl gegen die Datenbank?**
- [ ] **Schritt 5:** Ein Modul abwählen → verschwindet es aus allen drei Ansichten?
- [ ] **Schritt 6:** `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`

---

## Selbstprüfung des Plans

**Deckung:** Spec §5.3 (Auswertungslink, zwei Schranken, drei Ansichten, Anreicherungs-Historie, Konvertierungsknopf) und §5.4 (Konvertierung). **Nicht** enthalten: der Mailverlauf aus §5.3 — es gibt noch keinen (die Cold-Mail-Sequenz ist ungeschärft, `aktiv=false`); ein leerer Kasten wäre eine Behauptung von Vollständigkeit. Ebenfalls offen: `/plan/[token]`, der SV-sichtbare Präsentationslink — eigener Block, weil er eine zweite Tabelle und eine eigene Ansicht braucht.

**Platzhalter:** Aufgaben 3–6 führen die sechs Schritte knapp, weil das Muster seit P3 steht. Die Entscheidungen, Datenquellen und Fallunterscheidungen sind vollständig ausgeschrieben.

**Typen:** `pruefeStaff` liefert ein Ergebnis-Objekt wie alle Bibliotheksfunktionen; die Auswertung nutzt `Check`, `Befund` und `Massnahme` unverändert.

**Was dieser Plan bewusst NICHT tut:** die Cookie-Domain der Haupt-App ändern. Das wäre der elegantere Weg zum SSO — und es loggt jeden laufenden Nutzer aus. Eine solche Entscheidung trifft Aaron, nicht ein Nebenprojekt.
