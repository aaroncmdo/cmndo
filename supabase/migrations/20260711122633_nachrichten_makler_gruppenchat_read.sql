-- F2-Audit 2026-07-11: Der Makler-Chat-Tab (getFallChat) las den Gruppenchat nicht —
-- es gab KEINE SELECT-Policy fuer Makler auf nachrichten, also sah der Makler nur selbst
-- gesendete Nachrichten (Einweg-Spiegel; Banner versprach das Gegenteil). Aaron 2026-07-11:
-- der Makler SOLL die Team-Konversation seiner Consent-Faelle sehen.
--
-- Scope exakt wie der App-Gate (Detail-Redirect / send-message / copilot): aktiver
-- vollzugriff-Consent, nur die Gruppen-Kanaele. Interne Kanaele (chat_kb_kunde, ...) bleiben
-- fuer den Makler unsichtbar. Additiv (permissive Policies sind OR-verknuepft) -> kein
-- bestehender Zugriff wird eingeschraenkt.
CREATE POLICY nachrichten_makler_gruppenchat_read
ON public.nachrichten
FOR SELECT
TO authenticated
USING (
  kanal IN ('gruppenchat', 'chat_gruppe_mit_makler')
  AND fall_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.makler_fall_consent mfc
    JOIN public.makler m ON m.id = mfc.makler_id
    WHERE m.user_id = (SELECT auth.uid())
      AND mfc.fall_id = nachrichten.fall_id
      AND mfc.widerrufen_am IS NULL
      AND mfc.consent_scope = 'vollzugriff'
  )
);
