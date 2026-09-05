# Kasko-Werkstattbindung Phase 2 (Anspruchsprüfung) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Reviews nur auf dem stärksten Modell (Aaron 04.09.).

**Goal:** Die drei Anspruchsprüfungen (Check-Quiz, Berater-API, Foto-Tool) versprechen keine Werkstatt mehr, die der Tarif verbietet; der Quiz-Lead kommt als Kasko-Lead in die Phase-1-Strecke; die Berater-API liefert die Bindung als Faktum (Parameter, Namens-Lookup, eigener Endpunkt).

**Architecture:** Entscheidung Aaron 05.09.2026 = Option **A + C** (Spec `docs/superpowers/specs/2026-09-05-kasko-wb-phase2-anspruchspruefung-design.md`, Abschnitt 5, D1–D7 alle wie empfohlen). Keine Tariffrage im Quiz oder Foto-Tool; die Frage bleibt im FlowLink (Phase 1). Neue reine Module: Berater-Resolver (`src/lib/berater-api/pruefe-anspruch.ts`), Namens-Normalisierung (`src/lib/kasko-wb/namen.ts`); ein Server-Lookup (`src/lib/kasko-wb/lookup.ts`); ein Endpunkt (`src/app/api/v1/kasko-werkstattbindung/route.ts`). Eine DB-Migration (Konversion). Texte in sechs Locales.

**Tech Stack:** Next.js 16 App Router (Route Handler), Supabase (Admin-Client, PostgREST), vitest, Playwright, next-intl (Marketing), plpgsql (Migration über das Supabase-Plugin, Regel 2).

## Global Constraints

