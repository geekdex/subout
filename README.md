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

**subout** 旨在提供一个既能开箱即用、又具备高自由度可视化配置的跨平台 sing-box 代理管理工具：

* 🔄 **多订阅统一节点池**：将多个不同服务商的订阅链接、本地文件、自建节点或 Base64 汇集为统一「节点池」，策略组（如 `自动优选`、`流媒体`、`AI 专线`）可跨订阅自由搭配与调度节点。
* 🎭 **简单与专业双模式**：
  * **小白模式**：填入订阅链接即可一键启动代理，自动预设 DNS 解析方案与国内直连/国外代理/广告拦截分流策略。
  * **专业模式**：提供完整的可视化配置中心，自由定制 DNS 服务器、分流规则链与多类型策略组，支持配置语法校验与版本秒级回滚。
* 🌐 **全平台系统代理与 TUN 模式**：
  * **macOS**：支持系统代理与 TUN 虚拟网卡模式，服务停止与卸载时自动清理系统代理与 DNS 设置，杜绝断网残留。
  * **Windows**：系统级后台计划任务运行，支持系统代理实时刷新（无需重启浏览器）与 TUN 模式。
  * **Linux**：基于 systemd 系统服务与网络 Capabilities（`CAP_NET_ADMIN` 等）实现轻量透明代理。
* ⚡ **单二进制无依赖**：前端 Web UI 编译期嵌入单一 Rust 二进制产物中，内存占用极低，后台守护服务毫秒级启停。
* 🛡️ **节点净化与安全提示**：自动剔除包含到期时间、剩余流量、官网公告等非代理节点，重名节点自动加序号消重；主动识别并提示存在安全风险的节点配置（如 `allowInsecure: true`）。

---

## 🚀 快速开始 (Quick Start)

### 1. 方式 A：在线一键安装（推荐普通用户）

脚本会自动识别操作系统与 CPU 架构，从 GitHub Releases 下载最新预编译包，并配置开机自启后台守护服务：

* **Linux & macOS (Bash)**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh | bash
  ```
  > **注意**：脚本在注册系统后台服务与配置网络权限（TUN / 系统代理）时，会按需提示输入 `sudo` 密码提权。

* **Windows (PowerShell 管理员)**:
  ```powershell
  irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1 | iex
  ```

安装成功后打开浏览器访问：`http://127.0.0.1:1234`（默认登录密码：`admin`）。

> [!TIP]
> **sing-box 内核安装**：若系统中未检测到现有的 sing-box 内核，进入 Web 面板的「设置」页面即可一键在线下载对应平台的官方内核，亦可手动将内核放置于系统的 PATH 或数据目录下。

---

### 2. 方式 B：开发者源码本地编译安装（推荐二次开发）

在源码目录下直接执行安装脚本，会自动进入 `web` 目录执行 `pnpm build` 打包前端，并调用 `cargo build --release` 编译单二进制，最后安装并启动守护服务：

* **Linux & macOS (Bash)**:
  ```bash
  # 推荐以普通用户身份运行：自动编译前端与后端，仅在安装系统服务时提权 sudo
  ./install.sh
  ```
* **Windows (PowerShell 管理员)**:
  ```powershell
  .\install.ps1
  ```

---

### 3. 常用服务管理与一键卸载速查

> [!IMPORTANT]
> **为什么在 macOS 上查看与管理服务必须使用 `sudo`？**  
> `subout` 接管 sing-box 运行，需要创建虚拟网卡（`utun` 设备）、配置系统路由以及调用 `networksetup` 自动修改网络代理，这些操作均需要系统 root 特权。因此安装脚本将 `subout` 注册为系统级后台守护服务（位于 `/Library/LaunchDaemons/`，属于 `system` 域）。  
> 如果直接使用普通权限执行 `launchctl list`，macOS 只会检索当前登录用户的 `gui/<uid>` 域，**无法查看到系统级 LaunchDaemon**。因此，必须使用 `sudo launchctl list | grep subout` 才能正确查看服务状态。

<details open>
<summary><b>🍎 macOS (launchd)</b></summary>

| 操作需求 | 执行命令 | 说明 |
| :--- | :--- | :--- |
| **查看服务状态 (简要)** | `sudo launchctl list \| grep subout` | **必须带 sudo**，正常运行时首列显示进程 PID |
| **查看服务详细状态** | `sudo launchctl print system/io.github.geekdex.subout` | 查看进程运行状态、退出码与参数 |
| **启动后台服务** | `sudo launchctl load -w /Library/LaunchDaemons/io.github.geekdex.subout.plist` | 加载并启动守护服务 |
| **停止后台服务** | `sudo launchctl unload -w /Library/LaunchDaemons/io.github.geekdex.subout.plist` | 停止服务（退出前会自动还原系统代理） |
| **重启后台服务** | `sudo launchctl kickstart -k system/io.github.geekdex.subout` | 优雅重启守护服务进程 |
| **查看实时标准日志** | `tail -f "/Library/Logs/Subout/stdout.log"` | 查看 Web 面板与内核标准输出日志 |
| **查看实时错误日志** | `tail -f "/Library/Logs/Subout/stderr.log"` | 查看异常报错与排查信息 |
| **一键卸载 (保留数据)** | 本地执行：`sudo ./install.sh uninstall`<br>在线执行：`curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh \| sudo bash -s -- uninstall` | 停止服务并删除二进制与 plist，保留数据库 |
| **彻底卸载 (清理数据)** | 本地执行：`sudo ./install.sh uninstall --purge`<br>在线执行：`curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh \| sudo bash -s -- uninstall --purge` | 连同数据目录、日志与配置一同彻底删除 |

