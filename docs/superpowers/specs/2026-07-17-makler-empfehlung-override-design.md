# Makler-Empfehlungsstruktur mit 10-EUR-Override — Design-Spec

- **Datum:** 2026-07-17
- **Branch:** `kitta/makler-empfehlung-override`
- **Status:** Design abgestimmt (Brainstorming). Nächster Schritt: Implementierungs-Plan.
- **Kern in einem Satz:** Ein Makler kann über einen Nav-Eintrag weitere Makler einladen; jeder Makler verdient **10 EUR netto pro eingereichtem Gutachten seiner *direkt* geworbenen Makler** — zusätzlich zur vollen eigenen Provision des Geworbenen.

---

## 1 · Kontext & Ziel

Makler bringen über Promo-Codes Leads/Fälle herein und bekommen dafür eine Provision (per-Makler-Satz `komplett` bzw. `nur_gutachter`). Neu: ein **Empfehlungs-Netzwerk**. Ein Makler lädt andere Makler ein und baut so eine Struktur auf. Für jedes Gutachten, das ein direkt geworbener Makler vermittelt, erhält der Werber ein **Override von 10 EUR** — obendrauf, ohne dem Geworbenen etwas abzuziehen.

Business-Regeln (mit Aaron abgestimmt, 2026-07-17):

| Regel | Entscheidung |
|---|---|
| Vererbungs-Tiefe | **Single-Level** — nur der direkte Werber, kein Ketten-Override |
| Aktivierung Eingeladener | **Invite-Link, sofort aktiv** (Self-Service, kein Admin-Gate) |
| Provisions-Satz Eingeladener | **Erbt die Sätze des Werbers** (Default; Admin kann später anpassen) |
| Override-Betrag | **10 EUR netto**, Code-Konstante |
| Werber gesperrt (`provision_aktiv=false`) | **Kein Override** |

Beispiel-Kette `M1 ← M2 ← M3` (M1 wirbt M2, M2 wirbt M3):

```
M2 reicht Gutachten ein  → M2: 100 EUR (Basis)  +  M1: 10 EUR (Override)
M3 reicht Gutachten ein  → M3: 100 EUR (Basis)  +  M2: 10 EUR (Override)  |  M1: 0 EUR
```

Max. Override je Gutachten = **10 EUR** (gedeckelt, keine Kette).

---

## 2 · Bestandsaufnahme (prod-verifiziert 2026-07-17, Ref `paizkjajbuxxksdoycev`)

Wichtig für jeden, der hier weiterbaut — das Provisions-Modell wurde unifiziert:

- **`makler_provisionen` existiert nicht mehr** (in `partner_provisionen` unifiziert). Der alte Makler-Portal-Code (`src/lib/makler/queries.ts`, `src/app/api/cron/release-makler-provisionen`) liest noch die **gedroppte** Tabelle → Provisions-Unifikations-Drift (fremde Lane, hier NICHT gefixt).
- **`partner_provisionen`** = unifizierte Sink: `partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, ust_*, betrag_brutto, service_typ, trigger_event, trigger_at, hold_until, status, storniert_am, storno_grund, abrechnung_id, ausgezahlt_am, claim_nummer`.
  - Unique-Index `partner_provisionen_typ_claim_uniq (partner_typ, claim_id) WHERE claim_id IS NOT NULL`.
  - CHECK `partner_typ = ANY (ARRAY['makler','werkstatt','firmen_flotte'])`.
  - RLS an; SELECT-Policy `partner_provisionen__b1sel` deckt aktuell nur `partner_typ='makler'` (Makler) / `'werkstatt'` (Werkstatt) / Admin(+KB nur makler).
