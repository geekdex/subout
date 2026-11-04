import React, { useState } from "react";
import { Save, AlertTriangle, Smartphone, Monitor } from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Input";
import { ConfigProfile } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface ProfileEditorProps {
  profile: ConfigProfile;
  onClose: () => void;
  onSaved: () => void;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  profile,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(profile.name);
  const [jsonText, setJsonText] = useState(() => {
    const raw = profile.content || profile.config_json || "{}";
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  });
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  const isAndroid = profile.platform === "android";

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setJsonError(null);
      success("JSON 格式化成功");
    } catch (e: unknown) {
      setJsonError(`JSON 语法错误: ${getErrorMessage(e)}`);
    }
  };

  const handleValidate = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.route || !parsed.outbounds) {
        setJsonError('配置缺少必需的 "route" 或 "outbounds" 节点');
        return;
      }
      setJsonError(null);
      success("基本结构校验通过");
    } catch (e: unknown) {
      setJsonError(`JSON 语法解析失败: ${getErrorMessage(e)}`);
    }
  };

  const handleSave = async () => {
    let formatted = jsonText;
    try {
      const parsed = JSON.parse(jsonText);
      formatted = JSON.stringify(parsed);
      setJsonError(null);
    } catch (e: unknown) {
      setJsonError(`保存前请修复语法错误: ${getErrorMessage(e)}`);
      return;
    }

    setSaving(true);
    try {
      await api.updateConfig(profile.id, {
        name,
        platform: profile.platform,
        content: formatted,
        config_json: formatted,
      });
      success("配置已保存更新");
      onSaved();
    } catch (err: unknown) {
      error("保存失败", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width="2xl"
      title={
        <div className="flex items-center gap-2">
          <span>编辑配置: {profile.name}</span>
          <Badge platform={profile.platform} size="sm">
            {profile.platform.toUpperCase()}
          </Badge>
        </div>
      }
      description={`正在编辑目标为 ${profile.platform.toUpperCase()} 的 sing-box 配置方案，保存后客户端订阅将自动更新。`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="outline" size="sm" onClick={handleFormat}>
            格式化 JSON
          </Button>
          <Button variant="secondary" size="sm" onClick={handleValidate}>
            校验结构
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={handleSave}
            icon={<Save className="w-4 h-4" />}
          >
            保存配置
          </Button>
        </>
      }
    >
      <div className="space-y-4 h-full flex flex-col">
        {/* Profile platform notice */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              label="配置名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="配置名称..."
            />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            {isAndroid ? (
              <Smartphone className="w-4 h-4 text-emerald-400" />
            ) : (
              <Monitor className="w-4 h-4 text-sky-400" />
            )}
            <span>
              平台特性规范：
              {isAndroid
                ? " Android 平台分流规则支持 package_name 与 package_name_regex。"
                : " 桌面平台规则支持 process_name、process_path 与 process_path_regex。"}
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            v{profile.version_code}
          </span>
        </div>

        {jsonError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{jsonError}</span>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-[450px]">
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonError(null);
            }}
            placeholder="sing-box 完整配置 JSON..."
            className="w-full flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 resize-none leading-relaxed"
            spellCheck={false}
          />
        </div>
      </div>
    </Drawer>
  );
};
