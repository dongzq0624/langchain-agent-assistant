# CI/CD 部署设置指南

> 本指南详细介绍如何配置和使用自动化 CI/CD 流水线部署 AI 入职助手项目。

## 📋 目录

- [1. GitHub Secrets 配置](#1-github-secrets-配置)
- [2. 服务器准备](#2-服务器准备)
- [3. 项目配置](#3-项目配置)
- [4. 自动部署流程](#4-自动部署流程)
- [5. 手动部署](#5-手动部署)
- [6. 监控和日志](#6-监控和日志)
- [7. 故障排查](#7-故障排查)
- [8. 安全最佳实践](#8-安全最佳实践)
- [9. 高级配置](#9-高级配置)

---

## 1. GitHub Secrets 配置

### 1.1 添加 Secrets

在 GitHub 仓库中，进入 **Settings → Secrets and variables → Actions**，添加以下 secrets：

| Secret 名称 | 描述 | 获取方式 | 必需 |
|------------|------|---------|------|
| `ECS_SSH_KEY` | ECS 服务器的 SSH 私钥 | 见下方说明 | ✅ |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | DeepSeek 控制台 | ✅ |
| `DB_PASSWORD` | 数据库密码（如使用MySQL） | 自行设置 | ❌ |
| `SERVER_HOST` | 服务器 IP 地址 | 你的 ECS IP | ✅ |
| `SERVER_USER` | 服务器用户名 | 通常为 root | ✅ |

### 1.2 生成 SSH 密钥对

```bash
# 在本地机器上生成 SSH 密钥对
ssh-keygen -t ed25519 -C "github-actions@ai-onboarding" -f ~/.ssh/github-actions

# 将公钥添加到服务器
ssh-copy-id -i ~/.ssh/github-actions.pub root@YOUR_SERVER_IP

# 查看私钥内容（用于添加到 GitHub Secrets）
cat ~/.ssh/github-actions
```

**重要提示：**
- 只上传**私钥**到 GitHub Secrets（以 `-----BEGIN OPENSSH PRIVATE KEY-----` 开头的内容）
- 确保私钥文件权限正确：`chmod 600 ~/.ssh/github-actions`
- 不要将私钥提交到代码仓库

---

## 2. 服务器准备

### 2.1 系统要求

- **操作系统**: Ubuntu 20.04+ / CentOS 7+ / Debian 10+
- **内存**: 至少 2GB RAM
- **存储**: 至少 20GB 可用空间
- **网络**: 开放端口 80/443 (HTTP/HTTPS), 22 (SSH)

### 2.2 安装基础软件

#### Ubuntu/Debian
```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要软件
sudo apt install -y nodejs npm nginx git curl wget

# 安装 Node.js 20.x（推荐）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证安装
node --version  # 应显示 v20.x.x
npm --version   # 应显示 10.x.x
```

#### CentOS/RHEL
```bash
# 更新系统
sudo yum update -y

# 安装 EPEL 仓库
sudo yum install -y epel-release

# 安装必要软件
sudo yum install -y nodejs npm nginx git curl wget

# 安装 Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### 2.3 安装 PM2 进程管理器

```bash
# 全局安装 PM2 和 TypeScript
sudo npm install -g pm2 tsx typescript

# 设置 PM2 开机自启
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# 验证安装
pm2 --version
```

### 2.4 创建目录结构

```bash
# 创建后端目录
sudo mkdir -p /opt/backend/pdfs
sudo chown -R $USER:$USER /opt/backend

# 创建前端目录
sudo mkdir -p /var/www/ai-onboarding
sudo chown -R $USER:$USER /var/www/ai-onboarding

# 验证目录
ls -la /opt/backend
ls -la /var/www/ai-onboarding
```

### 2.5 配置防火墙

```bash
# Ubuntu (UFW)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

# 阿里云 ECS 安全组
# 在阿里云控制台添加安全组规则，开放端口 22, 80, 443
```

### 2.6 Nginx 配置

创建 Nginx 配置文件：

```bash
sudo nano /etc/nginx/sites-available/ai-onboarding
```

粘贴以下内容：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或 _

    root /var/www/ai-onboarding;
    index index.html;

    # 访问日志
    access_log /var/log/nginx/ai-onboarding-access.log;
    error_log /var/log/nginx/ai-onboarding-error.log;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 前端路由
    location / {
        try_files $uri $uri/ /index.html;
        
        # 安全头
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }

    # API 代理（流式对话必须关闭缓冲）
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # 请求头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 禁用缓冲（流式响应必需）
        proxy_buffering off;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
        
        # 错误处理
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
    }

    # 健康检查端点
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}

# HTTPS 配置（如果使用 SSL）
# server {
#     listen 443 ssl http2;
#     server_name your-domain.com;
#     
#     ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
#     ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
#     ssl_protocols TLSv1.2 TLSv1.3;
#     ssl_ciphers HIGH:!aNULL:!MD5;
#     
#     # ... 其他配置同上 ...
# }
```

启用配置并测试：

```bash
# 创建符号链接
sudo ln -s /etc/nginx/sites-available/ai-onboarding /etc/nginx/sites-enabled/

# 测试配置语法
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx

# 验证状态
sudo systemctl status nginx
```

### 2.7 配置 SSL（可选但推荐）

使用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx  # Ubuntu/Debian
# 或
sudo yum install -y certbot python3-certbot-nginx  # CentOS

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期测试
sudo certbot renew --dry-run
```

### 2.8 环境变量配置

创建后端环境变量文件：

```bash
sudo nano /opt/backend/.env
```

粘贴以下内容（根据实际情况修改）：

```env
# ==================== 服务配置 ====================
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# ==================== DeepSeek API 配置 ====================
DEEPSEEK_API_KEY=sk-your-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# ==================== OpenAI Embedding 配置（向量检索）====================
OPENAI_API_KEY=sk-your-openai-key  # 如需向量检索
OPENAI_EMBEDDING_BASE_URL=https://api.openai.com/v1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# ==================== 数据库配置（可选）====================
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=root
# DB_PASSWORD=your_secure_password
# DB_NAME=ai_onboarding

# ==================== 日志配置 ====================
LOG_LEVEL=info
LOG_FILE=/var/log/ai-onboarding/app.log
```

设置正确的权限：

```bash
sudo chmod 600 /opt/backend/.env
sudo chown root:root /opt/backend/.env
```

---

## 3. 项目配置

### 3.1 前端配置

确认 `frontend/vite.config.js` 配置：

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,  // WebSocket 支持
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,  // 生产环境不生成 sourcemap
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
})
```

### 3.2 后端配置

确认 `backend/ecosystem.config.cjs` 配置：

```javascript
module.exports = {
  apps: [
    {
      name: 'ai-onboarding',
      script: 'tsx src/index.ts',
      cwd: '/opt/backend',
      
      // 环境变量
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      
      // 实例数（多核 CPU 可设置为 'max'）
      instances: 1,
      exec_mode: 'fork',
      
      // 重启策略
      watch: false,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/ai-onboarding/error.log',
      out_file: '/var/log/ai-onboarding/out.log',
      merge_logs: true,
      
      // 资源限制
      max_memory_restart: '500M',
      
      // 优雅关闭
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
    },
  ],
};
```

创建日志目录：

```bash
sudo mkdir -p /var/log/ai-onboarding
sudo chown -R $USER:$USER /var/log/ai-onboarding
```

### 3.3 Git 配置

确认 `.gitignore` 包含以下内容：

```gitignore
# 依赖
node_modules/

# 构建产物
dist/
build/

# 环境变量
.env
.env.local
.env.production

# 日志
*.log
logs/

# PDF 文件（如果太大）
pdfs/*.pdf

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

---

## 4. 自动部署流程

### 4.1 GitHub Actions 工作流

项目已配置自动 CI/CD 流水线（`.github/workflows/ci-cd.yml`），触发条件：

- **Push 到 main/master 分支**：完整构建 + 部署
- **Pull Request**：仅构建和测试，不部署

### 4.2 工作流程步骤

```mermaid
graph LR
    A[代码推送] --> B{分支判断}
    B -->|main/master| C[前端构建]
    B -->|其他| D[PR 测试]
    C --> E[后端测试]
    E --> F[部署到服务器]
    F --> G[重启服务]
    G --> H[完成]
    D --> I[运行测试]
    I --> J[反馈结果]
```

### 4.3 自定义部署脚本

如果需要自定义部署逻辑，编辑 `.github/workflows/ci-cd.yml`：

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

# 环境变量
env:
  SERVER_HOST: ${{ secrets.SERVER_HOST }}
  SERVER_USER: ${{ secrets.SERVER_USER }}
  BACKEND_PATH: /opt/backend
  FRONTEND_PATH: /var/www/ai-onboarding

jobs:
  # 前端构建
  build-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
          
      - name: Install dependencies
        working-directory: ./frontend
        run: npm ci  # 使用 ci 而非 install，更严格
        
      - name: Lint code
        working-directory: ./frontend
        run: npm run lint || echo "No lint script"
        
      - name: Build frontend
        working-directory: ./frontend
        run: npm run build
        
      - name: Archive frontend build
        uses: actions/upload-artifact@v4
        with:
          name: frontend-build
          path: frontend/dist
          retention-days: 1

  # 后端测试
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
          
      - name: Install dependencies
        working-directory: ./backend
        run: npm ci --legacy-peer-deps
        
      - name: Type check
        working-directory: ./backend
        run: npx tsc --noEmit
        
      - name: Run tests
        working-directory: ./backend
        run: npm test || echo "No tests configured"
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}

  # 部署
  deploy:
    needs: [build-frontend, test-backend]
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master')
    
    environment: production  # 环境保护
    concurrency: 
      group: production-deploy
      cancel-in-progress: false
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Download frontend build
        uses: actions/download-artifact@v4
        with:
          name: frontend-build
          path: frontend/dist
          
      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.ECS_SSH_KEY }}
          
      - name: Verify server connection
        run: |
          ssh -o StrictHostKeyChecking=no ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }} "echo 'Server connection OK'"
          
      - name: Backup current deployment
        run: |
          ssh ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }} << 'EOF'
            cd ${{ env.BACKEND_PATH }}
            if [ -d "backup" ]; then
              rm -rf backup
            fi
            mkdir -p backup
            cp -r src package.json package-lock.json tsconfig.json ecosystem.config.cjs backup/ 2>/dev/null || true
            echo "Backup created"
          EOF
          
      - name: Deploy backend
        run: |
          # 上传后端代码
          scp -r \
            ./backend/src \
            ./backend/package.json \
            ./backend/package-lock.json \
            ./backend/tsconfig.json \
            ./backend/ecosystem.config.cjs \
            ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }}:${{ env.BACKEND_PATH }}/
          
          # 登录服务器并部署
          ssh ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }} << 'EOF'
            cd ${{ env.BACKEND_PATH }}
            
            # 安装依赖
            npm ci --legacy-peer-deps --production
            
            # 重启服务
            pm2 reload ai-onboarding || pm2 start ecosystem.config.cjs
            
            # 等待服务启动
            sleep 5
            
            # 验证服务状态
            pm2 status ai-onboarding
          EOF
          
      - name: Deploy frontend
        run: |
          # 备份当前版本
          ssh ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }} << 'EOF'
            if [ -d "${{ env.FRONTEND_PATH }}" ]; then
              mv ${{ env.FRONTEND_PATH }} ${{ env.FRONTEND_PATH }}.bak
            fi
            mkdir -p ${{ env.FRONTEND_PATH }}
          EOF
          
          # 上传前端构建文件
          scp -r ./frontend/dist/* ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }}:${{ env.FRONTEND_PATH }}/
          
          # 清理备份
          ssh ${{ env.SERVER_USER }}@${{ env.SERVER_HOST }} << 'EOF'
            rm -rf ${{ env.FRONTEND_PATH }}.bak
            systemctl reload nginx
          EOF
          
      - name: Health check
        run: |
          sleep 10
          curl -f http://${{ env.SERVER_HOST }}/health || exit 1
          
      - name: Notify deployment success
        if: success()
        run: echo "✅ 部署成功！"
        
      - name: Notify deployment failure
        if: failure()
        run: |
          echo "❌ 部署失败！"
          echo "请检查 GitHub Actions 日志和服务器状态"
```

### 4.4 部署触发

```bash
# 推送代码触发自动部署
git add .
git commit -m "feat: 添加新功能"
git push origin main

# 查看部署进度
# 访问: https://github.com/YOUR_USERNAME/YOUR_REPO/actions
```

---

## 5. 手动部署

### 5.1 使用部署脚本

```bash
# 给脚本添加执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

### 5.2 分步手动部署

#### 后端部署
```bash
# 1. 上传代码
scp -r ./backend/src/* \
  ./backend/package.json \
  ./backend/package-lock.json \
  ./backend/tsconfig.json \
  ./backend/ecosystem.config.cjs \
  root@YOUR_SERVER_IP:/opt/backend/

# 2. 登录服务器
ssh root@YOUR_SERVER_IP

# 3. 安装依赖并重启
cd /opt/backend
npm install --legacy-peer-deps
pm2 restart ai-onboarding

# 4. 查看状态
pm2 status
pm2 logs ai-onboarding --lines 50
```

#### 前端部署
```bash
# 1. 本地构建
cd frontend
npm run build

# 2. 上传构建产物
scp -r ./dist/* root@YOUR_SERVER_IP:/var/www/ai-onboarding/

# 3. 重启 Nginx
ssh root@YOUR_SERVER_IP "systemctl reload nginx"
```

### 5.3 回滚操作

```bash
# 后端回滚
ssh root@YOUR_SERVER_IP << 'EOF'
  cd /opt/backend
  pm2 stop ai-onboarding
  rm -rf src/
  cp -r backup/src ./
  cp backup/package.json ./
  npm install --legacy-peer-deps
  pm2 start ai-onboarding
EOF

# 前端回滚
ssh root@YOUR_SERVER_IP << 'EOF'
  cd /var/www
  rm -rf ai-onboarding
  mv ai-onboarding.bak ai-onboarding
  systemctl reload nginx
EOF
```

---

## 6. 监控和日志

### 6.1 PM2 监控

```bash
# 查看所有服务状态
pm2 status

# 实时监控
pm2 monit

# 查看详细日志
pm2 logs ai-onboarding --lines 100

# 实时日志流
pm2 logs ai-onboarding

# 查看特定级别日志
pm2 logs ai-onboarding --err  # 仅错误
pm2 logs ai-onboarding --out  # 仅输出

# 清空日志
pm2 flush
```

### 6.2 Nginx 日志

```bash
# 查看访问日志
tail -f /var/log/nginx/ai-onboarding-access.log

# 查看错误日志
tail -f /var/log/nginx/ai-onboarding-error.log

# 分析日志
awk '{print $1}' /var/log/nginx/ai-onboarding-access.log | sort | uniq -c | sort -nr | head -20
```

### 6.3 系统监控

```bash
# 查看系统资源
htop

# 查看磁盘使用
df -h

# 查看内存使用
free -h

# 查看网络连接
netstat -tulpn | grep :3000
netstat -tulpn | grep :80
```

### 6.4 设置告警（可选）

使用 PM2 Plus 或其他监控服务：

```bash
# 注册 PM2 Plus
pm2 plus

# 或在服务器上安装监控代理
npm install -g pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 7. 故障排查

### 7.1 常见问题

#### 问题 1: 部署失败 - SSH 连接错误

**症状:**
```
Permission denied (publickey).
```

**解决方案:**
```bash
# 1. 验证 SSH 密钥
ssh -i ~/.ssh/github-actions root@YOUR_SERVER_IP

# 2. 检查服务器 authorized_keys
cat ~/.ssh/authorized_keys

# 3. 重新添加公钥
ssh-copy-id -i ~/.ssh/github-actions.pub root@YOUR_SERVER_IP

# 4. 检查权限
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

#### 问题 2: 服务无法启动

**症状:**
```
PM2: Process already exists
```

**解决方案:**
```bash
# 停止所有进程
pm2 delete all

# 重新启动
cd /opt/backend
pm2 start ecosystem.config.cjs

# 查看错误
pm2 logs ai-onboarding --err
```

#### 问题 3: API 返回 502 Bad Gateway

**症状:**
浏览器显示 502 错误

**解决方案:**
```bash
# 1. 检查后端服务
pm2 status
pm2 logs ai-onboarding --err

# 2. 检查端口占用
netstat -tulpn | grep :3000

# 3. 重启服务
pm2 restart ai-onboarding

# 4. 检查 Nginx 配置
nginx -t
systemctl status nginx
```

#### 问题 4: 前端页面空白

**症状:**
页面加载但显示空白

**解决方案:**
```bash
# 1. 检查浏览器控制台错误

# 2. 验证文件是否存在
ls -la /var/www/ai-onboarding/

# 3. 检查 Nginx 配置
cat /etc/nginx/sites-available/ai-onboarding

# 4. 重新部署前端
cd frontend
npm run build
scp -r dist/* root@YOUR_SERVER_IP:/var/www/ai-onboarding/
```

#### 问题 5: 环境变量未生效

**症状:**
API 调用失败，提示缺少密钥

**解决方案:**
```bash
# 1. 检查 .env 文件
cat /opt/backend/.env

# 2. 验证文件权限
ls -la /opt/backend/.env

# 3. 重启 PM2 进程
pm2 restart ai-onboarding

# 4. 检查环境变量
pm2 env ai-onboarding
```

### 7.2 调试技巧

```bash
# 启用详细日志
export DEBUG=*
pm2 restart ai-onboarding

# 查看实时日志
pm2 logs ai-onboarding --timestamp

# 测试 API 端点
curl http://localhost:3000/api/health

# 检查 PDF 文件
ls -lh /opt/backend/pdfs/

# 验证 Node.js 版本
node --version
which node
```

### 7.3 性能优化

```bash
# 1. 启用 Gzip
# 已在 Nginx 配置中启用

# 2. 配置 PM2 集群模式（多核 CPU）
# 修改 ecosystem.config.cjs:
# instances: 'max'
# exec_mode: 'cluster'

# 3. 优化 Node.js
export NODE_OPTIONS="--max-old-space-size=512"

# 4. 数据库连接池（如使用）
# 在 .env 中配置
# DB_POOL_SIZE=10
```

---

## 8. 安全最佳实践

### 8.1 服务器安全

```bash
# 1. 禁用 root SSH 登录
sudo nano /etc/ssh/sshd_config
# 修改: PermitRootLogin no

# 2. 使用密钥认证
# 修改: PasswordAuthentication no

# 3. 更改 SSH 端口
# 修改: Port 2222

# 4. 重启 SSH
sudo systemctl restart sshd

# 5. 安装 fail2ban
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
```

### 8.2 应用安全

```bash
# 1. 使用 HTTPS
# 配置 SSL 证书（见 2.7 节）

# 2. 设置 CORS
# 在后端代码中配置允许的源

# 3. 速率限制
# 在后端添加 rate limiting

# 4. 输入验证
# 对所有用户输入进行验证和清理
```

### 8.3 密钥管理

```bash
# 1. 定期轮换密钥
# 每 90 天更换一次 API 密钥

# 2. 使用密钥管理服务
# 考虑使用 AWS Secrets Manager 或 HashiCorp Vault

# 3. 审计密钥使用
# 定期检查密钥访问日志
```

### 8.4 备份策略

```bash
# 创建备份脚本
cat > /opt/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/$DATE"

mkdir -p $BACKUP_DIR

# 备份后端代码
cp -r /opt/backend $BACKUP_DIR/

# 备份环境变量
cp /opt/backend/.env $BACKUP_DIR/

# 备份 PDF 文件
cp -r /opt/backend/pdfs $BACKUP_DIR/

# 压缩备份
tar -czf /opt/backups/backup_$DATE.tar.gz -C /opt/backups $DATE
rm -rf $BACKUP_DIR

# 保留最近 7 天的备份
find /opt/backups -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: backup_$DATE.tar.gz"
EOF

chmod +x /opt/backup.sh

# 添加到 crontab（每天凌晨 2 点备份）
crontab -e
# 添加: 0 2 * * * /opt/backup.sh
```

---

## 9. 高级配置

### 9.1 多环境部署

创建不同的部署配置文件：

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [ develop ]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    # ... 类似生产环境的配置
```

### 9.2 蓝绿部署

```bash
# 1. 准备两个相同的环境
# /opt/backend-blue
# /opt/backend-green

# 2. 部署到新环境
scp -r ./backend/* root@SERVER:/opt/backend-green/

# 3. 测试新环境
curl http://SERVER:3001/api/health

# 4. 切换流量
# 修改 Nginx upstream
```

### 9.3 容器化部署（Docker）

创建 `Dockerfile`：

```dockerfile
# Backend Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps --production

COPY . .

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
```

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    env_file:
      - ./backend/.env
    volumes:
      - ./backend/pdfs:/app/pdfs
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

### 9.4 监控集成

#### Prometheus + Grafana

```bash
# 安装 PM2 Prometheus 模块
pm2 install pm2-prometheus

# 配置 Prometheus
# prometheus.yml
scrape_configs:
  - job_name: 'pm2'
    static_configs:
      - targets: ['localhost:9090']
```

### 9.5 CI/CD 优化

```yaml
# 使用缓存加速构建
- name: Cache dependencies
  uses: actions/cache@v3
  with:
    path: |
      frontend/node_modules
      backend/node_modules
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-

# 并行任务
strategy:
  matrix:
    node-version: [18, 20]
```

---

## 10. 快速参考

### 常用命令速查表

```bash
# === PM2 ===
pm2 status                    # 查看状态
pm2 logs ai-onboarding        # 查看日志
pm2 restart ai-onboarding     # 重启服务
pm2 stop ai-onboarding        # 停止服务
pm2 delete ai-onboarding      # 删除服务
pm2 monit                     # 实时监控

# === Nginx ===
sudo nginx -t                 # 测试配置
sudo systemctl restart nginx  # 重启
sudo systemctl reload nginx   # 重载配置
sudo tail -f /var/log/nginx/ai-onboarding-error.log  # 查看错误日志

# === Git ===
git status                    # 查看状态
git add .                     # 添加所有文件
git commit -m "message"       # 提交
git push origin main          # 推送

# === 服务器 ===
ssh root@YOUR_SERVER_IP       # 连接服务器
df -h                         # 查看磁盘
free -h                       # 查看内存
htop                          # 查看进程
```

### 文件路径速查

```
/opt/backend/                 # 后端代码
/opt/backend/.env             # 环境变量
/opt/backend/pdfs/            # PDF 文件
/var/www/ai-onboarding/       # 前端文件
/etc/nginx/sites-available/   # Nginx 配置
/var/log/nginx/               # Nginx 日志
/var/log/ai-onboarding/       # 应用日志
```

### 端口速查

```
22    - SSH
80    - HTTP
443   - HTTPS
3000  - Backend API
5173  - Frontend Dev Server
```

---

## 11. 支持与帮助

### 获取帮助

1. **查看日志**: `pm2 logs ai-onboarding`
2. **检查文档**: 阅读本项目 README.md
3. **GitHub Issues**: 提交问题到仓库 Issues
4. **社区支持**: 搜索相关技术论坛

### 贡献指南

欢迎提交 Pull Request 改进 CI/CD 流程！

---

**最后更新**: 2026-04-07  
**维护者**: AI Onboarding Team