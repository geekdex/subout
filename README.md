# 🚀 subout

> **轻量、高自由度的 sing-box 跨平台代理客户端与 Web 可视化管理面板。**  
> *聚合多订阅节点统一调度，提供简单与深度自定义两种模式，支持 macOS / Linux / Windows 系统代理与 TUN 模式。*

[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![sing-box](https://img.shields.io/badge/sing--box-1.12%2B-blue)](https://sing-box.sagernet.org/)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](#-快速开始-quick-start)
[![License](https://img.shields.io/badge/License-MIT%2FApache--2.0-green)](LICENSE-MIT)

---

## 💡 项目初衷与特点

在日常使用中，很多代理客户端在配置和调度上不够灵活：要么只能局限在单一订阅内选择节点，无法将不同机场或自建节点混合调度；要么 UI 配置死板，难以随心所欲自定义 DNS、策略组与分流规则。

因此开发了 **subout**，旨在提供一个既能开箱即用、又具备高自由度可视化配置的跨平台 sing-box 代理管理工具：

* 🔄 **多订阅统一节点池**：将多个不同服务商的订阅链接、本地文件、自建节点或 Base64 汇集为统一「节点池」，策略组（如 `自动优选`、`流媒体`、`AI 专线`）可跨订阅自由搭配与调度节点。
* 🎭 **简单与专业双模式**：
  * **小白模式**：填入订阅链接即可一键启动代理，自动配置 DNS 与国内外规则分流，省心快捷。
  * **专业模式**：提供完整的可视化配置中心，自由定制 DNS 服务器、分流规则链与多类型策略组，支持配置语法校验与版本秒级回滚。
* 🌐 **全平台系统代理与 TUN 模式**：
  * **macOS**：支持系统代理与 TUN 模式，自动处理 DNS 转发并在退出时还原网络配置，杜绝断网残留。
  * **Windows**：支持系统代理实时刷新（浏览器即时生效无需重启）与 TUN 模式。
  * **Linux**：基于 TUN 虚拟网卡与网络 Capabilities 实现轻量透明代理。
* ⚡ **单二进制无依赖**：前端 Web UI 编译期嵌入单一 Rust 二进制，内存占用低，后台守护服务毫秒级启停。
* 🛡️ **节点净化与安全提示**：自动剔除包含到期时间、剩余流量、官网公告等非代理节点，重名节点自动加序号；主动识别并提示存在安全风险的节点配置。

---

## 🚀 快速开始 (Quick Start)

### 1. 方式 A：在线一键安装（推荐普通用户）

脚本会自动识别操作系统与 CPU 架构，从 GitHub Releases 下载最新预编译包并配置开机自启后台守护服务：

* **Linux & macOS (Bash)**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh | bash
  ```
* **Windows (PowerShell 管理员)**:
  ```powershell
  irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1 | iex
  ```

安装成功后打开浏览器访问：`http://127.0.0.1:1234`（默认登录密码：`admin`）。

---

### 2. 方式 B：开发者源码本地编译安装（推荐二次开发）

在源码目录下直接执行安装脚本，会自动进入 `web` 执行 `pnpm build` 前端打包，并返回根目录执行 `cargo build --release` 后覆盖安装并重启服务：

* **Linux & macOS (Bash)**:
  ```bash
  sudo ./install.sh
  ```
* **Windows (PowerShell 管理员)**:
  ```powershell
  .\install.ps1
  ```

---

### 3. 常用服务管理与一键卸载速查

<details open>
<summary><b>🐧 Linux (systemd)</b></summary>

| 操作需求 | 执行命令 |
| :--- | :--- |
| **查看服务状态** | `systemctl status subout` |
| **查看实时日志** | `sudo journalctl -u subout -f` |
| **重启后台服务** | `sudo systemctl restart subout` |
| **停止后台服务** | `sudo systemctl stop subout` |
| **一键卸载 (保留数据)** | `sudo ./install.sh uninstall` |
| **彻底卸载 (清理数据)** | `sudo ./install.sh uninstall --purge` |

</details>

<details open>
<summary><b>🍎 macOS (launchd)</b></summary>

| 操作需求 | 执行命令 |
| :--- | :--- |
| **查看服务状态** | `launchctl list \| grep subout` |
| **查看实时日志** | `tail -f "/Library/Logs/Subout/stdout.log"` |
| **重启后台服务** | `sudo launchctl kickstart -k system/io.github.geekdex.subout` |
| **停止后台服务** | `sudo launchctl unload -w "/Library/LaunchDaemons/io.github.geekdex.subout.plist"` |
| **一键卸载 (保留数据)** | `sudo ./install.sh uninstall` |
| **彻底卸载 (清理数据)** | `sudo ./install.sh uninstall --purge` |

</details>

<details open>
<summary><b>▦ Windows (PowerShell 管理员)</b></summary>

| 操作需求 | 执行命令 |
| :--- | :--- |
| **查看运行状态** | `Get-ScheduledTask -TaskName Subout` |
| **启动后台任务** | `Start-ScheduledTask -TaskName Subout` |
| **停止后台任务** | `Stop-ScheduledTask -TaskName Subout` |
| **重启后台任务** | `Stop-ScheduledTask -TaskName Subout; Start-ScheduledTask -TaskName Subout` |
| **一键卸载 (保留数据)** | `.\install.ps1 uninstall` |
| **彻底卸载 (清理数据)** | `.\install.ps1 uninstall -Purge` |

</details>

---

## 🌟 核心功能特性

### 1️⃣ 多订阅聚合与统一节点池
* **全协议兼容**：支持 VMess / VLESS / Shadowsocks / Trojan / SOCKS5 / HTTP / Anytls / Hysteria / Hysteria2 等协议。
* **跨源汇聚**：可添加多条不同机场的 HTTP/HTTPS 订阅链接、Base64 编码文本、节点 URI 或本地文件。
* **去重与净化**：自动剔除包含 `流量`、`到期`、`官网`、`公告` 的非代理节点；自动重名消重（`-1`、`-2`）。
* **节点网络测速**：支持节点批量 TCP/ICMP 延迟测试与真实网站连通性测速（Google、YouTube、GitHub、OpenAI）。
* **自动定时更新**：支持按指定时间间隔在后台自动同步更新订阅节点，并平滑热重载内核。

### 2️⃣ 双模式自由切换
* **小白模式 (Simple Mode)**：
  * 面向追求省心快捷的用户。
  * 仅需添加订阅并选择出站模式（**规则分流**、**全局代理**、**直接连接**、**TUN 虚拟网卡**），一键启动代理。
  * 自动预设纯净 DNS 解析方案与国内/国外/广告拦截分流策略。
* **专业模式 (Expert Mode)**：
  * 面向追求深度定制与精细网络分流的用户。
  * **策略组管理**：支持创建 `selector`（手动选择）、`urltest`（自动延迟优选）、`fallback`、`direct`、`block` 策略组；支持静态节点勾选或动态正则过滤规则。
  * **可视化 DNS 编辑器**：自定义 Direct/Remote/FakeIP DNS 服务器与 DNS 路由规则。
  * **可视化路由规则链**：支持基于域名 (Domain/DomainSuffix/DomainKeyword)、GeoIP、GeoSite、端口、协议等规则进行精准分流。
  * **配置快照历史**：每一次保存与修改均自动生成版本快照，支持配置差异对比与一键快速回滚。
  * **语法校验**：集成 `sing-box check` 语法检查，错误精准高亮定位，防止配置失误导致服务异常。

### 3️⃣ sing-box 内核管理
* **内核检索**：优先级为 `--kernel-path` > 环境变量 `SUBOUT_SINGBOX_PATH` > 系统 `PATH` > `<data_dir>/bin/sing-box` > 平台标准路径。
* **一键在线安装/更新**：若系统未安装 sing-box，可在 Web 面板中直接下载官方最新内核至数据目录。
* **进程冲突排查**：启动时自动扫描并提示外部冲突的 sing-box 进程，支持在 Web 界面上一键查杀释放端口。

---

## 💻 CLI 命令行参数 (服务与高级选项)

`subout` 支持通过命令行指定参数启动 Web 服务，也支持在自动化脚本中作为单次配置导出工具使用：

```bash
# 1. 启动 Web 管理面板 (默认端口 1234)
subout web -p 8080

# 2. 便携模式启动 (使用当前目录下的 ./data、./logs、./config)
subout --portable web -p 1234

# 3. 单次解析订阅并导出 sing-box outbounds 配置
subout -s "https://example.com/sub/token" -o outbounds.json -v
```

**CLI 参数完全指南**：

| 参数 | 长参数 | 类型 | 说明 |
| :--- | :--- | :---: | :--- |
| `-s` | `--source` | `String` | **(必填)** 订阅源：支持 HTTP(S) 链接、本地文件、Base64 或明文 URI 节点 |
| `-o` | `--output` | `String` | **(必填)** 导出的 sing-box `outbounds` JSON 路径 |
| `-v` | `--verbose` | Flag | 开启详细输出，显示协议统计与 TLS 安全审计警告 |
| `-p` | `--port` | `u16` | 指定 Web 面板运行端口 (默认: `1234`) |
| | `--portable` | Flag | 启动便携模式，强行使用当前目录下的 `./data`、`./logs`、`./config` |
| | `--kernel-path` | `Path` | 显式指定外部 `sing-box` 可执行文件路径 |
| | `--data-dir` | `Path` | 自定义持久化数据目录 (覆盖默认系统路径) |
| | `--config-dir` | `Path` | 自定义配置文件目录 |
| | `--log-dir` | `Path` | 自定义日志输出目录 |
| | `--runtime-dir` | `Path` | 自定义临时运行目录 |
| `-h` | `--help` | Flag | 显示 CLI 帮助菜单 |

---

## 🛠️ 本地二次开发 (Development)

### 1. 开发环境依赖
* **Rust**: 1.70+ (`cargo` / `rustc`)
* **Node.js**: 18+ 与 `pnpm` (推荐，或 `npm`)

### 2. 开发调试流程
后端在开发模式下运行 `cargo run` 会自动识别开发环境，并将所有数据与日志隔离在本地 `./runtime/` 目录中，完全无需 Root 权限：

```bash
# 启动前端 Vite 热更新开发服务 (调试 UI)
cd web
pnpm install
pnpm dev

# 启动 Rust 后端服务 (自动检测前端静态资源并嵌入)
cargo run -- web -p 1234
```

### 3. 本地全量构建与安装
`build.rs` 在编译 Rust 后端时会自动调用 `pnpm build` 将前端打包为单文件并嵌入 Rust 二进制中：

```bash
# 仅编译单二进制 Release 产物
cargo build --release

# 一键本地构建 + 覆盖安装并重启系统守护服务
sudo ./install.sh   # Linux & macOS
.\install.ps1        # Windows (PowerShell 管理员)
```

---

## 📂 跨平台运行目录规范

| 运行环境 / 平台 | 数据目录 (`data_dir`) | 日志目录 (`log_dir`) | 配置目录 (`config_dir`) | 临时运行目录 (`runtime_dir`) |
| :--- | :--- | :--- | :--- | :--- |
| **开发环境 (`cargo run`)** | `./runtime/data/` | `./runtime/logs/` | `./runtime/config/` | `./runtime/run/` |
| **便携模式 (`--portable`)** | `./data/` | `./logs/` | `./config/` | `./run/` |
| **Linux (生产守护)** | `/var/lib/subout/` | `/var/log/subout/` | `/etc/subout/` | `/run/subout/` |
| **macOS (生产守护)** | `/Library/Application Support/Subout/` | `/Library/Logs/Subout/` | `/Library/Application Support/Subout/config/` | `/Library/Application Support/Subout/run/` |
| **Windows (生产守护)** | `C:\ProgramData\Subout\` | `C:\ProgramData\Subout\logs\` | `C:\ProgramData\Subout\config\` | `C:\ProgramData\Subout\run\` |

> **数据目录内容结构**：
> * `subout.db`：SQLite 业务数据库（订阅源、分流组、节点池、历史版本）
> * `bin/sing-box`：自动管理与下载的 sing-box 官方内核
> * `generated/sing-box.json`：由 Subout 派生生成的完整 sing-box 运行配置

---

## ⚖️ 开源协议

本项目采用双重开源协议：
- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)
