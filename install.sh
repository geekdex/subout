#!/usr/bin/env bash
# ==============================================================================
# subout - Proxy Subscription Converter & Sing-box Web Panel
# One-Click Install / Uninstall Script for Linux & macOS
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Defaults
APP_NAME="subout"
BIN_TARGET_DIR="/usr/local/bin"
DEFAULT_PORT="1234"
PORT="$DEFAULT_PORT"
NO_SERVICE=false
UNINSTALL=false
PURGE=false
GITHUB_REPO="geekdex/subout"
CUSTOM_BIN_PATH=""

# Help message
show_help() {
    echo -e "${BOLD}subout 一键安装与管理脚本 (Linux & macOS)${NC}"
    echo
    echo "用法:"
    echo "  ./install.sh [命令] [选项]"
    echo
    echo "命令:"
    echo "  install                 安装 subout 并注册系统服务 (默认命令)"
    echo "  uninstall               卸载 subout 并停止/删除系统服务"
    echo
    echo "选项:"
    echo "  -p, --port <port>       指定 Web 面板监听端口 (默认: 1234)"
    echo "  -b, --bin <path>        指定本地 subout 二进制文件进行安装"
    echo "      --bin-dir <dir>     自定义二进制安装目录 (默认: /usr/local/bin)"
    echo "      --no-service        仅安装二进制文件，不配置/启动系统守护服务"
    echo "  -u, --uninstall         卸载 subout 并停止守护服务"
    echo "      --purge             卸载时连同数据目录与配置一同清理 (需配合 uninstall 或 -u)"
    echo "  -h, --help              显示此帮助信息"
    echo
    echo "示例:"
    echo "  ./install.sh install -p 1234"
    echo "  ./install.sh uninstall"
    echo "  ./install.sh uninstall --purge"
    exit 0
}

# Handle positional first command if provided
if [[ $# -gt 0 ]]; then
    case "$1" in
        install)
            UNINSTALL=false
            shift
            ;;
        uninstall|remove)
            UNINSTALL=true
            shift
            ;;
        -h|--help|help)
            show_help
            ;;
    esac
fi

# Parse remaining command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -b|--bin)
            CUSTOM_BIN_PATH="$2"
            shift 2
            ;;
        --bin-dir)
            BIN_TARGET_DIR="$2"
            shift 2
            ;;
        --no-service)
            NO_SERVICE=true
            shift
            ;;
        -u|--uninstall)
            UNINSTALL=true
            shift
            ;;
        --purge)
            PURGE=true
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo -e "${RED}错误: 未知参数 '$1'${NC}"
            echo "运行 '$0 --help' 查看使用说明。"
            exit 1
            ;;
    esac
done

# Root privilege helper
SUDO=""
if [[ $EUID -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
        SUDO="sudo"
    else
        echo -e "${RED}错误: 该操作需要 root 权限，但系统中未找到 sudo。请以 root 身份运行。${NC}"
        exit 1
    fi
fi

# Detect Operating System and Architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
    x86_64|amd64)
        TARGET_ARCH="x86_64"
        ;;
    aarch64|arm64)
        TARGET_ARCH="aarch64"
        ;;
    *)
        echo -e "${RED}错误: 不支持的 CPU 架构: ${ARCH}${NC}"
        exit 1
        ;;
esac

