# Makler-Empfehlungsstruktur mit 10-EUR-Override — Design-Spec

- **Datum:** 2026-07-17
- **Branch:** `kitta/makler-empfehlung-override`
- **Status:** Design abgestimmt (Brainstorming, inkl. Mechanik-Entscheid + Rechtsform-Erweiterung). Nächster Schritt: Implementierungs-Plan.
- **Kern in einem Satz:** Ein Makler teilt einen persönlichen Empfehlungs-Link; wer sich darüber registriert, wird seine Downline, und er verdient **10 EUR netto pro eingereichtem Gutachten seiner *direkt* geworbenen Makler** — zusätzlich zur vollen eigenen Provision des Geworbenen.

---

## 1 · Kontext & Ziel

Makler bringen über Promo-Codes Leads/Fälle herein und bekommen dafür eine Provision (per-Makler-Satz `komplett` bzw. `nur_gutachter`). Neu: ein **Empfehlungs-Netzwerk**. Ein Makler teilt seinen Empfehlungs-Link (kopieren · E-Mail · WhatsApp); wer sich darüber registriert, wird Teil seiner Struktur. Für jedes Gutachten, das ein direkt geworbener Makler vermittelt, erhält der Werber ein **Override von 10 EUR** — obendrauf, ohne dem Geworbenen etwas abzuziehen.

Zusätzlich (Aaron 2026-07-17): **Rechtsform wird für ALLE Makler beim Onboarding Pflicht** (zwecks Abrechnung) — im Self-Signup (bereits vorhanden) **und** im Admin-Anlage-Pfad (fehlt noch).

Business-Regeln (abgestimmt):

| Regel | Entscheidung |
|---|---|
| Vererbungs-Tiefe | **Single-Level** — nur der direkte Werber, kein Ketten-Override |
| Invite-Mechanik | **Persönlicher Empfehlungs-Link** (kopieren / E-Mail / WhatsApp) — kein Token-Lifecycle, keine Invite-Tabelle |
| Aktivierung Eingeladener | **Sofort aktiv** (reitet den bestehenden offenen Self-Signup, kein Admin-Gate) |
| Provisions-Satz Eingeladener | **Erbt die Sätze des Werbers** (statt Default 100/50; Admin kann später anpassen) |
| Override-Betrag | **10 EUR netto**, Code-Konstante |
| Werber gesperrt (`provision_aktiv=false`) | **Kein Override** |
| Rechtsform | **Pflicht** in Self-Signup (vorhanden) **und** Admin-Anlage (neu) |

Beispiel-Kette `M1 ← M2 ← M3`:

```
M2 reicht Gutachten ein  → M2: 100 EUR (Basis)  +  M1: 10 EUR (Override)
M3 reicht Gutachten ein  → M3: 100 EUR (Basis)  +  M2: 10 EUR (Override)  |  M1: 0 EUR
```

Max. Override je Gutachten = **10 EUR** (gedeckelt, keine Kette).

---

## 2 · Bestandsaufnahme (prod- + code-verifiziert 2026-07-17, Ref `paizkjajbuxxksdoycev`, Base `main`@R69)

Vieles existiert bereits — dieses Feature setzt darauf auf statt neu zu bauen:

**Anlage-Infrastruktur (schon da):**
- **`/makler/registrieren`** — offener Makler-Self-Signup (Säule B, Aaron 30.06.): **sofort aktiv, kein Admin-Gate**, Rate-Limit + Email-Dedupe. Action `registriereMaklerSelf` (`src/app/makler/registrieren/actions.ts`). Erhebt `firma, ansprechpartner_*, email, telefon, adresse_plz/ort, versicherung_id, maklerpool_id, rechtsform (Pflicht!), kleinunternehmer, einwilligung`. Ruft `anlegeMaklerKern` mit Default-Sätzen 100/50 auf.
- **`anlegeMaklerKern`** (`src/lib/makler/anlege-makler.ts`) — geteilter Anlage-Kern (Auth-User + `profiles[rolle=makler]` + `makler[status=aktiv, provision_aktiv=true]` + Default-Promo-Code + Standard-Staffel + Phone-Login, Rollback-Cascade). Nimmt bereits `rechtsform`/`istKleinunternehmer`. **KEIN `sponsor_makler_id` — hier setzt das Feature an.**
- **`anlegePartnerKern`** (`src/lib/partner/anlege-partner.ts`) — generalisierter Partner-Anlage-Kern (makler/werkstatt/…), von der **Admin**-Anlage genutzt (`src/app/admin/makler/actions.ts::createMakler`, via `rollenDetails`). **Erhebt aktuell KEIN `rechtsform`/`kleinunternehmer`** → die Aaron-Lücke.
- **`RECHTSFORM_OPTIONEN` + `istErlaubteRechtsform`** (`src/lib/rechtsformen.ts`) — kanonische Dropdown-Liste (9 Rechtsformen + Platzhalter) + Server-Whitelist. Consumer: SV-Profil, makler/registrieren.
- Billing-USt (`src/lib/finance/partner-billing-ust.ts`) rechnet über `ist_kleinunternehmer` (§19: 0 % sonst 19 %); `rechtsform` ist die rechtliche Identität für die Gutschrift/Abrechnung.

