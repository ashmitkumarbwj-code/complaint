/**
 * PM2 ecosystem file for Smart Campus SCRS
 * Usage: pm2 start ecosystem.config.cjs
 * Or:    npx pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'smart-campus',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
