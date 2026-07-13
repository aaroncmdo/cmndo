-- #8 Vermittler-SSoT Phase 1 (Aaron 13.07. "vermittler ssot ist gut"): EINE Spalte, die den
-- EINEN inbound-Vermittler pro Claim festhaelt (wer hat uns den Claim gebracht -> genau eine Provision).
-- Konsolidiert die verstreuten INBOUND-Signale (makler_id / werkstatt_id=inbound-QR / flotte-via-vehicle).
-- OUTBOUND (reparatur_werkstatt_id, sv_id) ist bewusst NICHT enthalten (keine Provision).
-- Phase 1 = reine Daten-SSoT (additiv). Phase 2 (Convert-Write + Trigger-Gates) folgt separat.
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS vermittler_typ text
  CHECK (vermittler_typ IS NULL OR vermittler_typ IN ('makler', 'werkstatt', 'firmen_flotte'));
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS vermittler_id uuid;

COMMENT ON COLUMN public.claims.vermittler_typ IS 'SSoT: der EINE inbound-Vermittler dieses Claims (makler|werkstatt|firmen_flotte). NULL=direkt/kein Vermittler. OUTBOUND (reparatur_werkstatt_id/sv_id) ist KEIN Vermittler.';
COMMENT ON COLUMN public.claims.vermittler_id IS 'SSoT: ID des inbound-Vermittlers (makler.id | werkstatt.id | firmen_flotten_konten.id), passend zu vermittler_typ.';

-- Backfill aus Ist-Signalen (Praezedenz: makler > werkstatt-inbound > firmen_flotte).
UPDATE public.claims c SET
  vermittler_typ = CASE
    WHEN c.makler_id IS NOT NULL THEN 'makler'
    WHEN c.werkstatt_id IS NOT NULL THEN 'werkstatt'
    WHEN EXISTS (SELECT 1 FROM public.flotten_fahrzeuge ff
                 JOIN public.firmen_flotten_konten k ON k.firma_id = ff.firma_id AND k.status = 'aktiv'
                 WHERE ff.vehicle_id = c.vehicle_id) THEN 'firmen_flotte'
    ELSE NULL
  END,
  vermittler_id = CASE
    WHEN c.makler_id IS NOT NULL THEN c.makler_id
    WHEN c.werkstatt_id IS NOT NULL THEN c.werkstatt_id
    ELSE (SELECT k.id FROM public.flotten_fahrzeuge ff
          JOIN public.firmen_flotten_konten k ON k.firma_id = ff.firma_id AND k.status = 'aktiv'
          WHERE ff.vehicle_id = c.vehicle_id LIMIT 1)
  END
WHERE c.makler_id IS NOT NULL OR c.werkstatt_id IS NOT NULL OR c.vehicle_id IS NOT NULL;
