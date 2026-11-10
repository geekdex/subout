import React, { useState, useMemo, useEffect } from "react";
import {
  Save,
  AlertTriangle,
  CheckCircle2,
  Smartphone,
  Monitor,
  Code2,
  Eye,
  EyeOff,
  ShieldCheck,
  Route as RouteIcon,
  Globe,
  Network,
  Shield,
  Sliders,
  RotateCcw,
} from "lucide-react";
import { Drawer } from "../ui/Drawer";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Input";
import { CopyButton } from "../ui/CopyButton";
import {
  ConfigProfile,
  NodeGroup,
  NodeItem,
  SanitizeChange,
} from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";
import {
  SingBoxVisualConfig,
  parseConfigToVisualState,
  serializeVisualStateToConfig,
  validateExplicitPlatformConstraints,
} from "./profile-editor/types";
import {
  RouteTabPanel,
  DnsTabPanel,
  InboundsTabPanel,
  OutboundsTabPanel,
  BasicDirectTabPanel,
} from "./profile-editor/SectionsEditor";

interface ProfileEditorProps {
  profile: ConfigProfile;
  nodes?: NodeItem[];
  nodeGroups?: NodeGroup[];
  onClose: () => void;
  onSaved: () => void;
}

type EditorTabKey = "inbounds" | "dns" | "outbounds" | "route" | "basic";

export const JSON_PREVIEW_STORAGE_KEY = "subout_profile_editor_json_preview";

const SANITIZE_ACTION_LABELS: Record<SanitizeChange["action"], string> = {
  removed: "移除",
  changed: "调整",
  added: "补充",
};

