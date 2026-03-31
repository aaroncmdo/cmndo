-- KFZ-69: Fix broken links in benachrichtigungen
-- /admin/leads/ → /admin/dispatch/lead/ (korrekte Route)
UPDATE benachrichtigungen SET link = REPLACE(link, '/admin/leads/', '/admin/dispatch/lead/') WHERE link LIKE '/admin/leads/%';
-- Null links → Dashboard
UPDATE benachrichtigungen SET link = '/admin' WHERE link IS NULL;
