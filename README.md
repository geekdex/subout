# subout

专为 **sing-box** 生态打造的轻量级代理订阅转换 CLI 工具与 Web 可视化管理面板。

[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![sing-box](https://img.shields.io/badge/sing--box-Outbounds-blue)](https://sing-box.sagernet.org/)
[![License](https://img.shields.io/badge/License-MIT%2FApache--2.0-green)](LICENSE-MIT)

`subout` 旨在解决 sing-box 配置过程中订阅转换繁琐、节点清洗困难以及多订阅管理复杂的问题。支持一键解析 VMess/VLESS/SS/Trojan/Socks/HTTP/Anytls/Hysteria(2) 等代理协议并导出为 sing-box `outbounds` 配置，同时提供嵌入式 Web 面板用于多订阅聚合、策略组配置与版本历史管理。

---

## 🚀 一、直接使用 (Usage & Quick Start)

### 1. 安装与服务部署

#### 方式 A：在线一键安装（推荐普通用户）
自动从 GitHub 下载最新 Release 预编译产物，并注册系统后台守护服务：

* **Linux & macOS (Bash)**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh | bash
  ```
* **Windows (PowerShell 管理员)**:
  ```powershell
  irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1 | iex
  ```

#### 方式 B：开发者源码本地编译安装（推荐开发者）
在源码目录中一键编译最新程序并一步安装注册到系统：

* **Linux & macOS (Bash)**:
  ```bash
  # 运行源码安装脚本（自动调用 cargo build --release 编译最新代码并覆盖安装至 /usr/local/bin/subout）
  sudo ./install.sh

  # 【常用高级选项】
  sudo ./install.sh -p 8080       # 指定 Web 面板服务端口
  sudo ./install.sh --no-service  # 仅安装二进制文件，不配置/启动守护服务
  ```
  > 💡 *提示：只要在源码目录下运行 `sudo ./install.sh`，脚本会自动调用 `cargo build --release` 编译最新代码并覆盖安装，随后运行重启命令即可立即生效。*

* **Windows (PowerShell 管理员)**:
  ```powershell
  # 1. 编译最新 Release 产物
  cargo build --release

  # 2. 运行安装脚本（安装至 C:\Program Files\Subout 并注册 Windows 服务）
  .\install.ps1

  # 【常用高级选项】
  .\install.ps1 -Port 8080        # 指定 Web 面板服务端口
  .\install.ps1 -NoService        # 仅安装二进制文件，不注册 Windows 服务
  ```

---

### 2. 运行模式

#### 模式 A：Web 可视化面板模式
未提供 CLI 导出参数时默认启动 Web 面板：

```bash
# 默认启动（自动进入开发模式或生产环境）
subout

# 指定端口启动
subout web -p 8080

# 便携模式运行（数据直接保存在当前目录 ./data/）
subout --portable web -p 1234
```

* **📍 访问地址**：`http://127.0.0.1:1234`（默认端口 `1234`，占用时自动在 `1234`~`1244` 探测空闲端口）
* **🔑 默认密码**：`admin`（建议首次登录后修改）
* **🌐 环境变量配置**：
  * `PORT=8080`：显式指定 Web 面板监听端口
  * `ADMIN_PASSWORD=your_password`：环境变量级别锁定管理员密码（锁定后禁用面板界面修改）

#### 模式 B：CLI 命令行转换模式
适用于单次订阅转换、Shell 自动化脚本或 Cron 定时任务：

```bash
# 从远程 HTTP(S) 订阅解析并导出 sing-box outbounds JSON
subout -s "https://example.com/sub/token" -o outbounds.json -v

# 从本地订阅文件 / 纯文本 / Base64 / 节点 URI 解析导出
subout -s ./subscription.txt -o outbounds.json

# Linux Cron 定时任务示例（每 6 小时自动更新节点并重启 sing-box）
0 */6 * * * /usr/local/bin/subout -s "https://example.com/sub" -o /var/lib/subout/generated/sing-box.json && systemctl restart sing-box
```

**CLI 参数完全指南**：

| 参数 | 长参数 | 类型 | 说明 |
| :--- | :--- | :---: | :--- |
| `-s` | `--source` | `String` | **(必填)** 订阅源：支持 HTTP(S) 链接、本地文件、Base64 或明文 URI 节点 |
| `-o` | `--output` | `String` | **(必填)** 导出的 sing-box `outbounds` JSON 路径 |
| `-v` | `--verbose` | Flag | 开启详细输出，显示协议统计与 TLS 安全审计警告 |
| `-p` | `--port` | `u16` | 指定 Web 面板运行端口 (默认: `1234`) |
| | `--portable` | Flag | 启动便携模式，强行使用当前目录下的 `./data`、`./logs`、`./config` |
| | `--singbox-path` / `--kernel-path` | `Path` | 显式指定外部 `sing-box` 可执行文件路径 |
| | `--data-dir` | `Path` | 自定义持久化数据目录 (覆盖默认系统路径) |
| | `--config-dir` | `Path` | 自定义配置文件目录 |
| | `--log-dir` | `Path` | 自定义日志输出目录 |
| | `--runtime-dir` | `Path` | 自定义临时运行目录 |
| `-h` | `--help` | Flag | 显示 CLI 帮助菜单 |

---

### 3. 常用服务管理与一键卸载速查表

| 平台 | 查看实时日志 | 重启守护服务 | 停止守护服务 | 一键卸载 (保留数据) | 彻底卸载 (清理数据) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Linux** | `sudo journalctl -u subout -f` | `sudo systemctl restart subout` | `sudo systemctl stop subout` | `sudo ./install.sh uninstall` | `sudo ./install.sh uninstall --purge` |
| **macOS** | `tail -f "/Library/Logs/Subout/stdout.log"` | `sudo launchctl kickstart -k system/io.github.geekdex.subout` | `sudo launchctl unload -w "/Library/LaunchDaemons/io.github.geekdex.subout.plist"` | `sudo ./install.sh uninstall` | `sudo ./install.sh uninstall --purge` |
| **Windows** | `Get-Content C:\ProgramData\Subout\logs\stdout.log -Wait -Tail 50` | `Restart-Service subout` | `Stop-Service subout` | `.\install.ps1 uninstall` | `.\install.ps1 uninstall -Purge` |

---

## 💡 二、核心原理 (Principles & Architecture)

### 1. 订阅解析与节点净化工作流
`subout` 内置高性能 Rust 解析引擎与自动净化机制：
1. **全协议解析**：自适应解析 VMess, VLESS, Shadowsocks, Trojan, SOCKS5, HTTP, Anytls, Hysteria, Hysteria2 等协议。
2. **公告净化**：自动识别并剔除包含`流量`、`到期`、`官网`、`公告`等无实际代理功能的非节点信息。
3. **Tag 去重**：当订阅节点重名时，自动追加 `-1`, `-2` 后缀，防止 sing-box 配置校验通过失败。
4. **安全审计**：扫描并警告 `allowInsecure: true` 等存在中间人攻击隐患的不安全 TLS 设置。

### 2. 架构设计与 sing-box 联动
* **单文件零依赖**：Axum 后端 + Vite/Vue 3 前端静态资源在编译期打包入单二进制文件，零外置 UI 依赖。
* **SQLite 持久化**：Web 模式下在数据目录保存 SQLite 数据库（管理多订阅源、分流策略组 `selector`/`urltest`、版本历史对比回滚与日志）。
* **sing-box 内核发现与调度**：
  * **查找优先级**：`--singbox-path` 参数 > 环境变量 `SUBOUT_SINGBOX_PATH` > 系统 `PATH` (`sing-box`) > `<data_dir>/bin/sing-box` (面板一键在线下载) > 系统常用路径 (`/opt/homebrew/bin/sing-box` 等)。
  * Subout 可派生生成完整 `sing-box.json` 并调用内核执行语法检查 (`sing-box check`) 及后台守护。

### 3. 跨平台运行目录规范与路径优先级

| 运行模式 / 平台 | 数据目录 (`data_dir`) | 日志目录 (`log_dir`) | 配置文件目录 (`config_dir`) | 临时运行目录 (`runtime_dir`) |
| :--- | :--- | :--- | :--- | :--- |
| **开发环境 (`cargo run`)** | `./runtime/data/` | `./runtime/logs/` | `./runtime/config/` | `./runtime/run/` |
| **便携模式 (`--portable`)** | `./data/` | `./logs/` | `./config/` | `./run/` |
| **Linux (生产环境)** | `/var/lib/subout/` | `/var/log/subout/` | `/etc/subout/` | `/run/subout/` |
| **macOS (生产环境)** | `/Library/Application Support/Subout/` | `/Library/Logs/Subout/` | `/Library/Application Support/Subout/config/` | `/Library/Application Support/Subout/run/` |
| **Windows (生产环境)** | `C:\ProgramData\Subout\` | `C:\ProgramData\Subout\logs\` | `C:\ProgramData\Subout\config\` | `C:\ProgramData\Subout\run\` |

* **数据目录内部结构**：
  * `subout.db`：SQLite 业务数据库（订阅源、分流组、历史版本）
  * `bin/sing-box`：自动下载与管理的 sing-box 内核
  * `generated/sing-box.json`：由 Subout 派生生成的完整 sing-box 运行配置
* **路径优先级解析**：CLI 命令行参数 > 环境变量 (`SUBOUT_*`) > 便携模式 (`--portable`) > 开发模式 (`cargo run`) > 系统默认生产路径。

### 4. 跨平台全自动系统代理与 TUN DNS 调度（无感透明代理）

Subout 调度器在拉起 sing-box 内核的同时，会在系统底层自动完成网络接管与安全还原，彻底抹平跨平台网络协议栈的引流差异：

| 平台 | 启动时自动接管 (无感代理) | 退出时自动还原 (安全无残留) |
| :--- | :--- | :--- |
| **macOS (Apple)** | • 自动调用 `networksetup` 为所有活动网络接口（Wi-Fi/以太网）开启系统 HTTP、HTTPS、SOCKS 代理。<br>• **TUN 模式下自动将系统 DNS 转发至 TUN 虚拟网关 (`172.19.0.1`)**，彻底解决 macOS `mDNSResponder` 绕过 TUN 导致的 DNS 污染与死锁。 | 停止或退出时，自动注销系统代理并恢复系统原始 DHCP DNS，绝不残留断网。 |
| **Windows** | • 自动写入注册表 `Internet Settings` 系统代理 (`ProxyEnable=1`) 并设置局域网绕过白名单。<br>• **自动调用 WinINet API 广播系统刷新**，Edge、Chrome 等运行中的浏览器立即生效，无需重启应用。 | 停止或退出时，自动置 `ProxyEnable=0` 并广播刷新 WinINet，恢复系统直连状态。 |
| **Linux** | • 原生依靠 TUN 网卡、路由表及 Capabilities (`CAP_NET_ADMIN`) 完成内核级透明代理接管。 | 退出时自动释放虚拟网卡与系统路由表。 |

> 💡 **真正的全局无感代理**：在 macOS / Linux / Windows 下启动服务后，无需在终端手动配置 `export http_proxy`，也不需要在浏览器安装代理插件，终端命令（如 `curl "https://www.google.com"`、`git`、`pip`）与图形界面软件全部自动透明走代理。

### 5. 配置体系设计：100% 所见即所得 (WYSIWYG)

* **配置与调度严格解耦**：你在 Web 面板、CLI 或从 SFM (sing-box for macOS) 导入的 JSON 配置保持 100% 原汁原味（所见即所得），Subout 不会在后台破坏或擅自重排你的自定义分流规则。
* **跨平台语法防御**：仅在跨平台不兼容时（如 macOS/Windows 遇到 Linux 特有的 `auto_redirect`）做语法级防御过滤，确保内核稳定启动。

### 6. 守护服务快速重启与平滑退出机制
* **秒级响应重启**：捕获 `SIGTERM` / `SIGINT` 信号后，主程序立即终止底层 sing-box 进程并清理网卡路由，同时限制 HTTP Socket 优雅退出最大超时为 `300ms`。
* **避免命令卡顿**：解决执行 `sudo launchctl kickstart -k system/io.github.geekdex.subout` (macOS) 或 `sudo systemctl restart subout` (Linux) 时因等待 HTTP 保持连接超时而卡顿 20+ 秒的问题，重启命令可在 **0.5 秒内瞬间完成**。

---

## 🛠️ 三、本地开发 (Development)

### 1. 开发环境依赖
* **Rust**: 1.70+ (`cargo` / `rustc`)
* **Node.js**: 18+ 与 `npm` (用于 Vue 3 前端构建)

### 2. 本地开发与调试
后端在开发模式下自动将数据隔离至 `./runtime/` 目录，完全免 Root 权限：

```bash
# 前端开发 (在 web 目录下启动 Vite 热更新服务)
cd web
npm install
npm run dev

# 后端开发 (在项目根目录下启动 Rust 后端)
cargo run -- web -p 1234
```

### 3. 本地构建打包
Rust 的 `build.rs` 脚本在编译后端时会自动检测 `web/` 目录中的改动，并自动调用 `npm run build` 将前端静态资源打包嵌入二进制：

```bash
# 编译包含前端 UI 的最终单文件二进制
cargo build --release
```
编译产物位于：`./target/release/subout` (Windows 下为 `subout.exe`)

### 4. 源码目录一键安装最新程序到系统
源码修改并编译完成后，可以直接调用本地安装脚本一键覆盖安装并重启服务：

```bash
# Linux & macOS
sudo ./install.sh

# Windows (PowerShell 管理员)
.\install.ps1
```

---

## 🔧 常见问题与故障排查

* **端口被占用**：启动时提示端口被占用，可通过 `subout web -p 8080` 或环境变量 `PORT=8080` 指定空闲端口。
* **权限错误**：安装服务或向 `/usr/local/bin` / `/var/lib/subout` 写入文件时，需确保使用 `sudo` (Linux/macOS) 或以管理员身份运行 PowerShell (Windows)。

---

## 📂 项目结构

```txt
├── Cargo.toml          # Rust 后端依赖与配置
├── build.rs            # 前端静态资源自动打包与嵌入脚本
├── install.sh          # Linux / macOS 一键安装与服务守护脚本
├── install.ps1         # Windows 一键安装与服务守护脚本
├── src/                # 后端源码 (Axum Web + SQLite + Parser + sing-box 调度)
└── web/                # 前端源码 (Vue 3 + Vite + Vanilla CSS)
```

---

## ⚖️ 开源协议

本项目采用双重开源协议：
- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)


