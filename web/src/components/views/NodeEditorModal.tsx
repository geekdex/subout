import React, { useState, useEffect, useMemo } from "react";
import {
  FileCode,
  Sliders,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Info,
} from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { Badge } from "../ui/Badge";
import { NodeItem } from "../../types/api";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface NodeEditorModalProps {
  open: boolean;
  node: NodeItem | null;
  onClose: () => void;
  onSaved: () => void;
}

type JsonObject = Record<string, unknown>;

const BASE_PROTOCOL_OPTIONS = [
  { value: "vless", label: "VLESS" },
  { value: "vmess", label: "VMess" },
  { value: "trojan", label: "Trojan" },
  { value: "shadowsocks", label: "Shadowsocks" },
  { value: "hysteria2", label: "Hysteria2" },
  { value: "tuic", label: "TUIC" },
  { value: "anytls", label: "AnyTLS" },
  { value: "socks", label: "SOCKS5" },
  { value: "http", label: "HTTP" },
  { value: "wireguard", label: "WireGuard" },
  { value: "ssh", label: "SSH" },
];

const TLS_PROTOCOLS = new Set([
  "vless",
  "vmess",
  "trojan",
  "hysteria2",
  "tuic",
  "anytls",
  "http",
]);

const TRANSPORT_PROTOCOLS = new Set(["vless", "vmess", "trojan"]);

const UTLS_FINGERPRINT_OPTIONS = [
  { value: "chrome", label: "chrome" },
  { value: "firefox", label: "firefox" },
  { value: "safari", label: "safari" },
  { value: "ios", label: "ios" },
  { value: "android", label: "android" },
  { value: "edge", label: "edge" },
  { value: "random", label: "random" },
  { value: "randomized", label: "randomized" },
];

const DEFAULT_NEW_NODE_JSON = JSON.stringify(
  {
    type: "vless",
    tag: "",
    server: "",
    server_port: 443,
    uuid: "",
    flow: "xtls-rprx-vision",
    tls: {
      enabled: true,
      server_name: "",
      utls: {
        enabled: true,
        fingerprint: "chrome",
      },
      reality: {
        enabled: false,
        public_key: "",
        short_id: "",
      },
    },
  },
  null,
  2,
);

function isPlainObject(val: unknown): val is JsonObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function getString(obj: JsonObject, key: string): string {
  const val = obj[key];
  return typeof val === "string" ? val : "";
}

function getNumberString(obj: JsonObject, key: string): string {
  const val = obj[key];
  if (typeof val === "number" && Number.isFinite(val)) {
    return String(val);
  }
  return "";
}

function getBoolean(obj: JsonObject, key: string): boolean {
  return obj[key] === true;
}

