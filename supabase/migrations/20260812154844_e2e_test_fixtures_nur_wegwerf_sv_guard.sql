-- Schutz fuer public.e2e_test_fixtures (12.08.) — direkt aus einem eigenen Beinaheschaden.
--
-- Die Tabelle ist scharf: ein Eintrag laesst den Test-SV-Guard den SV als "Test" werten.
-- Steht dort versehentlich ein ECHTER Partner-SV, blockt der Guard fuer ihn jede Buchung
-- durch einen echten Kunden (Matrix echt->Test = BLOCK) — er faellt still aus dem Geschaeft.
-- Genau das ist beim Integrations-Check der Vorgaenger-Migration passiert: eine Probe-Query
-- nahm blind `where ist_testaccount = false limit 1` und traf einen echten Gutachter. Ohne
-- deployten Guard-Code folgenlos, mit Deploy waere es ein Prod-Incident gewesen.
--
-- Deshalb: nur E2E-Wegwerf-SVs duerfen eingetragen werden. Kriterium = die Profil-Email
-- traegt einen Test-Marker (test|smoke|e2e an Wortgrenze) UND eine interne Domain — dieselbe
-- Form wie istInterneEmail (src/lib/testdaten/interne-identitaet.ts). Ein Partner-SV mit
-- externer Adresse kann damit gar nicht erst eingetragen werden.
--
-- Bewusst ein Trigger und kein CHECK: das Kriterium haengt an einer anderen Tabelle
-- (profiles), ein CHECK darf nicht per Subquery auf Fremdtabellen zugreifen.

create or replace function public.e2e_fixture_nur_wegwerf_sv()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
begin
  select p.email into v_email
  from public.sachverstaendige s
  join public.profiles p on p.id = s.profile_id
  where s.id = new.sv_id;

  if v_email is null then
    raise exception 'e2e_test_fixtures: SV % hat kein Profil mit Email — Eintrag abgelehnt', new.sv_id;
  end if;

  if split_part(lower(v_email), '@', 2) not in
       ('claimondo.de','claimondo.test','claimondo-test.de','example.com','example.org','example.net','example.de','lex-drive.com')
     or lower(v_email) !~ '(^|[.+_-])(test|smoke|e2e)([.+_@-]|$)'
  then
    raise exception
      'e2e_test_fixtures: nur E2E-Wegwerf-SVs zulaessig (interne Domain + test/smoke/e2e-Marker). "%" ist keiner — ein echter Partner-SV waere damit fuer Kunden unbuchbar.',
      v_email;
  end if;

  return new;
end
$function$;

drop trigger if exists e2e_fixture_nur_wegwerf_sv_trg on public.e2e_test_fixtures;
create trigger e2e_fixture_nur_wegwerf_sv_trg
  before insert or update on public.e2e_test_fixtures
  for each row execute function public.e2e_fixture_nur_wegwerf_sv();

comment on function public.e2e_fixture_nur_wegwerf_sv() is
  'Laesst in e2e_test_fixtures nur SVs zu, deren Profil-Email ein E2E-Wegwerf-Konto ist (interne Domain + test/smoke/e2e-Marker). Verhindert, dass ein echter Partner-SV versehentlich als Test-SV klassifiziert und dadurch fuer echte Kunden unbuchbar wird.';