- **Basis-Makler-Provision entsteht per Trigger** `trg_makler_provision_on_bridge` (AFTER INSERT auf `faelle_claim_bridge`) → Funktion `create_makler_provision()`. Sie liest `makler_id/service_typ/lead_id/vermittler_typ` aus `claims`, grantet Consent, gate't auf `vermittler_typ='makler'` (oder NULL) + `provision_aktiv`, und schreibt **eine** `partner_provisionen`-Zeile (`hold_until = now()+7d`, `status='pending'`).
- **`makler`** hat **keine** Sponsor/Downline-Spalte (Greenfield). Provisions-relevante Felder: `provision_betrag_komplett_netto`, `provision_betrag_nur_gutachter_netto`, `provision_aktiv`, `status`, `user_id`.
- **Trigger `guard_makler_privilegien`** (BEFORE INSERT/UPDATE): nicht-privilegierte INSERTs werden auf `status='pending'`, Sätze=0, `provision_aktiv=false` gezwungen; UPDATEs auf `status`/Sätze/`provision_aktiv`/`user_id` RAISEn. Privileged = `current_user IN ('service_role','supabase_admin','postgres','authenticator') OR is_admin()`.
- **Bestehendes Volumen-Bonus-System** (`makler_staffel_stufen` + `award_makler_staffel_boni` → `partner_staffel_bonus`): eine **andere Achse** (Menge, pro Makler), unberührt.
- **Kein verdrahteter Release/Storno-Pfad** für `partner_provisionen` (kein pg_cron-Job, keine Funktion updated die Tabelle, kein App-Code referenziert sie). Basis- wie Override-Provisionen bleiben auf `pending`, bis die Unifikations-Lane das gemeinsam wired (siehe §9).
- Datenlage klein: 5 Makler, 2 Provisionen (werkstatt), 12 Staffel-Stufen, 11 Pools → geringes Migrationsrisiko.

Account-Anlage heute: `src/app/admin/team/actions.ts::createMakler` (Admin-only) legt Auth-User + `profiles(rolle='makler')` + `makler`-Row (`status='aktiv'`) via `createAdminClient()` (service_role) an. **Keinen** Promo-Code (der läuft separat). Genau dieses Muster wird für die Invite-Annahme wiederverwendet.

---

## 3 · Architektur-Überblick

```
+ Empfehlen (Nav)  ──►  /makler/empfehlungen
                          ├─ "+ Makler einladen" ──► Server-Action: makler_empfehlung_invites INSERT (+ optional Mail)
                          ├─ Offene Einladungen (Link kopieren / zurückziehen)
                          ├─ Downline-Liste (Firma, Status, #Gutachten, Override verdient)   ← RPC get_makler_empfehlung_uebersicht
                          └─ Upline (Werber, informativ)

/makler/beitreten/[token] (öffentlich)
   └─ Server-Action (service_role): Token validieren → Account anlegen
        (createMaklerAccount-Helper: Auth-User + profiles + makler-Row,
         status='aktiv', sponsor_makler_id=Werber, Sätze vom Werber geerbt)
        → Invite=angenommen → Auto-Login → /makler

Gutachten eingereicht (Claim bridged)
   └─ Trigger create_makler_provision()  (ERWEITERT)
        ├─ Basis:    partner_provisionen(makler,            downline, Satz, pending, +7d)
        └─ Override: partner_provisionen(makler_empfehlung, werber,   10,   pending, +7d)   ← wenn Werber provision_aktiv
```

Isolationseinheiten (jede eigenständig verständlich/testbar):

1. **Referenz-Kante** — `makler.sponsor_makler_id` (Datum, wer wen geworben hat). Single-Level ⇒ ein Zeiger genügt.
2. **Override-Erzeugung** — Erweiterung von `create_makler_provision()`. Einzige Schreibstelle für Makler-Provisionen; Override sitzt direkt daneben.
3. **Einladungs-Lifecycle** — `makler_empfehlung_invites` + zwei Server-Actions (erzeugen, annehmen).
4. **Account-Anlage** — geteilter `createMaklerAccount`-Helper (Admin- **und** Invite-Pfad).
5. **Struktur-Sicht** — RPC `get_makler_empfehlung_uebersicht` (Downline/Upline/Override-Stats, leak-frei).
6. **UI** — Nav-Item + `/makler/empfehlungen` + `/makler/beitreten/[token]`.