case "$OS" in
    linux)
        TARGET_OS="linux"
        TARGET_TRIPLE="${TARGET_ARCH}-unknown-linux-musl"
        DATA_DIR="/var/lib/subout"
        CONFIG_DIR="/etc/subout"
        LOG_DIR="/var/log/subout"
        RUNTIME_DIR="/run/subout"
        SERVICE_FILE="/etc/systemd/system/subout.service"
        ;;
    darwin)
        TARGET_OS="darwin"
        TARGET_TRIPLE="${TARGET_ARCH}-apple-darwin"
        DATA_DIR="/Library/Application Support/Subout"
        CONFIG_DIR="/Library/Application Support/Subout/config"
        LOG_DIR="/Library/Logs/Subout"
        RUNTIME_DIR="/Library/Application Support/Subout/run"
        PLIST_FILE="/Library/LaunchDaemons/io.github.geekdex.subout.plist"
        LEGACY_PLIST_FILE1="/Library/LaunchDaemons/com.geekdex.subout.plist"
        LEGACY_PLIST_FILE2="/Library/LaunchDaemons/com.subout.server.plist"
        ;;
    *)
        echo -e "${RED}错误: 不支持的操作系统: ${OS} (本脚本支持 Linux 与 macOS，Windows 请运行 PowerShell 脚本 install.ps1)${NC}"
        exit 1
        ;;
esac

# ------------------------------------------------------------------------------
# UNINSTALL LOGIC
# ------------------------------------------------------------------------------
do_uninstall() {
    echo -e "${CYAN}======================================================${NC}"
    echo -e "${CYAN}       正在卸载 ${BOLD}subout${NC}${CYAN} 服务与文件...       ${NC}"
    echo -e "${CYAN}======================================================${NC}"

    # 1. Stop and remove systemd service (Linux)
    if [[ "$TARGET_OS" == "linux" ]]; then
        if command -v systemctl >/dev/null 2>&1; then
            if systemctl is-active --quiet subout 2>/dev/null; then
                echo -e "${BLUE}[1/4] 正在停止 systemd 服务...${NC}"
                $SUDO systemctl stop subout || true
            fi
            if systemctl is-enabled --quiet subout 2>/dev/null; then
                echo -e "${BLUE}[2/4] 正在禁用 systemd 服务...${NC}"
                $SUDO systemctl disable subout || true
            fi
            if [[ -f "$SERVICE_FILE" ]]; then
                echo -e "${BLUE}[3/4] 正在删除 service 配置文件: ${SERVICE_FILE}${NC}"
                $SUDO rm -f "$SERVICE_FILE"
                $SUDO systemctl daemon-reload || true
            fi
        fi
    # 2. Stop and remove launchd plist (macOS)
    elif [[ "$TARGET_OS" == "darwin" ]]; then
        echo -e "${BLUE}[1/3] 正在停止并卸载 launchd 守护服务...${NC}"
        if [[ -f "$PLIST_FILE" ]]; then
            $SUDO launchctl unload -w "$PLIST_FILE" 2>/dev/null || true
            $SUDO rm -f "$PLIST_FILE"
        fi
        if [[ -f "$LEGACY_PLIST_FILE1" ]]; then
            $SUDO launchctl unload -w "$LEGACY_PLIST_FILE1" 2>/dev/null || true
            $SUDO rm -f "$LEGACY_PLIST_FILE1"
        fi
        if [[ -f "$LEGACY_PLIST_FILE2" ]]; then
            $SUDO launchctl unload -w "$LEGACY_PLIST_FILE2" 2>/dev/null || true
            $SUDO rm -f "$LEGACY_PLIST_FILE2"
        fi
    fi

    # 3. Remove binary
    TARGET_BIN="${BIN_TARGET_DIR}/${APP_NAME}"
    if [[ -f "$TARGET_BIN" ]]; then
        echo -e "${BLUE}正在删除可执行文件: ${TARGET_BIN}${NC}"
        $SUDO rm -f "$TARGET_BIN"
    fi

    # 4. Handle data and log directories
    if [[ "$PURGE" == "true" ]]; then
        echo -e "${YELLOW}正在彻底清理数据目录、配置与日志 (--purge)...${NC}"
        $SUDO rm -rf "$DATA_DIR"
        [[ -d "$CONFIG_DIR" && "$CONFIG_DIR" != "$DATA_DIR"* ]] && $SUDO rm -rf "$CONFIG_DIR"
        [[ -d "$LOG_DIR" ]] && $SUDO rm -rf "$LOG_DIR"
        [[ -d "$RUNTIME_DIR" ]] && $SUDO rm -rf "$RUNTIME_DIR"
        echo -e "${GREEN}✓ 数据与日志目录已彻底清理。${NC}"
    else
        echo -e "${YELLOW}提示: 用户业务数据已保留: ${DATA_DIR}${NC}"
        [[ -d "$LOG_DIR" ]] && echo -e "${YELLOW}提示: 日志目录已保留: ${LOG_DIR}${NC}"
        echo -e "${YELLOW}如需彻底删除配置与数据库，请执行: ${BOLD}sudo $0 uninstall --purge${NC}"
    fi

    echo
    echo -e "${GREEN}======================================================${NC}"
    echo -e "${GREEN}✓ subout 卸载完成！${NC}"
    echo -e "${GREEN}======================================================${NC}"
    exit 0
}

