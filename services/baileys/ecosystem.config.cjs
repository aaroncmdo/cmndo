// PM2-Config für Baileys-Service auf VPS.
// Start: pm2 start ecosystem.config.cjs
// Auto-Restart bei Crash + bei Memory-Exceed.

module.exports = {
  apps: [
    {
      name: 'claimondo-baileys',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1, // 1 Account = 1 Service
      exec_mode: 'fork',
      max_memory_restart: '500M',
      autorestart: true,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        BAILEYS_PORT: '3055',
        BAILEYS_AUTH_DIR: './auth_info_baileys',
        // BAILEYS_AUTH_TOKEN: '<aus .env oder pm2 set>',
      },
      out_file: 'logs/baileys-out.log',
      error_file: 'logs/baileys-err.log',
      merge_logs: true,
      time: true,
    },
  ],
}