* Regel 1: Branch `kitta/kasko-wb-phase2` von `origin/staging`, PR gegen `staging`. Regel 2: Migration nur über `apply_migration`, Version ablesen, Datei = Version, md5 gegenprüfen. Regel 4: Prod-Smoke nach Deploy (Abschnitt „Abnahme"). Regel 5: Abnahme-Datei nach `memory/abnahmen/_VORLAGE.md`, Matrix Eingänge × Rollen.
* Frontend-Texte mit echten Umlauten; Server-Actions/Route Handler liefern Result-Objekte bzw. `{ error }` mit Status; jeder Write auf kritische Tabellen prüft `error`.
* Kein `'use server'`-File exportiert etwas anderes als `async function` + Typen (`check:use-server-exports`).
* `check:knip`, `check:silent-writes`, `check:flag-drift`, `check:e2e-toplevel-fs`, `check:stumme-waechter`, `check:token-audit`, `check:component-set` bleiben grün.
* Berater-API-Texte: keine Werkstatt-Empfehlung für gebundene Tarife; bei unbekannter Bindung Rückfrage statt Raten (wie `vollkasko`).
* Sechs Locales (`de en tr ar ru pl`) zeilenparallel; der `check`-Namespace ist ein Client-Namespace (`client-namespaces.ts`).
* Namens-Lookup: bei Mehrdeutigkeit Kandidatenliste + `werkstattbindung: 'unbekannt'`, nie eine geratene Bindung.
* Wissensbasis-Stand `2026-07-20` überall aus den Tabellen (`stand`), nicht hart kodiert.

---

### Task 1: Konversion repariert — `selbst` wird `eigenverantwortung`

**Files:**
- Create: `supabase/migrations/<VERSION>_convert_anfrage_selbst_eigenverantwortung.sql` (VERSION aus `list_migrations`)

**Interfaces:**
- Consumes: `public.convert_anfrage_zu_lead(p_anfrage_id uuid)` (aktuelle Fassung Mig `20260830230040`).
- Produces: dieselbe Funktion; `leads.schuldfrage='eigenverantwortung'` für `payload.check.schuld='selbst'`, plus `leads.notiz`.

- [ ] **Step 1: Prod-Read vorher (Beleg)**

```sql
select l.id, l.schuldfrage, l.auswertung_unverbindlich->>'tier' as tier
from public.anfragen a join public.leads l on l.id = a.lead_id
where a.quelle = 'claimondo-check' and a.payload->'check'->>'schuld' = 'selbst';
```
Erwartet (Stand 05.09.): 1 Zeile, `schuldfrage` NULL, `tier` kasko.

- [ ] **Step 2: Migration über das Plugin applizieren** — `apply_migration({ name: "convert_anfrage_selbst_eigenverantwortung", query: <SQL> })`. Vollständige Funktion (identisch zu `20260830230040`, zwei Änderungen im `v_schuld`-CASE und im `v_notiz`-CASE):

```sql
-- Kasko-WB Phase 2 (Spec 2026-09-05, Entscheidung D1 A+C): das /check-Quiz sendet schuld='selbst'.
-- Die Whitelist kannte den Wert nicht -> leads.schuldfrage blieb NULL, der Lead lief als "Schuld offen"
-- an der Kasko-Strecke (Versicherungsfrage, Tariffrage, Gate) vorbei. Live belegt 05.09.: 1 von 1.
-- Jetzt: 'selbst' -> 'eigenverantwortung' (leads_schuldfrage_check) + Dispatcher-Notiz zur Herkunft.
CREATE OR REPLACE FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_anfrage      public.anfragen;
  v_lead_id      uuid;
  v_vorname      text;
  v_nachname     text;
  v_telefon      text;
  v_check        jsonb;
  v_schuld       text;
  v_zeitfenster  text;
  v_gutachten    text;
  v_notiz        text;
  v_ort          text;
  v_ist_plz      boolean;
  v_ist_unfallort boolean;
  v_tier         text;
  v_auswertung   jsonb;
BEGIN
  SELECT * INTO v_anfrage FROM public.anfragen WHERE id = p_anfrage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(substr(trim(coalesce(v_anfrage.kontakt_name, '')), length(v_vorname) + 2), '');
  v_telefon  := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- WHITELIST-Mapping (siehe 20260830204820): ein unbekannter Wert wuerde den INSERT
  -- werfen -> EXCEPTION -> RAISE -> gar kein Lead. Unbekanntes faellt auf NULL.
  v_check := COALESCE(v_anfrage.payload -> 'check', '{}'::jsonb);

  v_schuld := CASE v_check ->> 'schuld'
                WHEN 'gegner' THEN 'gegner'
                WHEN 'unklar' THEN 'unklar'
                WHEN 'teils'  THEN 'unklar'
                WHEN 'selbst' THEN 'eigenverantwortung'
                WHEN 'eigenverantwortung' THEN 'eigenverantwortung'
                ELSE NULL END;

  v_zeitfenster := CASE v_check ->> 'unfall_her'
                     WHEN 'unter_woche' THEN 'unter_woche'
                     WHEN 'bis_monat'   THEN 'bis_monat'
                     WHEN 'ueber_monat' THEN 'ueber_monat'
                     ELSE NULL END;

  v_gutachten := CASE v_check ->> 'gutachten'
                   WHEN 'nein'         THEN 'nein'
                   WHEN 'versicherung' THEN 'versicherung'
                   WHEN 'ja'           THEN 'ja'
                   ELSE NULL END;

  v_notiz := CASE v_check ->> 'schuld'
               WHEN 'teils'  THEN 'Anspruchsprüfung: Kunde gab „Teils ich, teils der Gegner" an. Als „unklar" erfasst — Teilschuld-Aufklärung erforderlich.'
               WHEN 'selbst' THEN 'Anspruchsprüfung: Kunde gab „Ich war (haupt)schuld" an (Tier Kasko). Als „eigenverantwortung" erfasst — Versicherungs- und Tariffrage folgen im FlowLink.'
               ELSE NULL END;

  -- Quelle B: tier spiegelt resolveTier() aus lib/check/result-model.ts.
  -- Aus der ROHANTWORT abgeleitet, nicht aus v_schuld -- sonst waere 'teils' (quote)
  -- nicht mehr von 'unklar' (pruefen) unterscheidbar.
  v_tier := CASE v_check ->> 'schuld'
              WHEN 'gegner' THEN 'voll'
              WHEN 'teils'  THEN 'quote'
              WHEN 'selbst' THEN 'kasko'
              WHEN 'eigenverantwortung' THEN 'kasko'
              WHEN 'unklar' THEN 'pruefen'
              ELSE NULL END;

  v_auswertung := CASE WHEN v_tier IS NULL THEN NULL ELSE jsonb_build_object(
    'quelle',      'anspruchspruefung',
    'tier',        v_tier,
    'erstellt_am', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'antworten',   v_check
  ) END;

  -- Ortsangabe (Befund 2): Format erkennen und richtig einsortieren.
  v_ort := NULLIF(trim(coalesce(v_anfrage.kontakt_plz_oder_stadt, '')), '');
  v_ist_plz := v_ort IS NOT NULL AND v_ort ~ '^[0-9]{5}$';
  v_ist_unfallort := v_anfrage.quelle IN ('claimondo-check', 'claimondo-home-hero');

  INSERT INTO public.leads (
    vorname, nachname, telefon, email,
    kunde_plz, kunde_stadt,
    unfallort, unfallort_plz, unfallort_ort,
    source_channel, status,
    schuldfrage, unfall_zeitfenster, gutachten_status, notiz,
    auswertung_unverbindlich
  )
  VALUES (
    NULLIF(v_vorname, ''), v_nachname, NULLIF(v_telefon, ''), v_anfrage.kontakt_email,
    CASE WHEN v_ist_plz THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_plz THEN NULL  ELSE v_ort END,
    CASE WHEN v_ist_unfallort THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_unfallort AND v_ist_plz THEN v_ort ELSE NULL END,
    CASE WHEN v_ist_unfallort AND NOT v_ist_plz THEN v_ort ELSE NULL END,
    v_anfrage.quelle, 'neu'::lead_status,
    v_schuld, v_zeitfenster, v_gutachten, v_notiz,
    v_auswertung
  )
  RETURNING id INTO v_lead_id;

  UPDATE public.anfragen
     SET lead_id = v_lead_id, konvertiert_am = now(), konvertier_status = 'success'
   WHERE id = p_anfrage_id;

  RETURN v_lead_id;

EXCEPTION WHEN OTHERS THEN
  UPDATE public.anfragen
     SET konvertier_status = 'failed', konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$function$;
```

- [ ] **Step 3: Version ablesen + Datei schreiben + md5** — `list_migrations` → `<VERSION>`; Datei `supabase/migrations/<VERSION>_convert_anfrage_selbst_eigenverantwortung.sql` mit exakt dem Statement; Gegenprobe:

```sql
select version, md5(array_to_string(statements, E'\n')) from supabase_migrations.schema_migrations where name = 'convert_anfrage_selbst_eigenverantwortung';
```
Lokal `md5sum` der Datei muss identisch sein (bei CRLF-Checkout `git show :supabase/migrations/<datei>` hashen).

- [ ] **Step 4: Funktions-Read nachher** — `select pg_get_functiondef('public.convert_anfrage_zu_lead(uuid)'::regprocedure)` enthält `WHEN 'selbst' THEN 'eigenverantwortung'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<VERSION>_convert_anfrage_selbst_eigenverantwortung.sql
git commit -m "fix(check): convert_anfrage_zu_lead — 'selbst' wird 'eigenverantwortung' (Kasko-Lead erreicht die Phase-1-Strecke)"
```
Regel-4-Nachweis dieses Tasks kommt mit Task 12 (Prod-Smoke `/check` → Lead → FlowLink zeigt die Versicherungsfrage).

---

### Task 2: Foto-Tool — Textwiderspruch beheben, Bindungs-Hinweis, toter Code weg

**Files:**
- Modify: `src/lib/anspruch/darstellung.ts:81-85` (`schuldBotschaft` für `selbst`) + neue Konstante
- Modify: `src/app/embed/anspruch-pruefen/_components/AnspruchSummaryStep.tsx` (Hinweis bei `selbst`)
- Modify: `src/lib/anspruch/session.ts:103-107` (`promoteSessionAufLead` löschen)
- Test: `src/lib/anspruch/darstellung.test.ts`

**Interfaces:**
- Produces: `export const KASKO_WERKSTATTBINDUNG_HINWEIS: string` (darstellung.ts).

- [ ] **Step 1: Failing test**

```ts
describe('schuldBotschaft — selbst', () => {
  it('trennt Vollkasko ja/nein sauber statt sich zu widersprechen', () => {
    const b = schuldBotschaft('selbst')
    expect(b.beleg).toContain('Mit Vollkasko')
    expect(b.beleg).toContain('ohne tragen Sie den Schaden selbst')
    expect(b.beleg).not.toMatch(/^Ohne Vollkasko/)
  })
  it('Bindungs-Hinweis nennt den Versicherungsschein und die Folge', () => {
    expect(KASKO_WERKSTATTBINDUNG_HINWEIS).toContain('Versicherungsschein')
    expect(KASKO_WERKSTATTBINDUNG_HINWEIS).toContain('benennt Ihre Versicherung die Werkstatt')
  })
})
```
Import ergänzen: `import { darstellePositionen, schuldBotschaft, KASKO_WERKSTATTBINDUNG_HINWEIS } from './darstellung'`.

- [ ] **Step 2: Run** `npx vitest run src/lib/anspruch/darstellung.test.ts` → FAIL (Konstante fehlt, Text alt).

- [ ] **Step 3: Implement** — in `darstellung.ts`:

```ts
/**
 * Kasko-WB Phase 2 (D6): Das Foto-Tool fragt bewusst NICHT nach Versicherer/Tarif (das tut der FlowLink,
 * Phase 1). Der Hinweis schliesst die Luecke, dass ein gebundener Tarif die Werkstatt vorschreibt.
 */
export const KASKO_WERKSTATTBINDUNG_HINWEIS =
  'Bitte prüfen Sie vor der Reparatur Ihren Versicherungsschein auf einen Werkstattbindungs-Zusatz (z. B. „Werkstattbindung“, „Werkstattbonus“, „SELECT“). Steht dort einer, benennt Ihre Versicherung die Werkstatt.'
```
und in `schuldBotschaft` den `selbst`-Zweig:

```ts
  return {
    titel: 'Regulierung über Ihre Kasko',
    beleg:
      'Mit Vollkasko reguliert Ihre Versicherung den Fahrzeugschaden abzüglich Selbstbeteiligung; ohne tragen Sie den Schaden selbst. Nutzungsausfall, Anwalt und Gutachter übernimmt die Kasko in der Regel nicht.',
    ton: 'warnung',
  }
```
In `AnspruchSummaryStep.tsx` nach der Ton-Box (`</div>` der `botschaft`) einfügen:

```tsx
      {spanne.schuld === 'selbst' && (
        <p className="text-body-sm text-claimondo-shield" data-testid="anspruch-kasko-wb-hinweis">
          {KASKO_WERKSTATTBINDUNG_HINWEIS}
        </p>
      )}
```
Import: `import { schuldBotschaft, KASKO_WERKSTATTBINDUNG_HINWEIS } from '@/lib/anspruch/darstellung'`.
`promoteSessionAufLead` in `session.ts` samt JSDoc löschen (0 Consumer, Scan 05.09.).

- [ ] **Step 4: Run** `npx vitest run src/lib/anspruch` → PASS; `npx tsc --noEmit` grün; `npm run check:knip -- --ratchet` grün.

- [ ] **Step 5: Commit** `fix(anspruch): Foto-Tool — Kasko-Botschaft ohne Widerspruch, Werkstattbindungs-Hinweis, promoteSessionAufLead entfernt`

---

### Task 3: Check-Quiz — ehrliche Kasko-Texte (6 Locales) + Foto-Check-CTA bei Kasko

**Files:**
- Modify: `claimondo-marketing/lib/check/result-model.ts` (+ `showFotoCta`, Insight-Key)
- Modify: `claimondo-marketing/app/[locale]/check/CheckFunnelClient.tsx:240`
- Modify: `claimondo-marketing/i18n/messages/{de,en,tr,ar,ru,pl}.json` (Keys `result_kasko_sub`, `ent_kasko_werkstatt_d`, neu `insight_kasko_werkstattbindung`)
- Test: `claimondo-marketing/lib/check/result-model.test.ts`

**Interfaces:**
- Produces: `CheckResult.showFotoCta: boolean`.

- [ ] **Step 1: Failing test** (in `result-model.test.ts`, Kasko-Fall erweitern):

```ts
  it('Eigenverschulden → kasko: Kasko-Positionen, KEINE €-Spannen, aber Foto-Check + Werkstattbindungs-Hinweis', () => {
    const r = buildCheckResult({ schuld: 'selbst' })
    expect(r.tier).toBe('kasko')
    expect(r.positions).toEqual(['kasko_gutachten', 'kasko_werkstatt', 'kasko_abwicklung'])
    expect(r.showRanges).toBe(false)
    expect(r.showFotoCta).toBe(true)
    expect(r.insightKeys).toContain('insight_kasko')
    expect(r.insightKeys).toContain('insight_kasko_werkstattbindung')
  })
  it('unklar → pruefen: kein Foto-CTA (keine Schuld-Vorbelegung moeglich)', () => {
    expect(buildCheckResult({ schuld: 'unklar' }).showFotoCta).toBe(false)
  })
```

- [ ] **Step 2: Run** `cd claimondo-marketing && npx vitest run lib/check/result-model.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `result-model.ts`:

```ts
export type CheckResult = {
  tier: Tier
  headingKey: string
  subKey: string
  positions: string[]
  insightKeys: string[]
  /** illustrative EUR-Spannen nur wo ein echter Gegner-Anspruch besteht */
  showRanges: boolean
  /** Foto-Check-CTA: ueberall, wo das Tool die Schuld vorbelegen kann (voll/quote/kasko) — Kasko-WB Phase 2, D4 */
  showFotoCta: boolean
}
// ... in buildCheckResult:
  if (tier === 'kasko') insightKeys.push('insight_kasko', 'insight_kasko_werkstattbindung')
  return {
    ...,
    showRanges: tier === 'voll' || tier === 'quote',
    showFotoCta: tier === 'voll' || tier === 'quote' || tier === 'kasko',
  }
```
(die bisherige Zeile `if (tier === 'kasko') insightKeys.push('insight_kasko')` ersetzen.)
`CheckFunnelClient.tsx:240`: `{result.showFotoCta ? <AnspruchFotoCheckCta schuld={answers.schuld} /> : null}`.

Texte (Key → Wert), **alle sechs Dateien, gleiche Zeilen**:

| Key | de |
|---|---|
| `result_kasko_sub` | Gegen einen Gegner besteht kein Anspruch. Über Ihre Kaskoversicherung regeln wir die Abwicklung mit Ihnen – welche Werkstatt reparieren darf, hängt von Ihrem Tarif ab. |
| `ent_kasko_werkstatt_d` | wir prüfen mit Ihnen, ob Ihr Tarif eine Werkstatt vorschreibt (Werkstattbindung) – wenn nicht, reparieren Sie, wo Sie wollen |
| `insight_kasko_werkstattbindung` | Tarife mit Werkstattbindung sind günstiger, dafür benennt die Versicherung die Werkstatt. Ob Ihr Tarif dazugehört, steht auf dem Versicherungsschein – wir schauen mit Ihnen nach. |

| Key | en |
|---|---|
| `result_kasko_sub` | There is no claim against another party. Through your comprehensive (Kasko) insurance we handle the processing with you – which workshop may repair depends on your tariff. |
| `ent_kasko_werkstatt_d` | we check with you whether your tariff prescribes a workshop (workshop binding) – if not, you repair wherever you like |
| `insight_kasko_werkstattbindung` | Tariffs with workshop binding are cheaper, but the insurer names the workshop. Whether yours is one of them is on your policy document – we check it with you. |

| Key | tr |
|---|---|
| `result_kasko_sub` | Karşı tarafa yönelik bir talep yok. Kasko sigortanız üzerinden süreci sizinle birlikte yürütürüz – hangi servisin onarım yapabileceği tarifenize bağlıdır. |
| `ent_kasko_werkstatt_d` | tarifenizin bir servis zorunluluğu (anlaşmalı servis) içerip içermediğini sizinle kontrol ederiz – yoksa istediğiniz yerde onarım yaptırırsınız |
| `insight_kasko_werkstattbindung` | Anlaşmalı servis şartı olan tarifeler daha ucuzdur, ancak servisi sigorta belirler. Tarifenizin böyle olup olmadığı poliçenizde yazar – sizinle birlikte bakarız. |

| Key | ar |
|---|---|
| `result_kasko_sub` | لا توجد مطالبة ضد طرف آخر. عبر تأمينك الشامل (كاسكو) نتولى الإجراءات معك – أي ورشة يُسمح لها بالإصلاح يعتمد على تعرفتك. |
| `ent_kasko_werkstatt_d` | نتحقق معك مما إذا كانت تعرفتك تفرض ورشة محددة (ارتباط بالورشة) – وإن لم تكن كذلك، تصلح حيث تريد |
| `insight_kasko_werkstattbindung` | التعرفات المرتبطة بورشة أرخص، لكن شركة التأمين هي التي تحدد الورشة. ما إذا كانت تعرفتك منها مذكور في وثيقة التأمين – نتحقق من ذلك معك. |

| Key | ru |
|---|---|
| `result_kasko_sub` | Требований к другой стороне нет. Через ваше каско мы ведём урегулирование вместе с вами – какая мастерская может ремонтировать, зависит от вашего тарифа. |
| `ent_kasko_werkstatt_d` | мы вместе проверяем, предписывает ли ваш тариф мастерскую (привязка к мастерской) – если нет, вы ремонтируете там, где хотите |
| `insight_kasko_werkstattbindung` | Тарифы с привязкой к мастерской дешевле, но мастерскую назначает страховщик. Относится ли к ним ваш тариф, указано в полисе – мы проверим это вместе с вами. |

| Key | pl |
|---|---|
| `result_kasko_sub` | Nie ma roszczenia wobec drugiej strony. Przez Twoje ubezpieczenie kasko prowadzimy sprawę razem z Tobą – który warsztat może naprawiać, zależy od Twojej taryfy. |
| `ent_kasko_werkstatt_d` | sprawdzamy z Tobą, czy Twoja taryfa narzuca warsztat (powiązanie z warsztatem) – jeśli nie, naprawiasz, gdzie chcesz |
| `insight_kasko_werkstattbindung` | Taryfy z powiązaniem z warsztatem są tańsze, ale warsztat wskazuje ubezpieczyciel. Czy Twoja taryfa do nich należy, jest zapisane w polisie – sprawdzimy to razem z Tobą. |

Neuen Key in jeder Datei direkt nach `insight_kasko` einfügen (Zeile 94/95), damit die Dateien zeilenparallel bleiben.

- [ ] **Step 4: Run** `cd claimondo-marketing && npx vitest run lib/check i18n` → PASS (`client-namespaces.test.ts` bleibt grün, Namespace unverändert). Parität der sechs Dateien: `node -e "for (const l of ['de','en','tr','ar','ru','pl']) { const m = require('./claimondo-marketing/i18n/messages/'+l+'.json').check; console.log(l, Object.keys(m).length, 'insight_kasko_werkstattbindung' in m) }"` → gleiche Anzahl, überall `true`.

- [ ] **Step 5: Commit** `feat(check): Kasko-Ergebnis ohne Partnerwerkstatt-Versprechen (6 Locales), Foto-Check-CTA auch bei Kasko`

---

### Task 4: Namens-Normalisierung (pure) + Wissensbasis-Lookup nach Namen

**Files:**
- Create: `src/lib/kasko-wb/namen.ts`
- Create: `src/lib/kasko-wb/lookup.ts`
- Test: `src/lib/kasko-wb/__tests__/namen.test.ts`

**Interfaces:**
- Produces: `normalisiereName(s: string): string`; `waehleTreffer<T extends { name: string }>(kandidaten: T[], gesucht: string): { status: 'eindeutig'; treffer: T } | { status: 'mehrdeutig'; kandidaten: T[] } | { status: 'kein_treffer' }`; `findeKaskoTarifNachName(admin, { versicherer, tarif? }): Promise<LookupErgebnis>` mit
  ```ts
  export type LookupErgebnis =
    | { status: 'gefunden'; marke: MarkeKurz; tarif: TarifKurz | null; tarifStatus: 'gefunden' | 'nicht_angegeben' | 'nicht_gefunden' | 'mehrdeutig'; tarifKandidaten: TarifKurz[] }
    | { status: 'mehrdeutig'; kandidaten: MarkeKurz[] }
    | { status: 'nicht_gefunden' }
  export type MarkeKurz = { id: string; slug: string; marke: string; wbStatus: 'optional' | 'standard' | 'keine'; wbMarker: string[]; stand: string }
  export type TarifKurz = { id: string; anzeigename: string; hatWerkstattbindung: boolean; bindungsumfang: 'keine' | 'voll' | 'nur_glas' | 'unklar'; verlaesslichkeit: 'belegt' | 'abgeleitet' | 'nicht_belegt' }
  ```

- [ ] **Step 1: Failing tests** (`namen.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { normalisiereName, waehleTreffer } from '../namen'

describe('normalisiereName', () => {
  it('klein, ohne Rechtsform, Bindestriche/Leerzeichen egal', () => {
    expect(normalisiereName('HUK-COBURG')).toBe('hukcoburg')
    expect(normalisiereName('Huk Coburg Versicherung AG')).toBe('hukcoburg')
    expect(normalisiereName('  Allianz Direct ')).toBe('allianzdirect')
    expect(normalisiereName('Classic SELECT')).toBe('classicselect')
  })
})

describe('waehleTreffer', () => {
  const k = [{ name: 'HUK-COBURG' }, { name: 'HUK24' }, { name: 'Allianz' }, { name: 'Allianz Direct' }]
  it('exakter Treffer gewinnt vor Teiltreffer', () => {
    expect(waehleTreffer(k, 'Allianz')).toEqual({ status: 'eindeutig', treffer: { name: 'Allianz' } })
  })
  it('ein Teiltreffer ist eindeutig', () => {
    expect(waehleTreffer(k, 'coburg')).toEqual({ status: 'eindeutig', treffer: { name: 'HUK-COBURG' } })
  })
  it('mehrere Teiltreffer sind mehrdeutig — nie raten', () => {
    const r = waehleTreffer(k, 'huk')
    expect(r.status).toBe('mehrdeutig')
    if (r.status === 'mehrdeutig') expect(r.kandidaten.map((x) => x.name)).toEqual(['HUK-COBURG', 'HUK24'])
  })
  it('kein Treffer', () => {
    expect(waehleTreffer(k, 'Gothaer')).toEqual({ status: 'kein_treffer' })
    expect(waehleTreffer(k, '')).toEqual({ status: 'kein_treffer' })
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/kasko-wb/__tests__/namen.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implement** `namen.ts`:

```ts
// Namens-Abgleich fuer die Wissensbasis (Berater-API: versicherer=/tarif= als Text). Pure, client-safe.
// Regel: exakter Treffer (normalisiert) gewinnt; sonst genau EIN Teiltreffer; mehrere -> mehrdeutig (nie raten).

const RECHTSFORMEN = /\b(versicherung(en)?|versicherungs-?ag|ag|se|gmbh|vvag|a\.g\.|kfz)\b/g

export function normalisiereName(s: string): string {
  return s
    .toLowerCase()
    .replace(RECHTSFORMEN, ' ')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '')
}

export type Treffer<T> =
  | { status: 'eindeutig'; treffer: T }
  | { status: 'mehrdeutig'; kandidaten: T[] }
  | { status: 'kein_treffer' }

export function waehleTreffer<T extends { name: string }>(kandidaten: T[], gesucht: string): Treffer<T> {
  const g = normalisiereName(gesucht)
  if (!g) return { status: 'kein_treffer' }
  const exakt = kandidaten.filter((k) => normalisiereName(k.name) === g)
  if (exakt.length === 1) return { status: 'eindeutig', treffer: exakt[0] }
  if (exakt.length > 1) return { status: 'mehrdeutig', kandidaten: exakt }
  const teil = kandidaten.filter((k) => {
    const n = normalisiereName(k.name)
    return n.includes(g) || g.includes(n)
  })
  if (teil.length === 1) return { status: 'eindeutig', treffer: teil[0] }
  if (teil.length > 1) return { status: 'mehrdeutig', kandidaten: teil }
  return { status: 'kein_treffer' }
}
```
Hinweis zum Test „HUK": `normalisiereName('HUK-COBURG')` = `hukcoburg`, `HUK24` = `huk24` → beide enthalten `huk` → mehrdeutig ✓. „Allianz": exakt `allianz` ✓ (Allianz Direct ist nur Teiltreffer, zählt nicht, weil ein exakter Treffer existiert).

`lookup.ts` (Server, normaler Import von `createAdminClient`, KEIN `'use server'`):

```ts
// Wissensbasis nach NAMEN abfragen (Berater-API + Endpunkt). Die Phase-1-Actions arbeiten mit UUIDs;
// ein LLM kennt nur „HUK-COBURG“ und „Classic SELECT“. Admin-Client wie kasko-wb/actions.ts (Referenzdaten).
import type { SupabaseClient } from '@supabase/supabase-js'
import { waehleTreffer } from './namen'

export type MarkeKurz = { id: string; slug: string; marke: string; wbStatus: 'optional' | 'standard' | 'keine'; wbMarker: string[]; stand: string }
export type TarifKurz = { id: string; anzeigename: string; hatWerkstattbindung: boolean; bindungsumfang: 'keine' | 'voll' | 'nur_glas' | 'unklar'; verlaesslichkeit: 'belegt' | 'abgeleitet' | 'nicht_belegt' }
export type LookupErgebnis =
  | { status: 'gefunden'; marke: MarkeKurz; tarif: TarifKurz | null; tarifStatus: 'gefunden' | 'nicht_angegeben' | 'nicht_gefunden' | 'mehrdeutig'; tarifKandidaten: TarifKurz[] }
  | { status: 'mehrdeutig'; kandidaten: MarkeKurz[] }
  | { status: 'nicht_gefunden' }

type MarkeRow = { id: string; slug: string; marke: string; wb_status: MarkeKurz['wbStatus']; wb_marker: string[] | null; stand: string }
type TarifRow = { id: string; anzeigename: string; hat_werkstattbindung: boolean; bindungsumfang: TarifKurz['bindungsumfang']; verlaesslichkeit: TarifKurz['verlaesslichkeit'] }

export async function findeKaskoTarifNachName(
  admin: SupabaseClient,
  eingabe: { versicherer: string; tarif?: string | null },
): Promise<{ ok: true; ergebnis: LookupErgebnis } | { ok: false; error: string }> {
  const { data: marken, error } = await admin
    .from('kasko_versicherer_marken')
    .select('id, slug, marke, wb_status, wb_marker, stand')
    .eq('aktiv', true)
  if (error) return { ok: false, error: error.message }
  const kandidaten = ((marken ?? []) as unknown as MarkeRow[]).map((m) => ({
    name: m.marke,
    slugName: m.slug,
    wert: { id: m.id, slug: m.slug, marke: m.marke, wbStatus: m.wb_status, wbMarker: m.wb_marker ?? [], stand: m.stand } satisfies MarkeKurz,
  }))
  // Marke ueber Anzeigename ODER slug treffen (Slug-Schreibweise ist die haeufigste LLM-Eingabe).
  const nachName = waehleTreffer(kandidaten, eingabe.versicherer)
  const nachSlug = waehleTreffer(kandidaten.map((k) => ({ ...k, name: k.slugName })), eingabe.versicherer)
  const treffer = nachName.status === 'eindeutig' ? nachName : nachSlug.status === 'eindeutig' ? nachSlug : nachName
  if (treffer.status === 'kein_treffer') return { ok: true, ergebnis: { status: 'nicht_gefunden' } }
  if (treffer.status === 'mehrdeutig') return { ok: true, ergebnis: { status: 'mehrdeutig', kandidaten: treffer.kandidaten.map((k) => k.wert) } }
  const marke = treffer.treffer.wert

  const { data: tarife, error: tErr } = await admin
    .from('kasko_tarife')
    .select('id, anzeigename, hat_werkstattbindung, bindungsumfang, verlaesslichkeit')
    .eq('marke_id', marke.id)
    .eq('aktiv', true)
    .order('reihenfolge', { ascending: true })
  if (tErr) return { ok: false, error: tErr.message }
  const tarifKurz = ((tarife ?? []) as unknown as TarifRow[]).map((t) => ({
    name: t.anzeigename,
    wert: { id: t.id, anzeigename: t.anzeigename, hatWerkstattbindung: t.hat_werkstattbindung, bindungsumfang: t.bindungsumfang, verlaesslichkeit: t.verlaesslichkeit } satisfies TarifKurz,
  }))
  if (!eingabe.tarif?.trim()) {
    return { ok: true, ergebnis: { status: 'gefunden', marke, tarif: null, tarifStatus: 'nicht_angegeben', tarifKandidaten: tarifKurz.map((t) => t.wert) } }
  }
  const tTreffer = waehleTreffer(tarifKurz, eingabe.tarif)
  if (tTreffer.status === 'eindeutig') return { ok: true, ergebnis: { status: 'gefunden', marke, tarif: tTreffer.treffer.wert, tarifStatus: 'gefunden', tarifKandidaten: [] } }
  if (tTreffer.status === 'mehrdeutig') return { ok: true, ergebnis: { status: 'gefunden', marke, tarif: null, tarifStatus: 'mehrdeutig', tarifKandidaten: tTreffer.kandidaten.map((t) => t.wert) } }
  return { ok: true, ergebnis: { status: 'gefunden', marke, tarif: null, tarifStatus: 'nicht_gefunden', tarifKandidaten: tarifKurz.map((t) => t.wert) } }
}
```

- [ ] **Step 4: Run** `npx vitest run src/lib/kasko-wb` → PASS; `npx tsc --noEmit` grün.

- [ ] **Step 5: Commit** `feat(kasko-wb): Namens-Normalisierung + Wissensbasis-Lookup nach Versicherer/Tarif (nie raten bei Mehrdeutigkeit)`

---

### Task 5: Berater-API kennt die Werkstattbindung (Resolver extrahiert, Parameter, Lookup)

**Files:**
- Create: `src/lib/berater-api/pruefe-anspruch.ts` (pure: Texte + `resolvePruefeAnspruch`)
- Modify: `src/app/api/v1/pruefe-anspruch/route.ts` (dünner Handler; Parameter `werkstattbindung`, `versicherer`, `tarif`)
- Test: `src/lib/berater-api/__tests__/pruefe-anspruch.test.ts`

**Interfaces:**
- Consumes: `LookupErgebnis` (Task 4), `leiteWerkstattbindungAb` (`src/lib/kasko-wb/werkstattbindung.ts`).
- Produces:
  ```ts
  export type Vollkasko = 'ja' | 'nein' | 'unbekannt'
  export type Werkstattbindung = 'ja' | 'nein' | 'unbekannt'
  export type KaskoTarifBefund = { versicherer: string; tarif: string | null; werkstattbindung: Werkstattbindung; bindungsumfang: string | null; verlaesslichkeit: string | null; kandidaten: string[]; stand: string | null }
  export function resolvePruefeAnspruch(input: { schuldfrage: string; schadenart?: string; vollkasko?: Vollkasko; werkstattbindung?: Werkstattbindung; kaskoTarif?: KaskoTarifBefund | null }): PruefeAnspruchAntwort
  export function parseVollkasko(raw: string | null): Vollkasko
  export function parseWerkstattbindung(raw: string | null): Werkstattbindung
  ```
  Die Antwort erhält zusätzlich `werkstattbindung: Werkstattbindung | null` (nur bei `abrechnungsweg='kasko'`, sonst `null`) und `kasko_tarif: KaskoTarifBefund | null`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePruefeAnspruch, parseWerkstattbindung } from '../pruefe-anspruch'

describe('resolvePruefeAnspruch — Werkstattbindung', () => {
  it('kasko + gebunden: keine Partnerwerkstatt, Versicherung benennt die Werkstatt', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'selbst', vollkasko: 'ja', werkstattbindung: 'ja' })
    expect(r.abrechnungsweg).toBe('kasko')
    expect(r.werkstattbindung).toBe('ja')
    expect(r.naechster_schritt).toContain('benennt die Werkstatt')
    expect(r.naechster_schritt).not.toContain('werkstatt-finden')
  })
  it('kasko + unbekannt: Rueckfrage nach dem Schein, kein Finder-Link als Empfehlung', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'selbst', vollkasko: 'ja', werkstattbindung: 'unbekannt' })
    expect(r.werkstattbindung).toBe('unbekannt')
    expect(r.naechster_schritt).toContain('Versicherungsschein')
    expect(r.naechster_schritt).toContain('werkstattbindung=ja|nein')
  })
  it('kasko + frei: bisheriger Werkstatt-Weg mit Finder-Link', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'selbst', vollkasko: 'ja', werkstattbindung: 'nein' })
    expect(r.naechster_schritt).toContain('werkstatt-finden')
  })
  it('Lookup-Befund uebersteuert den Parameter und wird ausgegeben', () => {
    const r = resolvePruefeAnspruch({
      schuldfrage: 'selbst', vollkasko: 'ja', werkstattbindung: 'unbekannt',
      kaskoTarif: { versicherer: 'HUK-COBURG', tarif: 'Classic SELECT', werkstattbindung: 'ja', bindungsumfang: 'voll', verlaesslichkeit: 'belegt', kandidaten: [], stand: '2026-07-20' },
    })
    expect(r.werkstattbindung).toBe('ja')
    expect(r.kasko_tarif?.tarif).toBe('Classic SELECT')
    expect(r.naechster_schritt).toContain('HUK-COBURG')
  })
  it('haftpflicht: werkstattbindung ist null, alles wie bisher', () => {
    const r = resolvePruefeAnspruch({ schuldfrage: 'unverschuldet', werkstattbindung: 'ja' })
    expect(r.abrechnungsweg).toBe('haftpflicht')
    expect(r.werkstattbindung).toBeNull()
    expect(r.kasko_tarif).toBeNull()
  })
  it('Parameter-Parsing wie bei vollkasko', () => {
    expect(parseWerkstattbindung('ja')).toBe('ja'); expect(parseWerkstattbindung('true')).toBe('ja')
    expect(parseWerkstattbindung('nein')).toBe('nein'); expect(parseWerkstattbindung(null)).toBe('unbekannt')
  })
})
```

- [ ] **Step 2: Run** → FAIL (Modul fehlt).

- [ ] **Step 3: Implement** — `src/lib/berater-api/pruefe-anspruch.ts`: alle Konstanten (`SACHSCHADEN_KATALOG`, `EIGENKOSTEN_0`, `NAECHSTER_SCHRITT`, `NAECHSTER_SCHRITT_SELBSTZAHLER`, `NAECHSTER_SCHRITT_SELBST_UNKLAR`, `RDG_HINWEIS`, `FINANZIERUNG`) unverändert aus der Route übernehmen; `NAECHSTER_SCHRITT_KASKO` wird zu drei Varianten + Lookup-Satz:

```ts
export type Vollkasko = 'ja' | 'nein' | 'unbekannt'
export type Werkstattbindung = 'ja' | 'nein' | 'unbekannt'
export type KaskoTarifBefund = {
  versicherer: string
  tarif: string | null
  werkstattbindung: Werkstattbindung
  bindungsumfang: string | null
  verlaesslichkeit: string | null
  /** bei mehrdeutigem Tarif: die moeglichen Tarifnamen — dem Nutzer zur Auswahl vorlegen */
  kandidaten: string[]
  stand: string | null
}

