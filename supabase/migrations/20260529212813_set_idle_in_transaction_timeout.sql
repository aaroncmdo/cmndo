-- Killt Connections, die in einer offenen Transaktion >60s idle haengen.
-- Schuetzt vor Connection-Stau durch vergessene/abgebrochene Transaktionen.
-- Wirkt fuer alle NEUEN Connections zur Datenbank.
alter database postgres set idle_in_transaction_session_timeout = '60s';