**Provisions-Modell (unifiziert — wichtig):**
- **`makler_provisionen` existiert nicht mehr** (→ `partner_provisionen`). Alter Portal-Code (`src/lib/makler/queries.ts`, Release-Cron) liest noch die **gedroppte** Tabelle = Provisions-Unifikations-Drift (fremde Lane, hier NICHT gefixt).
- **`partner_provisionen`** = unifizierte Sink: `partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, ust_*, betrag_brutto, service_typ, trigger_event, trigger_at, hold_until, status, storniert_am, storno_grund, abrechnung_id, ausgezahlt_am, claim_nummer`. Unique `(partner_typ, claim_id) WHERE claim_id IS NOT NULL`. CHECK `partner_typ = ANY (ARRAY['makler','werkstatt','firmen_flotte'])`. RLS an; SELECT-Policy `partner_provisionen__b1sel` deckt nur `partner_typ='makler'`/`'werkstatt'`/Admin(+KB nur makler).
- **Basis-Makler-Provision** entsteht per Trigger `trg_makler_provision_on_bridge` (AFTER INSERT `faelle_claim_bridge`) → `create_makler_provision()`: liest `makler_id/service_typ/lead_id/vermittler_typ` aus `claims`, grantet Consent, gate't auf `vermittler_typ='makler'`(oder NULL) + Downline-`provision_aktiv`, schreibt **eine** Zeile (`hold_until=now()+7d`, `status='pending'`).
- **`makler`** hat **keine** Sponsor-Spalte (Greenfield). Guard-Trigger **`guard_makler_privilegien`** (BEFORE INS/UPD): nicht-privilegierte INSERTs → `status='pending'`, Sätze=0, `provision_aktiv=false`; UPDATE auf `status`/Sätze/`provision_aktiv`/`user_id` → RAISE. Privileged = service_role/supabase_admin/postgres/authenticator/`is_admin()`.
- **Kein verdrahteter Release/Storno-Pfad** für `partner_provisionen` (kein pg_cron, keine Funktion updated die Tabelle, kein App-Code liest sie) → Provisionen bleiben `pending`, bis die Unifikations-Lane das wired (siehe §9).
- Datenlage klein: 5 Makler, 2 Provisionen, 12 Staffel-Stufen, 11 Pools → geringes Migrationsrisiko.

---

## 3 · Architektur-Überblick

```
Empfehlungen (Nav) ──► /makler/empfehlungen
   ├─ Persönlicher Link  claimondo.de/makler/registrieren?werber=<eigener promo_code>
   │    └─ Teilen: Kopieren · E-Mail (Server-Action, branded) · WhatsApp (wa.me-Share, client)
   ├─ Downline-Liste (Firma, Status, #Gutachten, Override verdient)   ← RPC get_makler_empfehlung_uebersicht
   ├─ Override-Summe (offen/freigegeben)
   └─ Mein Werber (Upline, informativ)

/makler/registrieren?werber=<code>  (BESTEHEND, erweitert)
   └─ registriereMaklerSelf(formData + werber):
        werber-Code → Sponsor-Makler auflösen → dessen Sätze erben (statt 100/50)
        → anlegeMaklerKern({ …, sponsorMaklerId, provisionKomplett/Gutachter = geerbt })
        (rechtsform ist hier bereits Pflicht)

Gutachten eingereicht (Claim bridged)
   └─ create_makler_provision()  (ERWEITERT)
        ├─ Basis:    partner_provisionen(makler,            downline, Satz, pending, +7d)
        └─ Override: partner_provisionen(makler_empfehlung, werber,   10,   pending, +7d)  ← wenn Werber provision_aktiv

Admin  /admin/makler  createMakler  (ERWEITERT: rechtsform + kleinunternehmer Pflicht)
   └─ anlegePartnerKern('makler', { …, rollenDetails: { rechtsform, ist_kleinunternehmer, … } })
```