---

## 4 · Datenmodell / DDL (alle via `apply_migration` — Regel 2)

### 4.1 `makler.sponsor_makler_id` + Guard-Erweiterung

```sql
ALTER TABLE public.makler
  ADD COLUMN sponsor_makler_id uuid REFERENCES public.makler(id),
  ADD CONSTRAINT makler_sponsor_not_self
    CHECK (sponsor_makler_id IS NULL OR sponsor_makler_id <> id);

CREATE INDEX idx_makler_sponsor
  ON public.makler(sponsor_makler_id) WHERE sponsor_makler_id IS NOT NULL;
```

`guard_makler_privilegien()` wird erweitert, damit `sponsor_makler_id` ein **privilegiertes** Feld ist (nur service_role/Admin darf es setzen/ändern — sonst könnte ein Makler sich selbst einen Werber zuschustern und Overrides erschleichen):

- INSERT non-privileged: zusätzlich `NEW.sponsor_makler_id := NULL`.
- UPDATE non-privileged: die RAISE-Bedingung um `NEW.sponsor_makler_id IS DISTINCT FROM OLD.sponsor_makler_id` erweitern.

Cycles sind strukturell unmöglich: Eingeladene sind immer **brandneue** Leaf-Accounts; ihr Werber existiert bereits. Ein bestehender Makler durchläuft die Invite-Registrierung nie.

### 4.2 `partner_typ`-CHECK erweitern

```sql
ALTER TABLE public.partner_provisionen DROP CONSTRAINT partner_provisionen_partner_typ_check;
ALTER TABLE public.partner_provisionen ADD CONSTRAINT partner_provisionen_partner_typ_check
  CHECK (partner_typ = ANY (ARRAY['makler','werkstatt','firmen_flotte','makler_empfehlung']));
```

Zwingend: ohne den neuen erlaubten Wert schlägt der Override-INSERT fehl. Der eigene `partner_typ` ist auch der Grund, warum das Unique `(partner_typ, claim_id)` NICHT mit der Basis-`makler`-Zeile am selben Claim kollidiert.

### 4.3 `makler_empfehlung_invites` (neu)

```sql
CREATE TABLE public.makler_empfehlung_invites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_makler_id  uuid NOT NULL REFERENCES public.makler(id) ON DELETE CASCADE,
  email              text NOT NULL,
  token              text NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'offen'
                       CHECK (status IN ('offen','angenommen','abgelaufen','widerrufen')),
  expires_at         timestamptz NOT NULL,
  accepted_at        timestamptz,
  accepted_makler_id uuid REFERENCES public.makler(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.makler_empfehlung_invites FROM anon;   -- WURZEL fail-closed
ALTER TABLE public.makler_empfehlung_invites ENABLE ROW LEVEL SECURITY;
```

RLS (alle `TO authenticated` — RLS-Policy-Gate):

- **SELECT/INSERT/DELETE** nur für den eigenen Sponsor (`EXISTS (SELECT 1 FROM makler m WHERE m.id = sponsor_makler_id AND m.user_id = (SELECT auth.uid()))`) bzw. `public.is_admin()`.
- **Kein anon-Zugriff.** Die öffentliche `/beitreten`-Route validiert den Token server-seitig via `service_role` (Token = Capability, analog Magic-Link-Routen) — nicht über anon-RLS.
- `token`: kryptografisch (>= 32 Byte base64url), single-use, `expires_at` z. B. +14 Tage.

### 4.4 `create_makler_provision()` — Override-Block

`CREATE OR REPLACE` der Funktion: `v_sponsor uuid;` in DECLARE, und **nach** dem Basis-INSERT, **vor** `RETURN NEW`:

