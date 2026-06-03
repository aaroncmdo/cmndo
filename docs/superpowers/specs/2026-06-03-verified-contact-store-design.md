# Verified-Contact-Store — Design (Identitaets-Engine §12-Schritt-1)

**Stand 2026-06-03. Status: freigegeben (Aaron). Branch: `kitta/cmm-entity-verified-contacts`.**

Erster Bau-Baustein der Identitaets-Aufloesung (`docs/superpowers/specs/2026-06-03-identitaets-aufloesung-design.md`, §8 + §12-Schritt-1). Baut auf der personen-Registry (PR #2353, gemerged) auf. **Rein additiv, kein Consumer** — entsperrt die spaetere Match-Engine (§12-Schritt-2), aendert aber noch keinen App-Pfad.

---

## 1. Ziel

Eine **proven-control**-Ebene fuer Kontaktpunkte: festhalten, welche Email/Telefon-Werte einer `personen`-Zeile **nachweislich gehoeren** (OTP eingegeben, Magic-Link geklickt, `auth.users`-confirmed, Airdrop-Klick) — inkl. Quelle + Zeitpunkt.

Das ist die **harte** Kontakt-Ebene oberhalb der **weichen** (getippten) `personen.email`/`telefon`/`mobil`. §4 der Identitaets-Spec trennt genau das: „verifiziert" = nachgewiesene Kontrolle, nicht bloss gesendet/getippt.

Zwei Lese-Zwecke (beide spaeter, nicht in diesem Schritt):
- **Konfidenz:** verifizierte Kontakte gewichten den Match-Score hoeher als getippte.
- **Cross-Person-Signal:** **dasselbe** verifizierte `value` ueber **zwei Personen** = starker Merge-Hinweis (Schaediger-heute → Kunde-morgen).

## 2. Warum eine eigene Tabelle (nicht personen-Spalten)

`personen` hat schon flache `email`/`telefon`/`mobil` (weich/getippt). Spalten wie `email_verified_at` darauf wuerden:
- nur **eine** Email/Telefon pro Person erlauben (real: mehrere),
- **keine** Quelle/Historie tragen,
- und vor allem das **Cross-Person-Signal toeten** (selbes value ueber Personen waere nicht abbildbar).

Eine N:1-Tabelle loest alle drei. Verworfen: personen-Spalten (Ansatz 2 im Brainstorm). Aufgeschoben: authenticated-own-row-RLS fuer eine spaetere „deine verifizierten Kontakte"-UI (Ansatz 3, YAGNI).

## 3. Schema

```sql
create table public.verified_contacts (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.personen(id) on delete cascade,
  kind        text not null check (kind in ('email','phone')),
  value       text not null,                 -- normalisiert (email: lower+trim; phone: ohne Whitespace)
  source      text not null check (source in
                ('auth_email_confirmed','auth_phone_confirmed','otp','magic_link','airdrop_accept')),
  source_ref  text,                          -- opaker Beleg-Verweis (auth-uid / airdrop_token / otp-id) fuer Provenance
  verified_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (person_id, kind, value)            -- dedup INNERHALB Person; selbes value ueber Personen erlaubt = Signal
);

create index verified_contacts_kind_value_idx
  on public.verified_contacts (kind, value);  -- Cross-Person-Lesepfad der Engine
```

**Designentscheide:**
- **FK `on delete cascade`** auf `personen` — Stammdaten-Hygiene; bei Hard-Merge werden Belege ohnehin ueber den Survivor neu erfasst.
- **`unique (person_id, kind, value)`** dedupt pro Person, laesst aber `value` ueber mehrere Personen zu — das **ist** das Merge-Signal, kein zu verhinderndes Duplikat.
- **Kein** `user_id` auf der Tabelle: `personen.user_id` + `source`/`source_ref` decken Provenance ab (YAGNI, keine Redundanz).
- `kind`/`source` als CHECK-Enums (erweiterbar per spaeterer Migration).

## 4. RLS / Zugriff (die §2-sensible Stelle)

Harte Invariante der Identitaets-Spec (§2): **keine RLS-Policy/kein Access-Check je auf `person_id`.** Diese Tabelle ist reine Dedup-/Signal-Stammdaten, **keine** Access-Control-Flaeche. Sie traegt PII.

Posture:
```sql
alter table public.verified_contacts enable row level security;
revoke all on table public.verified_contacts from anon, authenticated;
grant select, insert, update, delete on public.verified_contacts to service_role;
-- KEINE Policy fuer anon/authenticated => deny-all fuer PostgREST-Clients.
```
- **Deny-all-to-clients:** anon/authenticated bekommen weder Grant noch Policy → kein Client-Lesepfad → §2 by-construction erfuellt (es gibt schlicht kein person_id-Gate, weil es keinen Client-Zugriff gibt) und null PII-Leak-Flaeche.
- **Schreiben** nur via SECURITY-DEFINER-Helper (unten), `execute` **nur** an `service_role` → kein authenticated-RPC → kein Client kann fremde Kontakte „verifizieren" (Poisoning-Schutz).
- **Lesen** (Cross-Person-Signal) kommt mit der Match-Engine (§12-2) als eigene Definer-Funktion oder server-seitig via `service_role` — **nicht in diesem Schritt**.

## 5. Schreib-Helper (die API fuer spaetere Writer)

```sql
create or replace function public.record_verified_contact(
  p_person_id   uuid,
  p_kind        text,
  p_value       text,
  p_source      text,
  p_source_ref  text default null,
  p_verified_at timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public
as $$ ... $$;  -- validiert kind/source, normalisiert value, upsert auf (person_id,kind,value)

revoke all on function public.record_verified_contact(uuid,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_verified_contact(uuid,text,text,text,text,timestamptz)
  to service_role;
```
- Normalisiert: email → `lower(btrim())`, phone → Whitespace raus.
- Upsert: bei Konflikt frühestes `verified_at` behalten (`least`), `source_ref` nachfuellen falls leer, `source` **nicht** downgraden.
- Einziger Schreibpfad → Normalisierung + Validierung zentral, kein breiter Table-Grant noetig.

## 6. Scope dieses Schritts

**Drin:** Tabelle + Constraints + Index + RLS + `record_verified_contact`-Helper. Eine additive Migration via `apply_migration`.

**Bewusst NICHT drin (Folgeschritte):**
- **Backfill** aus `auth.users.email_confirmed_at`/`phone_confirmed_at` → separater, idempotenter Fast-Follow (Daten duenn: ~70 Personen mit `user_id`). Erst wenn der Lesepfad steht, damit end-to-end verifizierbar.
- **Writer-Wiring** (record beim OTP/Magic-Link/Airdrop-Klick/Signup-Confirm) — sitzt im aar-939-Konversions-Hotpath → **supervised**, eigener Schritt.
- **Match-Engine / Reader** (§12-2) — liest diesen Store, eigener Schritt.

## 7. Verifikation

- `apply_migration` → `list_migrations` (getrackte Version ablesen) → File `supabase/migrations/<V>_verified_contacts_store.sql` exakt danach benennen (Anti-Twin-Drift, Regel 2).
- `execute_sql` (READ): Tabelle + Constraints + RLS-Status + Helper-Existenz pruefen; Negativ-Probe (anon/authenticated sehen nichts).
- `get_advisors` (security): RLS-Posture gegenchecken (RLS-enabled-no-policy = beabsichtigt/sicher, kein Fehler).
- Typen (`database.types.ts`): **aufgeschoben** bis ein Consumer die Tabelle nutzt (Regel 2 erlaubt das; kein Code referenziert sie in diesem Schritt).

## 8. Verhaeltnis zu den §13-Review-Schaerfungen

§13-B/C machen **Airdrop-Token + FIN** zu harten Identitaets-Bruecken. Dieser Store ist die **Email/Telefon**-proven-control-Ebene — komplementaer, nicht konkurrierend. `source='airdrop_accept'` + `source_ref=airdrop_token` verknuepft den Airdrop-Beleg sauber mit dem Kontakt. FIN bleibt ein **Fahrzeug**-Signal (vehicles), nicht Teil dieses Kontakt-Stores.
