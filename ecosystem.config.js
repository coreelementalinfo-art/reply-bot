module.exports = {
  apps: [
    {
      name: "crm-bot",
      script: "src/app.ts",
      interpreter: "ts-node",

      watch: false,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      env: {
        NODE_ENV: "production"
      },

      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true
    }
  ]
};