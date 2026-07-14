# Globale Fuzzy-Suche (alle Rollen) — Design-Spec

**Datum:** 2026-07-14
**Status:** Design (Brainstorming abgeschlossen, Aaron-approved Abschnitte 1-3)
**Projekt:** B (2. Hälfte von „Suchfunktion + Item-Linking"; A = notif-badges/PR #4239)

## Ziel

Eine **tippfehler-tolerante, rollen-übergreifende Suche**, die die richtigen Elemente findet und per Klick in die jeweilige Detail-View führt — für **alle internen Rollen** (Admin, Kundenbetreuer, Dispatch, Kanzlei, SV, Kunde, Makler, Werkstatt, Flottenmanager).

## Ausgangslage (verifiziert)

Suche ist **nicht greenfield**:
- Reusable Cmd+K-Palette **`src/components/shared/Spotlight.tsx`** (Debounce 250 ms, Keyboard-Nav, gruppierte Treffer, Klick→Detail).
- Verdrahtet in **Admin** (`admin/layout.tsx` → `/api/search`: Fälle/Leads/SV) + **SV** (`SVSpotlight` → `/api/gutachter/search`, RLS-gated eigene Fälle).
- **Fehlt:** Kunde/Makler/Dispatch/Werkstatt/Kanzlei/Flottenmanager (kein Such-Entry); Werkstätten/Makler/Personen/Rückrufe/Fahrzeuge nicht durchsuchbar.
- **Kein FTS** — alles `.ilike()` (Substring, keine Tippfehler-Toleranz).

## Entscheidungen (Aaron)

1. **Scope = „größer denken"** — Rollout auf alle Rollen + breitere Entitäten + Fuzzy.
2. **Match-Breite = Identifier + Namen + Ort** → **`pg_trgm`** (Trigram + GIN). **Kein** Volltext-`tsvector`, **kein** Dokument-/OCR-Inhalt in v1 (Non-Goal).
3. **Architektur = B: ein Unified Such-RPC** (`search_global`), **`SECURITY INVOKER`**.

## Global Constraints

- **DDL nur über das Supabase-Plugin** (`apply_migration`), Migration-File exakt nach getrackter Version benannt (AGENTS.md Regel 2).
- **RPC = `SECURITY INVOKER`** (nie `DEFINER`) → RLS bleibt das Gate. **Invariante:** nur RLS-geschützte Tabellen kommen in die Funktion (heute: alle 13 Kandidaten haben RLS aktiv ✓ verifiziert).
- **`SET search_path = public`** in der Funktion gepinnt (Security).
- **`Spotlight` wiederverwenden** — kein neues Palette-Widget (Komponenten-Set-Policy).
- Endpoint = **User-Client** (RLS greift), Result-Object-Pattern (`{ ok, ... }` / graceful `[]`).
- UI-Strings mit echten Umlauten; Ratchets (component-set/token-audit/knip) 0-neu.

## Architektur

```
Spotlight (Cmd+K) ─┐
Header-Such-Icon ──┴─> <GlobalSearch/> ──> POST /api/search {q}
                        (rollen-agnostisch)    │ (User-Client, RLS)
                                               ▼
                                   rpc('search_global', {q, limit_per_type})
                                     SECURITY INVOKER, pg_trgm, role-gated UNION
                                               │
                        ┌──────────────────────┘
                        ▼
        Treffer[] {entity_type,id,label,sub,status,score}
          → Client: dedupe(Claim-id) + routeForEntity(type,id,rolle) → Detail
```

### 1. Der RPC `search_global`

```sql
CREATE OR REPLACE FUNCTION public.search_global(q text, limit_per_type int DEFAULT 6)
RETURNS TABLE (entity_type text, id uuid, label text, sub text, status text, score real)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  IF length(coalesce(q,'')) < 2 THEN RETURN; END IF;      -- Min-Länge gegen Trigram-Rauschen
  SELECT rolle INTO v_role FROM profiles WHERE id = auth.uid();  -- Self-Read (RLS-ok)

  RETURN QUERY
  -- Fall/Claim (alle Rollen, RLS-scoped)
  (SELECT 'claim', c.id, c.claim_nummer,
          coalesce(c.schadenort_ort, c.polizei_aktenzeichen), c.operative_status::text,
          GREATEST(similarity(c.claim_nummer, q), similarity(coalesce(c.schadenort_ort,''), q))
   FROM claims c
   WHERE c.claim_nummer % q OR c.schadenort_ort % q OR c.polizei_aktenzeichen % q
   ORDER BY 6 DESC LIMIT limit_per_type);

  -- Fahrzeug → surft als sein Fall (Kennzeichen-Treffer, alle Rollen, RLS via claims)
  RETURN QUERY
  (SELECT 'claim', c.id, v.kennzeichen_aktuell, c.claim_nummer, c.operative_status::text,
          similarity(v.kennzeichen_normalized, q)
   FROM vehicles v JOIN claims c ON c.vehicle_id = v.id
   WHERE v.kennzeichen_normalized % q
   ORDER BY 6 DESC LIMIT limit_per_type);

  -- Lead (nur für admin/kundenbetreuer/dispatch/makler)
  IF v_role = ANY(ARRAY['admin','kundenbetreuer','dispatch','makler']) THEN
    RETURN QUERY
    (SELECT 'lead', l.id, concat_ws(' ', l.vorname, l.nachname),
            coalesce(l.kennzeichen, l.lead_nummer), l.status::text,
            GREATEST(similarity(concat_ws(' ',l.vorname,l.nachname), q),
                     similarity(coalesce(l.kennzeichen,''), q))
     FROM leads l
     WHERE (l.vorname||' '||l.nachname) % q OR l.kennzeichen % q OR l.lead_nummer % q
     ORDER BY 6 DESC LIMIT limit_per_type);
  END IF;

  -- ... weitere role-gated Zweige: person, sachverstaendiger(+profiles-join),
  --     werkstatt, makler, versicherung, rueckruf(admin_termine) ...
END;
$$;
```
- **Role-Gate per `IF`** (plpgsql) → nicht-anwendbare Zweige werden **komplett übersprungen** (Perf), zusätzlich zur RLS-Zeilenscopeung.
- **Ranking:** `similarity()` als `score`, je Zweig `ORDER BY score LIMIT limit_per_type`. Client gruppiert nach `entity_type`, dedupliziert (Claim-`id`) und sortiert **je Gruppe** nach `score` — **kein globales Cross-Entity-Ranking nötig** (gruppierte UI zeigt Fälle/Personen/… getrennt).
- **Grant:** `EXECUTE` an `authenticated`.

### 2. Endpoint `/api/search`

Ein Route-Handler (ersetzt die zwei bestehenden `/api/search` + `/api/gutachter/search`): liest die Session, ruft `supabase.rpc('search_global', { q, limit_per_type })` über den **User-Client**, gibt die Treffer zurück. Fehler → `{ ok:false }` / leere Liste (kein Crash).

### 3. Client `<GlobalSearch/>`

Verschmilzt `Spotlight.tsx` (admin) + `SVSpotlight.tsx` zu **einem** rollen-agnostischen Wrapper: ruft `/api/search`, **dedupliziert per Claim-`id`** (claim_nummer + mandatsnummer + kennzeichen → ein Fall), gruppiert nach `entity_type`, Klick → `routeForEntity`.

## Entitäten × Rollen (verifizierte Spalten)

| Entität | Such-Spalten | Rollen |
|---|---|---|
| Fall/Claim | `claim_nummer`, `schadenort_ort`, `polizei_aktenzeichen` | alle (RLS) |
| Fall via Kanzlei | `kanzlei_faelle.mandatsnummer` → selber Fall | admin, kundenbetreuer, kanzlei |
| Fahrzeug→Fall | `vehicles.kennzeichen_normalized` | alle (RLS) |
| Lead | `vorname+nachname`, `kennzeichen`, `lead_nummer`, `unfallort_ort` | admin, kundenbetreuer, dispatch, makler |
| Person | `vorname+nachname`, `firma`, `adresse_ort` | admin, kundenbetreuer, dispatch, kanzlei, SV |
| Sachverständiger | `firmenname` + `profiles.vorname/nachname` (Join), `standort_adresse` | admin, kundenbetreuer, dispatch |
| Werkstatt | `name`, `ansprechpartner_name`, `adresse_ort` | admin, kundenbetreuer, dispatch, SV |
| Makler | `firma`, `ansprechpartner_vorname/nachname`, `adresse_ort` | admin, kundenbetreuer, dispatch |
| Versicherung | `versicherungen.name` (Referenzdaten) | alle internen (nicht Kunde) |
| Rückruf | `admin_termine.titel` (typ=`rueckruf`) | admin, dispatch |

Kunde/Werkstatt/Makler/Flottenmanager suchen v.a. **ihre Fälle + Fahrzeuge** (RLS-eng).

## Matching-Details

- **Extension `pg_trgm`** + **GIN-Indizes** (`gin_trgm_ops`) je gematchte Spalte — eine Migration.
- **Fuzzy** via `%`-Operator (nutzt GIN-Index) + `similarity()` fürs Ranking; `pg_trgm.similarity_threshold` ~0.2-0.3 (im Plan tunen).
- **Dedup:** claim_nummer + mandatsnummer + kennzeichen → **derselbe Fall**, client-seitig per `id` kollabiert.
- **Kennzeichen-Normalisierung:** `kennzeichen_normalized` bereits vorhanden (matcht robuster als roh).

## Entry-Point / UI

- **`Spotlight` reuse** (Cmd+K).
- **Sichtbarer Such-Trigger** (Lupen-Icon) in jedem Portal-Header → dieselbe Palette (mobil/Kunde/Werkstatt erreichbar).
- **Ein `<GlobalSearch/>`** statt zwei Wrapper (entfernt Duplikation).
- **Gruppierte Treffer** (Fälle / Personen / Fahrzeuge / …), Klick → Detail.

## Routing

Shared **`routeForEntity(entity_type, id, rolle)`** in `src/lib/search/` (spiegelt `routeForKontext` aus `split.ts`):
- `claim` → rollen-bewusst (kunde `/kunde/faelle/[id]`, sv `/gutachter/fall/[id]`, makler `/makler/akten/[id]`, admin/dispatch `/faelle/[id]`; kanzlei/werkstatt/flottenmanager im Plan bestätigen).
- `lead` → `/dispatch/leads/[id]`; `sachverstaendiger` → `/admin|dispatch/sachverstaendige/[id]`; `rueckruf` → `/dispatch/rueckrufe?open=[id]`.
- Person/Werkstatt/Makler/Versicherung → Detail-Route je Entität **im Plan final** (manche → verknüpfter Fall / Admin-Detail / gefilterte Liste).

## Slicing

- **Slice 1 — Fundament** (kollisionsarm): pg_trgm-Migration · `search_global` für Fall/Fahrzeug/Lead/Person · `<GlobalSearch/>`-Unify · **bestehende admin/SV-Suche auf fuzzy umstellen**.
- **Slice 2 — Rollout:** Such-Trigger + Palette in die 6 suchlosen Portale. ⚠ **Koordination portal-header-phase2** (Session 7ca8e37c, Shells).
- **Slice 3 — Rest-Entitäten:** SV/Werkstatt/Makler/Versicherung/Rückruf + deren Routing.
- **Slice 4 (optional):** Ranking-Tuning (Recency-Boost), „Alle Ergebnisse"-Seite.

## Testing

- **RLS-Leak-Tests pro Rolle (kritisch für INVOKER-RPC):** 2 Mandanten seeden, als Kunde A suchen → NUR A's Fall, nie B's.
- Entitäts-Menge-pro-Rolle (Kunde bekommt keine Leads).
- Fuzzy ('Schmit'→'Schmidt'), Dedup (ein Fall aus 3 Identifiern), Min-Länge-Guard (<2 → leer).
- Client: `routeForEntity`, Parsing/Dedup (unit).

## Non-Goals (YAGNI)

- Kein Volltext/`tsvector`, keine Schadenbeschreibung/Notizen/Chat-Suche in v1.
- Keine Dokument-/OCR-Inhaltssuche.
- Keine eigene Such-Ergebnis-Vollseite in Slice 1 (optional Slice 4).

## Offen / im Plan zu klären

- Exakte Detail-Routen für Person/Werkstatt/Makler/Versicherung (haben teils keine eigene View).
- Rollen-Liste final gegen `profiles.rolle`-Enum bestätigen.
- `pg_trgm`-Threshold final tunen (Start ~0.25).
- `vehicles`↔`claims`-Join-Spalte + `claims.operative_status`-Spaltenname im Plan gegen die DB verifizieren (RPC-Sketch ist illustrativ).

## Cross-Lane

- **portal-header-phase2 (7ca8e37c):** Slice 2 fasst Portal-Shells an → vor Bau re-koordinieren (Marker).
- **notif-badges (`routeForKontext`):** `routeForEntity` spiegelt dessen Muster — konsistent halten.