```sql
  -- === Empfehlungs-Override (Single-Level): 10 EUR an den direkten Werber ===
  SELECT sponsor_makler_id INTO v_sponsor FROM public.makler WHERE id = v_makler;
  IF v_sponsor IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.makler WHERE id = v_sponsor AND provision_aktiv) THEN
    INSERT INTO public.partner_provisionen
      (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id,
       betrag_netto_eur, service_typ, trigger_event, trigger_at, hold_until, status)
    VALUES
      ('makler_empfehlung', v_sponsor, NEW.claim_id, NEW.fall_id, v_lead, v_promo,
       10, v_service, 'empfehlung_override', now(), now() + interval '7 days', 'pending')
    ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  END IF;
```

Erbt automatisch **alle** bestehenden Gates: kein `makler_id` → kein Basis → das Block wird nicht erreicht (RETURN NEW davor); `vermittler_typ`-Gate; Downline muss `provision_aktiv` sein (sonst RETURN NEW vor dem Block). Idempotent via `(makler_empfehlung, claim_id)`-Unique. Betrag hart `10` (gespiegelt in TS-Konstante, §6).

- Attribution „welcher Downline erzeugte dieses Override" = `override.claim_id → claims.makler_id` (definer-seitig im RPC, §5.2). Keine zusätzliche Spalte nötig.
- Gate bewusst `provision_aktiv` (spiegelt Basis-Logik). Optional erweiterbar auf `status='aktiv'`.

### 4.5 `partner_provisionen__b1sel` erweitern

SELECT-Policy neu erstellen (`TO authenticated`), Makler- **und** KB-Branch von `partner_typ = 'makler'` auf `partner_typ IN ('makler','makler_empfehlung')` — sonst sind Override-Zeilen für den Werber unsichtbar (auch in Abrechnungen). Werkstatt- und Admin-Branch **unverändert** übernehmen. (Der tote anon-Zweig entfällt dabei; deckt sich mit der anon-grant-cap-Richtung — kurz mit jener Lane abgleichen.)

### 4.6 RPC `get_makler_empfehlung_uebersicht(p_makler_id uuid)`

`SECURITY DEFINER`, `RETURNS jsonb`, `search_path=public`. Guard: `IF NOT (EXISTS (SELECT 1 FROM makler WHERE id=p_makler_id AND user_id=auth.uid()) OR is_admin()) THEN RAISE insufficient_privilege`. Liefert leak-frei (nur Firma/Name/Status, **kein** Bank/IHK):

```json
{
  "upline":   { "makler_id": "...", "firma": "...", "ansprechpartner_vorname": "..." } | null,
  "downline": [ { "makler_id": "...", "firma": "...", "ansprechpartner_vorname": "...",
                  "status": "aktiv", "gutachten_count": 3,
                  "override_netto_summe": 30, "override_pending_netto": 30 } ],
  "totals":   { "downline_count": 2, "override_netto_gesamt": 50, "override_pending": 50, "override_freigegeben": 0 }
}
```

`gutachten_count` je Downline = Anzahl der **Basis**-Provisionen der Downline (`partner_provisionen` mit `partner_typ='makler'`, `partner_id=downline`) — die echten vermittelten Gutachten, unabhängig davon, ob ein Override entstand. `override_netto_summe`/`override_pending_netto` je Downline = die `makler_empfehlung`-Zeilen des Werbers, deren `claim_id` zu einem Claim mit `makler_id=downline` gehört. Beides definer-seitig — sidesteppt RLS-Rekursion auf `makler` (kein Self-Join-Policy) und den fehlenden Downline-/claims-Read.

---

## 5 · Einladungs- & Annahme-Flow

