-- BUG-FOLLOW-1 (aus KFZ-152 Phase 1 Browser-Test):
-- sachverstaendige.portal_zugang_freigeschaltet hatte den falschen Default true,
-- was den Hard-Blocker aus KFZ-148 ausgehebelt haette wenn ein Insert ohne
-- explizite Angabe gemacht wuerde. Code arbeitet seit BUG-A.3 Fix drumherum
-- indem er das Feld bei jedem Insert explizit auf false setzt - das hier ist
-- der saubere Schema-Fix.

-- Bestehende Records werden NICHT umgestellt: alle bezahlten SVs sollen
-- freigeschaltet bleiben, alle pending SVs haben den Wert eh schon explizit
-- auf false (durch BUG-A.3 Code-Fix).

ALTER TABLE sachverstaendige
  ALTER COLUMN portal_zugang_freigeschaltet SET DEFAULT false;
