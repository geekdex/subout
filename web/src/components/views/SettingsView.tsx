import React, { useState } from "react";
import {
  Settings,
  Key,
  HardDrive,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Database,
  Info,
  CheckCircle2,
  RefreshCw,
  Lock,
  Download,
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
  const [oldWebPassword, setOldWebPassword] = useState("");
  const [newWebPassword, setNewWebPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingWebPassword, setSavingWebPassword] = useState(false);

  // Preference states persisted in localStorage
  const [logInterval, setLogInterval] = useState(() => {
    try {
      return window.localStorage.getItem("subout_log_interval") || "3000";
    } catch {
      return "3000";
    }
  });
  const [testTimeout, setTestTimeout] = useState(() => {
    try {
      return window.localStorage.getItem("subout_test_timeout") || "3000";
    } catch {
      return "3000";
    }
  });

  const handleLogIntervalChange = (val: string) => {
    setLogInterval(val);
    try {
      window.localStorage.setItem("subout_log_interval", val);
    } catch {
      // ignore
    }
  };

  const handleTestTimeoutChange = (val: string) => {
    setTestTimeout(val);
    try {
      window.localStorage.setItem("subout_test_timeout", val);
    } catch {
      // ignore
    }
  };

  const { success, error } = useToast();

  const isRoot = systemInfo?.is_root ?? false;
  const sudoConfigured = systemInfo?.sudo_configured ?? false;

  const handleSaveWebPassword = async () => {
    if (!oldWebPassword || !newWebPassword) {
      error("请完整输入当前密码和新密码");
      return;
    }
    if (confirmPassword && newWebPassword !== confirmPassword) {
      error("两次输入的新密码不一致，请重新检查");
      return;
    }
    setSavingWebPassword(true);
    try {
      await api.setWebPassword(oldWebPassword, newWebPassword);
      success("管理员密码修改成功，请妥善保存");
      setOldWebPassword("");
      setNewWebPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      error("修改密码失败", getErrorMessage(err));
    } finally {
      setSavingWebPassword(false);
    }
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "未输入", color: "bg-slate-700" };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, label: "较弱", color: "bg-rose-500" };
    if (score <= 3) return { score: 2, label: "中等", color: "bg-amber-500" };
    return { score: 3, label: "极佳", color: "bg-emerald-500" };
  };

  const strength = getPasswordStrength(newWebPassword);

  const handleExportDiagnostics = () => {
    const diag = {
      timestamp: new Date().toISOString(),
      systemInfo,
      userAgent: navigator.userAgent,
    };
    const blob = new Blob([JSON.stringify(diag, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subout-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    success("已导出系统诊断数据");
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-400" />
            <span>系统与安全设置</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            管理面板访问口令与查看宿主环境运行状态。系统提权权限 (Sudo)
            可直接在顶部导航栏随时点击管理。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isRoot || sudoConfigured ? "success" : "warning"}
            size="md"
          >
            {isRoot
              ? "Root 权限已就绪"
              : sudoConfigured
                ? "Sudo 提权已配置"
                : "权限受限状态"}
          </Badge>
        </div>
      </div>

      {/* Main Two-Column Layout for Desktop & Fluid Stacking for Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Security & Preferences (7 cols on LG+) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Admin Web Password Change */}
          <div className="glass-panel p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  修改面板管理员密码
                </h3>
              </div>
              <Badge variant="neutral" size="sm">
                Web 访问认证
              </Badge>
            </div>

            <div className="space-y-4">
              <Input
                type="password"
                label="当前旧密码"
                placeholder="输入旧密码..."
                value={oldWebPassword}
                onChange={(e) => setOldWebPassword(e.target.value)}
                icon={<Lock className="w-4 h-4" />}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Input
                    type="password"
                    label="设置新密码"
                    placeholder="输入新密码..."
                    value={newWebPassword}
                    onChange={(e) => setNewWebPassword(e.target.value)}
                    icon={<Key className="w-4 h-4" />}
                  />
                  {newWebPassword && (
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                      <span>安全强度:</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${strength.color} transition-all duration-300`}
                          style={{
                            width: `${(strength.score / 3) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-medium text-slate-300">
                        {strength.label}
                      </span>
                    </div>
                  )}
                </div>

                <Input
                  type="password"
                  label="确认新密码"
                  placeholder="再次输入新密码..."
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  icon={<Key className="w-4 h-4" />}
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <p className="text-[11px] text-slate-500">
                  修改后将立即在当前服务会话生效，请牢记您的新管理密码。
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  loading={savingWebPassword}
                  onClick={handleSaveWebPassword}
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                >
                  确认修改密码
                </Button>
              </div>
            </div>
          </div>

          {/* Web Console Preferences */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  控制台偏好设置
                </h3>
              </div>
              <Badge variant="neutral" size="sm">
                本地偏好
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
                <div>
                  <span className="text-xs font-medium text-slate-200 block">
                    内核实时日志刷新频率
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    控制后台日志轮询时间间隔，平衡性能与实时性
                  </p>
                </div>
                <select
                  value={logInterval}
                  onChange={(e) => handleLogIntervalChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-sky-500"
                >
                  <option value="1000">1 秒 (高频实时)</option>
                  <option value="3000">3 秒 (默认平衡)</option>
                  <option value="5000">5 秒 (省资源)</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800">
                <div>
                  <span className="text-xs font-medium text-slate-200 block">
                    节点测速请求超时 (Timeout)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    测速探测时的最大等待上限
                  </p>
                </div>
                <select
                  value={testTimeout}
                  onChange={(e) => handleTestTimeoutChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-sky-500"
                >
                  <option value="2000">2000 ms (激进)</option>
                  <option value="3000">3000 ms (默认)</option>
                  <option value="5000">5000 ms (宽松)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Maintenance & Diagnostics */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  维护与诊断工具
                </h3>
              </div>
              <Badge variant="neutral" size="sm">
                系统排障
              </Badge>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-800/30 border border-slate-800">
              <div className="text-xs text-slate-400">
                <span className="text-slate-200 font-medium block">
                  导出系统诊断与环境摘要
                </span>
                <span>包含宿主环境、网络拓扑参数与系统日志快照</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportDiagnostics}
                icon={<Download className="w-3.5 h-3.5" />}
              >
                导出诊断报告
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column: Host Status & Environmental Intelligence (5 cols on LG+) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Host Environment Info Card */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  主机环境状态
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefreshSystemInfo}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                title="刷新系统信息"
              >
                刷新
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block text-[11px]">
                  宿主系统
                </span>
                <span className="font-semibold text-slate-200 uppercase mt-1 block">
                  {systemInfo?.host_os} ({systemInfo?.host_arch})
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block text-[11px]">
                  权限运行状态
                </span>
                <span
                  className={`font-semibold mt-1 block ${
                    isRoot || sudoConfigured
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {isRoot
                    ? "Root 超级管理员"
                    : sudoConfigured
                      ? "管理员 (永久有效)"
                      : "普通用户 (受限)"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block text-[11px]">
                  默认 TUN 协议栈
                </span>
                <span className="font-mono text-slate-200 mt-1 block">
                  {systemInfo?.default_tun_stack || "system"}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 block text-[11px]">
                  当前运行配置 ID
                </span>
                <span className="font-mono text-sky-400 mt-1 block">
                  {systemInfo?.running_config_id
                    ? `#${systemInfo.running_config_id}`
                    : "无"}
                </span>
              </div>
            </div>
          </div>

          {/* Sudo Privilege Management Card */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Shield className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                系统特权与 Sudo 策略
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-800/40 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  {isRoot ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : sudoConfigured ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  )}
                  <span className="font-medium text-slate-200">
                    {isRoot
                      ? "当前程序拥有全局 Root 特权"
                      : sudoConfigured
                        ? "已持久化配置 Sudo 提权密码"
                        : "尚未配置永久提权密码"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  在 Linux 与 macOS 宿主中，启动 TUN
                  虚拟网卡设备或配置全局系统代理均需系统管理员权限。
                  您可随时在顶部控制栏点击特权按钮进行配置或临时授权。
                </p>
              </div>
            </div>
          </div>

          {/* About Subout Core */}
          <div className="glass-panel p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Info className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                关于 Subout
              </h3>
            </div>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span>控制台版本</span>
                <span className="font-mono text-slate-200">v0.3.0</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span>内核引擎</span>
                <span className="font-mono text-slate-200">sing-box 1.14+</span>
              </div>
              <div className="flex justify-between py-1">
                <span>分流机制</span>
                <span className="text-slate-200">Rule-Set 内存级路由</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
