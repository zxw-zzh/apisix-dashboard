# APISIX 管理面板部署脚本 (PowerShell)
Write-Host "🚀 开始部署 APISIX 管理面板..." -ForegroundColor Green

# 检查 Docker 是否运行
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker 未运行，请先启动 Docker" -ForegroundColor Red
    exit 1
}

# 创建日志目录
if (!(Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}

# 停止并删除现有容器（如果存在）
Write-Host "🔄 清理现有容器..." -ForegroundColor Yellow
docker stop apisix-admin-panel 2>$null
docker rm apisix-admin-panel 2>$null

# 构建镜像
Write-Host "🔨 构建 Docker 镜像..." -ForegroundColor Yellow
docker build -t apisix-admin-panel .

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 镜像构建失败" -ForegroundColor Red
    exit 1
}

# 启动容器
Write-Host "🚀 启动容器..." -ForegroundColor Yellow
docker run -d `
    --name apisix-admin-panel `
    --network host `
    -p 8080:80 `
    -v "${PWD}/config:/usr/share/nginx/html/config:ro" `
    -v "${PWD}/logs:/var/log/nginx" `
    --restart unless-stopped `
    apisix-admin-panel

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 部署成功！" -ForegroundColor Green
    Write-Host "🌐 访问地址: http://localhost:8080/admin.html" -ForegroundColor Cyan
    Write-Host "📊 管理面板: http://localhost:8080/admin.html" -ForegroundColor Cyan
    Write-Host "🔧 APISIX Admin API: http://localhost:9180/apisix/admin" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 容器状态:" -ForegroundColor Yellow
    docker ps | Select-String "apisix-admin-panel"
} else {
    Write-Host "❌ 部署失败" -ForegroundColor Red
    exit 1
}
