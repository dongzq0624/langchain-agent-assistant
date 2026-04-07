#!/bin/bash

# 部署后端
echo "部署后端..."
scp -r ./backend/src/* \
  ./backend/package.json \
  ./backend/pnpm-lock.yaml \
  ./backend/tsconfig.json \
  ./backend/ecosystem.config.cjs \
  root@101.37.236.214:/opt/backend/

ssh root@101.37.236.214 << 'EOF'
  cd /opt/backend
  
  # 确保安装了 pnpm
  which pnpm || npm install -g pnpm
  
  # 使用 pnpm 安装依赖
  pnpm install --frozen-lockfile
  
  # 重启服务
  pm2 restart ai-onboarding
EOF

# 部署前端
echo "部署前端..."
cd frontend
pnpm run build
scp -r ./dist/* root@101.37.236.214:/var/www/ai-onboarding/

ssh root@101.37.236.214 << 'EOF'
  systemctl reload nginx
EOF

echo "部署完成！"