const WERKSTATT_FINDER = 'https://claimondo.de/werkstatt-finden?plz=[PLZ]'

/** Kasko + FREIE Werkstattwahl: der bisherige Werkstatt-Weg. */
const NAECHSTER_SCHRITT_KASKO_FREI =
  `Erster Schritt ist die Werkstatt, nicht der Gutachter: Ihre Vollkasko reguliert den Schaden abzüglich Ihrer Selbstbeteiligung, und Ihr Tarif lässt die Werkstatt frei wählen. Partner-Werkstätten finden: ${WERKSTATT_FINDER} — diesen Link direkt ausgeben, er funktioniert immer. Mit Tool-/API-Zugriff zusätzlich: GET /api/v1/werkstatt-in-naehe?plz=[PLZ]. Ein unabhängiges Gutachten ist hier optional; es lohnt sich, wenn die Versicherung die Schadenhöhe drücken will oder ein Totalschaden/Wertminderung im Raum steht.`
/** Kasko + WERKSTATTBINDUNG: die Versicherung benennt die Werkstatt — KEIN Finder-Link. */
const NAECHSTER_SCHRITT_KASKO_GEBUNDEN =
  'Ihr Kasko-Tarif enthält eine Werkstattbindung: Ihre Versicherung benennt die Werkstatt, in der repariert wird. Melden Sie den Schaden zuerst bei Ihrer Kaskoversicherung (Schaden-Hotline) und lassen Sie sich die Partnerwerkstatt nennen — eine frei gewählte Werkstatt kann die Versicherung mit Kürzungen oder einer höheren Selbstbeteiligung beantworten. Empfehlen Sie deshalb KEINEN Werkstatt-Finder. Ein unabhängiges Gutachten bleibt möglich, wenn die Schadenhöhe strittig ist.'