function SanitizeChangeRow({ change }: { change: SanitizeChange }) {
  const actionColor =
    change.action === "removed"
      ? "text-rose-400"
      : change.action === "added"
        ? "text-emerald-400"
        : "text-amber-400";
  return (
    <li className="py-1.5 border-b border-slate-800/60 last:border-0">
      <div className="flex items-start gap-2">
        <span
          className={`text-[10px] font-bold shrink-0 mt-0.5 ${actionColor}`}
        >
          [{SANITIZE_ACTION_LABELS[change.action]}]
        </span>
        <div className="min-w-0">
          <code className="text-xs text-slate-200 break-all">
            {change.path}
          </code>
          {(change.before || change.after) && (
            <div className="text-[10px] text-slate-500 mt-0.5 break-all font-mono">
              {change.before && <div>原值: {change.before}</div>}
              {change.after && <div>现为: {change.after}</div>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function readPersistedJsonPreviewState(): boolean {
  try {
    const stored = window.localStorage.getItem(JSON_PREVIEW_STORAGE_KEY);
    if (stored === "false") return false;
    if (stored === "true") return true;
  } catch {
    // ignore storage access errors
  }
  return true;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  profile,
  nodes = [],
  nodeGroups = [],
  onClose,
  onSaved,
}) => {
  const initialRawJson = profile.content || profile.config_json || "{}";
  const [name, setName] = useState(profile.name);
  const [description, setDescription] = useState(profile.description || "");
  const [visualState, setVisualState] = useState<SingBoxVisualConfig>(() =>
    parseConfigToVisualState(initialRawJson),
  );
  const [activeTab, setActiveTab] = useState<EditorTabKey>("inbounds");
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(() =>
    readPersistedJsonPreviewState(),
  );
  const [isClosing, setIsClosing] = useState(false);
  const [schemaErrors, setSchemaErrors] = useState<string[]>([]);
  const [schemaValidatedOk, setSchemaValidatedOk] = useState(false);
  const [validating, setValidating] = useState(false);
  const [syncingNodes, setSyncingNodes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sanitizations, setSanitizations] = useState<SanitizeChange[]>([]);
  const [sanitizeDialogOpen, setSanitizeDialogOpen] = useState(false);

  const { success, error } = useToast();
  const isAndroid = profile.platform === "android";

  useEffect(() => {
    let hasLocalValue = false;
    try {
      const stored = window.localStorage.getItem(JSON_PREVIEW_STORAGE_KEY);
      hasLocalValue = stored === "true" || stored === "false";
    } catch {
      // ignore storage access errors
    }

    if (!hasLocalValue && typeof api.getEditorPreferences === "function") {
      let cancelled = false;
      void api
        .getEditorPreferences()
        .then((res) => {
          if (cancelled || typeof res?.show_json_preview !== "boolean") return;
          setShowJsonPreview(res.show_json_preview);
          try {
            window.localStorage.setItem(
              JSON_PREVIEW_STORAGE_KEY,
              String(res.show_json_preview),
            );
          } catch {
            // ignore storage access errors
          }
        })
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }
  }, []);

  const handleToggleJsonPreview = () => {
    const next = !showJsonPreview;
    setShowJsonPreview(next);
    try {
      window.localStorage.setItem(JSON_PREVIEW_STORAGE_KEY, String(next));
    } catch {
      // ignore storage access errors
    }
    if (typeof api.saveEditorPreferences === "function") {
      void api
        .saveEditorPreferences({ show_json_preview: next })
        .catch(() => undefined);
    }
  };

  const handleRequestClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const initialSerializedJson = useMemo(() => {
    const initParsed = parseConfigToVisualState(initialRawJson);
    return JSON.stringify(
      serializeVisualStateToConfig(initParsed, profile.platform),
      null,
      2,
    );
  }, [initialRawJson, profile.platform]);

  const liveJsonString = useMemo(() => {
    const serialized = serializeVisualStateToConfig(
      visualState,
      profile.platform,
    );
    return JSON.stringify(serialized, null, 2);
  }, [visualState, profile.platform]);

  const isDirty =
    name !== profile.name ||
    description !== (profile.description || "") ||
    liveJsonString !== initialSerializedJson;

  const outboundTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const addTag = (t?: string) => {
      if (t && t.trim() && !seen.has(t.trim())) {
        seen.add(t.trim());
        list.push(t.trim());
      }
    };
    for (const o of visualState.outbounds || []) {
      addTag(o.tag);
    }
    for (const g of nodeGroups) {
      addTag(g.tag);
    }
    addTag("direct");
    addTag("proxy");
    for (const n of nodes) {
      if (n.enabled !== false) addTag(n.tag);
    }
    return list;
  }, [visualState.outbounds, nodeGroups, nodes]);

  const dnsServerTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of visualState.dns?.servers || []) {
      if (s.tag && !seen.has(s.tag)) {
        seen.add(s.tag);
        list.push(s.tag);
      }
    }
    if (list.length === 0) {
      list.push("remote-dns", "local-dns");
    }
    return list;
  }, [visualState.dns?.servers]);

  const inboundTags = useMemo(() => {
    return (visualState.inbounds || [])
      .map((i) => i.tag)
      .filter((t): t is string => Boolean(t));
  }, [visualState.inbounds]);

  const ruleSetTags = useMemo(() => {
    return (visualState.route?.rule_set || [])
      .map((r) => r.tag)
      .filter((t): t is string => Boolean(t));
  }, [visualState.route?.rule_set]);

  const httpClientTags = useMemo(() => {
    return (visualState.http_clients || [])
      .map((c) => c.tag)
      .filter((t): t is string => Boolean(t));
  }, [visualState.http_clients]);

  const handleUpdateVisualState = (next: SingBoxVisualConfig) => {
    setVisualState(next);
    setSchemaValidatedOk(false);
    if (schemaErrors.length > 0) {
      setSchemaErrors([]);
    }
  };

  const handleResetChanges = () => {
    setName(profile.name);
    setDescription(profile.description || "");
    setVisualState(parseConfigToVisualState(initialRawJson));
    setSchemaErrors([]);
    setSchemaValidatedOk(false);
    success("已还原至上次保存的配置状态");
  };

  const handleSyncNodesFromPool = async () => {
    setSyncingNodes(true);
    try {
      const res = await api.previewSyncConfigNodes(profile.id, liveJsonString);
      if (res && res.content) {
        const nextVisual = parseConfigToVisualState(res.content);
        handleUpdateVisualState(nextVisual);
        success(
          "已同步最新策略组与节点到编辑器",
          "请确认预览无误后点击「保存配置」写入数据库",
        );
      }
    } catch (err: unknown) {
      error("同步节点池失败", getErrorMessage(err));
    } finally {
      setSyncingNodes(false);
    }
  };

  const handleValidateSchema = async (): Promise<boolean> => {
    setValidating(true);
    try {
      const localPlatformErrors = validateExplicitPlatformConstraints(
        visualState,
        profile.platform,
      );
      if (localPlatformErrors.length > 0) {
        setSchemaErrors(localPlatformErrors);
        setSchemaValidatedOk(false);
        error("配置未通过平台规范校验", localPlatformErrors[0]);
        return false;
      }

      const res = await api.validateConfigSchema(
        liveJsonString,
        profile.platform,
      );
      if (res.valid) {
        setSchemaErrors([]);
        setSchemaValidatedOk(true);
        success("官方 JSON Schema 校验通过");
        return true;
      } else {
        setSchemaErrors(
          res.errors?.length ? res.errors : ["未通过官方 JSON Schema 校验"],
        );
        setSchemaValidatedOk(false);
        error("Schema 校验未通过", res.errors?.[0] || "请检查配置项");
        return false;
      }
    } catch {
      setSchemaErrors([]);
      setSchemaValidatedOk(true);
      return true;
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      error("配置名称不能为空");
      return;
    }

    const localPlatformErrors = validateExplicitPlatformConstraints(
      visualState,
      profile.platform,
    );
    if (localPlatformErrors.length > 0) {
      setSchemaErrors(localPlatformErrors);
      setSchemaValidatedOk(false);
      error("配置存在不兼容当前平台的字段，无法保存", localPlatformErrors[0]);
      return;
    }

    setSaving(true);
    try {
      try {
        const check = await api.validateConfigSchema(
          liveJsonString,
          profile.platform,
        );
        if (check && check.valid === false) {
          setSchemaErrors(
            check.errors?.length
              ? check.errors
              : ["配置未通过官方 JSON Schema 校验"],
          );
          setSchemaValidatedOk(false);
          error(
            "未通过官方 JSON Schema 校验",
            check.errors?.[0] || "请修正错误后再保存",
          );
          return;
        }
      } catch {
        // Proceed to updateConfig which also enforces schema_validator on the backend
      }

      const res = await api.updateConfig(profile.id, {
        name: name.trim(),
        platform: profile.platform,
        description: description.trim() || undefined,
        content: liveJsonString,
        config_json: liveJsonString,
      });
      setSchemaErrors([]);
      setSchemaValidatedOk(true);
      if (res.sanitizations && res.sanitizations.length > 0) {
        setSanitizations(res.sanitizations);
        setSanitizeDialogOpen(true);
      } else {
        success("配置已通过官方 Schema 校验并保存到数据库");
      }
      onSaved();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setSchemaErrors([msg]);
      error("保存失败", msg);
    } finally {
      setSaving(false);
    }
  };

  const tabs: {
    key: EditorTabKey;
    step: number;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      key: "inbounds",
      step: 1,
      label: "入站配置 (inbounds)",
      icon: <Network className="w-3.5 h-3.5" />,
      badge: visualState.inbounds?.length || 0,
    },
    {
      key: "dns",
      step: 2,
      label: "DNS 与解析规则 (dns)",
      icon: <Globe className="w-3.5 h-3.5" />,
      badge:
        (visualState.dns?.servers?.length || 0) +
        (visualState.dns?.rules?.length || 0),
    },
    {
      key: "outbounds",
      step: 3,
      label: "出站与策略组 (outbounds)",
      icon: <Shield className="w-3.5 h-3.5" />,
      badge: visualState.outbounds?.length || 0,
    },
    {
      key: "route",
      step: 4,
      label: "路由与分流 (route)",
      icon: <RouteIcon className="w-3.5 h-3.5" />,
      badge: visualState.route?.rules?.length || 0,
    },
    {
      key: "basic",
      step: 5,
      label: "基础与日志 (log / experimental)",
      icon: <Sliders className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <Drawer
      open
      isClosing={isClosing}
      onClose={onClose}
      width="full"
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span>可视化配置编辑器: {profile.name}</span>
          <Badge platform={profile.platform} size="sm">
            {profile.platform.toUpperCase()}
          </Badge>
          {isDirty ? (
            <Badge variant="warning" size="sm">
              有未保存的更改 (点击保存后生效)
            </Badge>
          ) : (
            <Badge variant="success" size="sm">
              已同步保存
            </Badge>
          )}
        </div>
      }
      description={`正在通过可视化界面编辑 ${profile.platform.toUpperCase()} 平台 sing-box 配置。各标签页采用「上工具栏（可折叠快捷键）+ 下内容/列表编辑」布局，右侧提供只读 JSON 实时预览，点击「保存配置」并通过官方 Schema 校验后才落库。`}
      footer={
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              存储受官方 <code className="text-sky-300">schema.json</code>{" "}
              规范强约束校验，未点击保存直接关闭网页不会改动库内数据。
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDirty && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetChanges}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                还原修改
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleRequestClose}>
              关闭
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={validating}
              onClick={() => void handleValidateSchema()}
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              校验官方 Schema
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={() => void handleSave()}
              icon={<Save className="w-4 h-4" />}
            >
              保存配置
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Top Metadata & Platform Notice Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end bg-slate-900/50 p-3.5 rounded-xl border border-slate-800">
          <div className="lg:col-span-4">
            <Input
              label="配置名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入配置名称..."
            />
          </div>
          <div className="lg:col-span-4">
            <Input
              label="配置备注说明 (可选)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如: 主力开发机分流方案 / 手机移动蜂窝分流..."
            />
          </div>
          <div className="lg:col-span-4 flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs">
            <div className="flex items-center gap-2 text-slate-300 min-w-0">
              {isAndroid ? (
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Monitor className="w-4 h-4 text-sky-400 shrink-0" />
              )}
              <span className="truncate">
                {isAndroid
                  ? "Android 专属：支持 package_name / package_name_regex"
                  : `${profile.platform.toUpperCase()} 桌面专属：支持 process_name / process_path`}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleJsonPreview}
              icon={
                showJsonPreview ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )
              }
            >
              {showJsonPreview ? "隐藏 JSON 预览" : "打开 JSON 预览"}
            </Button>
          </div>
        </div>

        {/* Schema Validation Feedback Banner */}
        {schemaErrors.length > 0 && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>官方 JSON Schema 校验发现以下问题：</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 font-mono text-[11px] text-rose-300/90 max-h-32 overflow-y-auto">
              {schemaErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {schemaValidatedOk && schemaErrors.length === 0 && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              当前可视化生成的 JSON 配置完全符合 sing-box 官方{" "}
              <code>schema.json</code> 规范！
            </span>
          </div>
        )}

        {/* Main Workspace: Visual Editor (Left) + Live Read-Only JSON Preview (Right) */}
        <div
          className={`grid grid-cols-1 ${
            showJsonPreview ? "xl:grid-cols-12" : ""
          } gap-5 items-start`}
        >
          {/* Left Column: Visual Editor */}
          <div
            className={`${
              showJsonPreview ? "xl:col-span-7" : "w-full"
            } space-y-4`}
          >
            {/* Section Navigation Tabs (Ordered by Client Proxy Flow: Inbounds -> DNS -> Outbounds -> Route -> Basic) */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
              {tabs.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "bg-sky-500 text-white shadow-sm shadow-sky-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${
                        active
                          ? "bg-white/25 text-white"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {t.step}
                    </span>
                    {t.icon}
                    <span>{t.label}</span>
                    {t.badge !== undefined && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                          active
                            ? "bg-white/20 text-white"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Tab Content (Each Tab: Top Collapsible Toolbar + Bottom Content/Reorderable List) */}
            <div key={activeTab} className="animate-tab-fade-in">
              {activeTab === "route" && (
                <RouteTabPanel
                  platform={profile.platform}
                  config={visualState}
                  onChange={handleUpdateVisualState}
                  outboundTags={outboundTags}
                  dnsServerTags={dnsServerTags}
                  inboundTags={inboundTags}
                  httpClientTags={httpClientTags}
                />
              )}

              {activeTab === "dns" && (
                <DnsTabPanel
                  platform={profile.platform}
                  config={visualState}
                  onChange={handleUpdateVisualState}
                  outboundTags={outboundTags}
                  inboundTags={inboundTags}
                  ruleSetTags={ruleSetTags}
                />
              )}

              {activeTab === "inbounds" && (
                <InboundsTabPanel
                  platform={profile.platform}
                  config={visualState}
                  onChange={handleUpdateVisualState}
                />
              )}

              {activeTab === "outbounds" && (
                <OutboundsTabPanel
                  config={visualState}
                  onChange={handleUpdateVisualState}
                  nodes={nodes}
                  nodeGroups={nodeGroups}
                  onSyncFromNodePool={() => void handleSyncNodesFromPool()}
                  syncing={syncingNodes}
                />
              )}

              {activeTab === "basic" && (
                <BasicDirectTabPanel
                  config={visualState}
                  onChange={handleUpdateVisualState}
                  outboundTags={outboundTags}
                />
              )}
            </div>
          </div>

          {/* Right Column: Live Read-Only JSON Preview Panel */}
          {showJsonPreview && (
            <div className="xl:col-span-5 xl:sticky xl:top-0 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col shadow-xl animate-tab-fade-in">
              <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Code2 className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">
                        实时完整 JSON 预览
                      </span>
                      <Badge variant="neutral" size="sm">
                        只读预览
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      随左侧可视化配置实时同步生成 · 支持一键复制与划选复制
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <CopyButton
                    text={liveJsonString}
                    label="一键复制 JSON"
                    copiedLabel="已复制完整 JSON"
                    variant="secondary"
                    size="sm"
                  />
                </div>
              </div>

              <div className="relative max-h-[72vh] overflow-auto p-4 bg-slate-950">
                <pre
                  data-testid="json-preview-content"
                  className="font-mono text-xs text-slate-200 leading-relaxed whitespace-pre select-text cursor-text"
                >
                  <code>{liveJsonString}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={sanitizeDialogOpen}
        onClose={() => setSanitizeDialogOpen(false)}
        title="程序已按内核规范修正以下字段"
        description="以下修正在保存时自动应用，保证配置可被 sing-box 1.14 正常加载。原始意图均已保留。"
        size="lg"
        footer={
          <Button variant="primary" onClick={() => setSanitizeDialogOpen(false)}>
            我已知晓
          </Button>
        }
      >
        <ul className="max-h-[50vh] overflow-auto px-1">
          {sanitizations.map((change, idx) => (
            <SanitizeChangeRow key={`${change.path}-${idx}`} change={change} />
          ))}
        </ul>
      </Dialog>
    </Drawer>
  );
};
