# AAR-939 · Monika-Embed · Stream 8 — Billing-Cron (Spec/Handoff)

**Datum:** 30.05.2026 · **Status:** ✅ GEBAUT — Trigger appliziert (recorded `20260530171504`, verifiziert `secdef:true`, Def exakt) + Cron-Route fertig. Hook = `durchgefuehrt_am` (Aaron-Freigabe). OFFEN: Stream 8b (SV-„Besichtigung abgeschlossen"-Button — `markTerminDurchgefuehrt` ist auftrag-gebunden verdrahtet) + VPS-Crontab-Eintrag + PR-Merge.
**Worktree:** `.claude/worktrees/aar-939-monika-billing` (Branch `kitta/aar-939-monika-billing`, auf staging rebased — enthält Stream 1-7)

## Locked Architektur (Aaron 30.05.)

**Termin = orthogonaler Lifecycle** zu Aufträgen UND Leads. Der Abschluss („durchgeführt") passiert **auf DB-Ebene**, nicht im App-Code. Monika-Termine sind **claim-irrelevant** — kein Gutachten, kein Fall, kein Claim. Reiner Termin→Billing-Pfad.

**Billing-Trigger = DB-Trigger** (NICHT App-Setter, NICHT completeTermin-Action). Entkoppelt das €70-Billing vom UI-Pfad — feuert egal wer `status='durchgeführt'` setzt (SV-Portal, Dispatch, künftiger App-Pfad).

### Verifizierter Ausgangsbefund (30.05., gegen gemergtes staging)
- **KEIN** Code setzt `abrechnungs_relevant` (grep `src/` = 0 Treffer) → Stream 8 muss den Setter liefern.
- Nur `completeBegutachtung` (src/lib/termine/actions.ts:399) existiert — fall-gebunden (`typ='sv_begutachtung'`, `transitionFallStatus(fall_id)`), feuert NICHT für lead-only-Monika-Termin.
- Bestehender Trigger `tg_termin_sync_auftrag_status` returnt sofort bei `auftrag_id IS NULL` → für Monika-Termin tot. NICHT hineinbauen.
- Stream 6/7 (#2051 merged): SV-Portal (embed-sites-Wizard) + Inbox (`v_sv_inbox`, Migration 20260530133433) — aber KEIN Termin-Abschluss-Mechanismus.

## Teil 1 — Trigger-Migration (DDL, via apply_migration sobald Pooler lebt)

**LIVE-VERIFIZIERT 30.05. (Pooler-Fenster):** `gutachter_termine.status`-CHECK = `reserviert, bestaetigt, abgelehnt, abgesagt, storniert, abgeschlossen, sv_gesucht, gegenvorschlag, verschoben, verlegt, verlegung_pending`. **KEIN `'durchgefuehrt'`** → der Abschluss-Status für Monika-Termine ist **`'abgeschlossen'`** (live in Benutzung). `durchgefuehrt_am`-Spalte existiert separat. (completeBegutachtung schreibt status='durchgefuehrt' — NICHT im CHECK, latenter Fall-Bug, nicht Monika-Scope.)
embed_sites: `sv_id` + `einzelpreis_eur` ✓. sachverstaendige: nur `id/ist_aktiv/profile_id` → **Email via profiles** (profile_id-Join). Buckets `abrechnungen-pdf` + `abrechnungen` existieren. gfa-Billing-Spalten + embed_abrechnung_positionen ✓.

```sql
-- AAR-939 Stream 8: Billing-Trigger. Setzt abrechnungs_relevant wenn ein
-- Monika-Embed-Termin (Variante B) abgeschlossen wurde. Claim-unabhängig.
CREATE OR REPLACE FUNCTION public.tg_embed_termin_billing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- nur beim Übergang NACH 'abgeschlossen' (live verifizierter Terminal-Status)
  IF NEW.status = 'abgeschlossen' AND OLD.status IS DISTINCT FROM 'abgeschlossen' THEN
    UPDATE public.gutachter_finder_anfragen gfa
       SET abrechnungs_relevant   = true,
           abrechnungs_betrag_eur = COALESCE(
             (SELECT einzelpreis_eur FROM public.embed_sites es WHERE es.id = gfa.embed_site_id),
             70.00)
     WHERE gfa.termin_id = NEW.id
       AND gfa.source   = 'sv_embed'
       AND gfa.variante = 'B'
       AND gfa.abrechnungs_relevant IS NOT TRUE
       AND gfa.abrechnung_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS embed_termin_billing ON public.gutachter_termine;
CREATE TRIGGER embed_termin_billing
  AFTER UPDATE OF status ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.tg_embed_termin_billing();
```

> **VOR Apply live verifizieren (Pooler):** (1) `gutachter_termine.status`-CHECK enthält `'durchgefuehrt'` (completeBegutachtung setzt genau das); (2) gfa-Spalten `termin_id/source/variante/abrechnungs_relevant/abrechnungs_betrag_eur/abrechnung_id` existieren (Stream 1, Migration 20260529154412 — bestätigt im File); (3) `einzelpreis_eur` auf embed_sites (bestätigt: Migration 20260529154349, default 70.00). Nach Apply: list_migrations → File `<recorded>_aar939_embed_termin_billing.sql` (Twin-Drift! Plugin-Timestamp ≠ geraten).

## Teil 2 — Billing-Cron (Code, 1:1 nach src/app/api/cron/abrechnung-erstellen/route.ts)

**Files:**
- `src/app/api/cron/embed-abrechnung-erstellen/route.ts` — Bearer `CRON_SECRET`, Monats-Self-Check (nur letzter Tag), pro SV gruppieren, Kopf+Positionen+PDF+Email. NUR VPS-crontab, KEIN vercel.json.
- `src/lib/abrechnung/embed/generate-pdf.tsx` — react-pdf, nach kanzlei/generate-pdf.tsx (renderToBuffer + NAVY/ONDO inline-hex + Token-Audit-Skip-Header). Bucket: prüfen ob 'abrechnungen' oder 'abrechnungen-pdf' (Vorlage nutzt 'abrechnungen', Pfad kanzlei/<jahr>/<nr>.pdf).
- `src/lib/abrechnung/embed/erstelle-embed-abrechnung.ts` — Service (hält Route schlank).

**SV-Email-Auflösung:** embed_sites.sv_id → sachverstaendige.id → **profiles via profile_id** (`profiles.email/vorname/nachname`) — wie SV-Lead-Cron (route.ts:113), NICHT direkt sachverstaendige.email. ABER: embed_sites hat eigenes `empfaenger_email` (default info@claimondo.de) — Aaron klären ob SV-Rechnung an SV-profile-email ODER embed_sites.empfaenger_email geht.

**abrechnungen-Kopf:** empfaenger_typ='sv', empfaenger_id=sachverstaendige.id, empfaenger_email/name, abrechnungs_nr, abrechnungs_zeitraum_start/ende (date), positionen (jsonb NOT NULL!), summe_netto, ust_satz=19, ust_betrag, summe_brutto, status='versendet', faellig_am, versand_datum.

**Rechnungsnr:** `CMNDO-EMB-{YYYY}-{MM}-{NNN}` — via `abrechnungs_nr LIKE 'CMNDO-EMB-%'` zählen (NICHT empfaenger_typ='sv', sonst Lead-Kollision).

**embed_abrechnung_positionen:** abrechnung_id, embed_site_id, anfrage_id (UNIQUE partiell), termin_id, einzelpreis_eur, leistung_text. Spalten bestätigt Migration 20260529154425.

**Idempotenz (4 Schichten):** Self-Check + Kopf-Lookup (sv+Monat+EMB-prefix) + `abrechnung_id IS NULL`-Guard auf gfa + UNIQUE(anfrage_id).

**Selektion:** `gfa WHERE abrechnungs_relevant=true AND abrechnung_id IS NULL AND source='sv_embed'`, Monatsfenster über Termin-durchgefuehrt_am. Nach Insert: `UPDATE gfa SET abrechnung_id=<kopf>, abgerechnet_am=now()`.

**Email:** SvMonatsabrechnungVersand-Template reuse + sendEmail (google/client) mit PDF-Attachment, non-fatal try/catch.

## Warum pausiert
Supabase-Pooler (paizkjajbuxxksdoycev) flappt 30.05. mit 522/Connection-Timeout → `apply_migration` für den Trigger geht nicht, Live-Schema-Verifikation geht nicht. Den Cron jetzt blind committen ohne applizierten/verifizierten Trigger = halbgar (Billing-Pfad nicht end-to-end testbar). Bauen + applizieren + verifizieren in EINER Session sobald Pooler lebt.

## Offene Aaron-Fragen (nicht-blockierend)
- SV-Rechnung-Email: profiles.email (SV) ODER embed_sites.empfaenger_email?
- Fälligkeitsfrist (SV-Lead-Vorlage = 14. Folgemonat)?
- Storage-Bucket: 'abrechnungen' (kanzlei-Vorlage) übernehmen?
