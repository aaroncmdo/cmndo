# GEO-Freshness Phase 2 — Readiness-Analyse & korrigierte Spec

**Stand:** 26.05.2026 · **Autor:** Claude-Session `geo-freshness-p1`
**Bezug:** `docs/geo/geo-freshness-und-stadt-pages-2026-05-24.md` (Original-Plan, Phase 2 / H2 + L2)
**Status Phase 1:** ✅ fertig, auf `main` (PR #1766 `c8e90598`) — siehe Anhang.

---

## TL;DR — Verdikt

**Phase 2 jetzt NICHT bauen.** Zwei harte Gründe, empirisch belegt:

1. **Datentechnisch verfrüht.** Die dynamischen Stadt-Sections (H2) hätten *nichts* anzuzeigen: von 60 claims hat genau **1** eine `schadenort_plz`, **0** sind „abstrahierbar". Die Komponenten würden auf ~84 von 85 Stadt-Pages leer rendern.
2. **Die Plan-DDL ist gegen ein falsches Schema geschrieben.** Der Plan nimmt `faelle`-Spalten an (`unfallort_plz`, `schadenssumme`, `fahrzeug_marke`, `unfall_typ`, `erstellt_am`), die so **nicht existieren**. SSoT ist `claims` (CMM-44), die Spalten heißen anders, und `faelle` wird in CMM-44 Phase 6 gedroppt.

Der Original-Plan hat Phase 2 bewusst hinter den **4-Wochen-Re-Test (~07.06.)** gelegt. Die Daten bestätigen: das war richtig. Dieses Dokument liefert die **korrigierte, claims-basierte Spec** plus ein **Definition-of-Ready-Gate**, damit Phase 2 dann ohne erneute Schema-Archäologie baubar ist.

---

## 1 · Daten-Blocker (Prod-DB, abgefragt 26.05.2026)

```
SELECT
  (SELECT count(*) FROM claims)                                       AS total_claims,        -- 60
  (SELECT count(*) FROM claims WHERE schadenort_plz IS NOT NULL)      AS with_plz,            --  1
  (SELECT count(*) FROM claims c JOIN faelle f ON f.claim_id=c.id
     WHERE c.schadenort_plz IS NOT NULL AND f.fahrzeug_hersteller IS NOT NULL
       AND c.created_at >= now() - interval '180 days')               AS abstrahierbar_180d;  --  0
```

| Metrik | Wert | Konsequenz |
|---|---|---|
| `claims` total | 60 | früher Test-/Dispatch-Bestand |
| davon mit `schadenort_plz` | **1** (Prefix `'14'`) | `FallZahlen`-Aggregat zeigt auf 84/85 Städten 0 → null-guard → unsichtbar |
| abstrahierbare Fälle (plz + Hersteller + 180d) | **0** | `AbstrahierteFaelle` ist **überall** leer |
| `claims.status`-Verteilung | `dispatch_done` (58), `in_bearbeitung` (2) | Plan-Filter `IN ('ausgezahlt','abgeschlossen')` matcht **0 Zeilen** — diese Status existieren (noch) nicht |

**Interpretation:** Das deckt sich mit der GEO-Zwischenmessung (Claimondo früh, ~0 Sichtbarkeit). Es gibt schlicht noch keine abgeschlossenen Fälle mit Schadenort-PLZ, aus denen man regionale Zahlen aggregieren könnte. Eine öffentliche Sektion „Aktuelle Zahlen aus Ihrer Region: 1 Fall" wäre ein Anti-Trust-Signal, und ein einzelner abstrahierter Fall (Marke/Modell/Monat/Schadenbucket/PLZ-Region) bei N=1 ist **re-identifizierbar** → DSGVO-Risiko.

---

## 2 · Korrigiertes Spalten-Mapping (Plan → Realität)

Quelle: `information_schema.columns` auf `claims` + `faelle`, 26.05.2026. SSoT = `claims`.

| Plan-Annahme (auf `faelle`) | Realität | Tabelle |
|---|---|---|
| `unfallort_plz` | `schadenort_plz` (varchar) | **claims** |
| `schadenssumme` | `schadens_hoehe_netto` (numeric) | claims (auch auf faelle) |
| `fahrzeug_marke` | `fahrzeug_hersteller` (text) | **nur faelle** ⚠️ |
| `fahrzeug_modell` | `fahrzeug_modell` (text) | **nur faelle** ⚠️ |
| `unfall_typ` | `unfall_konstellation` (text) / `bkat_unfallart` (enum) / `schadenart` (text) | claims |
| `status` | `status` (text: `dispatch_done`/`in_bearbeitung`/…) | claims |
| `erstellt_am` | `created_at` (timestamptz) | claims |

⚠️ **Migrations-Dependency:** `fahrzeug_hersteller`/`fahrzeug_modell` liegen *nur auf `faelle`*. CMM-44 droppt `faelle` in Phase 6. Vor jedem Build der abstrahierten View: prüfen, ob die Fahrzeug-Spalten inzwischen auf `claims` oder eine Sub-Table gezogen sind, und das Mapping nachziehen.

---

## 3 · Korrigierte View-DDL

> **Regel 2 (AGENTS.md):** Views via `npx supabase migration new add_stadt_aggregat_view` → `db push`. **Niemals** Management-API. Vorher `npx supabase db pull` zum Drift-Audit (Migrations-Files sind teils Platzhalter).

### 3a · `vw_stadt_aggregat` — claims-only, sauber, bereit

```sql
CREATE OR REPLACE VIEW public.vw_stadt_aggregat AS
SELECT
  LEFT(c.schadenort_plz, 2) AS plz_prefix,
  COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '30 days') AS faelle_30d,
  COUNT(*) FILTER (WHERE c.created_at >= NOW() - INTERVAL '90 days') AS faelle_90d,
  COUNT(*) FILTER (WHERE c.created_at >= DATE_TRUNC('year', NOW()))  AS faelle_ytd
FROM public.claims c
WHERE c.schadenort_plz IS NOT NULL
GROUP BY LEFT(c.schadenort_plz, 2);

GRANT SELECT ON public.vw_stadt_aggregat TO anon, authenticated;
```

DSGVO: reine Counts, kein Personenbezug. Trotzdem im UI hinter Min-Count-Gate (siehe §5).

### 3b · `vw_stadt_faelle_abstrahiert` — EMPFEHLUNG: STREICHEN

Gründe gegen diese View (auch wenn Daten kommen):
- **0 Zeilen** heute; selbst mit Wachstum bleibt das Volumen pro Stadt lange klein.
- **Re-Identifikations-Risiko** bei kleinen N (Marke+Modell+Monat+PLZ-Region+Schadenbucket ist quasi ein Quasi-Identifier).
- **`faelle`-Abhängigkeit** (Fahrzeug-Spalten) auf einer Tabelle, die gedroppt wird.
- Geringer GEO-Mehrwert ggü. dem Aggregat + den bereits live hyperlokalen Hub-City-Fakten (Doc 38).

Falls **dennoch** gewünscht (nach DSGVO-Review + Daten-Gate): JOIN `claims c JOIN faelle f ON f.claim_id=c.id`, `f.fahrzeug_hersteller`/`f.fahrzeug_modell`, `c.schadens_hoehe_netto`-Buckets, `c.created_at`, `COALESCE(c.unfall_konstellation,'Verkehrsunfall')`. Status-Filter: **echte abgeschlossen-Status erst gegen die State-Machine verifizieren** — aktuell existieren nur `dispatch_done`/`in_bearbeitung`. **Pflicht: `HAVING count(*) >= 5` pro angezeigtem Bucket** o.ä., damit nie ein Einzelfall durchscheint.

---

## 4 · `plzPrefix`-Range-Falle

`Stadt.plzPrefix` ist ein String und teils ein **Bereich** mit En-Dash: Köln = `'50–51'`. Das Aggregat gruppiert nach `LEFT(schadenort_plz, 2)`, liefert also getrennte Buckets `'50'` und `'51'`. Ein naives `stadt.plzPrefix.slice(0,2)` (`'50'`) im Component-Lookup **verliert die `'51'`-Fälle**.

Lösung beim Build: pro Stadt die Range parsen (`'50–51'` → `['50','51']`) und die Prefix-Buckets **summieren**, oder ein explizites `plzPrefixes: string[]`-Feld am `Stadt`-Type pflegen. Single-Prefix-Städte (`'40'`, `'53'`) sind unkritisch.

---

## 5 · Komponenten + Cache-Pattern (wenn gebaut)

Vorlage existiert: `src/app/kfzgutachter-lp/live-stats.ts` — exakt das Muster nachziehen:

- **`createServiceClient()`** (`@/lib/supabase/server`) — anon-RLS ist Default-Deny; nur aggregierte Werte verlassen den Server.
- **`unstable_cache(fetchFn, [key], { revalidate: 3600, tags: ['stadt-<slug>'] })`** — `revalidateTag` greift **nicht** bei direktem `supabase-js`, daher zwingend dieser Wrapper (sonst ist L2 wirkungslos).
- **`MIN_DISPLAY_COUNT`-Gate** (live-stats nutzt `>= 5`): liefert `null` unter Schwelle → `FallZahlen` rendert nicht. Das ist gleichzeitig der DSGVO- und der Anti-„0 Fälle"-Schutz.
- **try/catch → null** bei DB-Fehler; `<Suspense fallback={…}>` damit eine fehlende Connection die Stadt-Page nie bricht.
- Tokens/Umlaute/Komponenten-Set beachten (`FallZahlen` baut auf `shared/StatCard` statt handgerolltem Tailwind).

---

## 6 · L2-Webhook — Wert ist an H2 gekoppelt

Der geplante `/api/webhooks/content-changed` revalidiert Feeds + Stadt-Pages bei DB-Änderungen. Aber:

- **Feeds sind content-asset-basiert** (MDX/Strategic-Pages, `src/lib/feed/*`), **nicht** DB-getrieben. Ein `claims`/`sachverstaendige`-Insert ändert die Feeds nicht → `revalidatePath('/feed.xml')` im Webhook ist dafür ein No-op.
- **Stadt-Page-Revalidation** ist nur sinnvoll, *wenn* H2 (dynamische Sektionen) existiert und via `unstable_cache`-Tag `stadt-<slug>` hängt.

**→ Den Webhook erst zusammen mit H2 bauen.** Pattern dann wie `src/app/api/webhooks/lexdrive/route.ts`: `force-dynamic`, Shared-Secret (`x-webhook-secret` ODER `Authorization: Bearer`), `{ ok: boolean }`-Response (kein throw). PLZ→Stadt-Mapping über `STAEDTE` + `freshness.ts`. `SUPABASE_WEBHOOK_SECRET` als neue ENV (Vercel + Supabase-Dashboard konsistent).

---

## 7 · Definition of Ready (Build-Gate für Phase 2)

Phase 2 ist baubar, sobald **alle** zutreffen:

- [ ] 4-Wochen-Re-Test (~07.06.) gelaufen — Phase 1 hat gewirkt / gemessen.
- [ ] `claims` mit `schadenort_plz` ≥ ~50, verteilt über mehrere PLZ-Prefixe; ≥ 5 pro Prefix der angezeigt werden soll.
- [ ] (nur für 3b) abgeschlossene Status existieren — echte Werte gegen die State-Machine verifiziert.
- [ ] Verbleib von `fahrzeug_hersteller`/`fahrzeug_modell` geklärt (bleibt auf `faelle` bis Phase-6-Drop? zieht nach `claims`/Sub-Table?).
- [ ] DSGVO-Review der View-Definition(en) schriftlich abgehakt.

**Alternative ohne Fall-Daten:** Falls regionale Trust-Signale früher gewünscht sind, ist `sachverstaendige` (Anzahl geprüfter SV-Partner je Region) eine **nicht-personenbezogene** Quelle, die heute schon Volumen haben dürfte — andere Komponente als der Fall-Aggregat, aber dieselbe Cache-Mechanik.

---

## Anhang · Phase-1-Status (zur Einordnung)

Phase 1 ist vollständig auf `main` (PR #1766):

| Hebel | Beleg |
|---|---|
| H1 `lastUpdated` + Sitemap | `src/app/kfz-gutachter/freshness.ts` + `sitemap.ts` (zentrale Map statt Type-Feld — bewusst, gegen doc38-Kollision) |
| L1 ISR | `src/app/kfz-gutachter/[stadt]/page.tsx` `revalidate=3600` + `dynamicParams=false` |
| H3 LegalService-Schema | `src/lib/seo/jsonld.ts` `stadtLegalServiceSchema()` + gebunden in `[stadt]/page.tsx` |
| L3 Crons | `src/app/api/cron/refresh-feeds` + `refresh-staedte-top20` (reuse `submitToIndexNow`) |
| IndexNow-Key | inline via `src/proxy.ts` |

**Einziger offener Phase-1-Rest (Deploy, VPS — nicht Code):** Die 2 Crontab-Zeilen müssen auf dem VPS eingetragen sein (`CRON_SECRET` existiert bereits, 53 andere Crons nutzen es):

```cron
0 5 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://claimondo.de/api/cron/refresh-staedte-top20 >/dev/null 2>&1
0 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://claimondo.de/api/cron/refresh-feeds   >/dev/null 2>&1
```
