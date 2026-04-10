-- KFZ-140 Audit Fix: Spalte 'fin' umbenennen zu 'fin_vin' (UI erwartet fin_vin)
ALTER TABLE faelle RENAME COLUMN fin TO fin_vin;
