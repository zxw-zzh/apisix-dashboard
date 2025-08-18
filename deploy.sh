#!/bin/bash

# APISIX 管理面板部署脚本
echo "🚀 开始部署 APISIX 管理面板..."

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker"
    exit 1
fi

# 创建日志目录
mkdir -p logs

# 停止并删除现有容器（如果存在）
echo "🔄 清理现有容器..."
docker stop apisix-admin-panel 2>/dev/null || true
docker rm apisix-admin-panel 2>/dev/null || true

# 构建镜像
echo "🔨 构建 Docker 镜像..."
docker build -t apisix-admin-panel .

if [ $? -ne 0 ]; then
    echo "❌ 镜像构建失败"
    exit 1
fi

# 启动容器
echo "🚀 启动容器..."
docker run -d \
    --name apisix-admin-panel \
    --network host \
    -p 8080:80 \
    -v $(pwd)/config:/usr/share/nginx/html/config:ro \
    -v $(pwd)/logs:/var/log/nginx \
    --restart unless-stopped \
    apisix-admin-panel

if [ $? -eq 0 ]; then
    echo "✅ 部署成功！"
    echo "🌐 访问地址: http://localhost:8080/admin.html"
    echo "📊 管理面板: http://localhost:8080/admin.html"
    echo "🔧 APISIX Admin API: http://localhost:9180/apisix/admin"
    echo ""
    echo "📋 容器状态:"
    docker ps | grep apisix-admin-panel
else
    echo "❌ 部署失败"
    exit 1
fi