</details>

<details open>
<summary><b>🐧 Linux (systemd)</b></summary>

| 操作需求 | 执行命令 | 说明 |
| :--- | :--- | :--- |
| **查看服务状态** | `systemctl status subout` 或 `sudo systemctl status subout` | 查看 systemd 服务运行状态与最近日志 |
| **启动后台服务** | `sudo systemctl start subout` | 启动守护服务 |
| **停止后台服务** | `sudo systemctl stop subout` | 停止服务 |
| **重启后台服务** | `sudo systemctl restart subout` | 重启服务 |
| **查看实时日志** | `sudo journalctl -u subout -f` | 实时跟踪服务运行日志 |
| **一键卸载 (保留数据)** | 本地执行：`sudo ./install.sh uninstall`<br>在线执行：`curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh \| sudo bash -s -- uninstall` | 停止服务并清理 unit，保留配置和数据库 |
| **彻底卸载 (清理数据)** | 本地执行：`sudo ./install.sh uninstall --purge`<br>在线执行：`curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh \| sudo bash -s -- uninstall --purge` | 彻底清理系统用户、数据与日志目录 |

</details>

<details open>
<summary><b>🪟 Windows (PowerShell 管理员)</b></summary>

| 操作需求 | 执行命令 | 说明 |
| :--- | :--- | :--- |
| **查看运行状态** | `Get-ScheduledTask -TaskName Subout` | 查看计划任务状态（Ready / Running） |
| **启动后台任务** | `Start-ScheduledTask -TaskName Subout` | 启动后台守护任务 |
| **停止后台任务** | `Stop-ScheduledTask -TaskName Subout` | 停止后台守护任务 |
| **重启后台任务** | `Stop-ScheduledTask -TaskName Subout; Start-ScheduledTask -TaskName Subout` | 重新启动任务 |
| **一键卸载 (保留数据)** | 本地执行：`.\install.ps1 uninstall`<br>在线执行：`& ([scriptblock]::Create((irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1))) uninstall` | 停止任务并删除可执行文件，保留数据 |
| **彻底卸载 (清理数据)** | 本地执行：`.\install.ps1 uninstall -Purge`<br>在线执行：`& ([scriptblock]::Create((irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1))) uninstall -Purge` | 连同 `C:\ProgramData\Subout` 一同彻底删除 |

</details>

---

## 🌟 核心功能特性

### 1️⃣ 多订阅聚合与统一节点池
* **全协议兼容**：支持 `VMess`、`VLESS`（含 Reality / TLS / Vision / WebSocket / gRPC / HTTP2 等传输层）、`Shadowsocks`、`Trojan`、`SOCKS5`、`HTTP(S)`、`Anytls`、`Hysteria`、`Hysteria2`。
* **多源汇聚**：支持添加多条 HTTP/HTTPS 订阅链接、Base64 编码文本、节点 URI 列表或本地文件。
* **智能去重与净化**：自动剔除包含 `流量`、`到期`、`官网`、`公告`、`群组` 等非代理属性的节点；自动对重复 tag 的节点添加序号后缀消重。
* **订阅信息读取**：自动从响应头 `Subscription-Userinfo` 或订阅文本内容中提取已用上传/下载、总流量配额与到期时间。
* **节点测试与真实连通性**：支持节点批量 TCP 延迟测试与主流网站连通性测速（Google、YouTube、GitHub、OpenAI）。
* **自动定时更新**：支持后台按指定周期自动同步订阅节点，并平滑热重载 sing-box 内核。

### 2️⃣ 双模式自由切换
* **小白模式 (Simple Mode)**：
  * **分流路由模式**：
    * `智能分流 (Smart)`：国内直连，国外走代理（绕过大陆白名单模式）。
    * `全局代理 (Global)`：所有网络流量走代理节点。
    * `GFW 列表分流 (GFW)`：仅被阻断域名走代理，其余直连。
  * **特性开关**：一键开启广告与追踪拦截（`geosite:category-ads-all`）、局域网私网直连（`geoip:private` / `cn`）。
  * **DNS 预设**：一键选择 `FakeIP 方案`（防污染、防泄露、极速解析）、`国内外双 DNS 分流`（国内阿里 223.5.5.5，国外 FakeIP/公共 DNS）或自定义 DNS。
  * **代理模式**：支持 `TUN 虚拟网卡` 模式（透明接管全局流量）与 `Mixed 本地混合端口`（HTTP/SOCKS，配合系统代理设置）。