Isolationseinheiten:
1. **Referenz-Kante** — `makler.sponsor_makler_id` (+ Guard-Schutz).
2. **Override-Erzeugung** — Erweiterung `create_makler_provision()`.
3. **Werber-Attribution im Signup** — `registriereMaklerSelf` + `anlegeMaklerKern` (Werber-Auflösung + Rateninheritanz + `sponsorMaklerId`).
4. **Struktur-Sicht** — RPC `get_makler_empfehlung_uebersicht` (leak-frei).
5. **UI** — Nav-Item + `/makler/empfehlungen` (Link/Share/Downline).
6. **Rechtsform-Pflicht Admin** — `createMakler` + `anlegePartnerKern` + Admin-Formular.

**Kein** neues `/beitreten`, **keine** Invite-Tabelle, **kein** Token-Lifecycle, **keine** Helper-Extraktion — alles reitet Bestehendes.

---

## 4 · Datenmodell / DDL (alle via `apply_migration` — Regel 2)

### 4.1 `makler.sponsor_makler_id` + Guard-Härtung

```sql
ALTER TABLE public.makler
  ADD COLUMN sponsor_makler_id uuid REFERENCES public.makler(id),
  ADD CONSTRAINT makler_sponsor_not_self
    CHECK (sponsor_makler_id IS NULL OR sponsor_makler_id <> id);

CREATE INDEX idx_makler_sponsor
  ON public.makler(sponsor_makler_id) WHERE sponsor_makler_id IS NOT NULL;
```

`guard_makler_privilegien()` erweitern, damit `sponsor_makler_id` privilegiert ist (nur service_role/Admin) — sonst könnte ein Makler sich per Self-UPDATE einen Werber zuschustern:
- INSERT non-privileged: zusätzlich `NEW.sponsor_makler_id := NULL`.
- UPDATE non-privileged: RAISE-Bedingung um `NEW.sponsor_makler_id IS DISTINCT FROM OLD.sponsor_makler_id` erweitern.

Cycles strukturell unmöglich: Geworbene sind immer brandneue Leaf-Accounts; der Werber existiert bereits.

### 4.2 `partner_typ`-CHECK erweitern

```sql
ALTER TABLE public.partner_provisionen DROP CONSTRAINT partner_provisionen_partner_typ_check;
ALTER TABLE public.partner_provisionen ADD CONSTRAINT partner_provisionen_partner_typ_check
  CHECK (partner_typ = ANY (ARRAY['makler','werkstatt','firmen_flotte','makler_empfehlung']));
```

Zwingend (CHECK ist restriktiv). Der eigene `partner_typ` vermeidet die Kollision mit der Basis-`makler`-Zeile am Unique `(partner_typ, claim_id)`.

### 4.3 `create_makler_provision()` — Override-Block

`CREATE OR REPLACE`: `v_sponsor uuid;` in DECLARE, und **nach** dem Basis-INSERT, **vor** `RETURN NEW`:

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

Erbt alle bestehenden Gates (kein makler / vermittler_typ / Downline-`provision_aktiv` → kein Basis → Block nie erreicht). Idempotent. Betrag hart `10` (gespiegelt in TS-Konstante, §6). Gate = Werber-`provision_aktiv` (spiegelt Basis-Logik).

### 4.4 `partner_provisionen__b1sel` erweitern

SELECT-Policy neu (`TO authenticated`), Makler- **und** KB-Branch von `partner_typ='makler'` auf `partner_typ IN ('makler','makler_empfehlung')` — sonst ist das Override für den Werber unsichtbar (auch in Abrechnungen). Werkstatt- und Admin-Branch **1:1** übernehmen (exakten Live-Body zu Plan-Zeit spiegeln). Der tote anon-Zweig entfällt (deckt sich mit anon-grant-cap; kurz mit jener Lane abgleichen).

### 4.5 RPC `get_makler_empfehlung_uebersicht(p_makler_id uuid)`

