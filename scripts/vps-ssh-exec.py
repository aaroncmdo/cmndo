#!/usr/bin/env python3
"""Run a list of shell commands on the prod-VPS via paramiko.

DEV-Tool — wird nur unter expliziter `feedback_vps_claude_rolle`-Override
(Memory) vom lokalen Claude benutzt. Standardweg für VPS-Operationen ist
VPS-Claude oder Aaron selbst per interactive SSH.

Warum existiert das Skript?
  OpenSSH-Client auf Windows-Git-Bash erlaubt kein Passwort über stdin
  (TTY-Anforderung); `sshpass` ist nicht installiert. paramiko ist die
  pragmatische Brücke.

Sicherheits-Hinweise
  - Passwort über ENV-Var `VPS_SSH_PASSWORD` bevorzugen; CLI-Arg ist in
    `ps aux` sichtbar (akzeptabel auf Single-User-Laptop, kein CI-Pfad).
  - `AutoAddPolicy` akzeptiert beliebige Host-Keys → nur in vertrauter
    Netzwerk-Umgebung verwenden. Für CI/Server-zu-Server lieber feste
    `known_hosts`-Einträge.

Usage
  VPS_SSH_PASSWORD=... python scripts/vps-ssh-exec.py <cmd1> [cmd2] [...]
  # oder (CLI-Arg-Fallback, weniger sicher):
  python scripts/vps-ssh-exec.py --password <pw> <cmd1> [cmd2] [...]
"""
import argparse
import os
import sys

try:
    import paramiko
except ImportError:
    print('paramiko fehlt — `pip install paramiko` ausführen.', file=sys.stderr)
    sys.exit(2)

HOST = '212.132.119.110'
USER = 'root'


def run(commands: list[str], password: str) -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username=USER,
        password=password,
        timeout=20,
        allow_agent=False,
        look_for_keys=False,
    )
    exit_code = 0
    try:
        for cmd in commands:
            print(f'\n--- $ {cmd}', flush=True)
            _, stdout, stderr = client.exec_command(cmd, timeout=60)
            out = stdout.read().decode('utf-8', errors='replace')
            err = stderr.read().decode('utf-8', errors='replace')
            rc = stdout.channel.recv_exit_status()
            if out.strip():
                print(out.rstrip())
            if err.strip():
                print('STDERR:', err.rstrip(), file=sys.stderr)
            print(f'(exit={rc})', flush=True)
            if rc != 0:
                exit_code = rc
    finally:
        client.close()
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Run remote shell commands on the prod-VPS via paramiko.',
    )
    parser.add_argument(
        '--password',
        help='SSH password (Fallback wenn VPS_SSH_PASSWORD nicht gesetzt). '
             'Sichtbar in `ps aux` — ENV-Var bevorzugen.',
    )
    parser.add_argument('commands', nargs='+', help='Shell-Commands sequenziell auf dem VPS ausführen.')
    args = parser.parse_args()

    pw = os.environ.get('VPS_SSH_PASSWORD') or args.password
    if not pw:
        print(
            'Kein Passwort angegeben. Setze VPS_SSH_PASSWORD oder --password.',
            file=sys.stderr,
        )
        return 2
    return run(args.commands, pw)


if __name__ == '__main__':
    sys.exit(main())
