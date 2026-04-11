-- KFZ-203: Dispatch als eigene Rolle
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'dispatch' AFTER 'leadbearbeiter';
