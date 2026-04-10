-- KFZ-152 Phase 2+3 Hotfix (vom Smoke-Test gefangen):
-- Der Lead-Dispatcher (sv-zuweisung) setzt fuer Akademie-Pool-Routing
-- status='sv-gesucht', aber dieser Enum-Wert fehlte. Ohne diese Migration
-- waere jede Pool-Zuweisung in Production mit 22P02 invalid input value
-- gestorben (was kein Test je gefangen hat — bis jetzt).
ALTER TYPE fall_status ADD VALUE IF NOT EXISTS 'sv-gesucht' BEFORE 'sv-zugewiesen';
