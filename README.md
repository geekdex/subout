# subout

`subout` 是一个专为 **sing-box** 设计的轻量级代理订阅转换 CLI 工具与 Web 可视化管理面板（**Subout Panel**）。

通过 `subout`，您可以轻松将 VMess、VLESS、Shadowsocks、Trojan、Socks 和 HTTP 等格式的代理订阅链接或本地文件，转换为 sing-box 兼容的 `outbounds` 节点配置。同时，内置的 Web 面板支持多订阅聚合、节点池管理、分流组设计及配置版本历史管理。

---

## 🌟 核心特性

### ⚡ CLI 命令行模式（轻量级、无依赖转换）
- **多协议自适应解析**：自动识别 VMess, VLESS, Shadowsocks, Trojan, Socks, HTTP 节点（支持 Base64 或明文内容，支持本地/网络源）。
- **无效公告节点过滤**：自动剔除流量公告、到期提示、剩余流量等非真实代理的广告/公告节点。
- **Tag 重名动态去重**：自动重命名冲突的节点 Tag，保证 sing-box 配置文件符合唯一的 Tag 约束规范。
- **节点安全与审计建议**：检测并对不安全的 TLS 配置（如 `allow_insecure: true`）提供警告，避免潜在的安全隐患。
- **纯净输出**：最终输出标准、干净且即装即用的 sing-box outbounds JSON 数组。

### 🖥️ Web 面板模式（Subout Panel 可视化管理）
- **看板总览 (Dashboard)**：直观展现系统内的订阅总数、聚合节点总数和出站组数。
- **多订阅管理 (Subscription)**：支持配置多条订阅源，一键同步/更新所有订阅源中的节点，并支持批量删除。
- **节点池 (Node Pool)**：统一汇聚从所有订阅中解析出的节点，同时支持添加**自定义专属节点**（如自建的专用节点）。
- **分流出站组设计 (Outbound Groups)**：可视化设计 sing-box 分流出站组。支持配置 Selector（策略组）、URLTest（自动测速延迟选择器）等类型，并可绑定特定节点。
- **模板配置 (Config Template)**：在线编辑 sing-box 基础配置 JSON 模板（如 DNS、Routing、Inbounds 规则等），支持格式美化和基于 JSON Schema 的配置合法性校验。
- **配置版本历史 (History)**：记录每一次由模板、订阅和分流组渲染生成的完整 sing-box 配置文件。支持历史配置一键预览、差异对比及一键还原。
- **系统设置 (Settings)**：在线修改 Web 面板的登录密码和运行端口。

---

## 🛠️ 如何构建

将项目编译为独立的二进制文件（包含已打包好的 Web 前端资源）：

```bash
cargo build --release
```

编译生成的二进制文件将位于 `./target/release/subout`。

---

## 🚀 快速开始

`subout` 支持两种运行模式，在运行时会自动识别。

### 1. 命令行（CLI）模式
适用于一次性的订阅转换或脚本自动化流程。

```bash
# 解析远程订阅链接并输出详细日志
./subout -s "https://example.com/sub/token" -o outbounds.json -v

# 解析本地订阅文件并输出
./subout -s ./raw_subscription.txt -o outbounds.json
```

**命令行参数说明**：
- `-s <source>`：(必填) 原始订阅链接（HTTP/HTTPS）、本地文件路径，或 Base64/明文订阅内容。
- `-o <output>`：(必填) 生成的 outbounds 目标 JSON 文件写入路径。
- `-v`：开启详细日志，包括解析节点结构摘要及优化警告。
- `-h`, `--help`：显示帮助信息。

---

### 2. Web 面板（Subout Panel）模式
适合长期运行、多订阅聚合管理和可视化配置 sing-box。

```bash
# 方式 A：无参数直接启动（默认监听 1234 端口）
./subout

# 方式 B：使用显式子命令启动
./subout web

# 方式 C：指定服务运行端口
./subout web -p 8080
```

**Web 服务访问说明**：
- **访问地址**：浏览器打开 `http://127.0.0.1:1234`（或您指定的端口）
- **默认密码**：`admin`
- **安全提示**：首次登录后，强烈建议您立即前往 **“系统设置 (Settings)”** 中修改默认的管理员密码。
- **数据存储**：Web 服务的配置数据默认保存在当前运行目录下的 `subout.db`（SQLite 数据库）中。

---

## 🌐 环境变量

在 **Web 面板模式**下运行时，您可以使用以下环境变量来定制 `subout` 的运行行为：

| 环境变量 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `PORT` | Web 面板服务监听的端口。如果未配置（既未设置 `PORT` 环境变量，也未在命令行使用 `-p` 参数），`subout` 将默认从 `1234` 端口开始尝试，若被占用则依次自动加 1 重试（最高重试至 `1244`）。如果 11 个端口均被占用，则退出并提示手动配置。如果显式配置了端口，则只会严格绑定该端口。 | `1234` |
| `ADMIN_PASSWORD` | 覆盖管理员登录密码。设置此变量后，后台登录将以其为准（直接覆盖数据库中保存的密码），同时管理后台“系统设置”中的修改密码面板将被禁用。如果未设置该变量，则默认登录密码为 `admin`（且可在后台网页中自行修改）。 | `admin` |

---

## 📂 项目结构

```txt
├── Cargo.toml          # Rust 后端依赖与配置
├── build.rs            # Rust 编译脚本 (主要用于前端资源打包校验)
├── src/                # 后端源码
│   ├── main.rs         # 入口及 CLI 参数解析
│   ├── parser/         # 各协议订阅解析逻辑
│   ├── db/             # 数据库模型与持久化
│   └── web/            # Axum Web 服务及 API 路由
└── web/                # 前端源码 (Vue 3 + Vite + Vanilla CSS)
    ├── dist/           # 前端打包产物 (单文件嵌入到二进制中)
    └── src/            # 前端业务代码
```

---

## ⚖️ 开源协议

本项目采用双重授权条款，您可以选择以下任意一种协议进行使用：

- **MIT 许可证** ([LICENSE-MIT](file:///home/panhy/src/handler/subout/LICENSE-MIT) 或 <http://opensource.org/licenses/MIT>)
- **Apache 许可证 2.0 版本** ([LICENSE-APACHE](file:///home/panhy/src/handler/subout/LICENSE-APACHE) 或 <http://www.apache.org/licenses/LICENSE-2.0>)