### 5.1 Einladen (durch aktiven Makler)
1. `/makler/empfehlungen` → „**+ Makler einladen**" (Drawer): E-Mail (+ optional Name).
2. Server-Action `createEmpfehlungInvite`: prüft, dass der Aufrufer ein aktiver Makler ist; INSERT `makler_empfehlung_invites` (token generiert, `expires_at=+14d`); Rückgabe `{ ok, link, error? }`. Optional Einladungs-Mail über bestehende `sendCommunication`-Infra (non-fatal, try/catch — Server-Action-Pattern).
3. UI zeigt den Link zum Kopieren + Status „offen". Aktionen: Link kopieren, Einladung zurückziehen (`status='widerrufen'`).

### 5.2 Annehmen (Eingeladener, öffentlich)
1. `/makler/beitreten/[token]` (kein Auth). Server validiert Token via `service_role`: existiert, `status='offen'`, `expires_at > now()`. Ungültig/abgelaufen → freundliche Fehlerseite, **kein** Account. Abgelaufen → nebenbei `status='abgelaufen'`.
2. Formular: E-Mail (aus Invite vorbelegt, read-only), Firma, Ansprechpartner Vor-/Nachname, Passwort (+ Wiederholung).
3. Server-Action `acceptEmpfehlungInvite` (via `service_role` — nötig wegen `guard_makler_privilegien`): Token re-validieren → **`createMaklerAccount`-Helper** aufrufen mit:
   - `status='aktiv'`, `provision_aktiv=true`,
   - `sponsor_makler_id = invite.sponsor_makler_id`,
   - Sätze aus der Sponsor-Row kopiert (`provision_betrag_komplett_netto`, `provision_betrag_nur_gutachter_netto`),
   - Passwort = vom Nutzer gewählt (nicht generiert), `force_password_change=false`.
   - Invite → `status='angenommen'`, `accepted_at=now()`, `accepted_makler_id`.
   - Bei Fehler: Auth-User + profiles wieder entfernen (kein halber Account — wie `createMakler`).
4. Auto-Login (Session setzen) → Redirect `/makler`. Bank/IHK füllt der Makler später in Einstellungen (Auszahlung ist ohnehin downstream).

### 5.3 Geteilter Helper `createMaklerAccount`
Kern von `createMakler` (Auth-User + profiles + makler-Row + Fehler-Rollback) wird in `src/lib/makler/create-account.ts` extrahiert:

```ts
createMaklerAccount(params: {
  email; firma; vorname; nachname; telefon?; ihkNummer?;
  password;                       // Admin: generiert; Invite: user-gewählt
  provisionKomplettNetto?; provisionGutachterNetto?;
  sponsorMaklerId?: string | null;
  aktiviertVon?: string | null;
  forcePasswordChange: boolean;
}): Promise<{ ok: true; userId } | { ok: false; error }>
```

- Admin-Pfad (`createMakler`) ruft es mit admin-gesetzten Sätzen + generiertem Passwort auf.
- Invite-Pfad ruft es mit vom Sponsor geerbten Sätzen + user-Passwort + `sponsorMaklerId` auf.
- Nutzt `createAdminClient()` (service_role) intern → `guard_makler_privilegien` lässt Sätze/Status/Sponsor zu.

---

## 6 · Konstante & Anzeige

`src/lib/finance/constants.ts`:

```ts
/** Empfehlungs-Override an den direkten Werber pro vermitteltem Gutachten (netto). */
MAKLER_EMPFEHLUNG_OVERRIDE_NETTO: 10,
```

DB-Trigger nutzt den Literal `10`; die TS-Konstante ist für Anzeige/Konsistenz. Kommentar an beiden Stellen, dass sie synchron zu halten sind (bewusst nicht konfigurierbar — YAGNI; ein späterer `app_config`-Wert wäre der Upgrade-Pfad).

---

## 7 · UI

### 7.1 Nav
`src/components/makler/MaklerShell.tsx` — neuer `PortalNavItem` **„Empfehlungen"** (Icon `Share2` oder `UsersRound`) nach „Promo & QR". Mobile-Items bleiben die ersten 4.

