# 奥能 AI 新员工入职系统 - 部署指南

## 环境信息


| 项目      | 值                                                        |
| ------- | -------------------------------------------------------- |
| 前端      | Vue 3 + Vite                                             |
| 后端      | Node.js + Express + LangChain                            |
| 后端服务器   | ECS: 101.37.236.214                                      |
| 前端自定义域名 | [http://101.37.236.214:8068](http://101.37.236.214:8068) |
| 后端端口    | 3000                                                     |


---

## 部署流程概览


| 步骤  | 操作         | 执行位置        |
| --- | ---------- | ----------- |
| 1   | SSH 连接服务器  | 🖥️ 本地终端    |
| 2   | 创建目录       | 🖥️ ECS 服务器 |
| 3   | 上传后端代码     | 🖥️ 本地新终端   |
| 4   | 安装依赖       | 🖥️ ECS 服务器 |
| 5   | 配置 .env    | 🖥️ ECS 服务器 |
| 6   | 安装 PM2     | 🖥️ ECS 服务器 |
| 7   | 启动后端       | 🖥️ ECS 服务器 |
| 8   | 验证后端       | 🖥️ ECS 服务器 |
| 9   | 开放 8068 端口 | 🌐 阿里云控制台   |
| 10  | 本地构建前端     | 🖥️ 本地终端    |
| 11  | 上传前端到服务器   | 🖥️ 本地终端    |
| 12  | 配置 Nginx   | 🖥️ ECS 服务器 |
| 13  | 验证部署       | 🖥️ 浏览器访问   |


---

## 详细步骤

### 步骤 1: SSH 连接服务器

**🖥️ 执行位置：本地终端**

```bash
ssh root@101.37.236.214
```

输入密码登录。

---

### 步骤 2: 创建目录

**🖥️ 执行位置：ECS 服务器（SSH 登录后）**

```bash
mkdir -p /opt/backend
mkdir -p /var/www/ai-onboarding
```

---

### 步骤 3: 上传后端代码

**🖥️ 执行位置：本地新终端（不是 SSH 连接的那个！）**

新开一个 Windows 终端窗口，然后执行：

```bash
# 注意：不要包含 node_modules 文件夹，只上传必要的代码文件
scp -r .\backend\* root@101.37.236.214:/opt/backend/
```

输入密码，等待上传完成。

**优化说明：** 只上传必要的文件，避免上传 node_modules 文件夹，这样可以大幅减少上传时间。依赖会在服务器上安装。

---

### 步骤 4: 安装后端依赖

**🖥️ 执行位置：ECS 服务器（SSH 登录后）**

```bash
cd /opt/backend
npm install
```

---

### 步骤 5: 配置环境变量

**🖥️ 执行位置：ECS 服务器（SSH 登录后）**

```bash
nano /opt/backend/.env
```

粘贴以下内容：

```env
# API 配置
API_KEY=sk-your-api-key-here
API_BASE_URL=https://api.deepseek.com

# 服务器端口
PORT=3000
HOST=0.0.0.0
```

按 `Ctrl+O` 保存，`Enter` 确认，`Ctrl+X` 退出。

---

### 步骤 6: 安装 PM2

**🖥️ 执行位置：ECS 服务器（SSH 登录后）**

```bash
npm install -g pm2
```

---

### 步骤 7: 启动后端服务

**🖥️ 执行位置：ECS 服务器（SSH 登录后）**

```bash
cd /opt/backend
pm2 start ecosystem.config.cjs
pm2 startup
pm2 save
```

---

### 步骤 8: 验证后端

**🖥️ 执行位置：ECS 服务器（SSH 登录后）**

```bash
curl http://localhost:3000/api/health
```

应返回：`{"status":"ok"}`

---

### 步骤 9: 开放 8068 端口

**🌐 执行位置：浏览器 - 阿里云控制台**

1. 登录 [阿里云 ECS 控制台](https://ecs.console.aliyun.com)
2. 进入 **实例** → 选择你的实例
3. 点击 **安全组** → 进入安全组规则
4. 点击 **添加安全组规则**：
  - 方向：入方向
  - 协议：TCP
  - 端口范围：8068/8068
  - 授权对象：0.0.0.0/0
5. 点击 **确定**

---

### 步骤 10: 本地构建前端

**🖥️ 执行位置：本地终端**

```bash
cd c:\Users\Administrator\Desktop\aoneng\langchain-project\frontend
pnpm install
pnpm build
```

---

### 步骤 11: 上传前端代码

**🖥️ 执行位置：本地终端**

```bash
scp -r .\dist\* root@101.37.236.214:/var/www/ai-onboarding/
```

---

### 步骤 12: 安装并配置 Nginx

**🖥️ 执行位置：ECS 服务器（SSH 登录后）**

```bash
# 安装 Nginx
apt update && apt install -y nginx

# 配置 Nginx
nano /etc/nginx/sites-available/ai-onboarding
```

粘贴以下内容：

```nginx
server {
    listen 8068;
    server_name _;

    root /var/www/ai-onboarding;
    index index.html;

    # 访问日志
    access_log /var/log/nginx/ai-onboarding-access.log;
    error_log /var/log/nginx/ai-onboarding-error.log;

    # 前端路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理（流式对话必须关闭缓冲，否则 chunk 长时间不推送到浏览器）
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

保存并退出（`Ctrl+O`, `Enter`, `Ctrl+X`）。

启用配置：

```bash
ln -s /etc/nginx/sites-available/ai-onboarding /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
systemctl enable nginx
```

---

### 步骤 13: 验证部署

**🖥️ 执行位置：浏览器**

访问：[http://101.37.236.214:8068](http://101.37.236.214:8068)

---

## 目录结构（部署后）

```
ECS 服务器：
/opt/backend/            ← 后端代码
/var/www/ai-onboarding/ ← 前端代码
```

---

## 访问地址


| 服务     | 地址                                                       |
| ------ | -------------------------------------------------------- |
| 前端     | [http://101.37.236.214:8068](http://101.37.236.214:8068) |
| 后端 API | [http://101.37.236.214:3000](http://101.37.236.214:3000) |


---

## 常用维护命令

### 查看后端状态

**🖥️ ECS 服务器执行：**

```bash
pm2 status
pm2 logs ai-onboarding --lines 100
```

### 重启后端

**🖥️ ECS 服务器执行：**

```bash
pm2 restart ai-onboarding
```

### 更新后端代码

**🖥️ 本地终端：**

```bash
scp -r .\backend\* root@101.37.236.214:/opt/backend/
```

**🖥️ ECS 服务器：**

```bash
cd /opt/backend
npm install
pm2 restart ai-onboarding
```

### 更新前端代码

**🖥️ 本地终端：**

```bash
cd frontend
pnpm build
scp -r .\dist\* root@101.37.236.214:/var/www/ai-onboarding/
```

---

## 故障排查

### 页面打不开

1. 检查安全组是否开放 8068 端口
2. 检查 Nginx 是否运行：
  ```bash
   systemctl status nginx
  ```
3. 检查端口监听：
  ```bash
   netstat -tlnp | grep 8068
  ```

### API 请求失败

1. 检查后端是否运行：
  ```bash
   pm2 status
   curl http://localhost:3000/api/health
  ```
2. 检查 Nginx 日志：
  ```bash
   tail -f /var/log/nginx/ai-onboarding-error.log
  ```

### 看不到对话内容

1. 检查 `.env` 中的 `API_KEY` 是否正确
2. 查看后端日志：
  ```bash
   pm2 logs ai-onboarding --lines 200
  ```

