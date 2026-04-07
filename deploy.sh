#!/bin/bash

# 部署后端
echo "部署后端..."
scp -r ./backend/src/* ./backend/package.json ./backend/package-lock.json ./backend/tsconfig.json ./backend/ecosystem.config.cjs ./backend/pdfs/* root@101.37.236.214:/opt/backend/

ssh root@101.37.236.214 << 'EOF'
  cd /opt/backend
  npm install --legacy-peer-deps
  pm2 restart ai-onboarding
EOF

# 部署前端
echo "部署前端..."
cd frontend
npm run build
scp -r ./dist/* root@101.37.236.214:/var/www/ai-onboarding/

ssh root@101.37.236.214 << 'EOF'
  systemctl reload nginx
EOF

echo "部署完成！"
