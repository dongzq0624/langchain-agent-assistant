// =============================================
// AI 入职助手 — PM2 进程管理配置
// =============================================

module.exports = {
  apps: [
    {
      name: 'ai-onboarding',
      script: './node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none',

      // 👇 修复这里！！！
      cwd: './',  // 原来写的是 ./backend 错误！

      node_args: '--max-old-space-size=2048',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './backend/logs/error.log',
      out_file: './backend/logs/out.log',
      log_file: './backend/logs/combined.log',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};