if [[ "$UNINSTALL" == "true" ]]; then
    do_uninstall
fi

# ------------------------------------------------------------------------------
# INSTALL LOGIC
# ------------------------------------------------------------------------------
echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}        欢迎使用 ${BOLD}subout${NC}${CYAN} 一键安装脚本         ${NC}"
echo -e "${CYAN}======================================================${NC}"
echo -e "系统环境: ${BOLD}${TARGET_OS} (${TARGET_TRIPLE})${NC}"
echo -e "安装目录: ${BOLD}${BIN_TARGET_DIR}/${APP_NAME}${NC}"
echo -e "数据目录: ${BOLD}${DATA_DIR}${NC}"
echo -e "日志目录: ${BOLD}${LOG_DIR}${NC}"
echo -e "Web 端口: ${BOLD}${PORT}${NC}"
echo

# 1. Locate or Download subout binary
SOURCE_BIN=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "$CUSTOM_BIN_PATH" && -f "$CUSTOM_BIN_PATH" ]]; then
    echo -e "${BLUE}[1/4] 使用用户指定的二进制文件: ${CUSTOM_BIN_PATH}${NC}"
    SOURCE_BIN="$CUSTOM_BIN_PATH"
elif [[ -f "${SCRIPT_DIR}/Cargo.toml" ]] && command -v cargo >/dev/null 2>&1; then
    echo -e "${BLUE}[1/4] 检测到源码仓库，正在编译最新 release 产物 (cargo build --release)...${NC}"
    (cd "$SCRIPT_DIR" && cargo build --release)
    SOURCE_BIN="${SCRIPT_DIR}/target/release/${APP_NAME}"
elif [[ -f "${SCRIPT_DIR}/target/release/${APP_NAME}" ]]; then
    echo -e "${BLUE}[1/4] 检测到本地 release 编译产物: ${SCRIPT_DIR}/target/release/${APP_NAME}${NC}"
    SOURCE_BIN="${SCRIPT_DIR}/target/release/${APP_NAME}"
elif [[ -f "${SCRIPT_DIR}/${APP_NAME}" ]]; then
    echo -e "${BLUE}[1/4] 检测到当前目录下的 ${APP_NAME} 二进制文件${NC}"
    SOURCE_BIN="${SCRIPT_DIR}/${APP_NAME}"
else
        # Download pre-built release binary from GitHub
        echo -e "${BLUE}[1/4] 正在从 GitHub 官方 Release 下载最新预编译版本 (${TARGET_TRIPLE})...${NC}"
        TMP_DIR="$(mktemp -d)"
        trap '$SUDO rm -rf "$TMP_DIR"' EXIT

        # Fetch latest version tag from GitHub API
        LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || echo "")
        if [[ -n "$LATEST_TAG" ]]; then
            DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}/subout-${LATEST_TAG}-${TARGET_TRIPLE}.tar.gz"
        else
            DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/latest/download/subout-${TARGET_TRIPLE}.tar.gz"
        fi

        echo -e "下载地址: ${CYAN}${DOWNLOAD_URL}${NC}"
        if curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/subout.tar.gz" 2>/dev/null; then
            tar -xzf "${TMP_DIR}/subout.tar.gz" -C "$TMP_DIR"
            SOURCE_BIN="${TMP_DIR}/${APP_NAME}"
        else
            echo -e "${RED}错误: 从 GitHub Releases 下载预编译文件失败。${NC}"
            echo -e "请在源码目录下运行 ${BOLD}cargo build --release${NC} 后再次执行此脚本。"
            exit 1
        fi