function parseOutboundJson(text: string): {
  obj: JsonObject | null;
  error: string | null;
} {
  if (!text.trim()) {
    return { obj: null, error: "JSON 内容不能为空" };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      return { obj: null, error: "JSON 必须是一个对象 ({ ... })" };
    }
    return { obj: parsed, error: null };
  } catch (err: unknown) {
    return {
      obj: null,
      error: `JSON 语法错误: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function validateOutboundForSubmit(
  obj: JsonObject,
): { tag: string; nodeType: string; server: string; port: number } | string {
  const tag = typeof obj.tag === "string" ? obj.tag.trim() : "";
  if (!tag) return "节点名称 (tag) 不能为空";

  const nodeType = typeof obj.type === "string" ? obj.type.trim() : "";
  if (!nodeType) return "协议类型 (type) 不能为空";

  const server = typeof obj.server === "string" ? obj.server.trim() : "";
  if (!server) return "服务器地址 (server) 不能为空";

  const rawPort = obj.server_port ?? obj.port;
  if (
    typeof rawPort !== "number" ||
    !Number.isInteger(rawPort) ||
    rawPort < 1 ||
    rawPort > 65535
  ) {
    return "端口 (server_port) 必须是 1 到 65535 之间的整数";
  }

  return { tag, nodeType, server, port: rawPort };
}

function formatInitialJson(node: NodeItem | null): string {
  if (!node) return DEFAULT_NEW_NODE_JSON;
  try {
    const parsed: unknown = JSON.parse(node.raw_json);
    if (isPlainObject(parsed)) {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // fallback to raw string if existing raw_json is malformed
  }
  return node.raw_json || DEFAULT_NEW_NODE_JSON;
}

export const NodeEditorModal: React.FC<NodeEditorModalProps> = ({
  open,
  node,
  onClose,
  onSaved,
}) => {
  const isEditMode = node !== null;
  const { success, error: showError } = useToast();

  const [activeTab, setActiveTab] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState<string>(DEFAULT_NEW_NODE_JSON);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setJsonText(formatInitialJson(node));
      setActiveTab("visual");
      setSubmitError(null);
    }
  }, [open, node]);

  const parsedResult = useMemo(() => parseOutboundJson(jsonText), [jsonText]);
  const parsedObj = parsedResult.obj;

  const jsonValidation = useMemo(() => {
    if (!parsedObj) {
      return { valid: false, message: parsedResult.error || "无效的 JSON" };
    }
    const check = validateOutboundForSubmit(parsedObj);
    if (typeof check === "string") {
      return { valid: false, message: check };
    }
    return {
      valid: true,
      message: `${check.nodeType.toUpperCase()} · ${check.tag} (${check.server}:${check.port})`,
    };
  }, [parsedObj, parsedResult.error]);

  const updateJsonObj = (updater: (draft: JsonObject) => void) => {
    const base: JsonObject = parsedObj ? structuredClone(parsedObj) : {};
    updater(base);
    setJsonText(JSON.stringify(base, null, 2));
    setSubmitError(null);
  };

  const setOrDeleteString = (
    target: JsonObject,
    key: string,
    value: string,
    keepEmpty = false,
  ) => {
    if (value === "" && !keepEmpty) {
      delete target[key];
    } else {
      target[key] = value;
    }
  };

  const handleTabSwitch = (nextTab: "visual" | "json") => {
    if (nextTab === "visual" && !parsedObj) {
      setSubmitError(
        parsedResult.error || "请先修复 JSON 语法错误后再切换到可视化视图",
      );
      return;
    }
    setSubmitError(null);
    setActiveTab(nextTab);
  };

  const handleFormatJson = () => {
    if (!parsedObj) {
      setSubmitError(parsedResult.error || "JSON 语法有误，无法格式化");
      return;
    }
    setJsonText(JSON.stringify(parsedObj, null, 2));
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!parsedObj) {
      setSubmitError(parsedResult.error || "JSON 语法有误");
      return;
    }

    const validated = validateOutboundForSubmit(parsedObj);
    if (typeof validated === "string") {
      setSubmitError(validated);
      return;
    }

    // Ensure raw_json carries trimmed tag/type/server and integer port
    const normalizedObj: JsonObject = {
      ...parsedObj,
      tag: validated.tag,
      type: validated.nodeType,
      server: validated.server,
    };
    if ("port" in normalizedObj && !("server_port" in normalizedObj)) {
      normalizedObj.port = validated.port;
    } else {
      normalizedObj.server_port = validated.port;
    }
    const rawJson = JSON.stringify(normalizedObj, null, 2);

    setSaving(true);
    setSubmitError(null);
    try {
      if (isEditMode && node) {
        await api.updateNode(node.id, {
          tag: validated.tag,
          node_type: validated.nodeType,
          server: validated.server,
          port: validated.port,
          raw_json: rawJson,
        });
        success("节点已更新", `已保存节点 ${validated.tag}`);
      } else {
        await api.saveNode({
          tag: validated.tag,
          node_type: validated.nodeType,
          server: validated.server,
          port: validated.port,
          raw_json: rawJson,
        });
        success("节点已添加", `已创建自定义节点 ${validated.tag}`);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      setSubmitError(msg);
      showError(isEditMode ? "保存节点失败" : "添加节点失败", msg);
    } finally {
      setSaving(false);
    }
  };

  // Derived visual fields from parsedObj
  const currentType = parsedObj
    ? getString(parsedObj, "type") || "vless"
    : "vless";
  const currentTag = parsedObj ? getString(parsedObj, "tag") : "";
  const currentServer = parsedObj ? getString(parsedObj, "server") : "";
  const currentPort = parsedObj
    ? getNumberString(parsedObj, "server_port") ||
      getNumberString(parsedObj, "port")
    : "";

  const protocolOptions = useMemo(() => {
    if (
      currentType &&
      !BASE_PROTOCOL_OPTIONS.some((opt) => opt.value === currentType)
    ) {
      return [
        ...BASE_PROTOCOL_OPTIONS,
        { value: currentType, label: currentType.toUpperCase() },
      ];
    }
    return BASE_PROTOCOL_OPTIONS;
  }, [currentType]);

  const tlsObj =
    parsedObj && isPlainObject(parsedObj.tls) ? parsedObj.tls : null;
  const tlsEnabled = tlsObj ? getBoolean(tlsObj, "enabled") : false;
  const utlsObj = tlsObj && isPlainObject(tlsObj.utls) ? tlsObj.utls : null;
  const utlsEnabled = utlsObj ? getBoolean(utlsObj, "enabled") : false;
  const realityObj =
    tlsObj && isPlainObject(tlsObj.reality) ? tlsObj.reality : null;
  const realityEnabled = realityObj ? getBoolean(realityObj, "enabled") : false;
  const alpnValue =
    tlsObj && Array.isArray(tlsObj.alpn)
      ? tlsObj.alpn.filter((x): x is string => typeof x === "string").join(", ")
      : "";

  const transportObj =
    parsedObj && isPlainObject(parsedObj.transport)
      ? parsedObj.transport
      : null;
  const transportType = transportObj ? getString(transportObj, "type") : "none";
  const transportHeaders =
    transportObj && isPlainObject(transportObj.headers)
      ? transportObj.headers
      : null;
  const obfsObj =
    parsedObj && isPlainObject(parsedObj.obfs) ? parsedObj.obfs : null;

  const ensureNestedObject = (root: JsonObject, key: string): JsonObject => {
    if (!isPlainObject(root[key])) {
      root[key] = {};
    }
    return root[key] as JsonObject;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="2xl"
      title={
        <div className="flex items-center gap-2">
          <span>{isEditMode ? "编辑节点配置" : "添加自定义节点"}</span>
          <Badge variant="info" size="sm">
            {currentType.toUpperCase()}
          </Badge>
        </div>
      }
      description={
        isEditMode
          ? `修改节点 ${node?.tag || ""} 的连接参数或底层 sing-box Outbound JSON`
          : "支持通过可视化表单填写参数，或直接粘贴 sing-box Outbound JSON 配置"
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={handleSubmit}
          >
            {isEditMode ? "保存修改" : "添加节点"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isEditMode && node && !node.is_custom && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              该节点来自订阅（{node.subscription_label || "未知订阅"}
              ），若后续更新订阅时启用了清理/覆盖策略，手动修改可能会被订阅同步覆盖。
            </span>
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => handleTabSwitch("visual")}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${
              activeTab === "visual"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>可视化表单</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch("json")}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${
              activeTab === "json"
                ? "bg-sky-500 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>粘贴 / 编辑 JSON</span>
          </button>
        </div>

        {submitError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* TAB 1: Visual Form */}
        {activeTab === "visual" && parsedObj && (
          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            {/* Section 1: Basic Connection */}
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-300">
                基础连接信息
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="节点名称 (Tag) *"
                  size="sm"
                  placeholder="例如: us_self"
                  value={currentTag}
                  onChange={(e) =>
                    updateJsonObj((draft) => {
                      draft.tag = e.target.value;
                    })
                  }
                />
                <Select
                  label="协议类型 (Type) *"
                  value={currentType}
                  onChange={(val) =>
                    updateJsonObj((draft) => {
                      draft.type = val;
                    })
                  }
                  options={protocolOptions}
                />
                <Input
                  label="服务器地址 (Server) *"
                  size="sm"
                  placeholder="例如: 170.106.76.11 或 example.com"
                  value={currentServer}
                  onChange={(e) =>
                    updateJsonObj((draft) => {
                      draft.server = e.target.value;
                    })
                  }
                />
                <Input
                  label="端口 (Port) *"
                  size="sm"
                  type="number"
                  min={1}
                  max={65535}
                  placeholder="例如: 443"
                  value={currentPort}
                  onChange={(e) =>
                    updateJsonObj((draft) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        delete draft.server_port;
                        delete draft.port;
                        return;
                      }
                      const num = Number(raw);
                      if (Number.isFinite(num)) {
                        draft.server_port = num;
                        delete draft.port;
                      }
                    })
                  }
                />
              </div>
            </div>

            {/* Section 2: Protocol-specific auth & options */}
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-300">
                协议认证与参数 ({currentType.toUpperCase()})
              </div>

              {currentType === "vless" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="UUID"
                    size="sm"
                    placeholder="例如: c04d6b79-0803-4cf1-8d76-3cc759ef79a0"
                    value={getString(parsedObj, "uuid")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "uuid", e.target.value.trim()),
                      )
                    }
                  />
                  <Input
                    label="Flow"
                    size="sm"
                    placeholder="例如: xtls-rprx-vision (可选)"
                    value={getString(parsedObj, "flow")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "flow", e.target.value.trim()),
                      )
                    }
                  />
                  <Input
                    label="Packet Encoding"
                    size="sm"
                    placeholder="可选，如: xudp"
                    value={getString(parsedObj, "packet_encoding")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(
                          draft,
                          "packet_encoding",
                          e.target.value.trim(),
                        ),
                      )
                    }
                  />
                </div>
              )}

              {currentType === "vmess" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    label="UUID"
                    size="sm"
                    placeholder="VMess UUID"
                    value={getString(parsedObj, "uuid")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "uuid", e.target.value.trim()),
                      )
                    }
                  />
                  <Select
                    label="加密方式 (Security)"
                    value={getString(parsedObj, "security") || "auto"}
                    onChange={(val) =>
                      updateJsonObj((draft) => {
                        draft.security = val;
                      })
                    }
                    options={[
                      { value: "auto", label: "auto" },
                      { value: "aes-128-gcm", label: "aes-128-gcm" },
                      {
                        value: "chacha20-poly1305",
                        label: "chacha20-poly1305",
                      },
                      { value: "none", label: "none" },
                    ]}
                  />
                  <Input
                    label="Alter ID"
                    size="sm"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={getNumberString(parsedObj, "alter_id")}
                    onChange={(e) =>
                      updateJsonObj((draft) => {
                        const raw = e.target.value.trim();
                        if (!raw) {
                          delete draft.alter_id;
                        } else {
                          draft.alter_id = Number(raw);
                        }
                      })
                    }
                  />
                </div>
              )}

              {(currentType === "trojan" || currentType === "anytls") && (
                <Input
                  label="密码 (Password)"
                  size="sm"
                  placeholder="节点密码"
                  value={getString(parsedObj, "password")}
                  onChange={(e) =>
                    updateJsonObj((draft) =>
                      setOrDeleteString(draft, "password", e.target.value),
                    )
                  }
                />
              )}

              {currentType === "shadowsocks" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="加密方式 (Method)"
                    size="sm"
                    placeholder="例如: 2022-blake3-aes-128-gcm / aes-256-gcm"
                    value={getString(parsedObj, "method")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(
                          draft,
                          "method",
                          e.target.value.trim(),
                        ),
                      )
                    }
                  />
                  <Input
                    label="密码 (Password)"
                    size="sm"
                    placeholder="Shadowsocks 密码"
                    value={getString(parsedObj, "password")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "password", e.target.value),
                      )
                    }
                  />
                </div>
              )}

              {currentType === "hysteria2" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="密码 (Password)"
                    size="sm"
                    placeholder="Hysteria2 认证密码"
                    value={getString(parsedObj, "password")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "password", e.target.value),
                      )
                    }
                  />
                  <Select
                    label="混淆类型 (Obfs)"
                    value={
                      obfsObj ? getString(obfsObj, "type") || "none" : "none"
                    }
                    onChange={(val) =>
                      updateJsonObj((draft) => {
                        if (val === "none") {
                          delete draft.obfs;
                        } else {
                          const obfs = ensureNestedObject(draft, "obfs");
                          obfs.type = val;
                        }
                      })
                    }
                    options={[
                      { value: "none", label: "无混淆" },
                      { value: "salamander", label: "salamander" },
                    ]}
                  />
                  {obfsObj && getString(obfsObj, "type") === "salamander" && (
                    <Input
                      label="混淆密码 (Obfs Password)"
                      size="sm"
                      placeholder="Salamander 密码"
                      value={getString(obfsObj, "password")}
                      onChange={(e) =>
                        updateJsonObj((draft) => {
                          const obfs = ensureNestedObject(draft, "obfs");
                          setOrDeleteString(obfs, "password", e.target.value);
                        })
                      }
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="上行 Mbps"
                      size="sm"
                      type="number"
                      min={0}
                      placeholder="可选"
                      value={getNumberString(parsedObj, "up_mbps")}
                      onChange={(e) =>
                        updateJsonObj((draft) => {
                          const raw = e.target.value.trim();
                          if (!raw) delete draft.up_mbps;
                          else draft.up_mbps = Number(raw);
                        })
                      }
                    />
                    <Input
                      label="下行 Mbps"
                      size="sm"
                      type="number"
                      min={0}
                      placeholder="可选"
                      value={getNumberString(parsedObj, "down_mbps")}
                      onChange={(e) =>
                        updateJsonObj((draft) => {
                          const raw = e.target.value.trim();
                          if (!raw) delete draft.down_mbps;
                          else draft.down_mbps = Number(raw);
                        })
                      }
                    />
                  </div>
                </div>
              )}

              {currentType === "tuic" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="UUID"
                    size="sm"
                    placeholder="TUIC UUID"
                    value={getString(parsedObj, "uuid")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "uuid", e.target.value.trim()),
                      )
                    }
                  />
                  <Input
                    label="密码 (Password)"
                    size="sm"
                    placeholder="TUIC 密码"
                    value={getString(parsedObj, "password")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "password", e.target.value),
                      )
                    }
                  />
                  <Select
                    label="拥塞控制 (Congestion Control)"
                    value={getString(parsedObj, "congestion_control") || "bbr"}
                    onChange={(val) =>
                      updateJsonObj((draft) => {
                        draft.congestion_control = val;
                      })
                    }
                    options={[
                      { value: "bbr", label: "bbr" },
                      { value: "cubic", label: "cubic" },
                      { value: "new_reno", label: "new_reno" },
                    ]}
                  />
                  <Select
                    label="UDP 中继模式"
                    value={getString(parsedObj, "udp_relay_mode") || "native"}
                    onChange={(val) =>
                      updateJsonObj((draft) => {
                        draft.udp_relay_mode = val;
                      })
                    }
                    options={[
                      { value: "native", label: "native" },
                      { value: "quic", label: "quic" },
                    ]}
                  />
                </div>
              )}

              {(currentType === "socks" || currentType === "http") && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="用户名 (Username)"
                    size="sm"
                    placeholder="可选"
                    value={getString(parsedObj, "username")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "username", e.target.value),
                      )
                    }
                  />
                  <Input
                    label="密码 (Password)"
                    size="sm"
                    placeholder="可选"
                    value={getString(parsedObj, "password")}
                    onChange={(e) =>
                      updateJsonObj((draft) =>
                        setOrDeleteString(draft, "password", e.target.value),
                      )
                    }
                  />
                </div>
              )}

              {currentType !== "vless" &&
                currentType !== "vmess" &&
                currentType !== "trojan" &&
                currentType !== "anytls" &&
                currentType !== "shadowsocks" &&
                currentType !== "hysteria2" &&
                currentType !== "tuic" &&
                currentType !== "socks" &&
                currentType !== "http" && (
                  <p className="text-xs text-slate-400">
                    该协议的高级字段请切换到「粘贴 / 编辑
                    JSON」标签页进行精确编辑。
                  </p>
                )}
            </div>

            {/* Section 3: TLS / uTLS / Reality */}
            {TLS_PROTOCOLS.has(currentType) && (
              <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-300">
                    TLS 安全传输与 Reality
                  </div>
                  <Switch
                    label="启用 TLS"
                    checked={tlsEnabled}
                    onChange={(checked) =>
                      updateJsonObj((draft) => {
                        if (checked) {
                          const tls = ensureNestedObject(draft, "tls");
                          tls.enabled = true;
                        } else if (isPlainObject(draft.tls)) {
                          draft.tls.enabled = false;
                        }
                      })
                    }
                  />
                </div>

                {tlsEnabled && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label="SNI (server_name)"
                        size="sm"
                        placeholder="例如: www.bing.com"
                        value={tlsObj ? getString(tlsObj, "server_name") : ""}
                        onChange={(e) =>
                          updateJsonObj((draft) => {
                            const tls = ensureNestedObject(draft, "tls");
                            setOrDeleteString(
                              tls,
                              "server_name",
                              e.target.value.trim(),
                            );
                          })
                        }
                      />
                      <Input
                        label="ALPN (逗号分隔)"
                        size="sm"
                        placeholder="例如: h2, http/1.1 (可选)"
                        value={alpnValue}
                        onChange={(e) =>
                          updateJsonObj((draft) => {
                            const tls = ensureNestedObject(draft, "tls");
                            const parts = e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            if (parts.length > 0) {
                              tls.alpn = parts;
                            } else {
                              delete tls.alpn;
                            }
                          })
                        }
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-1">
                      <Switch
                        label="跳过证书验证 (insecure)"
                        checked={
                          tlsObj ? getBoolean(tlsObj, "insecure") : false
                        }
                        onChange={(checked) =>
                          updateJsonObj((draft) => {
                            const tls = ensureNestedObject(draft, "tls");
                            if (checked) {
                              tls.insecure = true;
                            } else {
                              delete tls.insecure;
                            }
                          })
                        }
                      />
                      <Switch
                        label="启用 uTLS"
                        checked={utlsEnabled}
                        onChange={(checked) =>
                          updateJsonObj((draft) => {
                            const tls = ensureNestedObject(draft, "tls");
                            if (checked) {
                              const utls = ensureNestedObject(tls, "utls");
                              utls.enabled = true;
                              if (!getString(utls, "fingerprint")) {
                                utls.fingerprint = "chrome";
                              }
                            } else if (isPlainObject(tls.utls)) {
                              tls.utls.enabled = false;
                            }
                          })
                        }
                      />
                      <Switch
                        label="启用 Reality"
                        checked={realityEnabled}
                        onChange={(checked) =>
                          updateJsonObj((draft) => {
                            const tls = ensureNestedObject(draft, "tls");
                            if (checked) {
                              const reality = ensureNestedObject(
                                tls,
                                "reality",
                              );
                              reality.enabled = true;
                            } else if (isPlainObject(tls.reality)) {
                              tls.reality.enabled = false;
                            }
                          })
                        }
                      />
                    </div>

                    {utlsEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <Select
                          label="uTLS 指纹 (fingerprint)"
                          value={
                            utlsObj
                              ? getString(utlsObj, "fingerprint") || "chrome"
                              : "chrome"
                          }
                          onChange={(val) =>
                            updateJsonObj((draft) => {
                              const tls = ensureNestedObject(draft, "tls");
                              const utls = ensureNestedObject(tls, "utls");
                              utls.enabled = true;
                              utls.fingerprint = val;
                            })
                          }
                          options={UTLS_FINGERPRINT_OPTIONS}
                        />
                      </div>
                    )}

                    {realityEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <Input
                          label="Reality Public Key"
                          size="sm"
                          placeholder="例如: hDeF0usWcAOgKqZiygeQG8yPQGurjEhXXRNewBVkuy8"
                          value={
                            realityObj
                              ? getString(realityObj, "public_key")
                              : ""
                          }
                          onChange={(e) =>
                            updateJsonObj((draft) => {
                              const tls = ensureNestedObject(draft, "tls");
                              const reality = ensureNestedObject(
                                tls,
                                "reality",
                              );
                              reality.enabled = true;
                              setOrDeleteString(
                                reality,
                                "public_key",
                                e.target.value.trim(),
                              );
                            })
                          }
                        />
                        <Input
                          label="Reality Short ID"
                          size="sm"
                          placeholder="例如: b803b45ccaced487"
                          value={
                            realityObj ? getString(realityObj, "short_id") : ""
                          }
                          onChange={(e) =>
                            updateJsonObj((draft) => {
                              const tls = ensureNestedObject(draft, "tls");
                              const reality = ensureNestedObject(
                                tls,
                                "reality",
                              );
                              reality.enabled = true;
                              setOrDeleteString(
                                reality,
                                "short_id",
                                e.target.value.trim(),
                              );
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Section 4: Transport */}
            {TRANSPORT_PROTOCOLS.has(currentType) && (
              <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
                <div className="text-xs font-semibold text-slate-300">
                  传输层 (Transport)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="传输协议"
                    value={transportType || "none"}
                    onChange={(val) =>
                      updateJsonObj((draft) => {
                        if (val === "none") {
                          delete draft.transport;
                        } else {
                          const tr = ensureNestedObject(draft, "transport");
                          tr.type = val;
                        }
                      })
                    }
                    options={[
                      { value: "none", label: "默认 (TCP)" },
                      { value: "ws", label: "WebSocket (ws)" },
                      { value: "grpc", label: "gRPC" },
                      { value: "http", label: "HTTP" },
                      { value: "httpupgrade", label: "HTTPUpgrade" },
                    ]}
                  />

                  {(transportType === "ws" ||
                    transportType === "httpupgrade") && (
                    <>
                      <Input
                        label="路径 (Path)"
                        size="sm"
                        placeholder="例如: /ws"
                        value={
                          transportObj ? getString(transportObj, "path") : ""
                        }
                        onChange={(e) =>
                          updateJsonObj((draft) => {
                            const tr = ensureNestedObject(draft, "transport");
                            setOrDeleteString(
                              tr,
                              "path",
                              e.target.value.trim(),
                            );
                          })
                        }
                      />
                      <Input
                        label="Host 请求头"
                        size="sm"
                        placeholder="例如: cdn.example.com"
                        value={
                          transportHeaders
                            ? getString(transportHeaders, "Host")
                            : ""
                        }
                        onChange={(e) =>
                          updateJsonObj((draft) => {
                            const tr = ensureNestedObject(draft, "transport");
                            const headers = ensureNestedObject(tr, "headers");
                            setOrDeleteString(
                              headers,
                              "Host",
                              e.target.value.trim(),
                            );
                          })
                        }
                      />
                    </>
                  )}

                  {transportType === "grpc" && (
                    <Input
                      label="Service Name"
                      size="sm"
                      placeholder="例如: gun"
                      value={
                        transportObj
                          ? getString(transportObj, "service_name")
                          : ""
                      }
                      onChange={(e) =>
                        updateJsonObj((draft) => {
                          const tr = ensureNestedObject(draft, "transport");
                          setOrDeleteString(
                            tr,
                            "service_name",
                            e.target.value.trim(),
                          );
                        })
                      }
                    />
                  )}

                  {transportType === "http" && (
                    <Input
                      label="路径 (Path)"
                      size="sm"
                      placeholder="例如: /"
                      value={
                        transportObj ? getString(transportObj, "path") : ""
                      }
                      onChange={(e) =>
                        updateJsonObj((draft) => {
                          const tr = ensureNestedObject(draft, "transport");
                          setOrDeleteString(tr, "path", e.target.value.trim());
                        })
                      }
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Raw JSON Paste / Edit */}
        {activeTab === "json" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-slate-400">
                可直接粘贴完整的 sing-box Outbound 节点
                JSON（支持自动同步到可视化表单）
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFormatJson}
                icon={<Sparkles className="w-3.5 h-3.5 text-sky-400" />}
              >
                格式化 JSON
              </Button>
            </div>

            <textarea
              aria-label="节点 Outbound JSON"
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setSubmitError(null);
              }}
              spellCheck={false}
              rows={16}
              placeholder={`{\n  "type": "vless",\n  "tag": "us_self",\n  "server": "170.106.76.11",\n  "server_port": 443\n}`}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-xs font-mono text-emerald-300 leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500/60 focus:border-sky-500/60 resize-y"
            />

            <div
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                jsonValidation.valid
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-300"
              }`}
            >
              {jsonValidation.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>
                {jsonValidation.valid
                  ? `JSON 校验通过 · ${jsonValidation.message}`
                  : jsonValidation.message}
              </span>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
