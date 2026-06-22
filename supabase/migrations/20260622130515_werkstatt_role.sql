-- Werkstatt-Vermittler WP-A Task 1: neue Rolle 'werkstatt' im user_role-enum.
-- Eigene Migration (ALTER TYPE ADD VALUE ist nicht transaktional rückrollbar + darf
-- nicht im selben Tx wie eine Nutzung stehen). Consumer: profiles.rolle + portal-guard.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'werkstatt';