/** Kasko + Bindung UNBEKANNT: erst den Schein pruefen, dann entscheiden. */
const NAECHSTER_SCHRITT_KASKO_UNBEKANNT =
  'Prüfen Sie vor der Werkstattwahl den Versicherungsschein: Steht dort ein Zusatz wie „Werkstattbindung“, „Werkstattbonus“, „Werkstattservice“ oder „SELECT“, benennt die Versicherung die Werkstatt und Sie sollten keine eigene wählen. Fragen Sie danach und rufen Sie diese Auskunft mit `werkstattbindung=ja|nein` erneut ab — oder mit `versicherer=` und `tarif=`, dann schlagen wir die Bindung in unserer Tarifliste nach. Ohne solchen Zusatz gilt freie Werkstattwahl: ' + WERKSTATT_FINDER + '.'

function kaskoTarifSatz(k: KaskoTarifBefund | null | undefined): string {
  if (!k) return ''
  const tarif = k.tarif ? ` mit dem Tarif „${k.tarif}“` : ''
  const bindung = k.werkstattbindung === 'ja' ? 'enthält eine Werkstattbindung' : k.werkstattbindung === 'nein' ? 'lässt die Werkstatt frei wählen' : 'ist in unserer Tarifliste nicht eindeutig'
  const belege = k.verlaesslichkeit === 'belegt' ? '' : k.verlaesslichkeit ? ` (${k.verlaesslichkeit === 'abgeleitet' ? 'aus der Tarifbezeichnung abgeleitet' : 'nicht öffentlich belegt'} — bitte im Schein prüfen)` : ''
  const kand = k.kandidaten.length > 0 ? ` Mögliche Tarife: ${k.kandidaten.join(', ')}.` : ''
  return ` Tarifliste (Stand ${k.stand ?? 'CHECK24 20.07.2026'}): ${k.versicherer}${tarif} ${bindung}${belege}.${kand}`
}

