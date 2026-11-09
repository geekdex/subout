# 🚀 subout

> 基于 **sing-box 1.14.4** 的跨平台代理客户端与多平台配置托管中心。  
> 聚合多订阅统一调度，支持 Linux / macOS / Windows 宿主机代理与 Android / 跨设备配置托管分发。

[![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![sing-box](https://img.shields.io/badge/sing--box-1.14.*-blue)](https://sing-box.sagernet.org/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](#-快速开始)
[![License](https://img.shields.io/badge/License-MIT%2FApache--2.0-green)](LICENSE-MIT)

---

## 🎯 双重架构定位

Subout 在单一二进制架构下融合了**本地代理客户端**与**配置托管分发中心**双重角色：

```text
                      ┌────────────────────────────────────────┐
                      │          统一节点池与多源订阅聚合          │
                      └───────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     【角色 A：本地代理客户端】                       【角色 B：配置托管中心】
  - 宿主机系统代理 / TUN 虚拟网卡               - 针对 Linux/macOS/Windows/Android 派生配置
  - 极简 4 策略卡片 / 逻辑专业模式              - `/sub/:token` 零认证高速订阅下发
  - sing-box 1.14.* 内核守门与冲突诊断           - 基于 versionCode 的惰性同步
```

### 角色 A：本地代理客户端 (Local Host Client)

- **极简模式 (Simple Mode)**：4 种预设路由策略卡片，一键即开即用：
  - **智能分流**：国内直连、海外代理、精准拦截广告。
  - **全部代理**：全局流量强制走代理（广告与局域网除外）。
  - **GFW 列表**：仅 GFW 黑名单走代理，其余直连。
  - **全部直连**：全局直连并使用本地 DNS 解析。
  - _全模式强制优先内置局域网直连白名单与广告拦截。_
- **逻辑模式 (Logical Mode)**：提供策略组（Selector / URLTest / Fallback）、自定义 DNS 服务器、路由分流规则链的可视化编辑。
- **网络接管能力**：
  - **macOS / Windows**：支持系统代理一键启闭，DNS 自动转发与退出优雅恢复，杜绝断网残留。
  - **全平台 TUN 模式**：基于虚拟网卡与网络 Capabilities 实现轻量透明代理。
- **内核守门机制 (Kernel Gatekeeper)**：
  - 强约束依赖 `sing-box 1.14.*`；未就绪或版本不匹配时通过 HTTP 428 阻断启动并引导一键在线下载。
  - 具备外部 sing-box 进程冲突诊断与一键清理接管能力。

### 角色 B：配置托管与分发中心 (Profile Hosting Service)

- **跨平台配置派生**：基于统一节点池与基础规则，按目标平台（Linux、macOS、Windows、Android）自适应生成针对各端 TUN/Mixed 入站和分流策略的独立 sing-box 配置文件。
- **零认证高速分发**：支持为不同配置生成独立的防爆破 Token，通过 `/sub/:token` 接口免密高速下载订阅。
- **惰性同步追踪**：节点池或配置变更时自动自增 `versionCode`，客户端拉取时支持增量识别，避免无谓重载。

### 自动化与工程特性

- **自动更新中心**：支持 Cron 定时调度，执行全链路闭环联动：`订阅拉取` -> `节点池清洗去重` -> `策略组节点重组` -> `运行配置平滑热重载`。
- **配置快照与回滚**：每次自动或手动更新均持久化历史版本快照，支持秒级配置差异对比与一键回滚。
- **极轻单二进制交付**：前端基于 React 18 + TypeScript + Tailwind CSS 构建，编译期单文件嵌入 Rust 二进制，零外部运行时依赖，极低内存占用。

---

## 🚀 快速开始

### 1. 一键在线安装（注册系统守护服务）

- **Linux & macOS (Bash)**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/geekdex/subout/main/install.sh | bash
  ```
- **Windows (PowerShell 管理员)**:
  ```powershell
  irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1 | iex
  ```

安装成功后打开浏览器访问：`http://127.0.0.1:1234`（默认登录密码：`admin`）。

### 2. 源码本地编译安装

```bash
# Linux & macOS (以普通用户身份运行；编译阶段使用当前用户环境，系统写入时自动调用 sudo)
./install.sh

# Windows (PowerShell 管理员)
.\install.ps1
```

---

## ⚙️ 运行模式与端口机制

| 运行模式     | 触发方式                    | 监听端口                               | 数据与日志路径                        | sing-box 内核隔离                |
| :----------- | :-------------------------- | :------------------------------------- | :------------------------------------ | :------------------------------- |
| **生产模式** | 系统守护服务 / `subout web` | 默认 `1234`                            | 系统标准目录（如 `/var/lib/subout/`） | 独占管理生产环境 sing-box 进程   |
| **开发模式** | `cargo run -- web`          | 遇占自动顺延 (`1234` -> `1235..=1244`) | `./runtime/` 本地开发目录             | 隔离运行，识别外部生产进程防冲突 |
| **便携模式** | `subout --portable web`     | 默认 `1234` 或 `-p` 指定               | 当前目录下的 `./data/`, `./logs/`     | 使用便携目录下内核               |

> **端口冲突自动规避**：若未显式指定端口且 `1234` 已被占用，服务会自动依次探测 `1235` ~ `1244` 并绑定可用端口。

---

## 📋 常用服务管理速查

| 平台                | 查看状态                             | 实时日志                                  | 重启服务                                                      | 停止服务                                                                           | 彻底卸载                              |
| :------------------ | :----------------------------------- | :---------------------------------------- | :------------------------------------------------------------ | :--------------------------------------------------------------------------------- | :------------------------------------ |
| **Linux (systemd)** | `systemctl status subout`            | `journalctl -u subout -f`                 | `sudo systemctl restart subout`                               | `sudo systemctl stop subout`                                                       | `./install.sh uninstall --purge` |
| **macOS (launchd)** | `launchctl list \| grep subout`      | `tail -f /Library/Logs/Subout/stdout.log` | `sudo launchctl kickstart -k system/io.github.geekdex.subout` | `sudo launchctl unload -w "/Library/LaunchDaemons/io.github.geekdex.subout.plist"` | `./install.sh uninstall --purge` |
| **Windows (Task)**  | `Get-ScheduledTask -TaskName Subout` | 查看 `logs\subout.log`                    | `Restart-ScheduledTask Subout`                                | `Stop-ScheduledTask -TaskName Subout`                                              | `.\install.ps1 uninstall -Purge`      |

---

## 💻 CLI 命令行参数

```bash
# 启动 Web 管理面板 (默认端口 1234，遇占顺延)
subout web

# 指定端口启动
subout web -p 8080

# 便携模式启动
subout --portable web -p 1234

# 命令行单次解析订阅并导出 sing-box outbounds
subout -s "https://example.com/sub/token" -o outbounds.json -v
```

**参数参考**：

| 参数 | 长参数          |   类型   | 说明                                               |
| :--- | :-------------- | :------: | :------------------------------------------------- |
| `-p` | `--port`        |  `u16`   | 指定 Web 面板运行端口 (默认: `1234`)               |
|      | `--portable`    |   Flag   | 便携模式：数据与日志存放在当前执行目录下           |
|      | `--kernel-path` |  `Path`  | 显式指定外部 `sing-box` (需 1.14.*) 可执行文件路径 |
|      | `--data-dir`    |  `Path`  | 自定义持久化数据目录                               |
|      | `--config-dir`  |  `Path`  | 自定义配置文件目录                                 |
|      | `--log-dir`     |  `Path`  | 自定义日志输出目录                                 |
|      | `--runtime-dir` |  `Path`  | 自定义临时运行目录                                 |
| `-s` | `--source`      | `String` | 单次导出模式：订阅源 (URL / 文件 / Base64 / URI)   |
| `-o` | `--output`      | `String` | 单次导出模式：导出的 sing-box outbounds 文件路径   |
| `-v` | `--verbose`     |   Flag   | 单次导出模式：输出详细统计与安全审计日志           |
| `-h` | `--help`        |   Flag   | 显示帮助信息                                       |

---

## 🛠️ 本地二次开发

### 环境要求

- **Rust**: 1.85+ (`cargo` / `rustc`)
- **Node.js**: 18+ 与 `pnpm`

### 开发步骤

```bash
# 1. 启动前端 Vite 开发服务器 (默认端口 5173，自动代理后端接口)
cd web
pnpm install
pnpm dev

# 2. 启动后端开发服务 (数据与日志自动隔离在 ./runtime/)
cargo run -- web
```

### 规范检查与自动化测试

```bash
# Rust 代码格式化、Clippy 检查与单元测试
cargo fmt --check
cargo clippy -- -D warnings
cargo test

# 前端代码规范、类型检查与组件测试
cd web
pnpm run lint
pnpm run typecheck
pnpm run test
```

---

## 📂 跨平台运行目录规范

| 运行环境 / 平台             | 数据目录 (`data_dir`)                  | 日志目录 (`log_dir`)          | 配置目录 (`config_dir`)                       | 临时运行目录 (`runtime_dir`)               |
| :-------------------------- | :------------------------------------- | :---------------------------- | :-------------------------------------------- | :----------------------------------------- |
| **开发环境 (`cargo run`)**  | `./runtime/data/`                      | `./runtime/logs/`             | `./runtime/config/`                           | `./runtime/run/`                           |
| **便携模式 (`--portable`)** | `./data/`                              | `./logs/`                     | `./config/`                                   | `./run/`                                   |
| **Linux (生产守护)**        | `/var/lib/subout/`                     | `/var/log/subout/`            | `/etc/subout/`                                | `/run/subout/`                             |
| **macOS (生产守护)**        | `/Library/Application Support/Subout/` | `/Library/Logs/Subout/`       | `/Library/Application Support/Subout/config/` | `/Library/Application Support/Subout/run/` |
| **Windows (生产守护)**      | `C:\ProgramData\Subout\`               | `C:\ProgramData\Subout\logs\` | `C:\ProgramData\Subout\config\`               | `C:\ProgramData\Subout\run\`               |

> **数据目录关键内容**：
>
> - `subout.db`：SQLite 数据库（包含订阅源、节点池、策略组、多平台配置、更新快照与任务调度）
> - `bin/sing-box`：自动管理并下载的 sing-box 1.14.4 官方内核
> - `generated/sing-box.json`：派生生成的本机运行配置文件

---

## ⚖️ 开源协议

本项目采用双重开源协议：

- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)
