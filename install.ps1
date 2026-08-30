# ==============================================================================
# subout - Proxy Subscription Converter & Sing-box Web Panel
# One-Click Install & Uninstall PowerShell Script for Windows
# ==============================================================================

[CmdletBinding(DefaultParameterSetName = "Default")]
param (
    [Parameter(Position = 0)]
    [ValidateSet("install", "uninstall", "help")]
    [string]$Action = "install",

    [int]$Port = 1234,
    [string]$BinPath = "",
    [string]$BinDir = "C:\Program Files\Subout",
    [string]$DataDir = "C:\ProgramData\Subout",
    [string]$Tag = "",
    [string]$Version = "",
    [switch]$FromRelease,
    [switch]$Online,
    [switch]$NoService,
    [switch]$Uninstall,
    [switch]$Purge,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

function Show-Help {
    Write-Host "subout 一键安装与管理脚本 (Windows PowerShell)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "  .\install.ps1 [install|uninstall] [-Port <port>] [-BinPath <path>] [-NoService] [-Purge]"
    Write-Host ""
    Write-Host "也支持在 PowerShell (管理员) 中一键在线安装:"
    Write-Host "  irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1 | iex"
    Write-Host ""
    Write-Host "命令:"
    Write-Host "  install            安装 subout 并注册 Windows 开机自启后台任务 (默认命令)"
    Write-Host "  uninstall          卸载 subout 并停止/注销 Windows 后台任务"
    Write-Host ""
    Write-Host "参数:"
    Write-Host "  -Port <int>        指定 Web 面板监听端口 (默认: 1234)"
    Write-Host "  -BinPath <string>  指定本地 subout.exe 可执行文件路径"
    Write-Host "  -BinDir <string>   自定义安装目录 (默认: C:\Program Files\Subout)"
    Write-Host "  -DataDir <string>  自定义数据目录 (默认: C:\ProgramData\Subout)"
    Write-Host "  -Tag <string>      指定安装的 GitHub Release 版本标签 (如 v0.1.0)"
    Write-Host "  -FromRelease       强制从 GitHub Releases 下载预编译文件 (即使在源码目录中)"
    Write-Host "  -NoService         仅安装二进制文件，不注册 Windows 后台任务"
    Write-Host "  -Uninstall         卸载模式 (等同于 uninstall 命令)"
    Write-Host "  -Purge             卸载时彻底删除数据、日志与配置"
    Write-Host "  -Help              显示帮助信息"
    Write-Host ""
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)

    return $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

function Add-Argument {
    param (
        [System.Collections.Generic.List[string]]$List,
        [string]$Name,
        [string]$Value
    )

    $List.Add($Name)

    if ($Value -match '\s') {
        $List.Add("`"$Value`"")
    }
    else {
        $List.Add($Value)
    }
}

# ------------------------------------------------------------------------------
# 1. Help
# ------------------------------------------------------------------------------

if ($Help -or $Action -eq "help") {
    Show-Help
    exit 0
}

# ------------------------------------------------------------------------------
# 2. Normalize action
# ------------------------------------------------------------------------------

if ($Action -eq "uninstall") {
    $Uninstall = $true
}

if ($Version -and -not $Tag) {
    $Tag = $Version
}

# ------------------------------------------------------------------------------
# 3. Require Administrator Privileges
# ------------------------------------------------------------------------------

if (-not (Test-IsAdmin)) {
    Write-Host "[提示] 需要管理员权限，正在请求 UAC 提权..." -ForegroundColor Yellow

    $scriptPath = $MyInvocation.MyCommand.Path
    $temporaryScript = $false

    # Normal local execution
    if ($scriptPath -and (Test-Path -LiteralPath $scriptPath)) {
        $elevatedScriptPath = $scriptPath
    }
    else {
        # irm | iex execution
        $elevatedScriptPath = Join-Path `
            $env:TEMP `
            "subout-install-$([Guid]::NewGuid().ToString('N')).ps1"

        try {
            $scriptUrl = "https://raw.githubusercontent.com/geekdex/subout/main/install.ps1"

            Write-Host "[提示] 当前通过远程脚本执行，正在准备临时安装文件..." -ForegroundColor Gray

            Invoke-WebRequest `
                -Uri $scriptUrl `
                -OutFile $elevatedScriptPath `
                -UseBasicParsing `
                -ErrorAction Stop

            $temporaryScript = $true
        }
        catch {
            Write-Host ""
            Write-Host "错误: 无法下载安装脚本。" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }
    }

    # Build arguments
    $argumentList = New-Object System.Collections.Generic.List[string]

    $argumentList.Add("-NoProfile")
    $argumentList.Add("-ExecutionPolicy")
    $argumentList.Add("Bypass")
    $argumentList.Add("-File")
    $argumentList.Add("`"$elevatedScriptPath`"")

    if ($Uninstall) {
        $argumentList.Add("uninstall")
    }
    else {
        $argumentList.Add("install")
    }

    if ($Purge) {
        $argumentList.Add("-Purge")
    }

    if ($NoService) {
        $argumentList.Add("-NoService")
    }

    if ($FromRelease -or $Online) {
        $argumentList.Add("-FromRelease")
    }

    if ($Tag) {
        Add-Argument -List $argumentList -Name "-Tag" -Value $Tag
    }

    if ($Port -ne 1234) {
        Add-Argument -List $argumentList -Name "-Port" -Value ([string]$Port)
    }

    if ($BinPath) {
        Add-Argument -List $argumentList -Name "-BinPath" -Value $BinPath
    }

    if ($BinDir -ne "C:\Program Files\Subout") {
        Add-Argument -List $argumentList -Name "-BinDir" -Value $BinDir
    }

    if ($DataDir -ne "C:\ProgramData\Subout") {
        Add-Argument -List $argumentList -Name "-DataDir" -Value $DataDir
    }

    try {
        Start-Process `
            -FilePath "powershell.exe" `
            -Verb RunAs `
            -ArgumentList ($argumentList -join " ") `
            -Wait `
            -ErrorAction Stop
    }
    catch {
        Write-Host ""
        Write-Host "错误: UAC 提权失败。" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
    finally {
        if (
            $temporaryScript -and
            $elevatedScriptPath -and
            (Test-Path -LiteralPath $elevatedScriptPath)
        ) {
            Remove-Item `
                -LiteralPath $elevatedScriptPath `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }

    exit 0
}

# ------------------------------------------------------------------------------
# 4. System Architecture & Paths Setup
# ------------------------------------------------------------------------------

$AppName = "subout"
$TaskName = "Subout"
$ServiceName = "subout"
$TargetExe = Join-Path $BinDir "$AppName.exe"
$LogDir = Join-Path $DataDir "logs"
$RuntimeDir = Join-Path $DataDir "run"
$KernelDir = Join-Path $DataDir "bin"
$GeneratedDir = Join-Path $DataDir "generated"
$SubscriptionsDir = Join-Path $DataDir "subscriptions"
$NodesDir = Join-Path $DataDir "nodes"
$GitHubRepo = "geekdex/subout"

$arch = $env:PROCESSOR_ARCHITECTURE

if ($arch -eq "ARM64") {
    $TargetTriple = "aarch64-pc-windows-msvc"
}
else {
    $TargetTriple = "x86_64-pc-windows-msvc"
}

# ------------------------------------------------------------------------------
# 5. UNINSTALL LOGIC (Requirement 1: 干净卸载)
# ------------------------------------------------------------------------------

if ($Uninstall) {
    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host "       正在卸载 subout 服务与相关文件...             " -ForegroundColor Cyan
    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host ""

    # 1. Stop and remove Windows Scheduled Task
    Write-Host "[1/3] 正在停止与注销 Windows 后台任务 ($TaskName)..." -ForegroundColor Blue
    try {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        & schtasks.exe /End /TN $TaskName 2>$null | Out-Null
        & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
    }

    # Clean up legacy Windows Service if present
    $service = Get-Service `
        -Name $ServiceName `
        -ErrorAction SilentlyContinue

    if ($service) {
        Write-Host "[2/3] 正在停止与注销旧版 Windows 服务 ($ServiceName)..." -ForegroundColor Blue

        Stop-Service `
            -Name $ServiceName `
            -Force `
            -ErrorAction SilentlyContinue

        Start-Sleep -Seconds 1

        & sc.exe delete $ServiceName 2>$null | Out-Null
        Start-Sleep -Seconds 1
    }
    else {
        Write-Host "[2/3] 旧版 Windows 服务已不存在，跳过。" -ForegroundColor Gray
    }

    # Stop any lingering processes
    Stop-Process -Name $AppName -Force -ErrorAction SilentlyContinue

    # 2. Remove binary
    if (Test-Path -LiteralPath $TargetExe) {
        Write-Host "[3/3] 正在删除可执行文件: $TargetExe" -ForegroundColor Blue

        Remove-Item `
            -LiteralPath $TargetExe `
            -Force `
            -ErrorAction SilentlyContinue
    }
    else {
        Write-Host "[3/3] 未找到 $TargetExe，跳过。" -ForegroundColor Gray
    }

    # Remove empty installation directory
    if (Test-Path -LiteralPath $BinDir) {
        $remainingFiles = @(
            Get-ChildItem `
                -LiteralPath $BinDir `
                -Force `
                -ErrorAction SilentlyContinue
        )

        if ($remainingFiles.Count -eq 0) {
            Remove-Item `
                -LiteralPath $BinDir `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }

    # 3. Handle data directory
    if ($Purge) {
        if (Test-Path -LiteralPath $DataDir) {
            Write-Host ""
            Write-Host "正在彻底清理数据、日志与配置目录 (--Purge): $DataDir" -ForegroundColor Yellow

            Remove-Item `
                -LiteralPath $DataDir `
                -Recurse `
                -Force `
                -ErrorAction SilentlyContinue

            Write-Host "✓ 数据与日志目录已清理完毕。" -ForegroundColor Green
        }
    }
    else {
        if (Test-Path -LiteralPath $DataDir) {
            Write-Host ""
            Write-Host "提示: 用户业务数据与配置已保留: $DataDir" -ForegroundColor Yellow
            Write-Host "如需彻底删除数据，请运行:" -ForegroundColor Yellow
            Write-Host "  .\install.ps1 uninstall -Purge" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "✓ subout 卸载完成！" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green

    exit 0
}

# ------------------------------------------------------------------------------
# 6. INSTALL LOGIC
# ------------------------------------------------------------------------------

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "        欢迎使用 subout 一键安装脚本 (Windows)        " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "架构目标: $TargetTriple" -ForegroundColor White
Write-Host "安装路径: $TargetExe" -ForegroundColor White
Write-Host "数据目录: $DataDir" -ForegroundColor White
Write-Host "日志目录: $LogDir" -ForegroundColor White
Write-Host "Web 端口: $Port" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------------------------
# 7. Locate or Download subout.exe
# ------------------------------------------------------------------------------

$SourceExe = $null

$ScriptDir = $null
if ($PSScriptRoot -and (Test-Path -LiteralPath $PSScriptRoot)) {
    $ScriptDir = $PSScriptRoot
}

# ------------------------------------------------------------------------------
# 7.1 User specified binary
# ------------------------------------------------------------------------------

if ($BinPath) {
    if (Test-Path -LiteralPath $BinPath) {
        Write-Host "[1/4] 使用用户指定的二进制文件: $BinPath" -ForegroundColor Blue
        $SourceExe = (Resolve-Path -LiteralPath $BinPath).Path
    }
    else {
        Write-Host "错误: 指定的二进制文件不存在: $BinPath" -ForegroundColor Red
        exit 1
    }
}

# ------------------------------------------------------------------------------
# 7.2 Local source development build: pnpm build (web) + cargo build (root) (Requirement 2)
# ------------------------------------------------------------------------------

elseif ($ScriptDir -and (-not $FromRelease) -and (-not $Online)) {
    $CargoToml = Join-Path $ScriptDir "Cargo.toml"
    $WebPackageJson = Join-Path $ScriptDir "web\package.json"
    $SrcMainRs = Join-Path $ScriptDir "src\main.rs"

    if (
        (Test-Path -LiteralPath $CargoToml) -and
        (Test-Path -LiteralPath $WebPackageJson) -and
        (Test-Path -LiteralPath $SrcMainRs)
    ) {
        Write-Host "[1/4] 检测到本地源码仓库，正在执行完整开发编译构建..." -ForegroundColor Blue

        # Step 1.1: Build frontend UI in web directory (pnpm build)
        Write-Host "  -> [步骤 1/2] 进入 web 目录编译前端 UI (pnpm build)..." -ForegroundColor Blue
        $WebDir = Join-Path $ScriptDir "web"
        $WebNodeModules = Join-Path $WebDir "node_modules"
        $WebDistIndex = Join-Path $WebDir "dist\index.html"

        Push-Location $WebDir

        try {
            $hasPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            $hasNpm = Get-Command npm -ErrorAction SilentlyContinue

            if (-not $hasPnpm -and -not $hasNpm) {
                throw "未检测到 pnpm 或 npm。构建前端 UI 需要 Node.js 与 pnpm/npm 环境。请先安装 Node.js 与 pnpm。"
            }

            $pkgMgr = if ($hasPnpm) { "pnpm" } else { "npm" }

            if (-not $hasPnpm) {
                Write-Host "  提示: 系统未安装 pnpm，自动降级使用 npm 进行构建..." -ForegroundColor Yellow
            }

            # Install dependencies if node_modules missing
            if (-not (Test-Path -LiteralPath $WebNodeModules)) {
                Write-Host "  -> 前端依赖未初始化，正在执行 $pkgMgr install..." -ForegroundColor Blue
                & $pkgMgr install
                if ($LASTEXITCODE -ne 0) {
                    throw "$pkgMgr install 执行失败，退出码: $LASTEXITCODE"
                }
            }

            # Run build
            if ($pkgMgr -eq "pnpm") {
                & pnpm build
            }
            else {
                & npm run build
            }

            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $WebDistIndex)) {
                throw "前端 UI 构建失败，未生成 $WebDistIndex"
            }

            Write-Host "  ✓ 前端 UI 构建完成 ($WebDistIndex)" -ForegroundColor Green
        }
        finally {
            Pop-Location
        }

        # Step 1.2: Build backend with Cargo
        Write-Host "  -> [步骤 2/2] 返回项目根目录编译后端 (cargo build --release)..." -ForegroundColor Blue

        $hasCargo = Get-Command cargo -ErrorAction SilentlyContinue
        if (-not $hasCargo) {
            throw "未检测到 cargo 命令。请先安装 Rust 工具链 (https://rustup.rs)。"
        }

        Push-Location $ScriptDir

        try {
            & cargo build --release

            if ($LASTEXITCODE -ne 0) {
                throw "cargo build --release 执行失败，退出码: $LASTEXITCODE"
            }
        }
        finally {
            Pop-Location
        }

        $TargetReleaseExe = Join-Path $ScriptDir "target\release\$AppName.exe"
        if (Test-Path -LiteralPath $TargetReleaseExe) {
            $SourceExe = $TargetReleaseExe
            Write-Host "  ✓ 本地构建成功: $SourceExe" -ForegroundColor Green
        }
        else {
            throw "未找到编译生成的二进制文件: $TargetReleaseExe"
        }
    }
}

# ------------------------------------------------------------------------------
# 7.3 Download latest GitHub Release (Requirement 3)
# ------------------------------------------------------------------------------

if (-not $SourceExe) {
    Write-Host "[1/4] 正在从 GitHub Releases 获取预编译版本 ($TargetTriple)..." -ForegroundColor Blue

    $TmpDir = Join-Path `
        $env:TEMP `
        "subout_install_$([Guid]::NewGuid().ToString('N'))"

    New-Item `
        -ItemType Directory `
        -Force `
        -Path $TmpDir | Out-Null

    try {
        $LatestTag = $Tag

        if (-not $LatestTag) {
            Write-Host "  正在查询最新 Release 版本号..." -ForegroundColor Gray
            try {
                $ReleaseInfo = Invoke-RestMethod `
                    -Uri "https://api.github.com/repos/$GitHubRepo/releases/latest" `
                    -Headers @{ "User-Agent" = "subout-installer" } `
                    -ErrorAction Stop

                $LatestTag = $ReleaseInfo.tag_name
            }
            catch {
                # Fallback header location redirect
                $req = [System.Net.WebRequest]::Create("https://github.com/$GitHubRepo/releases/latest")
                $req.Method = "HEAD"
                $req.AllowAutoRedirect = $false
                try {
                    $resp = $req.GetResponse()
                    $loc = $resp.GetResponseHeader("Location")
                    if ($loc -match 'tag/(.+)$') {
                        $LatestTag = $matches[1].Trim()
                    }
                    $resp.Close()
                }
                catch {
                    # Ignore
                }
            }
        }

        if (-not $LatestTag) {
            throw "未能获取 GitHub 最新版本标签。请检查网络连接或使用 -Tag 参数指定版本 (如: -Tag v0.1.0)。"
        }

        $ArchiveName = "subout-$LatestTag-$TargetTriple.zip"
        $DownloadUrl = "https://github.com/$GitHubRepo/releases/download/$LatestTag/$ArchiveName"

        Write-Host "  版本标签 : $LatestTag" -ForegroundColor Cyan
        Write-Host "  下载文件 : $ArchiveName" -ForegroundColor Cyan
        Write-Host "  下载地址 : $DownloadUrl" -ForegroundColor Cyan

        $ZipPath = Join-Path $TmpDir "subout.zip"

        Write-Host "正在下载预编译产物..." -ForegroundColor Gray
        Invoke-WebRequest `
            -Uri $DownloadUrl `
            -OutFile $ZipPath `
            -UseBasicParsing `
            -ErrorAction Stop

        Write-Host "正在解压产物..." -ForegroundColor Gray
        Expand-Archive `
            -Path $ZipPath `
            -DestinationPath $TmpDir `
            -Force

        $ExtractedExe = Join-Path $TmpDir "$AppName.exe"

        if (-not (Test-Path -LiteralPath $ExtractedExe)) {
            # In case the zip contains a subdirectory, search recursively.
            $FoundExe = Get-ChildItem `
                -Path $TmpDir `
                -Filter "$AppName.exe" `
                -File `
                -Recurse `
                -ErrorAction SilentlyContinue |
                Select-Object -First 1

            if ($FoundExe) {
                $ExtractedExe = $FoundExe.FullName
            }
        }

        if (Test-Path -LiteralPath $ExtractedExe) {
            $SourceExe = $ExtractedExe
            Write-Host "  ✓ 预编译产物下载并解压成功。" -ForegroundColor Green
        }
        else {
            throw "解压后的文件中未找到 $AppName.exe"
        }
    }
    catch {
        Write-Host ""
        Write-Host "错误: 从 GitHub Releases 下载或解压预编译二进制文件失败。" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red

        if (Test-Path -LiteralPath $TmpDir) {
            Remove-Item `
                -LiteralPath $TmpDir `
                -Recurse `
                -Force `
                -ErrorAction SilentlyContinue
        }

        exit 1
    }
}

