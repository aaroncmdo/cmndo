-- AAR-461 F3: Enum-Erweiterung user_role um 'makler'.
-- Separate Migration weil ALTER TYPE ADD VALUE eigene Transaction braucht
-- bevor der neue Wert genutzt werden kann.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'makler';;
