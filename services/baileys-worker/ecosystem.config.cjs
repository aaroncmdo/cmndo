// AAR-898: PM2-Config fuer den Baileys-WhatsApp-Worker.
// Auf dem VPS deployen: cd /opt/claimondo-baileys && pm2 start ecosystem.config.cjs
// Aaron-Manual nach erstem Start: pm2 logs claimondo-baileys → QR scannen.

module.exports = {
  apps: [
    {
      name: 'claimondo-baileys',
      script: 'dist/server.js',
      cwd: '/opt/claimondo-baileys',
      env: {
        NODE_ENV: 'production',
        PORT: '4001',
        HOST: '127.0.0.1',
        BAILEYS_AUTH_DIR: '/etc/claimondo/baileys-auth',
        // BAILEYS_INTERNAL_TOKEN: aus /etc/claimondo/.env.local sourcen
      },
      env_file: '/etc/claimondo/.env.local',
      max_memory_restart: '300M',
      restart_delay: 5_000,
      autorestart: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