fi

if [[ ! -f "$SOURCE_BIN" ]]; then
    echo -e "${RED}错误: 未找到有效的 subout 二进制文件。${NC}"
    exit 1
fi

# 2. Install Binary to Target Directory
echo -e "${BLUE}[2/4] 正在安装二进制文件到 ${BIN_TARGET_DIR}/${APP_NAME}...${NC}"
$SUDO mkdir -p "$BIN_TARGET_DIR"
$SUDO cp -f "$SOURCE_BIN" "${BIN_TARGET_DIR}/${APP_NAME}"
$SUDO chmod 755 "${BIN_TARGET_DIR}/${APP_NAME}"

# 3. Create persistent directories and system user
echo -e "${BLUE}[3/4] 正在初始化数据与日志目录 (${DATA_DIR})...${NC}"

if [[ "$TARGET_OS" == "linux" ]]; then
    if ! id -u subout >/dev/null 2>&1; then
        echo -e "正在创建专用系统用户与组 subout..."
        $SUDO useradd -r -s /usr/sbin/nologin -M -d "$DATA_DIR" subout 2>/dev/null || \
        $SUDO useradd -r -s /bin/false -M -d "$DATA_DIR" subout 2>/dev/null || \
        $SUDO adduser --system --no-create-home --group subout 2>/dev/null || true
    fi
fi

$SUDO mkdir -p "$DATA_DIR"
$SUDO mkdir -p "$DATA_DIR/bin"
$SUDO mkdir -p "$DATA_DIR/generated"
$SUDO mkdir -p "$LOG_DIR"
$SUDO mkdir -p "$RUNTIME_DIR"

if [[ "$TARGET_OS" == "linux" ]]; then
    $SUDO chown -R subout:subout "$DATA_DIR" "$LOG_DIR" "$RUNTIME_DIR" 2>/dev/null || true
    $SUDO chmod 755 "$DATA_DIR" "$LOG_DIR" "$RUNTIME_DIR"
elif [[ "$TARGET_OS" == "darwin" ]]; then
    $SUDO chmod 755 "$DATA_DIR" "$LOG_DIR" "$RUNTIME_DIR"
fi

# Check sing-box existence in system
if command -v sing-box >/dev/null 2>&1; then
    SINGBOX_PATH="$(command -v sing-box)"
    SINGBOX_VER="$(sing-box version 2>/dev/null | head -n 1 || echo 'unknown')"
    echo -e "${GREEN}✓ 检测到系统中已存在 sing-box: ${SINGBOX_PATH} (${SINGBOX_VER})${NC}"
    echo -e "  subout 将优先调用此内核。"
else
    echo -e "${YELLOW}提示: 当前系统 PATH 中未检测到 sing-box 内核。${NC}"
    echo -e "  可在 Web 控制面板中一键在线下载，将自动保存至 ${DATA_DIR}/bin/sing-box。"
fi

# 4. Configure & Start System Service
if [[ "$NO_SERVICE" == "true" ]]; then
    echo -e "${YELLOW}[4/4] 已跳过系统守护进程配置 (--no-service)。${NC}"
else
    echo -e "${BLUE}[4/4] 正在配置开机自启系统服务...${NC}"

    if [[ "$TARGET_OS" == "linux" ]]; then
        if command -v systemctl >/dev/null 2>&1; then
            cat << SERVICE_EOF | $SUDO tee "$SERVICE_FILE" >/dev/null
