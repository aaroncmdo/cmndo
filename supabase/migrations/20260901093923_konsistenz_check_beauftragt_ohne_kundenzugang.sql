-- Waechter fuer eine STILLE Luecke: beauftragt, aber ohne Zugang zum eigenen Fall.
--
-- Die Kunden-Kontoanlage laeuft CLIENT-seitig NACH der SA-Unterschrift
-- (FlowWizardKfz -> createKundeAccount -> finalizeKundeSetup). Der Claim entsteht
-- server-seitig und ist damit sicher; alles danach haengt am offenen Browser-Tab:
-- geschaedigter_user_id (ohne die sperrt die RLS-Policy den Kunden aus seinem EIGENEN
-- Fall aus), claim_parties.user_id, die Pflichtdokumente und die Willkommens-
-- Benachrichtigung `kunde.account_bereit`. Schliesst der Kunde den Tab zu frueh,
-- faellt das alles aus — ohne Fehler, ohne Meldung, ohne Nachholpfad.
--
-- ⚠ Gemessen 01.09.2026, bevor dieser Waechter gebaut wurde: von 5 ECHTEN Kunden mit
-- unterschriebener SA (90 Tage) hatten 5 Konto UND Owner — also **0 eingetretene
-- Schaeden**. Es ist ein Risiko, kein laufender Vorfall. Deshalb ein Waechter (macht
-- das Stille sichtbar) statt eines Umbaus der Abschluss-Strecke.
--
-- Doppelt gegen Testdaten gefiltert, damit der Waechter nicht ab Tag 1 Rauschen ist:
-- claims.ist_testfall ist NEU und traegt im Altbestand `false` (14 Treffer allein
-- darauf), das interne Email-Muster faengt den Rest. Beide zusammen: Baseline 0.
-- ">1 h alt" schliesst Faelle aus, die gerade mitten im Flow stehen.
--
-- Umbau statt Neuschrift: die Funktion ist ~7 KB mit sieben bestehenden Checks. Sie
-- abzuschreiben riskiert, einen davon still zu verlieren. Der Block liest deshalb die
-- LEBENDE Definition, fuegt Check 8 vor dem Slack-Block ein und bricht LAUT ab, wenn
-- der Anker fehlt (Funktion inzwischen geaendert) — statt still nichts zu tun.

do $mig$
declare
  v_def   text;
  v_anker constant text := '  -- Slack-Alert wenn Findings';
  v_check constant text := $check$  -- Check 8 (01.09.2026): beauftragt, aber ohne Zugang zum eigenen Fall.
  -- Kontoanlage laeuft client-seitig nach der SA-Unterschrift; bricht der Tab vorher ab,
  -- bleibt geschaedigter_user_id NULL -> RLS sperrt den Kunden aus seinem eigenen Claim.
  -- Testdaten doppelt gefiltert (ist_testfall + internes Email-Muster) -> Baseline 0.
  SELECT count(*) INTO v_count
    FROM public.claims c
    JOIN public.leads l ON l.id = c.lead_id
   WHERE c.sa_unterschrieben IS TRUE
     AND c.geschaedigter_user_id IS NULL
     AND c.ist_testfall IS NOT TRUE
     AND l.email !~* '(@claimondo\.(de|test)|@example\.|lex-drive\.com)'
     AND l.email !~* '(^|[._+-])(test|smoke|e2e)([._+-]|@)'
     AND c.sa_unterschrieben_am BETWEEN now() - interval '30 days'
                                    AND now() - interval '1 hour';
  IF v_count > 0 THEN
    v_findings    := v_findings || jsonb_build_object('beauftragt_ohne_kundenzugang', v_count);
    v_count_total := v_count_total + v_count;
  END IF;
$check$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cron_konsistenz_check';

  if v_def is null then
    raise exception 'cron_konsistenz_check existiert nicht — Migration abgebrochen';
  end if;

  if position('beauftragt_ohne_kundenzugang' in v_def) > 0 then
    raise notice 'Check 8 bereits vorhanden — idempotent uebersprungen';
    return;
  end if;

  if position(v_anker in v_def) = 0 then
    raise exception 'Anker "%" nicht gefunden — die Funktion hat sich geaendert. '
                    'Migration bricht ab, statt an falscher Stelle einzufuegen.', v_anker;
  end if;

  v_def := replace(v_def, v_anker, v_check || chr(10) || v_anker);
  execute v_def;
end
$mig$;