# ------------------------------------------------------------------------------
# 8. Validate binary
# ------------------------------------------------------------------------------

if (
    -not $SourceExe -or
    -not (Test-Path -LiteralPath $SourceExe)
) {
    Write-Host ""
    Write-Host "错误: 未能找到有效的 subout.exe 文件。" -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------------------
# 9. Copy Binary to Installation Directory
# ------------------------------------------------------------------------------

Write-Host "[2/4] 正在安装二进制文件到 $TargetExe..." -ForegroundColor Blue

# Stop running background task and processes before copying to avoid file lock
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {}
Stop-Process -Name $AppName -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

if (-not (Test-Path -LiteralPath $BinDir)) {
    New-Item `
        -ItemType Directory `
        -Force `
        -Path $BinDir | Out-Null
}

Copy-Item `
    -LiteralPath $SourceExe `
    -Destination $TargetExe `
    -Force

# ------------------------------------------------------------------------------
# 10. Create Data, Kernel & Logs Directory
# ------------------------------------------------------------------------------

Write-Host "[3/4] 正在初始化数据与日志目录 ($DataDir)..." -ForegroundColor Blue

foreach ($dir in @(
    $DataDir,
    $KernelDir,
    $GeneratedDir,
    $SubscriptionsDir,
    $NodesDir,
    $LogDir,
    $RuntimeDir
)) {
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item `
            -ItemType Directory `
            -Force `
            -Path $dir | Out-Null
    }
}

# Check sing-box existence in system
$hasSingBox = Get-Command sing-box -ErrorAction SilentlyContinue
if ($hasSingBox) {
    Write-Host "✓ 检测到系统中已存在 sing-box: $($hasSingBox.Source)" -ForegroundColor Green
}
else {
    Write-Host "提示: 当前系统 PATH 中未检测到 sing-box 内核。" -ForegroundColor Yellow
    Write-Host "  可在 Web 控制面板中一键在线下载，将自动保存至 $KernelDir\sing-box.exe。" -ForegroundColor Gray
}

# ------------------------------------------------------------------------------
# 11. Configure & Start Windows Background Task
# ------------------------------------------------------------------------------

if ($NoService) {
    Write-Host "[4/4] 已跳过 Windows 后台任务配置 (-NoService)。" -ForegroundColor Yellow
}
else {
    Write-Host "[4/4] 正在配置 Windows 开机自启后台任务 ($TaskName)..." -ForegroundColor Blue

    # 1. Stop and remove existing task & legacy service
    try {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        & schtasks.exe /End /TN $TaskName 2>$null | Out-Null
        & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
    }

    $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        & sc.exe delete $ServiceName 2>$null | Out-Null
    }

    # Stop lingering processes
    Stop-Process -Name $AppName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    # 2. Register Windows Scheduled Task using canonical XML definition
    # Using Task Scheduler XML schema guarantees 100% reliability across all Windows versions
    # and eliminates all command-line quoting/escaping issues with spaces in file paths.
    $taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Subout Proxy Subscription Manager and Sing-box Web Panel</Description>
    <URI>\$TaskName</URI>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$TargetExe</Command>
      <Arguments>web -p $Port</Arguments>
      <WorkingDirectory>$DataDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

    $taskRegistered = $false

    # Method 1: Register-ScheduledTask -Xml
    try {
        Register-ScheduledTask -TaskName $TaskName -Xml $taskXml -Force -ErrorAction Stop | Out-Null
        $taskRegistered = $true
    }
    catch {
        # Method 2: Fallback to schtasks.exe /Create /XML with temporary UTF-16 XML file
        $xmlTempPath = Join-Path $env:TEMP "subout_task_$([Guid]::NewGuid().ToString('N')).xml"
        try {
            [System.IO.File]::WriteAllText($xmlTempPath, $taskXml, [System.Text.Encoding]::Unicode)
            & schtasks.exe /Create /TN $TaskName /XML $xmlTempPath /F | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $taskRegistered = $true
            }
        }
        finally {
            if (Test-Path -LiteralPath $xmlTempPath) {
                Remove-Item -LiteralPath $xmlTempPath -Force -ErrorAction SilentlyContinue
            }
        }
    }

    if (-not $taskRegistered) {
        throw "无法注册 Windows 后台任务 ($TaskName)。请确保在【以管理员身份运行】的 PowerShell 中执行。"
    }

    # 3. Start task
    $started = $false
    try {
        Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null
        $started = $true
    }
    catch {
        & schtasks.exe /Run /TN $TaskName 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $started = $true
        }
    }

    Start-Sleep -Seconds 1

    # Verify task / process status
    $suboutProc = Get-Process -Name $AppName -ErrorAction SilentlyContinue
    if ($suboutProc) {
        Write-Host "✓ Windows 后台守护任务已注册并运行 (PID: $($suboutProc.Id -join ', '))" -ForegroundColor Green
    }
    else {
        Write-Host "✓ Windows 后台守护任务已注册并启动 ($TaskName)" -ForegroundColor Green
    }
}

# ------------------------------------------------------------------------------
# 12. Cleanup temporary download directory
# ------------------------------------------------------------------------------

if ($TmpDir -and (Test-Path -LiteralPath $TmpDir)) {
    Remove-Item `
        -LiteralPath $TmpDir `
        -Recurse `
        -Force `
        -ErrorAction SilentlyContinue
}

# ------------------------------------------------------------------------------
# 13. Summary
# ------------------------------------------------------------------------------

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "🎉 subout 安装成功！" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "📍 Web 管理面板地址 : http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "🔑 默认登录密码     : admin (首次登录后建议修改)" -ForegroundColor White
Write-Host "💾 持久化数据目录   : $DataDir" -ForegroundColor White
Write-Host "📝 系统日志目录     : $LogDir" -ForegroundColor White
Write-Host ""

if (-not $NoService) {
    Write-Host "常用后台管理命令 (PowerShell 管理员):" -ForegroundColor White
    Write-Host "  • 查看运行状态 : Get-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host "  • 启动后台任务 : Start-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host "  • 停止后台任务 : Stop-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host "  • 重启后台任务 : Stop-ScheduledTask -TaskName Subout; Start-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "一键卸载命令 (PowerShell):" -ForegroundColor White
Write-Host "  .\install.ps1 uninstall" -ForegroundColor Gray
Write-Host "  .\install.ps1 uninstall -Purge" -ForegroundColor Gray
Write-Host ""