[Unit]
Description=Subout Proxy Subscription Manager & Sing-box Web Panel
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${DATA_DIR}
ExecStart=${BIN_TARGET_DIR}/${APP_NAME} web -p ${PORT}
Restart=always
RestartSec=3s
LimitNOFILE=65535

# State, Logs, and Runtime Directory Management
StateDirectory=subout
LogsDirectory=subout
RuntimeDirectory=subout

# Grant network capabilities for TUN mode
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW

[Install]
WantedBy=multi-user.target
SERVICE_EOF

            $SUDO chmod 644 "$SERVICE_FILE"
            $SUDO systemctl daemon-reload
            $SUDO systemctl enable subout >/dev/null 2>&1
            $SUDO systemctl restart subout
            echo -e "${GREEN}✓ Systemd 服务已创建并启动 (subout.service)${NC}"
        else
            echo -e "${YELLOW}提示: 未检测到 systemd，已跳过服务注册。你可以直接运行 '${APP_NAME} web' 启动服务。${NC}"
        fi

    elif [[ "$TARGET_OS" == "darwin" ]]; then
        cat << PLIST_EOF | $SUDO tee "$PLIST_FILE" >/dev/null
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.github.geekdex.subout</string>
    <key>ProgramArguments</key>
    <array>
        <string>${BIN_TARGET_DIR}/${APP_NAME}</string>
        <string>web</string>
        <string>-p</string>
        <string>${PORT}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${DATA_DIR}</string>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stderr.log</string>
</dict>
</plist>
PLIST_EOF

        $SUDO chmod 644 "$PLIST_FILE"
        $SUDO launchctl unload "$PLIST_FILE" 2>/dev/null || true
        $SUDO launchctl unload "$LEGACY_PLIST_FILE1" 2>/dev/null || true
        $SUDO launchctl unload "$LEGACY_PLIST_FILE2" 2>/dev/null || true
        $SUDO launchctl load -w "$PLIST_FILE"
        echo -e "${GREEN}✓ Launchd 守护服务已加载并启动 (io.github.geekdex.subout)${NC}"
    fi
fi

# Print Success Summary
echo
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}🎉 subout 安装成功！${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "📍 Web 管理面板地址 : ${CYAN}${BOLD}http://127.0.0.1:${PORT}${NC}"
echo -e "🔑 默认登录密码     : ${BOLD}admin${NC} (首次登录后建议修改)"
echo -e "💾 持久化数据目录   : ${BOLD}${DATA_DIR}${NC}"
echo -e "📝 系统日志目录     : ${BOLD}${LOG_DIR}${NC}"
echo
if [[ "$NO_SERVICE" != "true" ]]; then
    if [[ "$TARGET_OS" == "linux" ]]; then
        echo -e "常用服务管理命令:"
        echo -e "  • 查看运行状态 : ${BOLD}systemctl status subout${NC}"
        echo -e "  • 查看实时日志 : ${BOLD}journalctl -u subout -f${NC}"
        echo -e "  • 重启后台服务 : ${BOLD}sudo systemctl restart subout${NC}"
        echo -e "  • 停止后台服务 : ${BOLD}sudo systemctl stop subout${NC}"
    elif [[ "$TARGET_OS" == "darwin" ]]; then
        echo -e "常用服务管理命令:"
        echo -e "  • 查看实时日志 : ${BOLD}tail -f \"${LOG_DIR}/stdout.log\"${NC}"
        echo -e "  • 重启守护服务 : ${BOLD}sudo launchctl kickstart -k system/io.github.geekdex.subout${NC}"
        echo -e "  • 停止守护服务 : ${BOLD}sudo launchctl unload -w \"${PLIST_FILE}\"${NC}"
    fi
    echo
fi
echo -e "一键卸载命令:"
echo -e "  ${BOLD}sudo ./install.sh uninstall${NC} (或加上 --purge 彻底删除数据)"
echo