* **专业模式 (Expert Mode)**：
  * **策略组深度管理**：支持创建 `selector`（手动选择）、`urltest`（自动延迟优选）、`fallback`（故障转移）策略组；支持勾选静态节点或配置正则表达式动态筛选匹配节点。
  * **可视化 DNS 编辑器**：自定义 Direct / Remote / FakeIP DNS 服务器与多条件 DNS 路由规则链。
  * **可视化路由规则链**：支持基于域名（Domain / Suffix / Keyword / Regex）、GeoIP、GeoSite、端口（Port / PortRange）、入站（Inbound）、网络协议（Protocol）等多维条件精准分流。
  * **语法校验与安全审计**：实时集成 `sing-box check` 进行语法检查并定位错误行号；主动识别并在界面提示 `allowInsecure: true` 等存在中间人攻击隐患的不安全节点。
  * **配置快照历史**：每次配置保存均自动生成版本快照，支持配置变更差异对比与一键快速回滚。

### 3️⃣ sing-box 内核管理与系统集成
* **内核检索优先级**：`--kernel-path` > 环境变量 `SUBOUT_SINGBOX_PATH` > 系统 `PATH` > `<data_dir>/bin/sing-box` > 平台标准路径。
* **一键在线安装/升级**：若系统中未检测到内核，可在 Web 控制台直接在线下载官方最新内核。
* **冲突进程查杀**：启动时自动扫描并提示外部冲突的 sing-box 进程，支持一键强制终止释放端口。
* **系统防断网保护**：在服务停止、卸载或重启时，自动调用系统原生接口清除系统代理配置与 DNS 设定，避免代理失效导致全系统断网。

---

## 💻 CLI 命令行参数 (服务与高级选项)

`subout` 二进制既可以直接作为后台 Web 服务运行，也可以在自动化脚本中作为单次配置解析与导出工具：

```bash
# 1. 启动 Web 管理面板 (默认端口 1234，可直接运行 subout)
subout web -p 8080

# 2. 便携模式启动 (使用当前目录下的 ./data、./logs、./config、./run)
subout --portable web -p 1234

# 3. 单次解析订阅并导出 sing-box outbounds JSON
subout -s "https://example.com/sub/token" -o outbounds.json -v
```

**CLI 参数完全速查**：

| 参数 | 长参数 | 类型 | 说明 |
| :--- | :--- | :---: | :--- |
| `-s` | `--source` | `String` | **(CLI 模式必填)** 订阅源：支持 HTTP(S) 链接、本地文件、Base64 或明文 URI |
| `-o` | `--output` | `String` | **(CLI 模式必填)** 导出的 sing-box `outbounds` JSON 目标路径 |
| `-p` | `--port` | `u16` | 指定 Web 面板运行端口（默认: `1234`，亦可通过 `PORT` 环境变量指定） |
| `-v` | `--verbose` | Flag | 开启详细输出，显示节点协议统计与 TLS 安全审计警告 |
| | `--portable` | Flag | 启用便携模式，数据和日志存放于当前目录（`./data`、`./logs`、`./config`） |
| | `--kernel-path` | `Path` | 显式指定外部 `sing-box` 内核可执行文件路径（别名: `--singbox-path`） |
| | `--data-dir` | `Path` | 自定义持久化数据目录（存放数据库与运行时生成配置） |
| | `--config-dir` | `Path` | 自定义配置文件目录 |
| | `--log-dir` | `Path` | 自定义日志输出目录 |
| | `--runtime-dir` | `Path` | 自定义临时运行目录 |
| `-h` | `--help` | Flag | 显示 CLI 帮助菜单 |

---

## 🛠️ 本地二次开发 (Development)

### 1. 开发环境依赖
* **Rust**: 1.70+ (`cargo` / `rustc`)
* **Node.js**: 18+ 与 `pnpm`

### 2. 开发调试流程
后端在开发模式下运行 `cargo run` 会自动识别开发环境，并将所有数据与日志隔离在本地 `./runtime/` 目录中，无需 Root 权限：

```bash
# 启动前端 Vite 热更新开发服务 (调试 UI)
cd web
pnpm install
pnpm dev

# 在根目录下启动 Rust 后端服务
cargo run -- web -p 1234
```

### 3. 本地全量构建与安装
`build.rs` 在编译 Rust 后端时会自动调用 `pnpm build` 将前端打包嵌入单一 Rust 二进制产物中：

```bash
# 仅编译单二进制 Release 产物
cargo build --release

# 一键本地构建 + 覆盖安装并重启系统守护服务 (推荐普通用户执行，按需提权)
./install.sh         # Linux & macOS
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
> * `subout.db`：SQLite 业务数据库（订阅源、分流组、节点池、历史快照、密码与设置）
> * `bin/sing-box`：自动管理与下载的 sing-box 官方内核
> * `generated/sing-box.json`：由 Subout 派生生成的完整 sing-box 运行配置

---

## ⚖️ 开源协议

本项目采用双重开源协议：
- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)
