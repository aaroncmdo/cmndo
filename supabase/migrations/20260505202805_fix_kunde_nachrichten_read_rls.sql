-- Fix: Kunde-RLS-Policy auf nachrichten verwendete Legacy-Kanal-Namen.
--
-- Bug: kunde_nachrichten_read filterte auf kanal IN ('portal-kunde-claimondo',
-- 'portal-kunde-gutachter'). Der aktuelle Code (KundeKbChat, sendKundeChatMessage,
-- inbox-threads) nutzt aber 'chat_kb_kunde' / 'chat_kunde_sv' / 'gruppenchat'
-- (Migration AAR-102, ~2025-12). Der Kunde konnte seine eigenen frisch
-- gesendeten Nachrichten nicht zurueck-lesen — Insert ging via service-role
-- durch, SELECT mit auth-Token wurde von RLS gefiltert. Realtime-Events kamen
-- damit nicht durch, Re-Fetch lieferte leere Liste — Symptom: Nachricht
-- erscheint kurz (optimistic), verschwindet dann beim naechsten useEffect-Run.
--
-- Fix:
-- 1. policy auf neue Kanal-Liste umstellen
-- 2. fall_id darf NULL sein (allgemeiner Kunde-KB-Chat ohne Fallbezug —
--    siehe sendKundeChatMessage-Action)
-- 3. Lese-Berechtigung wenn Kunde sender ODER empfaenger ODER kunde_id des
--    referenzierten Falls

DROP POLICY IF EXISTS kunde_nachrichten_read ON public.nachrichten;

CREATE POLICY kunde_nachrichten_read ON public.nachrichten
  FOR SELECT
  USING (
    kanal = ANY (ARRAY[
      'chat_kb_kunde'::text,
      'chat_kunde_sv'::text,
      'gruppenchat'::text,
      -- Legacy-Aliase weiterhin lesbar, falls noch alte Rows existieren
      'portal-kunde-claimondo'::text,
      'portal-kunde-gutachter'::text
    ])
    AND (
      nachrichten.sender_id = auth.uid()
      OR nachrichten.empfaenger_id = auth.uid()
      OR (
        nachrichten.fall_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.faelle f
          WHERE f.id = nachrichten.fall_id AND f.kunde_id = auth.uid()
        )
      )
    )
  );

COMMENT ON POLICY kunde_nachrichten_read ON public.nachrichten IS
  'Kunde liest Chat-Nachrichten der neuen Kanal-Namen (chat_kb_kunde, chat_kunde_sv, gruppenchat) wenn er Sender, Empfaenger oder Fall-Kunde ist. Legacy-Kanal-Namen weiterhin gelistet fuer alte Rows.';