`SECURITY DEFINER`, `RETURNS jsonb`, `search_path=public`. Guard: nur eigener Makler (`EXISTS makler WHERE id=p_makler_id AND user_id=auth.uid()`) oder `is_admin()`, sonst RAISE `insufficient_privilege`. Liefert leak-frei (nur Firma/Name/Status — **kein** Bank/IHK):

```json
{
  "upline":   { "makler_id": "...", "firma": "...", "ansprechpartner_vorname": "..." } | null,
  "downline": [ { "makler_id": "...", "firma": "...", "ansprechpartner_vorname": "...",
                  "status": "aktiv", "gutachten_count": 3,
                  "override_netto_summe": 30, "override_pending_netto": 30 } ],
  "totals":   { "downline_count": 2, "override_netto_gesamt": 50, "override_pending": 50, "override_freigegeben": 0 }
}
```

`gutachten_count` je Downline = Anzahl der **Basis**-Provisionen der Downline (`partner_typ='makler'`, `partner_id=downline`) — echte vermittelte Gutachten, unabhängig davon ob ein Override entstand. `override_*` je Downline = die `makler_empfehlung`-Zeilen des Werbers, deren `claim_id` zu einem Claim mit `makler_id=downline` gehört. Beides definer-seitig → sidesteppt RLS-Rekursion auf `makler` (kein Self-Join-Policy) + den fehlenden Downline-/claims-Read.

---

## 5 · Werber-Link & Signup-Erweiterung

### 5.1 Empfehlungs-Link
- Referral-Ref = der **eigene Promo-Code** des Werbers (jeder Makler hat einen aus `anlegeMaklerKern`; keine neue Kennung). Link: `https://claimondo.de/makler/registrieren?werber=<promo_code>`.
- Auf `/makler/empfehlungen` gebaut aus `getMaklerPrimaryPromoCode(meineMaklerId)`.

### 5.2 `registriereMaklerSelf` erweitern
- Neues optionales Feld `werber` (aus dem Query-Param, via hidden input im Formular).
- Wenn gesetzt: Sponsor über `promotion_codes.code = werber` → `makler_id` auflösen. Sponsor gefunden **und** aktiv → dessen `provision_betrag_komplett_netto`/`_nur_gutachter_netto` erben (statt 100/50) und `sponsorMaklerId` an `anlegeMaklerKern` durchreichen. Sponsor nicht gefunden/inaktiv → **normaler** offener Signup (kein Sponsor, Default 100/50).
- Rechtsform bleibt Pflicht (unverändert).

### 5.3 `anlegeMaklerKern` erweitern
- Neuer Param `sponsorMaklerId?: string | null` → auf der `makler`-INSERT als `sponsor_makler_id` setzen. Nutzt weiter `createAdminClient()` (service_role) → Guard lässt es zu. Sonst unverändert.

### 5.4 `MaklerRegistrierenClient` erweitern
- Query-Param `?werber=<code>` als hidden `werber`-Field mitführen. Optional: „Eingeladen von **<Firma>**"-Trust-Hinweis (Sponsor-Firma server-seitig aufgelöst).

---

## 6 · Konstante

`src/lib/finance/constants.ts`:
```ts
/** Empfehlungs-Override an den direkten Werber pro vermitteltem Gutachten (netto). */
MAKLER_EMPFEHLUNG_OVERRIDE_NETTO: 10,
```
DB-Trigger nutzt Literal `10`; TS-Konstante für Anzeige. Kommentar an beiden Stellen (synchron halten; bewusst nicht konfigurierbar — YAGNI).

---

## 7 · UI

### 7.1 Nav
`src/components/makler/MaklerShell.tsx` — neuer `PortalNavItem` **„Empfehlungen"** (Icon `Share2`/`UsersRound`) nach „Promo & QR". Mobile-Items = erste 4.

### 7.2 `/makler/empfehlungen`
Server-Component (RPC-getrieben), Bausteine aus `primitives/*` + `shared/*` (Component-Set-Policy), deutsche UI-Strings mit Umlauten:
- **Empfehlungs-Link-Card:** der Link + drei Aktionen — **Kopieren** · **E-Mail** (Server-Action `sendeEmpfehlungMail`, branded, non-fatal) · **WhatsApp** (`https://wa.me/?text=<encodeURIComponent(text+link)>`, client-`<a>`, öffnet WhatsApp des Werbers).
- **StatCards:** Downline-Anzahl · Override gesamt · offen/freigegeben.
- **Meine geworbenen Makler:** `DataTable` — Firma · Ansprechpartner · Status · vermittelte Gutachten · Override verdient.
- **Mein Werber** (falls `upline != null`): Info-Card (Firma/Name).

