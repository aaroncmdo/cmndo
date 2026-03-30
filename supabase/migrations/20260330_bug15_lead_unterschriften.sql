-- BUG-15: SA + Vollmacht gehoeren in den Lead (vor FlowLink-Versand)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sa_datum TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vollmacht_unterschrieben BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vollmacht_datum TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS mandatstyp TEXT DEFAULT 'claimondo'
  CHECK (mandatstyp IN ('claimondo', 'kanzlei-claimondo'));