export function parseVollkasko(raw: string | null): Vollkasko {
  const v = (raw ?? '').toLowerCase().trim()
  return v === 'ja' || v === 'true' ? 'ja' : v === 'nein' || v === 'false' ? 'nein' : 'unbekannt'
}
export function parseWerkstattbindung(raw: string | null): Werkstattbindung {
  return parseVollkasko(raw) // identische Werte
}

export function resolvePruefeAnspruch(input: {
  schuldfrage: string
  schadenart?: string
  vollkasko?: Vollkasko
  werkstattbindung?: Werkstattbindung
  kaskoTarif?: KaskoTarifBefund | null
}) {
  const { schuldfrage, schadenart } = input
  const vollkasko = input.vollkasko ?? 'unbekannt'
  // Lookup-Befund (Tarifliste) schlaegt den Parameter — er ist ein Faktum, der Parameter eine Angabe.
  const wb: Werkstattbindung = input.kaskoTarif?.werkstattbindung ?? input.werkstattbindung ?? 'unbekannt'
  const abrechnungsweg = /* unveraendert wie bisher */ …
  const istKasko = abrechnungsweg === 'kasko'
  const base = {
    schuldfrage,
    schadenart: schadenart ?? null,
    abrechnungsweg,
    werkstattbindung: istKasko ? wb : null,
    kasko_tarif: istKasko ? (input.kaskoTarif ?? null) : null,
    naechster_schritt: NAECHSTER_SCHRITT,
    finanzierung: FINANZIERUNG,
    hinweis: RDG_HINWEIS,
  }
  // ... unverschuldet / teilschuld unveraendert ...
  if (schuldfrage === 'selbst' || schuldfrage === 'eigenverschulden') {
    if (vollkasko === 'ja') {
      const schritt = wb === 'ja' ? NAECHSTER_SCHRITT_KASKO_GEBUNDEN : wb === 'nein' ? NAECHSTER_SCHRITT_KASKO_FREI : NAECHSTER_SCHRITT_KASKO_UNBEKANNT
      return {
        ...base,
        naechster_schritt: schritt + kaskoTarifSatz(input.kaskoTarif),
        anspruchslage: 'keine_gegen_gegner',
        eigenkosten: /* unveraendert */,
        ansprueche: [],
        empfehlung:
          wb === 'ja'
            ? 'Mit Vollkasko und Werkstattbindung führt der Weg über Ihre Versicherung: Schaden melden, Partnerwerkstatt nennen lassen, dort reparieren. Rechnen Sie vorher durch, ob sich die Meldung lohnt (Höherstufung vs. Reparatur aus eigener Tasche).'
            : /* bisheriger Kasko-Text */,
      }
    }
    // vollkasko nein / unbekannt: unveraendert
  }
  // ...
}
```
(Die Auslassungen `…`/„unverändert" sind beim Umsetzen 1:1 aus der heutigen `resolve()` zu übernehmen — der Task verschiebt Code, er erfindet ihn nicht neu.)

Route `pruefe-anspruch/route.ts` danach (nur Parsing, Lookup, Antwort):

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findeKaskoTarifNachName } from '@/lib/kasko-wb/lookup'
import { leiteWerkstattbindungAb } from '@/lib/kasko-wb/werkstattbindung'
import { parseVollkasko, parseWerkstattbindung, resolvePruefeAnspruch, type KaskoTarifBefund } from '@/lib/berater-api/pruefe-anspruch'
// CORS / rateLimited / json / OPTIONS unveraendert

export async function GET(req: Request) {
  const ip = …; if (rateLimited(ip)) return json({ error: 'Rate limit exceeded (60 requests/minute)' }, 429)
  const url = new URL(req.url)
  const schuldfrage = (url.searchParams.get('schuldfrage') || 'unklar').toLowerCase().trim()
  const schadenart = url.searchParams.get('schadenart')?.trim() || undefined
  const vollkasko = parseVollkasko(url.searchParams.get('vollkasko'))
  const werkstattbindung = parseWerkstattbindung(url.searchParams.get('werkstattbindung'))
  const versicherer = url.searchParams.get('versicherer')?.trim() || null
  const tarif = url.searchParams.get('tarif')?.trim() || null

  // Kasko-WB Phase 2: Versicherer/Tarif als Namen -> Tarifliste. Nur bei Selbstverschulden sinnvoll; ein
  // Lookup-Fehler faellt auf den Parameter zurueck (non-fatal, die Antwort bleibt nutzbar).
  let kaskoTarif: KaskoTarifBefund | null = null
  if (versicherer && (schuldfrage === 'selbst' || schuldfrage === 'eigenverschulden')) {
    const r = await findeKaskoTarifNachName(createAdminClient(), { versicherer, tarif })
    if (r.ok) kaskoTarif = zuBefund(r.ergebnis, versicherer, tarif)
    else console.error('[pruefe-anspruch] Tarif-Lookup fehlgeschlagen (non-fatal):', r.error)
  }
  return json(resolvePruefeAnspruch({ schuldfrage, schadenart, vollkasko, werkstattbindung, kaskoTarif }), 200)
}

function zuBefund(e: LookupErgebnis, versicherer: string, tarif: string | null): KaskoTarifBefund {
  if (e.status === 'nicht_gefunden') return { versicherer, tarif, werkstattbindung: 'unbekannt', bindungsumfang: null, verlaesslichkeit: null, kandidaten: [], stand: null }
  if (e.status === 'mehrdeutig') return { versicherer, tarif, werkstattbindung: 'unbekannt', bindungsumfang: null, verlaesslichkeit: null, kandidaten: e.kandidaten.map((k) => k.marke), stand: e.kandidaten[0]?.stand ?? null }
  const wb = leiteWerkstattbindungAb({
    wbStatus: e.marke.wbStatus,
    tarif: e.tarif ? { hatWerkstattbindung: e.tarif.hatWerkstattbindung, bindungsumfang: e.tarif.bindungsumfang } : null,
    markerAntwort: null,
    schadenIstGlas: false,
  })
  return {
    versicherer: e.marke.marke,
    tarif: e.tarif?.anzeigename ?? null,
    werkstattbindung: wb.freieWerkstattwahl === false ? 'ja' : wb.freieWerkstattwahl === true ? 'nein' : 'unbekannt',
    bindungsumfang: e.tarif?.bindungsumfang ?? null,
    verlaesslichkeit: e.tarif?.verlaesslichkeit ?? null,
    kandidaten: e.tarifStatus === 'mehrdeutig' || e.tarifStatus === 'nicht_gefunden' || e.tarifStatus === 'nicht_angegeben' ? e.tarifKandidaten.map((t) => t.anzeigename) : [],
    stand: e.marke.stand,
  }
}
```
`zuBefund` in `src/lib/berater-api/kasko-befund.ts` ablegen (pure, testbar mit einem Beispiel-`LookupErgebnis`), nicht in der Route.