### 7.2 `/makler/empfehlungen`
Server-Component lädt via RPC. Bausteine aus `primitives/*` + `shared/*` (Component-Set-Policy), deutsche UI-Strings mit Umlauten:

- **Header** mit CTA „**+ Makler einladen**" (Drawer aus §5.1).
- **StatCards:** Downline-Anzahl · Override gesamt (netto) · davon offen/freigegeben.
- **Offene Einladungen:** Liste (E-Mail, Status, erstellt) + „Link kopieren" / „Zurückziehen".
- **Meine geworbenen Makler:** `DataTable` — Firma · Ansprechpartner · Status · vermittelte Gutachten · Override verdient.
- **Mein Werber** (falls `upline != null`): kleine Info-Card (Firma/Name).

### 7.3 `/makler/beitreten/[token]`
Eigenständige öffentliche Seite (nicht in der `(shell)`-Gruppe, kein Portal-Guard). Claimondo-Branding, Registrierungsformular (§5.2), klare Fehlerzustände (Token ungültig/abgelaufen/bereits benutzt).

---

## 8 · Sicherheit

- **Instant-Active-Fläche** gemindert: Token kryptografisch + an E-Mail gebunden + single-use + `expires_at`. Ein Override zahlt **nur** bei einem echten gebridgeten Claim (`vermittler_typ='makler'`) — nicht durch bloße Account-Anlage. Admin sieht die Struktur (`sponsor_makler_id`) und kann sperren.
- **`sponsor_makler_id` privilegiert** (Guard, §4.1) — kein Selbst-Setzen.
- **Kein Bank/IHK-Leak** an die Downline/Upline: die Struktur-Sicht kommt aus dem RPC mit expliziter Feld-Whitelist; die `makler`-SELECT-RLS bleibt „nur eigene Row".
- **Fail-closed Grants** auf der neuen Invite-Tabelle (`revoke all from anon`, WURZEL-Regel).
- Server-Actions liefern `{ ok, error? }` (kein throw); Non-Critical-Sends (Mail) in try/catch.

---

## 9 · Lifecycle & Abhängigkeiten (ehrlich)

- **Release/Storno von `partner_provisionen` ist aktuell nicht verdrahtet** (§2). Basis- **und** Override-Provisionen bleiben auf `pending`, bis die Provisions-Unifikations-Lane den gemeinsamen Pfad (Freigabe nach `hold_until`, Storno bei Claim-Storno) auf `partner_provisionen` umstellt. Dieses Feature baut **keinen** Parallel-Cron — das Override erbt den Pfad automatisch (gleiche Tabelle, gleiche Lifecycle-Spalten, Storno-by-`claim_id` erfasst beide `partner_typ`). → **Flag an Aaron / Unifikations-Lane**, separat.
- **Portal-Read-Drift** (`queries.ts`/alter Cron lesen die gedroppte `makler_provisionen`) ist fremde Lane — hier nur geflaggt, nicht gefixt. Dieses Feature liest ausschließlich `partner_provisionen`.

---

## 10 · Bewusst nicht dabei (YAGNI)

Multi-Level-/Ketten-Override · admin-konfigurierbarer Override-Betrag · Admin-Approval-Gate für Eingeladene · Re-Parenting/Entfernen aktiver Downline-Makler · Netzwerk-Staffelbonus · Reparatur der `partner_provisionen`-Release/Storno-Verdrahtung · Reparatur der `makler_provisionen`-Portal-Drift.

---

## 11 · Akzeptanzkriterien (testbar)

