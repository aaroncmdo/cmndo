-- Phase 2: Thread-native Nachrichten haben kanal=null (thread_id ist die Zuordnung).
-- Alte kanal-Reader (WHERE kanal='...') matchen null NICHT -> keine Leak-Gefahr, saubere Trennung.
-- Additiv/sicher: Bestandszeilen haben alle kanal gesetzt; nur zukuenftige duerfen null sein.
-- Die CHECK-Constraint (kanal in (...)) passt bei null (CHECK schlaegt nur bei FALSE fehl).
alter table public.nachrichten alter column kanal drop not null;
