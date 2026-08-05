# GEO-P2 SP2 — NPS-Capture (Post-Abschluss-Kundenumfrage) — Design

**Datum:** 2026-08-05
**Status:** Design (brainstorming) — Aaron-Review vor writing-plans
**Programm:** GEO P2 (Daten-Moat), Sub-Projekt 2/3. Nach SP1 (Kürzungs-Capture, PR #5001).
**Branch (geplant):** `kitta/geo-p2-nps-capture` (off origin/staging) — Main-App + prod-DDL.

---

## Programm-Kontext

P2 macht den Schadensreport 2026 mit echten Falldaten füllbar. Von den 7 Report-Datenpunkten (A–G aus `docs/geo/operations-daten-pull.md`) ist nach SP1 nur noch **Block G (NPS/Customer-Satisfaction)** ein echter Neu-Capture — A–F sind bei Volumen aus Bestandsdaten + SP1-Kürzungen aggregierbar (= SP3). SP2 schließt diese letzte Capture-Lücke: **Post-Abschluss-Kundenumfrage (0–10 + Kommentar) → `kunde_feedback`**. Wie SP1 „Baum pflanzen" — die Erhebung startet sofort, der Report-Block G kommt bei Volumen (SP3).

**Prod verifiziert (05.08.):** `kunde_feedback` existiert nicht (alles neu); `claims.abgeschlossen_am` existiert (timestamptz); Terminal-Status = `abgeschlossen` (4 Claims). Kein NPS/Feedback-Mechanismus vorhanden — aber zwei saubere Vorbilder: der SV-Google-Review-Nudge (`notifyKundeSvBewerten`, post-Event Kunde nudgen) + `/kunde-termin/[token]` (anon Token-Route, Service-Role-Write, one-time-Token).

## Ziel

Ab sofort nach Fall-Abschluss den Kunden per E-Mail-Magic-Link um eine Service-Bewertung (NPS 0–10 + Kommentar) bitten, Antworten in `kunde_feedback` erfassen. **Erfolgskriterium:** ein frisch abgeschlossener Test-Claim erzeugt (via Cron) eine `kunde_feedback`-Zeile mit Token + Invite-Mail; der Magic-Link öffnet ein Formular; Absenden schreibt `rating`/`kommentar`/`beantwortet_am`. **Nicht Ziel (SP2):** Aggregation/Report-Block-G (SP3), WhatsApp-Kanal, In-Portal-Prompt.

## Drei Entscheidungen (Aaron 05.08. approved)
- **Kanal = E-Mail-Magic-Link** (WA/SMS degradiert; echter E-Mail-only-Pfad existiert). Nicht Channel-Router-auto.
- **DSGVO = Art. 6(1)(f) berechtigtes Interesse** (Service-Feedback zu abgeschlossener Transaktion an Bestandskunde, **kein Marketing**), mit klarem „Service-Feedback"-Framing + funktionierendem Opt-out (Art. 21). Kein Consent-Gate nötig, aber Opt-out Pflicht.
- **Fatigue:** NPS bleibt neben dem SV-Google-Review-Nudge (andere Achse: post-Abschluss/Claimondo-Service vs. post-Besichtigung/SV). Beide behalten.

---

## Architektur — 4 Einheiten + Migration

### Einheit 1 · DDL: `kunde_feedback` (Regel 2, apply_migration)

```sql
CREATE TABLE public.kunde_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES public.claims(id) ON DELETE CASCADE,
  rating smallint CHECK (rating >= 0 AND rating <= 10),   -- null bis beantwortet
  kommentar text,
  response_token text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  eingeladen_am timestamptz NOT NULL DEFAULT now(),
  beantwortet_am timestamptz,
  abgemeldet_am timestamptz,                               -- Opt-out (DSGVO Art. 21)
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kunde_feedback ENABLE ROW LEVEL SECURITY;
-- Staff-Read (für spätere Fall-/Report-Anzeige); Write ausschließlich service_role.
CREATE POLICY kunde_feedback_staff_read ON public.kunde_feedback
  FOR SELECT TO authenticated
  USING (public.can_access_claim(claim_id) OR public.is_kanzlei());
-- Explizite Grants (Default-Privileges granten neuen Tabellen nichts):
GRANT SELECT ON public.kunde_feedback TO authenticated;
GRANT ALL ON public.kunde_feedback TO service_role;
-- KEIN Grant TO anon (Anon-Gates) — die Token-Route schreibt via service_role-Action.
```

- **`claim_id` (nicht `fall_id`)** — claims = SSoT (faelle-Drop-Runway). **UNIQUE** = genau-eine Umfrage je Claim (idempotent).
- **RLS:** `TO authenticated` explizit (RLS-Policy-Gate), `can_access_claim`-scoped (Muster wie `forderungspositionen.staff_fall_scoped`). **Kein anon-Grant** → `check:anon-*`-Ratchets bleiben grün. `rating`/`kommentar` sind keine Namens-PII → Anon-Grant-Gate n/a, aber wir granten anon trotzdem nichts.
- Regel-2-Flow: apply_migration → recorded Version → File benennen → `execute_sql` verifizieren → Types regen (`kunde_feedback`-Row **neu** → hier regeneriert der CLI-Gen echte Typen → committen). Kein flag-drift-Snapshot nötig (der `rating`-CHECK ist ein Range, kein ANY-ARRAY-enum).

### Einheit 2 · Invite-Cron `src/app/api/cron/nps-invite/route.ts`

Muster exakt wie `api/cron/fall-abschluss/route.ts`: `assertCronAuth(request)` → `createAdminClient()` → `export const dynamic='force-dynamic'` → GET.

- **Kandidaten:** `claims` mit `operative_status='abgeschlossen'` **und** `abgeschlossen_am > now()-interval '3 days'` (Fenster bounded den Scan).
- **Idempotent + race-safe:** je Kandidat `upsert({ claim_id, response_token, token_expires_at, eingeladen_am }, { onConflict: 'claim_id', ignoreDuplicates: true }).select('id, claim_id')`. Kam eine Zeile zurück (neu angelegt) → Invite senden; leer (schon eingeladen) → skip. Der UNIQUE-Constraint + `ignoreDuplicates` garantiert **genau-einmal**, auch bei mehrfachem Cron-Lauf.
- **Token:** kryptographisch zufällig (z.B. 2× `crypto.randomUUID()` ohne Bindestriche = 64 hex; `/upload/dokumente` verlangt ≥16). `token_expires_at = now()+30 Tage`.
- **Opt-out-Suppression:** vor dem Insert prüfen, ob der Kunde global abgemeldet ist (bestehende Suppression-Liste wiederverwenden falls vorhanden — im Plan verifizieren; sonst per `kunde_feedback.abgemeldet_am`-Historie über die E-Mail). MVP: mindestens die pro-Claim-Unique + der In-Flow-Opt-out.
- **Invite-Send:** gebrandete NPS-Invite-E-Mail mit Magic-Link `${SITE_URL}/kunde-nps/<token>` (Muster: `FlowLinkVersand`-Magic-Link-Mail). Empfänger = Kunde-E-Mail via `claims.lead_id→leads.email` (Fallback `geschaedigter_user_id→profiles.email`) — Resolution wie in `send-fall.ts`. Branding via `resolveEmailBranding({ claimId })`. Direkt-Send via `sendEmail` (`@/lib/email/google/client`), da die Token-URL per-Invite dynamisch ist (Registry-Trigger nimmt keine dynamischen Daten). Non-critical: Send-Fehler loggt, die Zeile bleibt (nächster Cron-Lauf re-invitet nicht — Zeile existiert; ggf. Retry-Feld als Follow-up).
- **Scheduler:** Cron-Route ist Code; der Schedule-Eintrag (VPS-crontab, z.B. stündlich) = **Ops-Handoff** (wie Werkstatt-Drip). Kein pg_cron → kein Cron-Guard-Problem.

### Einheit 3 · Response-Route `src/app/kunde-nps/[token]/` (anon, Muster `/kunde-termin/[token]`)

- **`page.tsx`** (`dynamic='force-dynamic'`, anon, kein Login): lädt via `loadFeedbackByToken` (`.eq('response_token', token).maybeSingle()` + Expiry- + `beantwortet_am`-Check), gebranded (`resolveBrandingFromToken`-Analog), rendert `NpsFormClient`.
- **`NpsFormClient.tsx`** (`'use client'`): 0–10-Skala (11 Buttons, NPS-Standard) + optionales Kommentar-Textarea + „Absenden"; plus dezenter „Keine Umfragen mehr"-Opt-out-Link. Danke-Zustand nach Submit.
- **`actions.ts`** (`'use server'`, `createAdminClient`, Result-Object `{ success, error? }`):
  - `submitNpsByToken(token, rating: number, kommentar?: string)` — Token+Expiry-Check, `rating` 0–10 validieren, `update({ rating, kommentar, beantwortet_am: now, token_expires_at: now (verbrauchen) }).eq('response_token', token)` mit `.select()` + Row-Check (RLS-Silent-Fail-Guard, [[coordination-dsgvo-storno-silent-failure]] — hier service_role, aber Row-Check trotzdem).
  - `abmeldenByToken(token)` — `update({ abgemeldet_am: now, token_expires_at: now })` + Suppression-Eintrag (Plan).
- **Sicherheit:** kein anon-RLS-Write; alle Writes über die service_role-Action nach Token-Validierung (exakt das `/kunde-termin`-Muster → Anon-Gates bleiben grün).

### Einheit 4 · E-Mail-Template `src/lib/email/google/templates/KundeNpsUmfrage.tsx`

react-email, Layout aus `templates/layout.tsx` + `src/lib/email/components/*`. Inhalt: knappe Bitte um Service-Feedback zum abgeschlossenen Fall (`claim_nummer`), prominenter „Jetzt bewerten"-Button → Magic-Link, **Framing „Service-Feedback, kein Werbung"** + **Opt-out-Zeile** (Link → `/kunde-nps/<token>?opt_out=1` oder ein dedizierter Abmelde-Pfad). Umlaute echt, gebranded via `var(--brand-*)`-Props (Token-Audit-Skip-Header wie andere Email-Templates).

*(Aggregation Block G + `datasetSchema`-Erweiterung + Report-Rendering = SP3, deferred.)*

---

## Datenfluss

```
Fall wird abgeschlossen (operative_status='abgeschlossen', abgeschlossen_am gesetzt)
   │
   ▼ (stündlicher Cron, entkoppelt von den 3 Abschluss-Pfaden)
api/cron/nps-invite  ── scannt abgeschlossen<3d ohne feedback-Zeile
   │  upsert kunde_feedback {claim_id, token, expires+30d}  (onConflict claim_id → genau-einmal)
   ▼
sendEmail(KundeNpsUmfrage, kunde-email, branded)  ── Magic-Link /kunde-nps/<token>
   ▼
Kunde klickt → /kunde-nps/[token]  ── 0–10 + Kommentar (oder Opt-out)
   ▼
submitNpsByToken → update {rating, kommentar, beantwortet_am, token verbraucht}
   ▼
kunde_feedback befüllt  ── [SP3 aggregiert monatlich → Schadensreport Block G]
```

## Testing / Verifikation

- **Unit (vitest, pure):** die Token-/Validierungs-Logik isolieren (z.B. `nps-token.ts`-Helfer: Token-Gen-Länge, Expiry-Check, rating-Range-Validierung 0..10 inkl. Grenzen/NaN) + die Cron-Kandidaten-Filter-Logik (Fenster + „hat schon feedback"), mit Mock-`db`. Server-Actions/Route selbst = Integration (nicht unit).
- **Build:** voller `npm run build` (neue Route + Server-Action + Cron-Route → Next-15-Validator).
- **Regel 4 (scharf — kundengerichtete Route + DB-Write + Cron):** nach Prod-Deploy, Test-Konten (`telefon=NULL`, **Test-E-Mail** — kein echter Kunde):
  1. Test-Claim auf `abgeschlossen` bringen (oder direkt eine Test-Zeile via Cron-Trigger).
  2. Cron-Route manuell mit Auth-Header GETen → `kunde_feedback`-Zeile + Invite-Mail an Test-Adresse.
  3. Magic-Link `/kunde-nps/<token>` öffnen → 0–10 wählen + Kommentar → Absenden.
  4. `execute_sql`: Zeile hat `rating`/`kommentar`/`beantwortet_am`; Token verbraucht (`token_expires_at ≤ now`); zweiter Cron-Lauf legt **keine** zweite Zeile an (Unique).
  - **Kein echter Kunden-Versand** — nur Test-E-Mail-Adresse. Opt-out-Pfad ebenfalls smoken.

## DSGVO-Handling (dokumentiert)

- **Rechtsgrundlage:** Art. 6(1)(f) — berechtigtes Interesse an Servicequalität; die Umfrage bezieht sich auf eine **abgeschlossene Vertragsbeziehung**, ist **kein Werbe-/Marketing-Versand** (UWG §7 nicht einschlägig, da keine Werbung).
- **Opt-out (Art. 21):** jede Invite-Mail + die Response-Seite tragen einen funktionierenden Abmelde-Link (`abmeldenByToken` → `abgemeldet_am` + Suppression). Abgemeldete Kunden werden vom Cron nicht erneut eingeladen.
- **Datensparsamkeit:** nur `rating` + freiwilliger `kommentar`; keine zusätzlichen personenbezogenen Felder (Bezug über `claim_id`). Aggregation (SP3) nur >5-Buckets, anonymisiert.
- **Framing:** Betreff/Text klar als „Wie zufrieden waren Sie mit der Abwicklung?" — Service-Feedback, nicht Werbung.

## Regel 2 / 3 / 4 — Disziplin

- **Regel 2:** DDL nur via apply_migration, **nach diesem Spec-Review**. Recorded Version → File. Types regen + committen (neue Tabelle → echte neue Row-Typen).
- **Regel 3:** Session-Ende clean.
- **Regel 4:** Prod-Smoke wie oben; Deploy + crontab-Eintrag post-merge → Smoke-Pflicht + Scheduler-Setup als Handoff im Marker.

## Koordination (13 aktive Sessions)

- **Null Hot-File-Eingriff:** SP2 legt neue Files an (Cron-Route, Response-Route, Template, Migration) + berührt **nicht** `process-event.ts`/`state-machine.ts`/Abschluss-Pfade (die entkoppelte Cron ist der Clou). Minimales Kollisionsrisiko.
- `communications/registry.ts` **nicht** angefasst (Direkt-Send statt Registry-Trigger) → keine Kollision mit Comms-Sessions.

## Nicht in Scope (YAGNI / Folge)

- **SP3:** Monats-NPS-Aggregation + Schadensreport-Block-G + `datasetSchema.variableMeasured`-Erweiterung + Fall-View-Anzeige des Feedbacks.
- **WhatsApp-1-Klick-Variante** (Spec-Original) — bis WA-Outbound wieder stabil.
- **In-Portal-Prompt** (nach `GoogleReviewPrompt`) — E-Mail deckt den Post-Abschluss-Moment (Kunde nicht zwingend eingeloggt).
- **Globale Cross-Claim-Suppression-Tabelle** — falls keine bestehende Suppression wiederverwendbar; MVP nutzt pro-Claim-Unique + In-Flow-Opt-out.
- **Retry bei Mail-Fehlschlag** (die Zeile existiert dann; ein Retry-Feld wäre Follow-up).

## Offene Plan-Items (für writing-plans)

- `assertCronAuth`-Signatur + der Cron-Secret-Header (aus `@/lib/auth/cron-auth`) — exakt für den Smoke-GET.
- Bestehende Suppression-Liste? (grep `suppression`/`abgemeldet`/`unsubscribe` — reuse statt neu).
- `sendEmail`-Signatur (`@/lib/email/google/client`) + `resolveEmailBranding`-Rückgabe.
- Kunde-E-Mail-Resolution-Helfer in `send-fall.ts` (extrahierbar/reusable?).
- `can_access_claim` + `is_kanzlei` als korrekte RLS-Helfer bestätigen (existieren, aus forderungspositionen-Policy).
- `SITE_URL`/Base-URL-Konstante für den Magic-Link (App-seitig, nicht Marketing).
