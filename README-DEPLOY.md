# 🚀 APISIX 管理面板 Docker 部署指南

## 📋 前置要求

- ✅ Docker 已安装并运行
- ✅ 已有 APISIX 环境运行（端口 9180）
- ✅ 已有 etcd 环境运行（端口 2379）

## 🎯 快速部署

### 方法1：使用部署脚本（推荐）

#### Linux/macOS
```bash
# 进入项目目录
cd 03/Admin/horizontal

# 给脚本执行权限
chmod +x deploy.sh

# 运行部署脚本
./deploy.sh
```

#### Windows PowerShell
```powershell
# 进入项目目录
cd 03/Admin/horizontal

# 运行部署脚本
.\deploy.ps1
```

### 方法2：手动部署

```bash
# 1. 构建镜像
docker build -t apisix-admin-panel .

# 2. 启动容器
docker run -d \
    --name apisix-admin-panel \
    --network host \
    -p 8080:80 \
    -v $(pwd)/config:/usr/share/nginx/html/config:ro \
    -v $(pwd)/logs:/var/log/nginx \
    --restart unless-stopped \
    apisix-admin-panel
```

## 🌐 访问地址

部署成功后，您可以通过以下地址访问：

- **管理面板**: http://localhost:8080/admin.html
- **登录页面**: http://localhost:8080/index.html
- **AI代理测试**: http://localhost:8080/ai-proxy-test.html

## ⚙️ 配置说明

### 1. APISIX 连接配置

编辑 `config/etcd-config.json`：

```json
{
  "etcd": {
    "hosts": ["http://localhost:2379"],
    "prefix": "/apisix",
    "timeout": 30
  },
  "apisix": {
    "admin_url": "http://localhost:9180",
    "api_key": "edd1c9f034335f136f87ad84b625c8f1"
  }
}
```

### 2. 端口配置

- **前端面板**: 8080
- **APISIX Admin API**: 9180
- **etcd**: 2379

## 🔧 管理命令

### 查看容器状态
```bash
docker ps | grep apisix-admin-panel
```

### 查看日志
```bash
docker logs apisix-admin-panel
```

### 重启容器
```bash
docker restart apisix-admin-panel
```

### 停止容器
```bash
docker stop apisix-admin-panel
```

### 删除容器
```bash
docker rm apisix-admin-panel
```

## 📁 目录结构

```
03/Admin/horizontal/
├── Dockerfile                 # Docker 镜像构建文件
├── nginx.conf                 # Nginx 配置文件
├── docker-compose-simple.yml  # 简化版 Docker Compose
├── deploy.sh                  # Linux/macOS 部署脚本
├── deploy.ps1                 # Windows 部署脚本
├── .dockerignore              # Docker 忽略文件
├── README-DEPLOY.md           # 部署说明文档
├── admin.html                 # 主管理面板
├── index.html                 # 登录页面
├── ai-proxy-test.html         # AI 代理测试页面
├── config/                    # 配置文件目录
│   ├── etcd-config.json      # etcd 配置
│   └── plugin-config.json    # 插件配置
├── assets/                    # 静态资源
├── plugins/                   # 插件文件
└── logs/                      # 日志目录（自动创建）
```

## 🚨 故障排除

### 1. 端口冲突
如果 8080 端口被占用，可以修改端口：
```bash
docker run -d --name apisix-admin-panel -p 8081:80 apisix-admin-panel
```

### 2. 权限问题
确保项目目录有正确的读取权限：
```bash
chmod -R 755 .
```

### 3. 网络连接问题
如果无法连接到 APISIX，检查网络模式：
```bash
# 使用 host 网络模式
docker run -d --name apisix-admin-panel --network host apisix-admin-panel
```

### 4. 配置文件问题
检查配置文件路径和权限：
```bash
docker exec -it apisix-admin-panel ls -la /usr/share/nginx/html/config
```

## 🔄 更新部署

### 重新构建并部署
```bash
# 停止现有容器
docker stop apisix-admin-panel

# 删除容器
docker rm apisix-admin-panel

# 重新构建镜像
docker build -t apisix-admin-panel .

# 重新启动
docker run -d --name apisix-admin-panel --network host -p 8080:80 apisix-admin-panel
```

## 📞 技术支持

如果遇到问题，请检查：
1. Docker 服务状态
2. 容器日志
3. 网络连接
4. 配置文件格式

## 🎉 部署完成

恭喜！您已成功部署 APISIX 管理面板。

现在可以：
- 🔐 通过管理面板配置 APISIX
- 🛣️ 管理 API 路由
- 🔌 配置插件
- �� 管理消费者
- 📊 监控系统状态