### 7.3 WhatsApp-Share (Detail)
Client-`wa.me`-Link mit vorformuliertem Text („Werde Claimondo-Makler-Partner: <link>"). **Kein** Twilio/Server-Send (kein Template/Kosten, teilt aus dem eigenen WhatsApp des Werbers). E-Mail dagegen als Server-Action (branded, über bestehende `sendCommunication`-Infra).

---

## 8 · Rechtsform-Pflicht im Admin-Anlage-Pfad (Aaron 2026-07-17)

Ziel: **alle** Makler (self **und** admin-erstellt) haben eine Rechtsform (zwecks Abrechnung). Self-Signup erfüllt das bereits; nur der Admin-Pfad fehlt.

1. **`src/app/admin/makler/actions.ts::createMakler`**: `rechtsform` (Pflicht, via `istErlaubteRechtsform`) + `ist_kleinunternehmer` (Checkbox → boolean) parsen; bei fehlender/ungültiger Rechtsform Result-Fehler. An `anlegePartnerKern` über `rollenDetails: { rechtsform, ist_kleinunternehmer, … }` durchreichen.
2. **`src/lib/partner/anlege-partner.ts`**: sicherstellen, dass `rollenDetails.rechtsform` + `ist_kleinunternehmer` auf die `makler`-Row geschrieben werden (rollenDetails-Passthrough prüfen/ergänzen — spiegelt `anlegeMaklerKern`).
3. **Admin-Makler-Anlage-Formular** (Client unter `src/app/admin/makler/…`): `rechtsform`-Dropdown aus `RECHTSFORM_OPTIONEN` (Pflicht) + Kleinunternehmer-Checkbox. Bausteine aus `shared/forms/*`.

Kein DB-Change (Spalten `rechtsform`/`ist_kleinunternehmer` existieren).

---

## 9 · Lifecycle & Abhängigkeiten (ehrlich)

- **Release/Storno von `partner_provisionen` ist aktuell nicht verdrahtet.** Basis- **und** Override-Provisionen bleiben `pending`, bis die Provisions-Unifikations-Lane den gemeinsamen Pfad (Freigabe nach `hold_until`, Storno bei Claim-Storno) umstellt. Dieses Feature baut **keinen** Parallel-Cron — das Override erbt den Pfad (gleiche Tabelle/Spalten; Storno-by-`claim_id` erfasst beide `partner_typ`). → **Flag an Aaron / Unifikations-Lane**, separat.
- **Portal-Read-Drift** (`queries.ts`/alter Cron lesen die gedroppte `makler_provisionen`) = fremde Lane, hier nur geflaggt. Dieses Feature liest ausschließlich `partner_provisionen`.

---

## 10 · Bewusst nicht dabei (YAGNI)

Multi-Level-/Ketten-Override · admin-konfigurierbarer Override-Betrag · Admin-Approval-Gate · Invite-Tabelle/Token-Lifecycle/Pending-Tracking · Re-Parenting/Entfernen aktiver Downline-Makler · Netzwerk-Staffelbonus · Server-seitiger WhatsApp-Versand (Twilio) · Reparatur der `partner_provisionen`-Release/Storno-Verdrahtung · Reparatur der `makler_provisionen`-Portal-Drift.

---

## 11 · Akzeptanzkriterien (testbar)

1. Aktiver Makler sieht Nav „Empfehlungen"; die Seite zeigt seinen Empfehlungs-Link mit **Kopieren / E-Mail / WhatsApp**.
2. Öffnet jemand `…/makler/registrieren?werber=<code>` und registriert sich, ist der neue Makler **sofort `status='aktiv'`**, `sponsor_makler_id`=Werber, mit den **geerbten Sätzen** des Werbers; Rechtsform war dabei Pflicht.
3. Ohne/mit ungültigem `werber` funktioniert die Registrierung normal (kein Sponsor, Default-Sätze).
4. Reicht ein geworbener Makler ein Gutachten ein (Claim gebridged, `vermittler_typ='makler'`), entstehen **zwei** `partner_provisionen`-Zeilen: Basis (`makler`, Downline, dessen Satz) **und** Override (`makler_empfehlung`, Werber, **10**, `pending`, `hold_until=+7d`).
5. `/makler/empfehlungen` (Werber) zeigt die Downline mit je #Gutachten + verdientem Override, Override-Gesamtsumme, und (falls vorhanden) den eigenen Werber. Override erscheint auch in den normalen Abrechnungen (RLS-sichtbar).
6. `provision_aktiv=false` beim Werber ⇒ **kein** Override.
7. Ein Makler kann seinen eigenen `sponsor_makler_id` **nicht** selbst ändern (Guard RAISEt).
8. **Kein Ketten-Override:** in `M1←M2←M3` bekommt M1 nichts von M3s Gutachten.
9. **Rechtsform-Pflicht im Admin:** Die Admin-Makler-Anlage verlangt eine gültige Rechtsform (Dropdown); ohne → Fehler, kein Account. Der angelegte Makler hat `rechtsform` gesetzt.

---

## 12 · Test-/Smoke-Plan (Regel 4 — echter Flow, Prod mit Test-Accounts, `telefon=NULL`)

1. **Werber W** (aktiv, `provision_aktiv`, Sätze 100/50) → `/makler/empfehlungen`: Link + 3 Share-Buttons sichtbar; WhatsApp-Link öffnet `wa.me` mit Text.
2. **Signup via Link:** `…/registrieren?werber=<W-code>` → registrieren (Rechtsform wählen). Verify: neuer Makler **X** `status='aktiv'`, `sponsor_makler_id=W`, Sätze 100/50, `rechtsform` gesetzt.
3. **Override:** Claim X-attribuiert (`makler_id=X`, `vermittler_typ='makler'`) → bridge. Verify `partner_provisionen`: `(makler, X, 100, pending)` **und** `(makler_empfehlung, W, 10, pending, +7d)`.
4. **Struktur-Sicht:** `/makler/empfehlungen` als W → X mit „1 Gutachten / 10 EUR". Als X → Upline=W, Downline leer.
5. **Negativ:** `W.provision_aktiv=false`, weiterer X-Claim → **kein** neues Override.
6. **Kette:** X wirbt **Y**, Y-Claim → Override nur an X, **nichts** an W.
7. **Guard:** `makler.sponsor_makler_id` als normaler Makler ändern → RAISE.
8. **Admin-Rechtsform:** `/admin/makler` Anlage ohne Rechtsform → Fehler; mit Rechtsform → Makler mit gesetzter `rechtsform`.

---

## 13 · Migrations-Reihenfolge (Regel 2: `apply_migration` → `list_migrations` → File nach recorded Version → READ-Verify → Typen regenerieren + committen)

- **MIG-1** `makler_sponsor_makler_id`: Spalte + CHECK + Index + `guard_makler_privilegien`-Update.
- **MIG-2** `partner_provisionen_typ_add_makler_empfehlung`: CHECK erweitern.
- **MIG-3** `create_makler_provision_empfehlung_override`: Funktion `CREATE OR REPLACE`.
- **MIG-4** `partner_provisionen_sel_makler_empfehlung`: SELECT-Policy neu.
- **MIG-5** `get_makler_empfehlung_uebersicht`: RPC.

Danach `src/lib/supabase/database.types.ts` regenerieren + committen (Regel 2 Schritt 6). Rechtsform-im-Admin (§8) ist **app-only** (kein Migration).

---

## 14 · Offene Verifikationen (Plan-Zeit)

- Exakten Live-Body von `partner_provisionen__b1sel` 1:1 übernehmen (Werkstatt/Admin-Branch), nur Makler/KB-`partner_typ`-Set erweitern.
- `anlegePartnerKern`-`rollenDetails`-Passthrough für `rechtsform`/`ist_kleinunternehmer` prüfen (ob generisch geschrieben oder Whitelist ergänzen).
- Admin-Makler-Anlage-Formular lokalisieren (Client-Component unter `src/app/admin/makler/…`) für das Rechtsform-Feld.
- `/makler/registrieren` Page/Client: `searchParams.werber` → hidden Field verdrahten.
- Werber-Auflösung: `promotion_codes.code`-Lookup (aktiv) → Sponsor; Sonderfall Werber ohne aktiven Promo-Code.
