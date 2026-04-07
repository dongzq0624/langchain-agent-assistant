# PNPM 使用指南

> 本项目强制使用 **pnpm** 作为包管理器。本文档提供 pnpm 的快速入门和常用命令。

## 📋 目录

- [为什么使用 pnpm](#为什么使用-pnpm)
- [安装 pnpm](#安装-pnpm)
- [常用命令](#常用命令)
- [与 npm/yarn 对比](#与-npmyarn-对比)
- [故障排查](#故障排查)

---

## 为什么使用 pnpm

### 优势

1. **速度快** - 比 npm 快 2-3 倍
2. **磁盘空间高效** - 使用内容寻址存储，避免重复安装
3. **严格的依赖管理** - 防止幽灵依赖（phantom dependencies）
4. **Monorepo 支持** - 原生支持 workspace
5. **安全性高** - 更好的依赖隔离

### 项目配置

本项目通过以下方式强制使用 pnpm：

- ✅ `.npmrc` 配置文件设置 `only-allow=pnpm`
- ✅ `package.json` 添加 `preinstall` 钩子
- ✅ CI/CD 工作流使用 pnpm
- ✅ 提交 `pnpm-lock.yaml` 到版本控制

---

## 安装 pnpm

### 方法一：使用 npm（推荐）

```bash
npm install -g pnpm
```

### 方法二：使用官方脚本

```bash
# macOS/Linux
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Windows (PowerShell)
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

### 方法三：使用 Homebrew（macOS）

```bash
brew install pnpm
```

### 验证安装

```bash
pnpm --version
# 应显示版本号，如：10.33.0
```

---

## 常用命令

### 安装依赖

```bash
# 安装所有依赖（根据 pnpm-lock.yaml）
pnpm install

# 严格模式安装（CI 环境推荐）
pnpm install --frozen-lockfile

# 安装单个包
pnpm add <package-name>

# 安装开发依赖
pnpm add -D <package-name>

# 安装全局包
pnpm add -g <package-name>
```

### 运行脚本

```bash
# 运行 package.json 中的脚本
pnpm run dev
pnpm run build
pnpm run start

# 简写（常用脚本可直接运行）
pnpm dev
pnpm build
pnpm test
```

### 管理依赖

```bash
# 移除包
pnpm remove <package-name>

# 更新包
pnpm update <package-name>

# 更新所有包
pnpm update

# 查看过时的包
pnpm outdated

# 清理缓存
pnpm store prune
```

### 项目特定命令

#### 前端

```bash
cd frontend

# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# 构建开发版本
pnpm build:dev

# 预览构建结果
pnpm preview
```

#### 后端

```bash
cd backend

# 开发模式（带热重载）
pnpm dev

# 构建 TypeScript
pnpm build

# 启动服务
pnpm start
```

---

## 与 npm/yarn 对比

| 功能 | npm | yarn | pnpm |
|------|-----|------|------|
| 安装速度 | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 磁盘使用 | 高 | 中 | 低 |
| 依赖隔离 | ❌ | ❌ | ✅ |
| Monorepo | 一般 | 好 | 优秀 |
| 严格模式 | ❌ | ⚠️ | ✅ |

### 命令对照表

| 操作 | npm | yarn | pnpm |
|------|-----|------|------|
| 安装依赖 | `npm install` | `yarn` | `pnpm install` |
| 添加包 | `npm install pkg` | `yarn add pkg` | `pnpm add pkg` |
| 添加开发依赖 | `npm install -D pkg` | `yarn add -D pkg` | `pnpm add -D pkg` |
| 移除包 | `npm uninstall pkg` | `yarn remove pkg` | `pnpm remove pkg` |
| 运行脚本 | `npm run script` | `yarn script` | `pnpm script` |
| 全局安装 | `npm install -g pkg` | `yarn global add pkg` | `pnpm add -g pkg` |
| 更新包 | `npm update` | `yarn upgrade` | `pnpm update` |
| 查看过时 | `npm outdated` | `yarn outdated` | `pnpm outdated` |

---

## 故障排查

### 问题 1: 误用了 npm install

**症状：**
```
Error: Run "pnpm install" instead of "npm install"
```

**解决方案：**
```bash
# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 使用 pnpm 重新安装
pnpm install
```

### 问题 2: pnpm-lock.yaml 冲突

**解决方案：**
```bash
# 方法 1: 重新生成 lock 文件
rm pnpm-lock.yaml
pnpm install

# 方法 2: 合并后重新安装
git checkout --theirs pnpm-lock.yaml  # 或 --ours
pnpm install
```

### 问题 3: 权限错误

**症状：**
```
EACCES: permission denied
```

**解决方案：**
```bash
# 修复 npm 全局目录权限
sudo chown -R $(whoami) ~/.npm

# 或使用 nvm 管理 Node.js（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### 问题 4: CI/CD 中 pnpm 未找到

**解决方案：**
确保在 CI 工作流中安装了 pnpm：
```yaml
- name: Install pnpm
  run: npm install -g pnpm
```

### 问题 5: 依赖解析失败

**解决方案：**
```bash
# 清理 pnpm store
pnpm store prune

# 清除缓存并重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

---

## 最佳实践

### 1. 始终提交 pnpm-lock.yaml

```bash
git add pnpm-lock.yaml
git commit -m "chore: update dependencies"
```

### 2. CI/CD 使用严格模式

```bash
pnpm install --frozen-lockfile
```

### 3. 定期更新依赖

```bash
# 查看可更新的包
pnpm outdated

# 交互式更新
pnpm update -i
```

### 4. 使用 .npmrc 配置

在项目根目录创建 `.npmrc`：
```ini
# 强制使用 pnpm
only-allow=pnpm

# 提升安装速度
shamefully-hoist=false

# 严格 peer dependencies
strict-peer-dependencies=true
```

### 5. Monorepo 配置（如需要）

```yaml
# pnpm-workspace.yaml
packages:
  - 'frontend'
  - 'backend'
  - 'packages/*'
```

---

## 迁移指南

### 从 npm 迁移到 pnpm

```bash
# 1. 安装 pnpm
npm install -g pnpm

# 2. 删除旧的 node_modules 和 lock 文件
rm -rf node_modules package-lock.json

# 3. 使用 pnpm 安装
pnpm install

# 4. 提交新的 lock 文件
git add pnpm-lock.yaml
git commit -m "chore: migrate to pnpm"
```

### 从 yarn 迁移到 pnpm

```bash
# 1. 安装 pnpm
npm install -g pnpm

# 2. 删除旧的 node_modules 和 lock 文件
rm -rf node_modules yarn.lock

# 3. 使用 pnpm 安装
pnpm install

# 4. 提交新的 lock 文件
git add pnpm-lock.yaml
git commit -m "chore: migrate from yarn to pnpm"
```

---

## 资源链接

- [pnpm 官方文档](https://pnpm.io/)
- [pnpm GitHub 仓库](https://github.com/pnpm/pnpm)
- [为什么选择 pnpm](https://pnpm.io/motivation)
- [pnpm vs npm vs Yarn](https://pnpm.io/benchmarks)

---

**最后更新**: 2026-04-07  
**维护者**: AI Onboarding Team