1. Aktiver Makler sieht Nav „Empfehlungen"; „+ Makler einladen" erzeugt eine Invite-Row + kopierbaren Link (optional Mail).
2. Öffnen des Invite-Links zeigt das Registrierungsformular mit vorbelegter E-Mail; nach Absenden ist der neue Makler **sofort `status='aktiv'`**, `sponsor_makler_id`=Werber, mit den **geerbten Sätzen** des Werbers, und landet eingeloggt in `/makler`.
3. Reicht der Eingeladene ein Gutachten ein (Claim gebridged, `vermittler_typ='makler'`), entstehen **zwei** `partner_provisionen`-Zeilen: Basis (`makler`, Downline, dessen Satz) **und** Override (`makler_empfehlung`, Werber, **10**, `pending`, `hold_until=+7d`).
4. `/makler/empfehlungen` (Werber) zeigt die Downline mit je #Gutachten + verdientem Override, die Override-Gesamtsumme und (falls vorhanden) den eigenen Werber.
5. Das Override erscheint auch in den normalen Abrechnungen/Earnings des Werbers (RLS-sichtbar).
6. `provision_aktiv=false` beim Werber ⇒ **kein** Override.
7. Ein Makler kann seinen eigenen `sponsor_makler_id` **nicht** selbst ändern (Guard RAISEt).
8. Invite-Token: single-use, an E-Mail gebunden, mit Ablauf; abgelaufen/bereits benutzt ⇒ Fehlerseite, kein Account.
9. **Kein Ketten-Override:** in `M1←M2←M3` bekommt M1 nichts von M3s Gutachten.

---

## 12 · Test-/Smoke-Plan (Regel 4 — echter Flow, staging/prod mit Test-Accounts)

1. **Seed:** Test-Makler **W** (aktiv, `provision_aktiv`, Sätze 100/50).
2. **Invite→Accept:** W lädt **X** ein → Link öffnen → registrieren. Verify: X `status='aktiv'`, `sponsor_makler_id=W`, Sätze 100/50, eingeloggt in `/makler`.
3. **Override:** Claim X-attribuiert (`makler_id=X`, `vermittler_typ='makler'`) → bridge. Verify `partner_provisionen`: `(makler, X, 100, pending)` **und** `(makler_empfehlung, W, 10, pending, +7d)`.
4. **Struktur-Sicht:** `/makler/empfehlungen` als W → X mit „1 Gutachten / 10 EUR". Als X → Upline=W, Downline leer.
5. **Negativ:** `W.provision_aktiv=false`, weiterer X-Claim → **kein** neues Override.
6. **Kette:** X lädt **Y** ein, Y-Claim → Override nur an X, **nichts** an W.
7. **Guard:** Versuch, `makler.sponsor_makler_id` als normaler Makler zu ändern → RAISE.

---

## 13 · Migrations-Reihenfolge (Regel 2: `apply_migration` → `list_migrations` → File nach recorded Version benennen → READ-Verify)

- **MIG-1** `makler_sponsor_makler_id`: Spalte + CHECK + Index + `guard_makler_privilegien`-Update.
- **MIG-2** `partner_provisionen_typ_add_makler_empfehlung`: CHECK erweitern.
- **MIG-3** `create_makler_provision_empfehlung_override`: Funktion `CREATE OR REPLACE`.
- **MIG-4** `partner_provisionen_sel_makler_empfehlung`: SELECT-Policy neu.
- **MIG-5** `makler_empfehlung_invites`: Tabelle + Grants + RLS.
- **MIG-6** `get_makler_empfehlung_uebersicht`: RPC.

Danach TS-Typen regenerieren (oder aufschieben bis Consumer die neuen Spalten nutzt). Jede Migration einzeln applyen, recorded Version ablesen, File exakt danach benennen (Twin-Drift vermeiden).

---

## 14 · Offene Verifikationen (Plan-Zeit)

- Exakter aktueller Body von `partner_provisionen__b1sel` 1:1 übernehmen (Werkstatt/Admin-Branch), nur Makler/KB-`partner_typ`-Set erweitern.
- Auto-Login-Mechanik in der Accept-Action (Session-Cookie via SSR-Client nach service_role-Anlage).
- Ob ein neuer Makler ohne Promo-Code Claims attribuiert bekommen kann (bestehende Vermittlungs-Mechanik, unverändert — nur prüfen, nicht ändern).
