#!/bin/bash

echo "🔧 快速修复 APISIX 管理面板部署问题..."

# 检查容器状态
echo "📋 检查容器状态..."
if docker ps | grep -q apisix-admin-panel; then
    echo "✅ 容器正在运行"
    echo "📊 容器信息:"
    docker ps | grep apisix-admin-panel
else
    echo "❌ 容器未运行"
fi

# 检查端口占用
echo "🔍 检查端口 8080 占用情况..."
if netstat -tuln | grep -q ":8080 "; then
    echo "⚠️  端口 8080 被占用:"
    netstat -tuln | grep ":8080 "
else
    echo "✅ 端口 8080 可用"
fi

# 检查容器日志
echo "📝 检查容器日志..."
if docker ps | grep -q apisix-admin-panel; then
    echo "最近的日志:"
    docker logs --tail 20 apisix-admin-panel
else
    echo "容器未运行，无法查看日志"
fi

# 重新部署选项
echo ""
echo "🔄 重新部署选项:"
echo "1. 重新构建并启动容器"
echo "2. 仅重启容器"
echo "3. 检查配置文件"
echo "4. 退出"

read -p "请选择操作 (1-4): " choice

case $choice in
    1)
        echo "🔨 重新构建并启动容器..."
        docker stop apisix-admin-panel 2>/dev/null
        docker rm apisix-admin-panel 2>/dev/null
        docker build -t apisix-admin-panel .
        docker run -d \
            --name apisix-admin-panel \
            -p 8080:80 \
            -v $(pwd)/config:/usr/share/nginx/html/config:ro \
            -v $(pwd)/logs:/var/log/nginx \
            --restart unless-stopped \
            apisix-admin-panel
        ;;
    2)
        echo "🔄 重启容器..."
        docker restart apisix-admin-panel
        ;;
    3)
        echo "📋 检查配置文件..."
        if docker ps | grep -q apisix-admin-panel; then
            echo "Nginx 配置:"
            docker exec apisix-admin-panel cat /etc/nginx/conf.d/default.conf
            echo ""
            echo "文件列表:"
            docker exec apisix-admin-panel ls -la /usr/share/nginx/html/
        else
            echo "容器未运行"
        fi
        ;;
    4)
        echo "👋 退出"
        exit 0
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

# 等待容器启动
if [ $choice -eq 1 ] || [ $choice -eq 2 ]; then
    echo "⏳ 等待容器启动..."
    sleep 5
    
    if docker ps | grep -q apisix-admin-panel; then
        echo "✅ 容器已启动"
        echo "🌐 访问地址: http://localhost:8080/admin.html"
        
        # 测试连接
        echo "🧪 测试连接..."
        if curl -s http://localhost:8080/ > /dev/null; then
            echo "✅ 连接成功！"
        else
            echo "❌ 连接失败"
            echo "📝 容器日志:"
            docker logs --tail 10 apisix-admin-panel
        fi
    else
        echo "❌ 容器启动失败"
        echo "📝 查看错误日志:"
        docker logs apisix-admin-panel
    fi
fi
