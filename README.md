# 🚀 subout

> **专为 sing-box 打造的下一代跨平台代理订阅转换与 Web 可视化管理面板。**  
> *打破单订阅孤岛壁垒，汇聚多源节点统一调度；兼顾小白开箱即用与专业深度定制，支持三大操作系统无感透明代理。*

[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![sing-box](https://img.shields.io/badge/sing--box-1.12%2B-blue)](https://sing-box.sagernet.org/)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](#-快速开始-quick-start)
[![License](https://img.shields.io/badge/License-MIT%2FApache--2.0-green)](LICENSE-MIT)

---

## 💡 为什么选择 subout？

市面上多数代理客户端只能「选定单个订阅使用单个订阅内的节点」，不同机场服务商与自建节点割裂严重，多订阅用户体验繁琐。  
**subout 彻底重构了这一体验**：

* 🔄 **跨订阅全局节点池**：将多个不同服务商的订阅链接、本地文件、自建节点或 Base64 汇集为统一「节点池」，策略组（如 `AUTO 自动测速`、`流媒体`、`AI 专线`）可跨订阅自由调度所有节点。
* 🎭 **双模式自由切换**：
  * **小白极简模式**：10 秒快速上手，填入订阅即可一键开启透明代理，全自动配置 DNS 与国内外分流。
  * **专业高定制模式**：全功能可视化配置中心，精细掌控 DNS、自定义策略组、可视化路由规则链、实时配置语法校验与历史版本秒级回滚。
* 🌐 **全平台无感透明代理**：
  * **macOS**：自动接管网络代理，TUN 模式下**独创系统 DNS 转发至虚拟网关 (`172.19.0.1`)**，彻底终结 `mDNSResponder` 导致的 DNS 污染与死锁，退出时自动还原 DHCP DNS，绝不残留断网。
  * **Windows**：自动配置系统代理并**广播 WinINet API 实时刷新**，浏览器无需重启即可即时生效；退出时自动恢复直连。
  * **Linux**：原生基于 TUN 虚拟网卡与网络 Capabilities (`CAP_NET_ADMIN`) 实现内核级透明代理。
* ⚡ **单文件零依赖 & 极速启停**：前端 Vue 3 UI 编译期嵌入单个可执行文件，无外部静态资源依赖；服务重启/退出经针对性优化，可在 **0.3 秒内瞬间完成**。
* 🛡️ **智能净化与安全审计**：自动过滤到期/流量/官网等非节点广告信息，智能追加重名序号，主动扫描并预警 `allowInsecure: true` 等中间人攻击安全隐患。

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

### 3. 常用服务管理与一键卸载速查表

| 操作需求 | Linux | macOS | Windows (PowerShell) |
| :--- | :--- | :--- | :--- |
| **查看服务状态** | `systemctl status subout` | `launchctl list \| grep subout` | `Get-Service subout` |
| **查看实时日志** | `sudo journalctl -u subout -f` | `tail -f "/Library/Logs/Subout/stdout.log"` | `Get-Content C:\ProgramData\Subout\logs\stdout.log -Wait -Tail 50` |
| **重启后台服务** | `sudo systemctl restart subout` | `sudo launchctl kickstart -k system/io.github.geekdex.subout` | `Restart-Service subout` |
| **停止后台服务** | `sudo systemctl stop subout` | `sudo launchctl unload -w "/Library/LaunchDaemons/io.github.geekdex.subout.plist"` | `Stop-Service subout` |
| **一键卸载 (保留数据)** | `sudo ./install.sh uninstall` | `sudo ./install.sh uninstall` | `.\install.ps1 uninstall` |
| **彻底卸载 (清理数据)** | `sudo ./install.sh uninstall --purge` | `sudo ./install.sh uninstall --purge` | `.\install.ps1 uninstall -Purge` |

---

## 🌟 核心功能全景

### 1️⃣ 多订阅聚合与统一节点池
* **全协议兼容**：支持 VMess / VLESS / Shadowsocks / Trojan / SOCKS5 / HTTP / Anytls / Hysteria / Hysteria2 等协议。
* **跨源汇聚**：可添加多条不同机场的 HTTP/HTTPS 订阅链接、Base64 编码文本、节点 URI 或本地文件。
* **智能去重与净化**：自动剔除包含 `流量`、`到期`、`官网`、`公告` 的非代理节点；自动重名消重（`-1`、`-2`）。
* **节点网络测速**：支持节点批量 TCP/ICMP 延迟测试与真实网站连通性测速（Google、YouTube、GitHub、OpenAI）。
* **自动定时更新**：支持按指定时间间隔在后台自动同步更新订阅节点，并平滑热重载内核。

### 2️⃣ 双模式自由切换
* **小白模式 (Simple Mode)**：
  * 面向追求省心快捷的用户。
  * 仅需添加订阅并选择出站模式（**规则分流**、**全局代理**、**直接连接**、**TUN 虚拟网卡**），一键启动代理。
  * 自动预设纯净 DNS 解析方案与国内/国外/广告拦截分流策略。
* **专业模式 (Expert Mode)**：
  * 面向追求深度定制与复杂网络分流的用户。
  * **策略组管理**：自由创建 `selector`（手动选择）、`urltest`（自动延迟优选）、`fallback`、`direct`、`block` 策略组；支持静态节点勾选或动态正则过滤规则。
  * **可视化 DNS 编辑器**：自定义 Direct/Remote/FakeIP DNS 服务器与 DNS 路由规则。
  * **可视化路由规则链**：支持基于域名 (Domain/DomainSuffix/DomainKeyword)、GeoIP、GeoSite、端口、协议等规则进行精准分流。
  * **配置快照历史**：每一次保存与修改均自动生成版本快照，支持配置差异对比与一键快速回滚。
  * **语法防御校验**：集成 `sing-box check` 语法检查，错误精准高亮定位，防止配置失误导致服务异常。

### 3️⃣ sing-box 内核生命周期管理
* **智能内核检索**：优先级为 `--kernel-path` > 环境变量 `SUBOUT_SINGBOX_PATH` > 系统 `PATH` > `<data_dir>/bin/sing-box` > 平台标准路径。
* **一键在线安装/更新**：若系统未安装 sing-box，可在 Web 面板中一键下载官方最新内核至数据目录。
* **进程冲突防护**：启动时自动扫描并提示外部冲突的 sing-box 进程，支持在 Web 界面上一键查杀释放端口。

---

## 💻 命令行 CLI 模式 (自动化与脚本集成)

除 Web 面板外，`subout` 还可作为高性能单次订阅转换 CLI 工具使用，适用于自动化流水线或 Linux 定时任务：

```bash
# 1. 从远程 HTTP(S) 订阅解析并导出 sing-box outbounds 配置
subout -s "https://example.com/sub/token" -o outbounds.json -v

# 2. 从本地订阅文件 / 纯文本 / Base64 解析导出
subout -s ./subscription.txt -o outbounds.json

# 3. 指定端口或便携模式启动 Web 面板
subout web -p 8080
subout --portable web -p 1234
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