- [ ] **Step 4: Run** `npx vitest run src/lib/berater-api` → PASS; `npx tsc --noEmit`; bestehender Smoke-Test-Vertrag bleibt (`eigenkosten`, `finanzierung` unverändert).

- [ ] **Step 5: Commit** `feat(api): pruefe-anspruch kennt die Werkstattbindung — Parameter, Tarifliste-Lookup, drei Kasko-Wege`

---

### Task 6: Endpunkt `GET /api/v1/kasko-werkstattbindung`

**Files:**
- Create: `src/app/api/v1/kasko-werkstattbindung/route.ts`
- Modify: `src/app/api/v1/openapi.json/route.ts` (Pfad + Schema + `pruefe-anspruch`-Parameter/Response)
- Test: Prod-Smoke in Task 11

**Interfaces:**
- Consumes: `findeKaskoTarifNachName`, `zuBefund`, `ladeKaskoBindungsInfo` (Konditionen/Hotline; Phase 1) — Aufruf mit `marke.id`/`tarif.id`.
- Produces (200):
  ```json
  { "versicherer": "HUK-COBURG", "tarif": "Classic SELECT", "werkstattbindung": "ja", "bindungsumfang": "voll", "verlaesslichkeit": "belegt",
    "sanktion": "...", "ausnahmen": "...", "partnernetz": "...", "hotline": "0800 …", "kandidaten": [],
    "naechster_schritt": "...", "hinweis": "Maßgeblich sind Versicherungsschein und AKB. Tarifliste CHECK24, Stand 2026-07-20.",
    "nutzungshinweis": "...", "_meta": { "quelle": "Claimondo Kasko-Tarifliste", "stand": "2026-07-20" } }
  ```
  400 ohne `versicherer`; 404 `{ error, hinweis }` wenn Versicherer unbekannt; bei Mehrdeutigkeit 200 mit `werkstattbindung: 'unbekannt'` + `kandidaten`.

- [ ] **Step 1: Implement** (Muster `werkstatt-in-naehe`: `runtime='nodejs'`, CORS, Rate-Limit 60/min, `OPTIONS`; Cache wie `sv-in-naehe`):

```ts
// Kasko-Werkstattbindung nachschlagen (Kasko-WB Phase 2, D5): „Mein Tarif heisst X — darf ich zu meiner
// Werkstatt?“ Antwort aus der Wissensbasis (CHECK24-Tarifliste, Phase 1). Anonym, read-only. Keine
// Kundendaten. Bei Mehrdeutigkeit: Kandidaten + 'unbekannt' — nie raten.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findeKaskoTarifNachName } from '@/lib/kasko-wb/lookup'
import { ladeKaskoBindungsInfo } from '@/lib/kasko-wb/actions'
import { zuBefund } from '@/lib/berater-api/kasko-befund'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }
const CACHE = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' }
// rateLimited() wie pruefe-anspruch
function json(body: unknown, status: number, extra: Record<string, string> = {}) { return NextResponse.json(body, { status, headers: { ...CORS, ...extra } }) }
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }) }

export async function GET(req: Request) {
  const ip = …; if (rateLimited(ip)) return json({ error: 'Rate limit exceeded (60 requests/minute)' }, 429)
  const url = new URL(req.url)
  const versicherer = url.searchParams.get('versicherer')?.trim() || ''
  const tarif = url.searchParams.get('tarif')?.trim() || null
  if (versicherer.length < 2) return json({ error: 'Parameter `versicherer` fehlt (Name der Kaskoversicherung, z. B. HUK-COBURG).' }, 400)
  const admin = createAdminClient()
  const r = await findeKaskoTarifNachName(admin, { versicherer, tarif })
  if (!r.ok) return json({ error: 'Tarifliste nicht erreichbar.' }, 500)
  if (r.ergebnis.status === 'nicht_gefunden') {
    return json({ error: `Versicherer „${versicherer}“ nicht in der Tarifliste.`, hinweis: 'Die Liste umfasst die CHECK24-Marken (Stand 20.07.2026) plus HDI. Bitte den Versicherungsschein prüfen: Zusätze wie „Werkstattbindung“, „Werkstattbonus“, „SELECT“ bedeuten, dass die Versicherung die Werkstatt benennt.' }, 404, CACHE)
  }
  const befund = zuBefund(r.ergebnis, versicherer, tarif)
  const info = r.ergebnis.status === 'gefunden' ? await ladeKaskoBindungsInfo(r.ergebnis.marke.id, r.ergebnis.tarif?.id ?? null, r.ergebnis.marke.marke) : null
  const k = info && info.ok ? info.info : null
  return json({
    versicherer: befund.versicherer,
    tarif: befund.tarif,
    werkstattbindung: befund.werkstattbindung,
    bindungsumfang: befund.bindungsumfang,
    verlaesslichkeit: befund.verlaesslichkeit,
    sanktion: befund.werkstattbindung === 'ja' ? k?.sanktionText ?? null : null,
    ausnahmen: befund.werkstattbindung === 'ja' ? k?.ausnahmenText ?? null : null,
    partnernetz: k?.partnernetz ?? null,
    hotline: k?.hotline ?? null,
    kandidaten: befund.kandidaten,
    naechster_schritt:
      befund.werkstattbindung === 'ja'
        ? 'Schaden bei der Kaskoversicherung melden und die Partnerwerkstatt nennen lassen; keine eigene Werkstatt wählen.'
        : befund.werkstattbindung === 'nein'
          ? 'Freie Werkstattwahl: Werkstatt selbst wählen, z. B. über https://claimondo.de/werkstatt-finden?plz=[PLZ].'
          : 'Tarif nicht eindeutig: den genauen Tarifnamen vom Versicherungsschein erfragen (Kandidaten oben) oder den Schein auf einen Werkstattbindungs-Zusatz prüfen.',
    hinweis: `Maßgeblich sind Versicherungsschein und AKB. Tarifliste CHECK24, Stand ${befund.stand ?? '2026-07-20'}.`,
    nutzungshinweis: 'Nennen Sie dem Nutzer Versicherer, Tarif und ob eine Werkstattbindung besteht; bei „unbekannt“ die Kandidaten zur Auswahl vorlegen oder auf den Versicherungsschein verweisen. Keine Werkstatt empfehlen, wenn werkstattbindung=ja.',
    _meta: { quelle: 'Claimondo Kasko-Tarifliste (CHECK24 + HDI)', stand: befund.stand ?? '2026-07-20', hinweis: 'Allgemeine Information, keine Rechtsberatung.' },
  }, 200, CACHE)
}
```
`ladeKaskoBindungsInfo` liegt in einer `'use server'`-Datei — der Import in einen Route Handler ist erlaubt (serverseitig), aber der Guard `check:use-server-exports` bleibt unberührt, weil nichts Neues exportiert wird.

