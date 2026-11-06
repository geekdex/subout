import React, { useState } from "react";
import {
  Layers,
  Plus,
  RotateCw,
  Edit,
  Trash2,
  Check,
  Smartphone,
  Monitor,
  Terminal,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { CopyButton } from "../ui/CopyButton";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import {
  ConfigProfile,
  SystemInfo,
  PlatformType,
  NodeItem,
  NodeGroup,
} from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";
import { ProfileEditor } from "./ProfileEditor";

interface ProfilesViewProps {
  configs: ConfigProfile[];
  runningProfile: ConfigProfile | null;
  systemInfo: SystemInfo | null;
  nodes?: NodeItem[];
  nodeGroups?: NodeGroup[];
  onRefresh: () => void;
}

export const ProfilesView: React.FC<ProfilesViewProps> = ({
  configs,
  runningProfile,
  systemInfo,
  nodes = [],
  nodeGroups = [],
  onRefresh,
}) => {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfilePlatform, setNewProfilePlatform] =
    useState<PlatformType>("linux");
  const [creating, setCreating] = useState(false);

  const [editingProfile, setEditingProfile] = useState<ConfigProfile | null>(
    null,
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { success, error } = useToast();
  const hostOs = systemInfo?.host_os ?? "unknown";

  const handleCreate = async () => {
    if (!newProfileName.trim()) {
      error("请输入配置名称");
      return;
    }
    setCreating(true);
    try {
      // Default empty sing-box 1.14 basic skeleton
      const defaultConfig = {
        $schema: "https://sing-box.sagernet.org/schema.json",
        log: {},
        dns: {},
        ntp: {},
        certificate: {},
        certificate_providers: [],
        http_clients: [],
        endpoints: [],
        inbounds: [],
        outbounds: [],
        route: {},
        services: [],
        experimental: {},
      };

      await api.createConfig({
        name: newProfileName.trim(),
        platform: newProfilePlatform,
        config_json: JSON.stringify(defaultConfig, null, 2),
      });

      success("配置创建成功");
      setCreateModalOpen(false);
      setNewProfileName("");
      onRefresh();
    } catch (err: unknown) {
      error("创建配置失败", getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleResetToken = async (id: number) => {
    try {
      const res = await api.resetConfigToken(id);
      success(
        "Token 重置成功",
        `新 Token: ${String(res.token || "").slice(0, 8)}...`,
      );
      onRefresh();
    } catch (err: unknown) {
      error("重置 Token 失败", getErrorMessage(err));
    }
  };

  const handleSetRunning = async (profile: ConfigProfile) => {
    if (profile.platform !== hostOs) {
      error(
        "平台不兼容",
        `无法在 ${hostOs.toUpperCase()} 宿主上运行 ${profile.platform.toUpperCase()} 平台的配置！`,
      );
      return;
    }
    try {
      await api.setRunningConfig(profile.id);
      success("已设为本机运行配置");
      onRefresh();
    } catch (err: unknown) {
      error("设置失败", getErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await api.deleteConfig(deleteConfirmId);
      success("配置已删除");
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err: unknown) {
      error("删除失败", getErrorMessage(err));
    }
  };

  const getSubUrl = (token: string) => {
    const origin = window.location.origin;
    return `${origin}/sub/${token}`;
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "android":
        return <Smartphone className="w-4 h-4 text-emerald-400" />;
      case "linux":
        return <Terminal className="w-4 h-4 text-amber-400" />;
      case "macos":
        return <Monitor className="w-4 h-4 text-slate-300" />;
      case "windows":
        return <Monitor className="w-4 h-4 text-sky-400" />;
      default:
        return <Monitor className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Top action header */}
      <div className="glass-panel p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-400" />
            <span>配置中心 (Profiles & Subscription Hosting)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            为不同操作系统量身定制专属 sing-box 规则，通过公开端点{" "}
            <code className="text-sky-300">/sub/:token</code>{" "}
            开放订阅下发，集成版本号自动懒同步。
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => setCreateModalOpen(true)}
          icon={<Plus className="w-4 h-4" />}
          className="w-full sm:w-auto"
        >
          新建配置
        </Button>
      </div>

      {/* Profiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {configs.map((p) => {
          const isRunning = runningProfile?.id === p.id;
          const isCompatible = p.platform === hostOs;
          const subUrl = getSubUrl(p.token);

          return (
            <div
              key={p.id}
              className={`glass-panel p-5 flex flex-col justify-between transition-all ${
                isRunning ? "border-sky-500/80 shadow-lg shadow-sky-500/10" : ""
              }`}
            >
              <div className="space-y-4">
                {/* Header: Platform & Running badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700/60">
                      {getPlatformIcon(p.platform)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">
                        {p.name}
                      </h3>
                      <span className="text-[11px] text-slate-400 font-mono">
                        v{p.version_code}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge platform={p.platform} size="sm">
                      {p.platform.toUpperCase()}
                    </Badge>
                    {isRunning && (
                      <Badge variant="success" dot size="sm">
                        本机运行
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Subscription URL Box */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 block uppercase font-mono tracking-wider">
                      开放订阅链接
                    </span>
                    <span className="text-xs text-sky-400 font-mono truncate block">
                      {subUrl}
                    </span>
                  </div>
                  <CopyButton text={subUrl} label="复制" />
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>
                    更新时间:{" "}
                    {p.updated_at ? String(p.updated_at).slice(0, 16) : "-"}
                  </span>
                  <span className="font-mono text-slate-500">
                    Token: {String(p.token || "").slice(0, 8)}...
                  </span>
                </div>
              </div>

              {/* Action buttons footer */}
              <div className="mt-5 pt-3.5 border-t border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingProfile(p)}
                    icon={<Edit className="w-3.5 h-3.5" />}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResetToken(p.id)}
                    icon={<RotateCw className="w-3.5 h-3.5" />}
                    title="重置订阅 Token"
                  >
                    重置
                  </Button>
                  {!isRunning && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(p.id)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {!isRunning && (
                  <Button
                    variant={isCompatible ? "secondary" : "ghost"}
                    size="sm"
                    disabled={!isCompatible}
                    onClick={() => handleSetRunning(p)}
                    icon={<Check className="w-3.5 h-3.5" />}
                    title={
                      !isCompatible
                        ? `仅适用于 ${p.platform.toUpperCase()} 平台`
                        : "设为本机运行配置"
                    }
                  >
                    设为运行
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Profile Modal */}
      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="新建客户端配置"
        description="选择目标平台并初始化配置模板，创建后可直接在线编辑出站与分流规则。"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={creating}
              onClick={handleCreate}
            >
              创建配置
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="配置名称"
            placeholder="例如: Android 专用移动配置 或 Linux 生产配置"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 select-none">
              目标分流平台
            </label>
            <Select
              value={newProfilePlatform}
              onChange={(val) => setNewProfilePlatform(val as PlatformType)}
              options={[
                {
                  value: "linux",
                  label:
                    "Linux (支持 process_name / process_path, TUN 虚拟网卡)",
                },
                {
                  value: "macos",
                  label: "macOS (支持 process_name, TUN utun 网卡)",
                },
                {
                  value: "windows",
                  label: "Windows (支持 process_name / path, WinTUN 网卡)",
                },
                {
                  value: "android",
                  label:
                    "Android (专有 package_name / package_name_regex 包名分流)",
                },
              ]}
            />
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="确认删除此配置文件？"
        description="删除后，使用该 Token 的客户端将无法再拉取配置订阅更新。"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteConfirmId(null)}
            >
              取消
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              确认删除
            </Button>
          </>
        }
      >
        <div className="text-xs text-rose-300">
          此操作不可逆。如果此配置在其他设备上使用，请确保已更换订阅 Token。
        </div>
      </Dialog>

      {/* Profile Online Editor Drawer */}
      {editingProfile && (
        <ProfileEditor
          profile={editingProfile}
          nodes={nodes}
          nodeGroups={nodeGroups}
          onClose={() => setEditingProfile(null)}
          onSaved={() => {
            setEditingProfile(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
