# subout

> 专为 **sing-box** 生态打造的高性能、轻量级代理订阅转换 CLI 工具与 Web 可视化管理面板。

[![Rust](https://img.shields.io/badge/Rust-1.70%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![sing-box](https://img.shields.io/badge/sing--box-Outbounds-blue)](https://sing-box.sagernet.org/)
[![License](https://img.shields.io/badge/License-MIT%2FApache--2.0-green)](LICENSE-MIT)

`subout` 将繁琐的代理节点订阅转换与复杂的 `sing-box` 规则配置简化为极致简单的体验。无论是命令行脚本一键导出，还是通过优雅的 Web 面板进行多订阅聚合与分流策略组管理，`subout` 都能轻松胜任。

---

## ⚡ 为什么选择 subout？

- **📦 零依赖单二进制**：采用 Rust 极速构建，Web 前端打入二进制，开箱即用，无需复杂部署环境。
- **🌐 广泛协议支持**：自适应解析 **VMess, VLESS, Shadowsocks, Trojan, Socks, HTTP, Anytls, Hysteria, Hysteria2** 等主流代理协议。
- **🧹 智能节点净化**：自动识别并剔除流量/到期/公告等无效节点，Tag 自动冲突去重，保证 sing-box 配置规范。
- **🛡️ 节点安全审计**：实时检测不安全 TLS（如 `allowInsecure`），防范潜在中间人风险。
- **📊 强大可视化面板 (Subout Panel)**：
  - **多订阅聚合与节点池**：多订阅同步、关键字过滤，支持手动追加自定义专属节点。
  - **分流出站组设计**：可视化设计 Selector（策略组）、URLTest（自动延迟测速选择器）。
  - **模板与 Schema 校验**：在线编辑全局 JSON 模板（DNS, Routing, Inbounds），实时语法校验。
  - **版本控制与还原**：配置修改历史全程留痕，支持一键预览、差异对比与回滚还原。

---

## 🚀 快速开始

`subout` 支持两种模式运行，在未提供命令参数时，默认启动 Web 面板。

### 1. Web 可视化面板模式

适合多订阅在线聚合管理与 sing-box 配置文件可视化编辑：

```bash
# 默认启动（无参数运行，自动探测空闲端口，默认 1234）
./subout

# 或指定端口启动
./subout web -p 8080
```

- **📍 访问地址**：`http://127.0.0.1:1234`（或您指定的端口）
- **🔑 默认密码**：`admin`（建议首次登录后前往系统设置修改）
- **💾 数据存储**：数据库安全持久化于用户系统配置目录（Linux/macOS: `~/.config/subout/subout.db`，Windows: `%APPDATA%\subout\subout.db`），升级平滑不丢配置。

---

### 2. CLI 命令行模式

适用于单次订阅转换或 Shell / Docker 自动化脚本：

```bash
# 从远程订阅链接解析并导出 sing-box outbounds 配置
./subout -s "https://example.com/sub/token" -o outbounds.json -v

# 从本地订阅文件解析导出
./subout -s ./subscription.txt -o outbounds.json
```

**命令行参数指南**：

| 参数 | 选项 | 说明 |
| :--- | :--- | :--- |
| `-s` | `<source>` | **(必填)** 原始订阅链接 (HTTP/HTTPS)、本地文件路径或 Base64/明文内容 |
| `-o` | `<output>` | **(必填)** 导出的 `outbounds` JSON 配置文件路径 |
| `-v` | | 开启详细日志，显示协议节点统计与安全审计建议 |
| `-p` | `<port>` | 指定 Web 服务运行端口 |
| `-h` | `--help` | 显示帮助菜单 |

---

## 🌐 环境变量配置

在 Web 面板模式下，可通过环境变量灵活定制服务行为：

| 环境变量 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `PORT` | 显式指定 Web 服务端口。若未指定，将在 `1234`~`1244` 范围内自动探测可用端口。 | `1234` |
| `ADMIN_PASSWORD` | 环境变量级别锁定管理员密码。设置后以环境变量为准，同时禁用面板内部密码修改功能。 | `admin` |

---

## 🛠️ 本地构建与开发

项目采用 Rust 开发后端，Vue 3 + Vite 构建前端：

```bash
# 一键编译包含嵌入前端的单二进制产物
cargo build --release
```

编译产物位于：`./target/release/subout`

---

## 📂 项目结构

```txt
├── Cargo.toml          # Rust 后端依赖与配置
├── build.rs            # 前端静态资源打包脚本
├── src/                # 后端源码 (Axum Web + SQLite + Parser)
└── web/                # 前端源码 (Vue 3 + Vite + Vanilla CSS)
```

---

## ⚖️ 开源协议

本项目采用双重开源协议，可任选其一使用：
- [MIT License](LICENSE-MIT)
- [Apache License 2.0](LICENSE-APACHE)
