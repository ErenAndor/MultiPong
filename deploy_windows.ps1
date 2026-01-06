# Windows Deployment Helper Script for AndorPong

# 1. Build Client
Write-Host "🚧 Building Client..." -ForegroundColor Cyan
Set-Location client
npm install
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Client build failed!" -ForegroundColor Red
    exit
}
Set-Location ..

# 2. Setup Server
Write-Host "🚧 Setting up Server..." -ForegroundColor Cyan
Set-Location server
npm install
Set-Location ..

# 3. Check & Install PM2
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Host "⬇️ PM2 not found. Installing globally..." -ForegroundColor Yellow
    npm install -g pm2
}

# 4. Start Application
Write-Host "🚀 Starting Application with PM2..." -ForegroundColor Green
pm2 start ecosystem.config.js
pm2 save

Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "   App is running on port 3000 (default)"
Write-Host "   To view logs: pm2 logs"
Write-Host "   To stop: pm2 stop andorpong"
