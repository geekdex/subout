import React, { useState } from "react";
import {
  Settings,
  Key,
  Shield,
  HardDrive,
  Sparkles,
  Sliders,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Badge } from "../ui/Badge";
import { SystemInfo } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface SettingsViewProps {
  systemInfo: SystemInfo | null;
  onRefreshSystemInfo: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  systemInfo,
  onRefreshSystemInfo,
}) => {
  const [sudoPassword, setSudoPassword] = useState("");
  const [savingSudo, setSavingSudo] = useState(false);

  const [oldWebPassword, setOldWebPassword] = useState("");
  const [newWebPassword, setNewWebPassword] = useState("");
  const [savingWebPassword, setSavingWebPassword] = useState(false);

  const [switchingMode, setSwitchingMode] = useState(false);

  const { success, error } = useToast();

  const handleSaveSudo = async () => {
    if (!sudoPassword) {
      error("请输入 sudo 密码");
      return;
    }
    setSavingSudo(true);
    try {
      await api.setSudoPassword(sudoPassword);
      success("Sudo 会话授权成功");
      setSudoPassword("");
      onRefreshSystemInfo();
    } catch (err: unknown) {
      error("Sudo 授权验证失败", getErrorMessage(err));
    } finally {
      setSavingSudo(false);
    }
  };

  const handleClearSudo = async () => {
    setSavingSudo(true);
    try {
      await api.setSudoPassword("");
      success("已清除会话 Sudo 授权缓存");
      setSudoPassword("");
      onRefreshSystemInfo();
    } catch (err: unknown) {
      error("清除 Sudo 授权失败", getErrorMessage(err));
    } finally {
      setSavingSudo(false);
    }
  };

  const handleSaveWebPassword = async () => {
    if (!oldWebPassword || !newWebPassword) {
      error("请完整输入当前密码和新密码");
      return;
    }
    setSavingWebPassword(true);
    try {
      await api.setWebPassword(oldWebPassword, newWebPassword);
      success("管理员密码修改成功，请妥善保存");
      setOldWebPassword("");
      setNewWebPassword("");
    } catch (err: unknown) {
      error("修改密码失败", getErrorMessage(err));
    } finally {
      setSavingWebPassword(false);
    }
  };

  const handleSwitchMode = async (targetMode: "simple" | "expert") => {
    if (systemInfo?.app_mode === targetMode) return;
    setSwitchingMode(true);
    try {
      await api.setAppMode(targetMode, false);
      success(
        "运行模式已切换",
        `已切换至 ${targetMode === "simple" ? "小白模式" : "专业模式"}`,
      );
      onRefreshSystemInfo();
    } catch (err: unknown) {
      error("切换模式失败", getErrorMessage(err));
    } finally {
      setSwitchingMode(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Banner */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-400" />
          <span>系统与安全设置</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          管理客户端工作模式、Linux/macOS 权限凭证、数据目录与管理员口令。
        </p>
      </div>

      {/* Grid: App Mode & Sudo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mode Switch Card */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">客户端运作模式</h3>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              切换模式将停止正在运行的 sing-box 内核并释放 TUN 网卡资源。
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={switchingMode}
                onClick={() => handleSwitchMode("simple")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  systemInfo?.app_mode === "simple"
                    ? "border-sky-500 bg-sky-500/10 shadow-md shadow-sky-500/10"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">小白模式</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  4 种傻瓜策略，一键切换
                </p>
              </button>

              <button
                type="button"
                disabled={switchingMode}
                onClick={() => handleSwitchMode("expert")}
                className={`p-4 rounded-xl border text-left transition-all ${
                  systemInfo?.app_mode === "expert"
                    ? "border-sky-500 bg-sky-500/10 shadow-md shadow-sky-500/10"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-bold text-white">专业模式</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  完整平台配置文件与订阅中心
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Sudo Password Settings */}
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">
                系统提权密码 (Sudo)
              </h3>
            </div>
            <Badge
              variant={systemInfo?.sudo_configured ? "success" : "neutral"}
              dot
              size="sm"
            >
              {systemInfo?.sudo_configured ? "会话已授权" : "未授权"}
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Linux / macOS 平台配置 TUN 虚拟网卡与清理系统外部冲突需要 root 权限。Subout 采用安全的会话提权机制，密码仅在内存中缓存（重启或退出后自动失效），绝不写入磁盘数据库。
            </p>

            <Input
              type="password"
              placeholder="输入当前主机 sudo 密码..."
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
            />

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                loading={savingSudo}
                onClick={handleSaveSudo}
              >
                验证并设置会话授权
              </Button>
              {systemInfo?.sudo_configured && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={savingSudo}
                  onClick={handleClearSudo}
                  className="text-slate-400 hover:text-rose-400"
                >
                  清除当前授权
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Web Password Change */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <Key className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">
            修改面板管理员密码
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="password"
            label="当前旧密码"
            placeholder="输入旧密码..."
            value={oldWebPassword}
            onChange={(e) => setOldWebPassword(e.target.value)}
          />
          <Input
            type="password"
            label="设置新密码"
            placeholder="输入新密码..."
            value={newWebPassword}
            onChange={(e) => setNewWebPassword(e.target.value)}
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          loading={savingWebPassword}
          onClick={handleSaveWebPassword}
        >
          确认修改密码
        </Button>
      </div>

      {/* Host Environment Info Card */}
      <div className="glass-panel p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-white">主机环境状态</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">宿主系统</span>
            <span className="font-semibold text-slate-200 uppercase">
              {systemInfo?.host_os} ({systemInfo?.host_arch})
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">默认 TUN 协议栈</span>
            <span className="font-mono text-slate-200">
              {systemInfo?.default_tun_stack || "system"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">运行形态</span>
            <span className="text-slate-200">
              {systemInfo?.portable_mode
                ? "便携模式 (Portable)"
                : "系统服务安装模式"}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">当前运行配置 ID</span>
            <span className="font-mono text-sky-400">
              {systemInfo?.running_config_id
                ? `#${systemInfo.running_config_id}`
                : "无"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
