#!/usr/bin/env python3
"""Append-only Sync der Marketing-Keys (ELEVENLABS_API_KEY, PEXELS_API_KEY)
in die kanonische prod-VPS-Env /etc/claimondo/.env.local.

Sicherheit (analog scripts/vps-env-sync.py):
  * APPEND-ONLY + IDEMPOTENT: vorhandene Remote-Keys werden NIE ueberschrieben.
  * BACKUP vor Write (.bak-marketing).
  * KEINE WERTE IM OUTPUT: nur Key-Namen + Zaehler.
  * Werte werden aus poc/.env gelesen (nicht aus argv) -> keine Secrets in der Shell.
  * Passwort via env VPS_SSH_PASSWORD.
  * DRY-RUN default; echtes Schreiben nur mit --apply.

Usage:
  VPS_SSH_PASSWORD=... python vps-set-marketing-keys.py            # dry-run
  VPS_SSH_PASSWORD=... python vps-set-marketing-keys.py --apply    # schreibt
"""
import os
import re
import sys

import paramiko

HOST = '212.132.119.110'
USER = 'root'
REMOTE = '/etc/claimondo/.env.local'
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
WANT = ['ELEVENLABS_API_KEY', 'PEXELS_API_KEY']


def load_env(path):
    d = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line.rstrip('\r\n'))
            if m:
                d[m.group(1)] = m.group(0)  # ganze Zeile KEY=VALUE
    return d


def main():
    apply = '--apply' in sys.argv
    pw = os.environ.get('VPS_SSH_PASSWORD')
    if not pw:
        print('Kein VPS_SSH_PASSWORD gesetzt.', file=sys.stderr)
        return 2

    local = load_env(SRC)
    considered = []
    for k in WANT:
        if k not in local:
            print(f'  SKIP {k}: nicht in poc/.env')
            continue
        val = local[k].split('=', 1)[1].strip().strip('"').strip("'")
        if not val or val.lower() in ('changeme', 'placeholder', 'todo'):
            print(f'  SKIP {k}: leer/Platzhalter')
            continue
        considered.append((k, local[k]))

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=pw, timeout=20, allow_agent=False, look_for_keys=False)
    try:
        sftp = client.open_sftp()
        with sftp.open(REMOTE, 'r') as f:
            remote_txt = f.read().decode('utf-8')
        remote_keys = set(re.findall(r'^([A-Za-z_][A-Za-z0-9_]*)=', remote_txt, re.M))

        to_append = [(k, full) for (k, full) in considered if k not in remote_keys]
        already = [k for (k, _) in considered if k in remote_keys]

        print(f'Remote-Keys aktuell: {len(remote_keys)}')
        if already:
            print(f'Bereits vorhanden (skip): {already}')
        print(f'WUERDE ERGAENZEN ({len(to_append)}): {[k for k, _ in to_append]}')

        if not apply:
            print('DRY-RUN — keine Aenderung. Mit --apply schreiben.')
            return 0
        if not to_append:
            print('Nichts zu ergaenzen.')
            return 0

        bak = REMOTE + '.bak-marketing'
        _i, _o, _e = client.exec_command(f'cp {REMOTE} {bak}')
        _o.channel.recv_exit_status()

        prefix = '' if remote_txt.endswith('\n') else '\n'
        block = (prefix + '\n# --- marketing content-studio keys (2026-07-13) ---\n'
                 + '\n'.join(full for _, full in to_append) + '\n')
        with sftp.open(REMOTE, 'a') as f:
            f.write(block)

        with sftp.open(REMOTE, 'r') as f:
            new_txt = f.read().decode('utf-8')
        new_keys = set(re.findall(r'^([A-Za-z_][A-Za-z0-9_]*)=', new_txt, re.M))
        failures = [k for k, _ in to_append if k not in new_keys]
        print(f'Remote-Keys nachher: {len(new_keys)}  (Backup: {bak})')
        print(f'Append-Verify-Fehler: {failures or "keine"}')
        return 1 if failures else 0
    finally:
        client.close()


if __name__ == '__main__':
    sys.exit(main())