- [ ] **Step 2: OpenAPI** — in `openapi.json/route.ts`: bei `/api/v1/pruefe-anspruch` drei Parameter ergänzen (`werkstattbindung` enum ja/nein, `versicherer` string, `tarif` string; Beschreibung: „NUR bei schuldfrage=selbst; mit versicherer/tarif schlägt die API die Bindung in der Tarifliste nach; ohne beides liefert sie bei Kasko die Aufforderung, den Schein zu prüfen"), in `PruefeAnspruchResponse` die Properties `werkstattbindung` (enum ja/nein/unbekannt, nullable) und `kasko_tarif` (`$ref: KaskoTarifBefund`), neuer Pfad `/api/v1/kasko-werkstattbindung` (get, `operationId: 'kaskoWerkstattbindung'`, Parameter `versicherer` required, `tarif` optional, Responses 200 `KaskoWerkstattbindungResponse`, 400/404/429 `ApiError`), Schemas `KaskoTarifBefund` und `KaskoWerkstattbindungResponse` mit den Feldern aus Step 1.

- [ ] **Step 3: Run** `npx tsc --noEmit`; `npm run build` (Route-Validator); `npx vitest run src/lib/geo-deeplink` (Parameter-Konsistenz-Test — falls er neue Parameter gegen llms.txt prüft, Task 7 zuerst ziehen und beide zusammen grün bekommen).

- [ ] **Step 4: Commit** `feat(api): GET /api/v1/kasko-werkstattbindung — Tarifliste fuer LLMs, OpenAPI nachgezogen`

---

### Task 7: GEO-Doku — `llms.txt`/`llms-full.txt` kennen die Werkstattbindung

**Files:**
- Modify: `claimondo-marketing/app/llms.txt/route.ts` (Zeilen 183, 226, 227, 490)
- Modify: `claimondo-marketing/app/llms-full.txt/route.ts` (Zeile 196 Umgebung: ein Absatz)
- Test: `src/lib/geo-deeplink/llms-parameter-konsistenz.test.ts` (bestehend; ggf. erweitern)

- [ ] **Step 1: Änderungen**
  - Zeile 183 (Vollkasko-Rückfrage) ergänzen: „**Dritte Frage, nur bei Vollkasko:** Enthält der Tarif eine **Werkstattbindung**? Dann benennt die Versicherung die Werkstatt — empfehlen Sie keinen Werkstatt-Finder. Mit \`GET /kasko-werkstattbindung?versicherer=…&tarif=…\` schlagen Sie das in unserer Tarifliste nach; ohne Tarifkenntnis prüft der Nutzer den Schein auf Zusätze wie „Werkstattbindung“, „Werkstattbonus“, „SELECT“."
  - Zeile 226 (`pruefe-anspruch`): Parameter `&werkstattbindung=[ja|nein]&versicherer=[Name]&tarif=[Name]` + Satz „Bei \`abrechnungsweg=kasko\` sagt \`werkstattbindung\`, ob die Versicherung die Werkstatt benennt."
  - Neue Zeile nach 226: „- \`GET /kasko-werkstattbindung?versicherer=[Name]&tarif=[Name, optional]\` — Werkstattbindung eines Kasko-Tarifs aus der Tarifliste (CHECK24, Stand 20.07.2026, 72 Marken, 408 Tarife). Antwort: \`werkstattbindung\` ja/nein/unbekannt, Sanktion, Hotline, Kandidaten bei Mehrdeutigkeit."
  - Zeile 227 (Nebenbefund): „**namentlich**" streichen → „Partner-Werkstätten im Umkreis — Anzahl, Entfernung und Art (freie Fachwerkstatt/Markenwerkstatt), ohne Namen und Kontaktdaten; die Zuordnung läuft über den Werkstatt-Finder-Link."
  - Zeile 490 (Nebenbefund): „6 Endpunkte" → „10 Endpunkte" (nach Task 6: 9 + 1) und die Aufzählung um „Kasko-Werkstattbindung" ergänzen.
  - `llms-full.txt` nach Zeile 196 einen Absatz: „**Werkstattbindung bei Kasko:** Viele günstige Kasko-Tarife („Werkstattbonus“, „SELECT“, „mit Werkstattbindung“) verpflichten zur Partnerwerkstatt des Versicherers; freie Werkstattwahl kostet dort eine höhere Selbstbeteiligung oder eine Kürzung. Claimondo prüft das mit dem Kunden anhand einer Tarifliste (72 Marken, 408 Tarife, Stand 20.07.2026) und vermittelt bei Bindung keine Werkstatt."
- [ ] **Step 2: Run** `npx vitest run src/lib/geo-deeplink` → PASS (Test ggf. um die neuen Parameter erweitern); Marketing-Build der zwei Routen: `cd claimondo-marketing && npx tsc --noEmit`.
- [ ] **Step 3: Commit** `docs(geo): llms.txt kennt die Werkstattbindung + neuen Endpunkt; zwei Nebenbefunde korrigiert`

---

### Task 8: `auswertung_unverbindlich` durchreichen + im Dispatch zeigen (D2)

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts:598` (nach `eigene_versicherung`)
- Create: `src/app/dispatch/leads/[id]/_v2/DispatchAnspruchspruefungHinweis.tsx`
- Modify: `src/app/dispatch/leads/[id]/DispatchLeadForm.tsx:217` (Mount nach `DispatchGatesPanel`)
- Test: `src/app/dispatch/leads/[id]/_v2/__tests__/anspruchspruefung-hinweis.test.ts` (pure Formatierung)

- [ ] **Step 1: Failing test** für die pure Formatierung:

```ts
import { describe, it, expect } from 'vitest'
import { formatiereAuswertung } from '../DispatchAnspruchspruefungHinweis'
describe('formatiereAuswertung', () => {
  it('Tier + Antworten in Dispatcher-Sprache', () => {
    expect(formatiereAuswertung({ quelle: 'anspruchspruefung', tier: 'kasko', erstellt_am: '2026-09-05T10:00:00Z', antworten: { schuld: 'selbst', unfall_her: 'unter_woche', gutachten: 'nein' } }))
      .toEqual({ tier: 'Kasko (Eigenverschulden)', zeilen: ['Schuld: Ich war (haupt)schuld', 'Unfall: vor weniger als einer Woche', 'Gutachten: noch keins'], datum: '05.09.2026' })
  })
  it('unbekannte Werte werden roh gezeigt, nichts wird erfunden', () => {
    const r = formatiereAuswertung({ tier: 'voll', antworten: { schuld: 'gegner', foo: 'bar' } })
    expect(r.zeilen).toContain('foo: bar')
  })
  it('null -> null', () => { expect(formatiereAuswertung(null)).toBeNull() })
})
```

- [ ] **Step 2: Implement**
  - Konverter: nach Zeile 598 einfügen
    ```ts
    // Kasko-WB Phase 2 (D2): die unverbindliche Selbst-Auswertung (/check) reist mit — der Spalten-Kommentar
    // auf claims versprach das seit dem 30.08., der Konverter tat es nie.
    ;(claimsInsert as Record<string, unknown>).auswertung_unverbindlich = lead.auswertung_unverbindlich ?? null
    ```
  - Komponente (`'use client'`, exportiert `formatiereAuswertung` + Default-Komponente):
    ```tsx
    const TIER: Record<string, string> = { voll: 'Vollanspruch (unverschuldet)', quote: 'Anteilig (Teilschuld)', pruefen: 'Schuld offen', kasko: 'Kasko (Eigenverschulden)' }
    const LABEL: Record<string, Record<string, string>> = {
      schuld: { gegner: 'Der Gegner', teils: 'Teils ich, teils der Gegner', unklar: 'Noch unklar', selbst: 'Ich war (haupt)schuld' },
      unfall_her: { unter_woche: 'vor weniger als einer Woche', bis_monat: 'vor bis zu einem Monat', ueber_monat: 'vor mehr als einem Monat' },
      gutachten: { nein: 'noch keins', versicherung: 'von der Versicherung', ja: 'eigenes vorhanden' },
    }
    const FELD: Record<string, string> = { schuld: 'Schuld', unfall_her: 'Unfall', gutachten: 'Gutachten' }
    export function formatiereAuswertung(a: unknown): { tier: string; zeilen: string[]; datum: string | null } | null { … }
    export default function DispatchAnspruchspruefungHinweis({ auswertung }: { auswertung: unknown }) {
      const f = formatiereAuswertung(auswertung)
      if (!f) return null
      return (
        <Card p={4} radius="lg" className="mb-4">
          <p className="text-caption uppercase tracking-wide text-claimondo-navy/60">Anspruchsprüfung des Kunden (unverbindlich{f.datum ? `, ${f.datum}` : ''})</p>
          <p className="mt-1 text-body-sm font-semibold text-claimondo-navy">{f.tier}</p>
          <ul className="mt-1 text-body-sm text-claimondo-navy/80">{f.zeilen.map((z) => <li key={z}>{z}</li>)}</ul>
        </Card>
      )
    }
    ```
    (`Card` aus `@/components/primitives`; Datum mit `timeZone: 'Europe/Berlin'` formatieren — Client-Timezone-Gate.)
  - `DispatchLeadForm.tsx`: unter `<DispatchGatesPanel values={values} lead={lead} />` → `<DispatchAnspruchspruefungHinweis auswertung={lead.auswertung_unverbindlich} />`.
- [ ] **Step 3: Run** vitest (Test) + tsc + `check:client-timezone`, `check:component-set` → grün.
- [ ] **Step 4: Commit** `feat(dispatch): Anspruchspruefung des Kunden sichtbar, auswertung_unverbindlich reist zum Claim`

---

### Task 9: Kunde-Portal — „Versicherungsschein wird geprüft" als dauerhafte Card

**Files:**
- Modify: `src/lib/claims/kunde-claim-view.ts:710-712` (Flag `kaskoBindungUngeklaert`) + Typ `flags` (Zeile ~210)
- Create: `src/components/kunde/KaskoPruefungCard.tsx`
- Modify: `src/components/kunde/claim-view/GeldZone.tsx:54-56`
- Test: `src/lib/claims/__tests__/kunde-claim-view*.test.ts` (Flag-Fall ergänzen, falls vorhanden; sonst neuer Test der Flag-Ableitung)

- [ ] **Step 1:** Flag: `kaskoBindungUngeklaert: abrechnungsweg === 'kasko' && (claimExtra?.freie_werkstattwahl ?? null) === null && claimExtra?.werkstattbindung_quelle === 'unbekannt' && reparaturWerkstattId == null`.
- [ ] **Step 2:** Card (Server-tauglich, kein State): „Dein Versicherungsschein wird geprüft" / „Du konntest die Werkstattbindung deines Kasko-Tarifs nicht angeben. Unser Team klärt das mit dir, bevor eine Werkstatt beauftragt wird – bitte halte den Versicherungsschein bereit." Mount in `GeldZone` direkt nach `KaskoBindungCard`: `{flags.kaskoBindungUngeklaert && <KaskoPruefungCard />}`. Der Finder bleibt sichtbar (E3: durchlassen).
- [ ] **Step 3:** vitest/tsc/`check:component-set` grün. Commit `feat(kunde): Kasko-Bindung ungeklaert — dauerhafte Pruef-Card statt nur Toast`

---

### Task 10: Journey J5 Delta + Spec-Status

**Files:**
- Modify: `docs/fundament/journeys/j05-kasko-selbstzahler-abrechnungswege.md` (Abschnitt „Varianten / Abzweige": Eingang Check-Quiz und Berater-API)
- Modify: Spec-Status (Abschnitt 1 der Spec: „umgesetzt in PR #…")

- [ ] Delta-Text: „**Eingang Anspruchsprüfung (Phase 2, 05.09.2026):** Ein `/check`-Lead mit „Ich war (haupt)schuld" kommt als `eigenverantwortung` an; der FlowLink stellt die Versicherungsfrage, dann die Tariffrage (Phase 1). Das Quiz verspricht keine Werkstatt mehr. Die Berater-API antwortet bei Kasko mit `werkstattbindung` ja/nein/unbekannt und empfiehlt bei Bindung keinen Werkstatt-Finder; `GET /api/v1/kasko-werkstattbindung` liefert die Tarifliste. Im Portal bleibt eine Prüf-Card sichtbar, solange die Bindung ungeklärt ist."
- [ ] Commit `docs(journeys): J5 Delta Anspruchspruefung (Phase 2)`

---

### Task 11: Smokes (Playwright) — API-Kasko-Zweig + Quiz→FlowLink

**Files:**
- Modify: `tests/e2e/flows/kostenfrage-geo-assets-smoke.spec.ts` (drei API-Fälle)
- Create: `tests/e2e/flows/check-quiz-kasko-lead-smoke.spec.ts` (Quiz per UI → Lead → FlowLink zeigt Versicherungsfrage; Cleanup afterEach über `loescheLeadMitAnhang`; `anfragen` ist Audit-Tabelle „niemals DELETE" → nur `lead_id`-SET NULL beim Lead-Delete akzeptieren)

- [ ] API-Fälle:
```ts
test('pruefe-anspruch: Kasko + Werkstattbindung empfiehlt keinen Werkstatt-Finder', async ({ request }) => {
  const res = await request.get(`${APP}/api/v1/pruefe-anspruch?schuldfrage=selbst&vollkasko=ja&werkstattbindung=ja`)
  expect(res.status()).toBe(200)
  const j = await res.json() as { werkstattbindung?: string; naechster_schritt?: string }
  expect(j.werkstattbindung).toBe('ja')
  expect(j.naechster_schritt ?? '').not.toContain('werkstatt-finden')
})
test('pruefe-anspruch: Tarifliste-Lookup HUK-COBURG / Classic SELECT = gebunden', async ({ request }) => {
  const res = await request.get(`${APP}/api/v1/pruefe-anspruch?schuldfrage=selbst&vollkasko=ja&versicherer=HUK-COBURG&tarif=Classic%20SELECT`)
  const j = await res.json() as { werkstattbindung?: string; kasko_tarif?: { tarif?: string } }
  expect(j.kasko_tarif?.tarif).toBe('Classic SELECT'); expect(j.werkstattbindung).toBe('ja')
})
test('kasko-werkstattbindung: mehrdeutig -> Kandidaten, nie geraten', async ({ request }) => {
  const res = await request.get(`${APP}/api/v1/kasko-werkstattbindung?versicherer=HUK`)
  const j = await res.json() as { werkstattbindung?: string; kandidaten?: string[] }
  expect(j.werkstattbindung).toBe('unbekannt'); expect((j.kandidaten ?? []).length).toBeGreaterThan(1)
})
```
- [ ] Quiz-Spec: `/check` per UI (Frage 1 „Ich war (haupt)schuld", Frage 2, Frage 3, Formular mit Test-Namen + Telefon `+491633628571` + Stadt; E-Mail-Feld existiert im Formular nicht → Lead ohne Email; Ergebnisseite: Text enthält „Werkstattbindung", kein „Partnerwerkstatt"), dann DB: Lead mit `schuldfrage='eigenverantwortung'` und Notiz; FlowLink des Leads (aus `flow_links`) öffnen → nach Consent erscheint „Ja, ich habe eine Kaskoversicherung". Gate: `PLAYWRIGHT_BASE_URL` für die App, Marketing-URL `https://claimondo.de` (prod) — bewusst nur gegen prod fahrbar (Marketing hat kein staging), daher `test.skip(!process.env.RUN_CHECK_QUIZ_SMOKE)`; **RUN_CHECK_QUIZ_SMOKE in ci.yml e2e-Job setzen**, sonst schlägt `check:stumme-waechter` an.
- [ ] Commit `test(e2e): Berater-API Kasko-Zweig + Check-Quiz -> Kasko-Lead -> FlowLink`

---

### Task 12: Verifikation, PR, Regel 4, Abnahme (Regel 5)

- [ ] `npm run build` (Turbopack, Log auf `error` greppen), `npx tsc --noEmit`, `npx vitest run`, alle Ratchets (`check:knip`, `check:silent-writes`, `check:flag-drift`, `check:use-server-exports`, `check:e2e-toplevel-fs`, `check:stumme-waechter`, `check:client-timezone`, `check:component-set`, `check:token-audit`, `check:i18n*`).
- [ ] GEO-Baseline vor dem Merge sichern: `node --env-file=.env.local scripts/geo-baseline.mjs` (Vergleich nach Deploy).
- [ ] PR gegen `staging` mit `--body-file`: operatives Soll (Spec Abschnitt 2), Smoke-Plan (Task 11 + Matrix), Journey-Bezug J5, Regel-4-Übergabe.
- [ ] Nach Deploy (staging, dann prod nach Drain): Task-11-Specs gegen prod; Prod-Read aus Task 1 Step 1 wiederholen (neuer `selbst`-Lead trägt `eigenverantwortung`); Ergebnis + Screenshots in `memory/abnahmen/2026-09-05-kasko-wb-phase2-anspruchspruefung.md` (Vorlage), INDEX-Zeile, HTML-Bericht für Aaron (Regel 5: Matrix Eingänge × Rollen — Quiz anonym → Lead → Dispatch → FlowLink → Dispatcher; API als LLM; Foto-Tool → Summary → Finder-Handoff; Portal unbekannt-Card).
- [ ] Abnahme durch eine zweite Session; Aaron entscheidet.

---

## Self-Review

* **Spec-Abdeckung:** D1 (Tasks 1, 2, 3, 5), D2 (8), D3 (3), D4 (3), D5 (4, 5, 6), D6 (2), D7 (7), Zusatz Portal-Card (9), Journey (10), Nachweis (11, 12). Option B bewusst nicht enthalten.
* **Platzhalter:** Task 5 enthält gekennzeichnete Übernahmestellen („unverändert") aus der heutigen `resolve()` — das ist ein Verschiebe-Refactor, der bestehende Code steht in `route.ts` und wird 1:1 übernommen; keine erfundene Logik.
* **Typkonsistenz:** `LookupErgebnis`/`MarkeKurz`/`TarifKurz` (Task 4) werden in Task 5 (`zuBefund`) und Task 6 gleich verwendet; `KaskoTarifBefund` in 5 und 6; `Werkstattbindung`-Werte `ja|nein|unbekannt` überall gleich, Parsing identisch zu `vollkasko`.
