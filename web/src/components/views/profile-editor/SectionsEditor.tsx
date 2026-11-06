import React from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  Server,
  Shield,
  Sliders,
  Sparkles,
  Network,
  Layers,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { PlatformType } from "../../../types/api";
import {
  SingBoxVisualConfig,
  RuleSetItem,
  DnsServerItem,
  InboundItem,
  OutboundItem,
  HttpClientItem,
  OFFICIAL_RULE_SET_PRESETS,
} from "./types";
import { TagListInput } from "./TagListInput";

interface RouteGlobalAndRuleSetsProps {
  platform: PlatformType;
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  outboundTags: string[];
  dnsServerTags: string[];
  httpClientTags: string[];
}

export const RouteGlobalAndRuleSetsEditor: React.FC<
  RouteGlobalAndRuleSetsProps
> = ({
  platform,
  config,
  onChange,
  outboundTags,
  dnsServerTags,
  httpClientTags,
}) => {
  const route = config.route || {};
  const ruleSets: RuleSetItem[] = Array.isArray(route.rule_set)
    ? route.rule_set
    : [];

  const updateRouteField = (key: string, val: unknown) => {
    const nextRoute: Record<string, unknown> = { ...route };
    if (val === undefined || val === "") {
      delete nextRoute[key];
    } else {
      nextRoute[key] = val;
    }
    onChange({ ...config, route: nextRoute as SingBoxVisualConfig["route"] });
  };

  const addRuleSet = (preset?: { tag: string; url: string }) => {
    const tag = preset?.tag || `ruleset-${ruleSets.length + 1}`;
    if (ruleSets.some((r) => r.tag === tag)) return;
    const defaultClient = httpClientTags.includes("proxy")
      ? "proxy"
      : undefined;
    const nextItem: RuleSetItem = {
      type: "remote",
      tag,
      format: "binary",
      url:
        preset?.url ||
        "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
      ...(defaultClient ? { http_client: defaultClient } : {}),
    };
    updateRouteField("rule_set", [...ruleSets, nextItem]);
  };

  const updateRuleSetAt = (idx: number, nextItem: RuleSetItem) => {
    const next = [...ruleSets];
    next[idx] = nextItem;
    updateRouteField("rule_set", next);
  };

  const removeRuleSetAt = (idx: number) => {
    updateRouteField(
      "rule_set",
      ruleSets.filter((_, i) => i !== idx),
    );
  };

  const resolverStr =
    typeof route.default_domain_resolver === "string"
      ? route.default_domain_resolver
      : "";

  return (
    <div className="space-y-5">
      {/* Global Route Settings */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>全局路由基础参数 (route)</span>
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="默认兜底出站 (route.final)"
            value={route.final || outboundTags[0] || "proxy"}
            onChange={(val) => updateRouteField("final", val)}
            options={[
              ...outboundTags.map((t) => ({
                value: t,
                label: t === "direct" ? "direct (直连)" : t,
              })),
              ...(route.final && !outboundTags.includes(route.final)
                ? [{ value: route.final, label: route.final }]
                : []),
            ]}
          />

          <Select
            label="默认域名解析器 (default_domain_resolver)"
            value={resolverStr}
            onChange={(val) =>
              updateRouteField("default_domain_resolver", val || undefined)
            }
            options={[
              { value: "", label: "未指定 (使用默认 DNS)" },
              ...dnsServerTags.map((t) => ({ value: t, label: t })),
              ...(resolverStr && !dnsServerTags.includes(resolverStr)
                ? [{ value: resolverStr, label: resolverStr }]
                : []),
            ]}
          />

          <Select
            label="默认 HTTP 客户端 (default_http_client)"
            value={route.default_http_client || ""}
            onChange={(val) =>
              updateRouteField("default_http_client", val || undefined)
            }
            options={[
              { value: "", label: "系统默认连接" },
              ...httpClientTags.map((t) => ({ value: t, label: t })),
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                自动检测网卡 (auto_detect_interface)
              </span>
              <span className="text-[10px] text-slate-500">
                TUN 模式下自动绑定出口物理网卡
              </span>
            </div>
            <Switch
              checked={Boolean(route.auto_detect_interface)}
              onChange={(val) =>
                updateRouteField("auto_detect_interface", val || undefined)
              }
            />
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                查找本地进程 (find_process)
              </span>
              <span className="text-[10px] text-slate-500">
                开启连接所属进程名称与路径匹配
              </span>
            </div>
            <Switch
              checked={Boolean(route.find_process)}
              onChange={(val) =>
                updateRouteField("find_process", val || undefined)
              }
            />
          </div>

          {platform === "android" && (
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-300 block">
                  接管 Android VPN (override_android_vpn)
                </span>
                <span className="text-[10px] text-slate-500">
                  Android 平台覆盖系统 VPN 路由
                </span>
              </div>
              <Switch
                checked={Boolean(route.override_android_vpn)}
                onChange={(val) =>
                  updateRouteField("override_android_vpn", val || undefined)
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Rule Set Manager */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>远程/本地规则集管理 (route.rule_set) — 共 {ruleSets.length} 个</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              配置分流规则中引用的 <code className="text-sky-300">geosite-*</code>{" "}
              与 <code className="text-sky-300">geoip-*</code> 规则集源。
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => addRuleSet()}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            手动新增规则集
          </Button>
        </div>

        {/* One-Click Official RuleSet Presets */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] text-slate-400 flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            一键添加官方规则集:
          </span>
          {OFFICIAL_RULE_SET_PRESETS.map((preset) => {
            const exists = ruleSets.some((r) => r.tag === preset.tag);
            return (
              <button
                key={preset.tag}
                type="button"
                disabled={exists}
                onClick={() => addRuleSet(preset)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${
                  exists
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 cursor-default"
                    : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-sky-500/50 hover:text-sky-300"
                }`}
                title={preset.label}
              >
                {exists ? `✓ ${preset.tag}` : `+ ${preset.tag}`}
              </button>
            );
          })}
        </div>

        {ruleSets.length > 0 && (
          <div className="space-y-2 pt-2">
            {ruleSets.map((rs, idx) => (
              <div
                key={`${rs.tag}-${idx}`}
                className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/90 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
              >
                <div className="sm:col-span-3">
                  <Input
                    label="标签 (tag)"
                    value={rs.tag || ""}
                    onChange={(e) =>
                      updateRuleSetAt(idx, { ...rs, tag: e.target.value })
                    }
                    placeholder="如: geosite-cn"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Select
                    label="类型 (type)"
                    value={rs.type || "remote"}
                    onChange={(val) =>
                      updateRuleSetAt(idx, {
                        ...rs,
                        type: val as RuleSetItem["type"],
                      })
                    }
                    options={[
                      { value: "remote", label: "远程 (remote)" },
                      { value: "local", label: "本地 (local)" },
                    ]}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Select
                    label="格式 (format)"
                    value={rs.format || "binary"}
                    onChange={(val) =>
                      updateRuleSetAt(idx, {
                        ...rs,
                        format: val as RuleSetItem["format"],
                      })
                    }
                    options={[
                      { value: "binary", label: "二进制 (.srs)" },
                      { value: "source", label: "源码 (.json)" },
                    ]}
                  />
                </div>
                <div className="sm:col-span-4">
                  {rs.type === "local" ? (
                    <Input
                      label="本地文件路径 (path)"
                      value={rs.path || ""}
                      onChange={(e) =>
                        updateRuleSetAt(idx, {
                          ...rs,
                          path: e.target.value,
                          url: undefined,
                        })
                      }
                      placeholder="/etc/sing-box/ruleset.srs"
                    />
                  ) : (
                    <Input
                      label="远程订阅地址 (url)"
                      value={rs.url || ""}
                      onChange={(e) =>
                        updateRuleSetAt(idx, {
                          ...rs,
                          url: e.target.value,
                          path: undefined,
                        })
                      }
                      placeholder="https://.../geosite-cn.srs"
                    />
                  )}
                </div>
                <div className="sm:col-span-1 flex justify-end pb-1">
                  <button
                    type="button"
                    onClick={() => removeRuleSetAt(idx)}
                    className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    title="删除规则集"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface DnsSectionEditorProps {
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  outboundTags: string[];
}

export const DnsSectionEditor: React.FC<DnsSectionEditorProps> = ({
  config,
  onChange,
  outboundTags,
}) => {
  const dns = config.dns || {};
  const servers: DnsServerItem[] = Array.isArray(dns.servers)
    ? dns.servers
    : [];
  const serverTags = servers.map((s) => s.tag).filter(Boolean) as string[];

  const updateDnsField = (key: string, val: unknown) => {
    const nextDns: Record<string, unknown> = { ...dns };
    if (val === undefined || val === "") {
      delete nextDns[key];
    } else {
      nextDns[key] = val;
    }
    onChange({ ...config, dns: nextDns as SingBoxVisualConfig["dns"] });
  };

  const addServer = (preset?: Partial<DnsServerItem>) => {
    const newServer: DnsServerItem = {
      type: "udp",
      tag: `dns-${servers.length + 1}`,
      server: "223.5.5.5",
      ...preset,
    };
    updateDnsField("servers", [...servers, newServer]);
  };

  const updateServerAt = (idx: number, nextItem: DnsServerItem) => {
    const next = [...servers];
    next[idx] = nextItem;
    updateDnsField("servers", next);
  };

  const removeServerAt = (idx: number) => {
    updateDnsField(
      "servers",
      servers.filter((_, i) => i !== idx),
    );
  };

  return (
    <div className="space-y-5">
      {/* Global DNS Settings */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-sky-400" />
          <span>DNS 全局参数配置 (dns)</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="默认兜底 DNS 服务器 (dns.final)"
            value={dns.final || serverTags[0] || ""}
            onChange={(val) => updateDnsField("final", val || undefined)}
            options={[
              { value: "", label: "默认首个服务器" },
              ...serverTags.map((t) => ({ value: t, label: t })),
              ...(dns.final && !serverTags.includes(dns.final)
                ? [{ value: dns.final, label: dns.final }]
                : []),
            ]}
          />

          <Select
            label="全局解析策略 (dns.strategy)"
            value={dns.strategy || ""}
            onChange={(val) => updateDnsField("strategy", val || undefined)}
            options={[
              { value: "", label: "系统默认 (双栈)" },
              { value: "prefer_ipv4", label: "优先 IPv4 (prefer_ipv4)" },
              { value: "prefer_ipv6", label: "优先 IPv6 (prefer_ipv6)" },
              { value: "ipv4_only", label: "仅 IPv4 (ipv4_only)" },
              { value: "ipv6_only", label: "仅 IPv6 (ipv6_only)" },
            ]}
          />

          <Input
            label="EDNS 客户端子网 (client_subnet)"
            value={dns.client_subnet || ""}
            onChange={(e) =>
              updateDnsField("client_subnet", e.target.value || undefined)
            }
            placeholder="例如: 114.114.114.114/24"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-300">
              禁用 DNS 缓存 (disable_cache)
            </span>
            <Switch
              checked={Boolean(dns.disable_cache)}
              onChange={(val) =>
                updateDnsField("disable_cache", val || undefined)
              }
            />
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-300">
              禁用 TTL 过期 (disable_expire)
            </span>
            <Switch
              checked={Boolean(dns.disable_expire)}
              onChange={(val) =>
                updateDnsField("disable_expire", val || undefined)
              }
            />
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-300">
              IP 反向映射 (reverse_mapping)
            </span>
            <Switch
              checked={Boolean(dns.reverse_mapping)}
              onChange={(val) =>
                updateDnsField("reverse_mapping", val || undefined)
              }
            />
          </div>
        </div>
      </div>

      {/* DNS Servers List */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-sky-400" />
              <span>DNS 服务器列表 (dns.servers) — 共 {servers.length} 个</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              支持 sing-box 1.14 新版结构化 DNS 服务器定义 (udp / tcp / tls / https / h3 / quic / local / fakeip)。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                addServer({
                  tag: "local-dns",
                  type: "udp",
                  server: "223.5.5.5",
                })
              }
            >
              + 国内阿里 DNS
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                addServer({
                  tag: "remote-dns",
                  type: "https",
                  server: "1.1.1.1",
                  detour: outboundTags.find((t) => t !== "direct") || "proxy",
                })
              }
            >
              + 海外远程 DoH
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                addServer({
                  tag: "fakeip-dns",
                  type: "fakeip",
                  inet4_range: "198.18.0.0/15",
                  inet6_range: "fc00::/18",
                })
              }
            >
              + FakeIP 服务器
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => addServer()}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              自定义服务器
            </Button>
          </div>
        </div>

        <div className="space-y-2.5">
          {servers.map((srv, idx) => {
            const needsAddress = [
              "udp",
              "tcp",
              "tls",
              "https",
              "h3",
              "quic",
            ].includes(srv.type || "udp");
            const isFakeIp = srv.type === "fakeip";

            return (
              <div
                key={`${srv.tag || idx}-${idx}`}
                className="p-3 rounded-lg bg-slate-950/75 border border-slate-800/90 space-y-2.5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-3">
                    <Input
                      label="服务器标签 (tag)"
                      value={srv.tag || ""}
                      onChange={(e) =>
                        updateServerAt(idx, { ...srv, tag: e.target.value })
                      }
                      placeholder="例如: remote-dns"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Select
                      label="协议类型 (type)"
                      value={srv.type || "udp"}
                      onChange={(val) => {
                        const nextType = val as DnsServerItem["type"];
                        const copy: DnsServerItem = {
                          type: nextType,
                          tag: srv.tag,
                        };
                        if (
                          ["udp", "tcp", "tls", "https", "h3", "quic"].includes(
                            nextType,
                          )
                        ) {
                          copy.server = srv.server || "1.1.1.1";
                          if (srv.detour) copy.detour = srv.detour;
                        } else if (nextType === "fakeip") {
                          copy.inet4_range = "198.18.0.0/15";
                          copy.inet6_range = "fc00::/18";
                        }
                        updateServerAt(idx, copy);
                      }}
                      options={[
                        { value: "udp", label: "UDP (标准 DNS)" },
                        { value: "https", label: "HTTPS (DoH)" },
                        { value: "tls", label: "TLS (DoT)" },
                        { value: "h3", label: "HTTP/3 (DoH3)" },
                        { value: "quic", label: "QUIC (DoQ)" },
                        { value: "tcp", label: "TCP" },
                        { value: "local", label: "系统本地 (local)" },
                        { value: "fakeip", label: "虚拟 IP (fakeip)" },
                        { value: "dhcp", label: "DHCP 自动获取" },
                      ]}
                    />
                  </div>

                  {needsAddress && (
                    <>
                      <div className="sm:col-span-3">
                        <Input
                          label="服务器地址 (server)"
                          value={srv.server || ""}
                          onChange={(e) =>
                            updateServerAt(idx, {
                              ...srv,
                              server: e.target.value,
                            })
                          }
                          placeholder="如: 223.5.5.5 或 1.1.1.1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Select
                          label="出站绕行 (detour)"
                          value={srv.detour || ""}
                          onChange={(val) =>
                            updateServerAt(idx, {
                              ...srv,
                              detour: val || undefined,
                            })
                          }
                          options={[
                            { value: "", label: "直连 (无 detour)" },
                            ...outboundTags
                              .filter((t) => t !== "direct")
                              .map((t) => ({ value: t, label: t })),
                          ]}
                        />
                      </div>
                    </>
                  )}

                  {isFakeIp && (
                    <>
                      <div className="sm:col-span-3">
                        <Input
                          label="IPv4 地址池 (inet4_range)"
                          value={srv.inet4_range || ""}
                          onChange={(e) =>
                            updateServerAt(idx, {
                              ...srv,
                              inet4_range: e.target.value || undefined,
                            })
                          }
                          placeholder="198.18.0.0/15"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Input
                          label="IPv6 地址池 (inet6_range)"
                          value={srv.inet6_range || ""}
                          onChange={(e) =>
                            updateServerAt(idx, {
                              ...srv,
                              inet6_range: e.target.value || undefined,
                            })
                          }
                          placeholder="fc00::/18"
                        />
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-1 flex justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => removeServerAt(idx)}
                      className="p-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      title="删除 DNS 服务器"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface InboundsSectionEditorProps {
  platform: PlatformType;
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
}

export const InboundsSectionEditor: React.FC<InboundsSectionEditorProps> = ({
  platform,
  config,
  onChange,
}) => {
  const inbounds: InboundItem[] = Array.isArray(config.inbounds)
    ? config.inbounds
    : [];
  const isAndroid = platform === "android";

  const updateInbounds = (next: InboundItem[]) => {
    onChange({ ...config, inbounds: next });
  };

  const addInbound = (type: "tun" | "mixed" | "http" | "socks") => {
    const newItem: InboundItem =
      type === "tun"
        ? {
            type: "tun",
            tag: "tun-in",
            address: ["172.19.0.1/30"],
            auto_route: true,
            strict_route: true,
          }
        : {
            type,
            tag: `${type}-in`,
            listen: "127.0.0.1",
            listen_port: type === "mixed" ? 2080 : type === "http" ? 8080 : 1080,
          };
    updateInbounds([...inbounds, newItem]);
  };

  const updateInboundAt = (idx: number, nextItem: InboundItem) => {
    const next = [...inbounds];
    next[idx] = nextItem;
    updateInbounds(next);
  };

  const removeInboundAt = (idx: number) => {
    updateInbounds(inbounds.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-sky-400" />
              <span>入站监听配置 (inbounds) — 共 {inbounds.length} 个</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              管理本地代理端口 (mixed / socks / http) 与虚拟网卡透明代理 (tun)。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addInbound("tun")}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              新增 TUN 虚拟网卡
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addInbound("mixed")}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              新增 Mixed 混合端口
            </Button>
          </div>
        </div>

        {inbounds.length === 0 && (
          <div className="p-6 rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
            当前暂无入站配置，请点击上方按钮添加 TUN 或 Mixed 入站。
          </div>
        )}

        <div className="space-y-3">
          {inbounds.map((inb, idx) => {
            const isTun = inb.type === "tun";
            return (
              <div
                key={`${inb.tag || idx}-${idx}`}
                className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="info" size="sm">
                      {(inb.type || "mixed").toUpperCase()}
                    </Badge>
                    <span className="text-xs font-mono text-slate-200">
                      {inb.tag || `inbound-${idx + 1}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeInboundAt(idx)}
                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    title="删除入站"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Select
                    label="入站类型 (type)"
                    value={inb.type || "mixed"}
                    onChange={(val) => {
                      if (val === "tun") {
                        updateInboundAt(idx, {
                          type: "tun",
                          tag: inb.tag || "tun-in",
                          address: ["172.19.0.1/30"],
                          auto_route: true,
                          strict_route: true,
                        });
                      } else {
                        updateInboundAt(idx, {
                          type: val,
                          tag: inb.tag || `${val}-in`,
                          listen: "127.0.0.1",
                          listen_port: 2080,
                        });
                      }
                    }}
                    options={[
                      { value: "tun", label: "TUN 虚拟网卡 (tun)" },
                      { value: "mixed", label: "HTTP+SOCKS 混合代理 (mixed)" },
                      { value: "http", label: "HTTP 代理 (http)" },
                      { value: "socks", label: "SOCKS5 代理 (socks)" },
                      { value: "redirect", label: "透明重定向 (redirect)" },
                      { value: "tproxy", label: "透明代理 (tproxy)" },
                      { value: "direct", label: "直连转发 (direct)" },
                    ]}
                  />

                  <Input
                    label="入站标签 (tag)"
                    value={inb.tag || ""}
                    onChange={(e) =>
                      updateInboundAt(idx, { ...inb, tag: e.target.value })
                    }
                    placeholder="如: tun-in, mixed-in"
                  />

                  {isTun ? (
                    <Input
                      label="MTU 大小 (mtu)"
                      type="number"
                      value={inb.mtu ? String(inb.mtu) : ""}
                      onChange={(e) =>
                        updateInboundAt(idx, {
                          ...inb,
                          mtu: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                      placeholder="默认 (如 9000 或 1500)"
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="监听地址 (listen)"
                        value={inb.listen || ""}
                        onChange={(e) =>
                          updateInboundAt(idx, {
                            ...inb,
                            listen: e.target.value,
                          })
                        }
                        placeholder="127.0.0.1"
                      />
                      <Input
                        label="端口 (listen_port)"
                        type="number"
                        value={
                          inb.listen_port !== undefined
                            ? String(inb.listen_port)
                            : ""
                        }
                        onChange={(e) =>
                          updateInboundAt(idx, {
                            ...inb,
                            listen_port: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="2080"
                      />
                    </div>
                  )}
                </div>

                {isTun && (
                  <div className="space-y-3">
                    <TagListInput
                      label="TUN 网卡地址段 (address)"
                      values={inb.address || []}
                      onChange={(v) =>
                        updateInboundAt(idx, { ...inb, address: v })
                      }
                      placeholder="如: 172.19.0.1/30, fdfe:dcba:9876::1/126"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-300">
                          自动配置路由 (auto_route)
                        </span>
                        <Switch
                          checked={Boolean(inb.auto_route)}
                          onChange={(val) =>
                            updateInboundAt(idx, {
                              ...inb,
                              auto_route: val || undefined,
                            })
                          }
                        />
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-300">
                          严格路由防泄漏 (strict_route)
                        </span>
                        <Switch
                          checked={Boolean(inb.strict_route)}
                          onChange={(val) =>
                            updateInboundAt(idx, {
                              ...inb,
                              strict_route: val || undefined,
                            })
                          }
                        />
                      </div>

                      {platform === "linux" && (
                        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                          <span className="text-xs text-slate-300">
                            NFTables 自动重定向 (auto_redirect)
                          </span>
                          <Switch
                            checked={Boolean(inb.auto_redirect)}
                            onChange={(val) =>
                              updateInboundAt(idx, {
                                ...inb,
                                auto_redirect: val || undefined,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>

                    {isAndroid && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <TagListInput
                          label="仅代理指定 Android 应用包名 (include_package)"
                          values={inb.include_package || []}
                          onChange={(v) =>
                            updateInboundAt(idx, {
                              ...inb,
                              include_package: v.length ? v : undefined,
                            })
                          }
                          placeholder="留空则代理全部应用"
                        />
                        <TagListInput
                          label="排除指定 Android 应用包名 (exclude_package)"
                          values={inb.exclude_package || []}
                          onChange={(v) =>
                            updateInboundAt(idx, {
                              ...inb,
                              exclude_package: v.length ? v : undefined,
                            })
                          }
                          placeholder="例如: com.tencent.mm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface OutboundsSectionEditorProps {
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  onSyncFromNodePool: () => void;
  syncing: boolean;
}

export const OutboundsSectionEditor: React.FC<OutboundsSectionEditorProps> = ({
  config,
  onChange,
  onSyncFromNodePool,
  syncing,
}) => {
  const outbounds: OutboundItem[] = Array.isArray(config.outbounds)
    ? config.outbounds
    : [];

  const allTags = outbounds.map((o) => o.tag).filter(Boolean) as string[];

  // Separate group/system outbounds vs concrete proxy nodes
  const editableTypes = new Set(["direct", "selector", "urltest"]);
  const groupAndSystemIndices: number[] = [];
  const nodeIndices: number[] = [];

  outbounds.forEach((o, i) => {
    if (editableTypes.has(o.type)) {
      groupAndSystemIndices.push(i);
    } else {
      nodeIndices.push(i);
    }
  });

  const updateOutboundAt = (idx: number, nextItem: OutboundItem) => {
    const next = [...outbounds];
    next[idx] = nextItem;
    onChange({ ...config, outbounds: next });
  };

  const removeOutboundAt = (idx: number) => {
    onChange({
      ...config,
      outbounds: outbounds.filter((_, i) => i !== idx),
    });
  };

  const addGroupOutbound = (type: "selector" | "urltest" | "direct") => {
    const newItem: OutboundItem =
      type === "direct"
        ? { type: "direct", tag: "direct" }
        : type === "selector"
          ? {
              type: "selector",
              tag: `group-${outbounds.length + 1}`,
              outbounds: ["direct"],
            }
          : {
              type: "urltest",
              tag: `auto-${outbounds.length + 1}`,
              outbounds: ["direct"],
              url: "http://cp.cloudflare.com/generate_204",
              interval: "3m",
              tolerance: 50,
            };
    onChange({ ...config, outbounds: [newItem, ...outbounds] });
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>
                出站与策略组管理 (outbounds) — 共 {outbounds.length} 项 (策略/基础{" "}
                {groupAndSystemIndices.length} 项，节点 {nodeIndices.length} 项)
              </span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              可一键从「节点池」与「节点组合」同步最新策略组和节点，支持手动编辑策略组选项，修改后需点击底部「保存配置」才会写入数据库。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={syncing}
              onClick={onSyncFromNodePool}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              从节点池与节点组合同步
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addGroupOutbound("selector")}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              新增手动选择组 (selector)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addGroupOutbound("urltest")}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              新增自动测速组 (urltest)
            </Button>
          </div>
        </div>

        {/* Strategy Groups & Direct Outbounds */}
        <div className="space-y-3">
          {groupAndSystemIndices.map((idx) => {
            const item = outbounds[idx];
            const isSelector = item.type === "selector";
            const isUrltest = item.type === "urltest";

            return (
              <div
                key={`${item.tag || idx}-${idx}`}
                className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={item.type === "direct" ? "success" : "info"}
                      size="sm"
                    >
                      {item.type.toUpperCase()}
                    </Badge>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {item.tag || `outbound-${idx}`}
                    </span>
                  </div>
                  {item.tag !== "direct" && (
                    <button
                      type="button"
                      onClick={() => removeOutboundAt(idx)}
                      className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      title="删除此出站"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    label="出站标签 (tag)"
                    value={item.tag || ""}
                    onChange={(e) =>
                      updateOutboundAt(idx, { ...item, tag: e.target.value })
                    }
                    placeholder="如: proxy, AUTO-Test, direct"
                  />

                  <Select
                    label="出站类型 (type)"
                    value={item.type}
                    onChange={(val) =>
                      updateOutboundAt(idx, { ...item, type: val })
                    }
                    options={[
                      { value: "selector", label: "手动选择策略组 (selector)" },
                      { value: "urltest", label: "自动测速策略组 (urltest)" },
                      { value: "direct", label: "直连出站 (direct)" },
                    ]}
                  />

                  {isSelector && (
                    <Select
                      label="默认选中出站 (default)"
                      value={item.default || ""}
                      onChange={(val) =>
                        updateOutboundAt(idx, {
                          ...item,
                          default: val || undefined,
                        })
                      }
                      options={[
                        { value: "", label: "默认列表首项" },
                        ...(item.outbounds || []).map((t) => ({
                          value: t,
                          label: t,
                        })),
                      ]}
                    />
                  )}

                  {isUrltest && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="测速周期 (interval)"
                        value={item.interval || ""}
                        onChange={(e) =>
                          updateOutboundAt(idx, {
                            ...item,
                            interval: e.target.value || undefined,
                          })
                        }
                        placeholder="3m"
                      />
                      <Input
                        label="容差 ms (tolerance)"
                        type="number"
                        value={
                          item.tolerance !== undefined
                            ? String(item.tolerance)
                            : ""
                        }
                        onChange={(e) =>
                          updateOutboundAt(idx, {
                            ...item,
                            tolerance: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="50"
                      />
                    </div>
                  )}
                </div>

                {(isSelector || isUrltest) && (
                  <TagListInput
                    label="包含的子出站标签列表 (outbounds)"
                    values={item.outbounds || []}
                    onChange={(v) =>
                      updateOutboundAt(idx, { ...item, outbounds: v })
                    }
                    placeholder="输入或点选下方出站标签..."
                    suggestions={allTags
                      .filter((t) => t !== item.tag)
                      .slice(0, 20)
                      .map((t) => ({ value: t, label: t }))}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Synced Proxy Nodes Summary */}
        {nodeIndices.length > 0 && (
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                已挂载代理节点 ({nodeIndices.length} 个节点)
              </span>
              <span className="text-[11px] text-slate-500">
                由节点池与节点组合维护
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
              {nodeIndices.map((idx) => {
                const n = outbounds[idx];
                return (
                  <span
                    key={`${n.tag}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 border border-slate-800 text-slate-300"
                  >
                    <span className="text-sky-400 uppercase text-[10px]">
                      {n.type}
                    </span>
                    <span>{n.tag}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface AdvancedSectionsEditorProps {
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  outboundTags: string[];
}

export const AdvancedSectionsEditor: React.FC<AdvancedSectionsEditorProps> = ({
  config,
  onChange,
  outboundTags,
}) => {
  const log = config.log || {};
  const httpClients: HttpClientItem[] = Array.isArray(config.http_clients)
    ? config.http_clients
    : [];
  const exp = config.experimental || {};
  const cacheFile = exp.cache_file || {};
  const clashApi = exp.clash_api || {};
  const ntp = config.ntp || {};

  const updateLog = (patch: Partial<NonNullable<SingBoxVisualConfig["log"]>>) => {
    onChange({
      ...config,
      log: { ...log, ...patch },
    });
  };

  const updateExp = (
    patch: Partial<NonNullable<SingBoxVisualConfig["experimental"]>>,
  ) => {
    onChange({
      ...config,
      experimental: { ...exp, ...patch },
    });
  };

  const updateNtp = (patch: Partial<NonNullable<SingBoxVisualConfig["ntp"]>>) => {
    onChange({
      ...config,
      ntp: { ...ntp, ...patch },
    });
  };

  const addHttpClient = () => {
    const next: HttpClientItem[] = [
      ...httpClients,
      {
        tag: httpClients.length === 0 ? "direct" : `client-${httpClients.length + 1}`,
      },
    ];
    onChange({ ...config, http_clients: next });
  };

  const updateHttpClientAt = (idx: number, item: HttpClientItem) => {
    const next = [...httpClients];
    next[idx] = item;
    onChange({ ...config, http_clients: next });
  };

  const removeHttpClientAt = (idx: number) => {
    onChange({
      ...config,
      http_clients: httpClients.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="space-y-5">
      {/* Log Section */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          <span>日志与 Schema 基础设置 (log & $schema)</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="日志级别 (log.level)"
            value={log.level || "info"}
            onChange={(val) =>
              updateLog({
                level: val as NonNullable<SingBoxVisualConfig["log"]>["level"],
              })
            }
            options={[
              { value: "trace", label: "Trace (最详尽追踪)" },
              { value: "debug", label: "Debug (调试信息)" },
              { value: "info", label: "Info (常规运行信息 - 推荐)" },
              { value: "warn", label: "Warn (警告信息)" },
              { value: "error", label: "Error (仅错误)" },
              { value: "fatal", label: "Fatal (致命错误)" },
              { value: "panic", label: "Panic" },
            ]}
          />

          <Input
            label="日志文件输出路径 (log.output)"
            value={log.output || ""}
            onChange={(e) =>
              updateLog({ output: e.target.value || undefined })
            }
            placeholder="留空输出到控制台 / 托管日志"
          />

          <Input
            label="JSON Schema 引用 ($schema)"
            value={
              config.$schema || "https://sing-box.sagernet.org/schema.json"
            }
            onChange={(e) =>
              onChange({
                ...config,
                $schema:
                  e.target.value || "https://sing-box.sagernet.org/schema.json",
              })
            }
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-300">
              输出时间戳 (log.timestamp)
            </span>
            <Switch
              checked={log.timestamp ?? true}
              onChange={(val) => updateLog({ timestamp: val })}
            />
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-300">
              禁用日志输出 (log.disabled)
            </span>
            <Switch
              checked={Boolean(log.disabled)}
              onChange={(val) => updateLog({ disabled: val || undefined })}
            />
          </div>
        </div>
      </div>

      {/* Experimental: Cache File & Clash API */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          <span>实验性特性与面板接口 (experimental)</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                启用持久化缓存 (cache_file.enabled)
              </span>
              <span className="text-[10px] text-slate-500">
                缓存远程规则集 (.srs) 与状态
              </span>
            </div>
            <Switch
              checked={Boolean(cacheFile.enabled)}
              onChange={(val) =>
                updateExp({
                  cache_file: { ...cacheFile, enabled: val },
                })
              }
            />
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <span className="text-xs text-slate-300">
              持久化 FakeIP (store_fakeip)
            </span>
            <Switch
              checked={Boolean(cacheFile.store_fakeip)}
              onChange={(val) =>
                updateExp({
                  cache_file: {
                    ...cacheFile,
                    store_fakeip: val || undefined,
                  },
                })
              }
            />
          </div>

          <Input
            label="缓存文件路径 (cache_file.path)"
            value={cacheFile.path || ""}
            onChange={(e) =>
              updateExp({
                cache_file: {
                  ...cacheFile,
                  path: e.target.value || undefined,
                },
              })
            }
            placeholder="默认 cache.db"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/70">
          <Input
            label="Clash API 控制器地址 (external_controller)"
            value={clashApi.external_controller || ""}
            onChange={(e) =>
              updateExp({
                clash_api: {
                  ...clashApi,
                  external_controller: e.target.value || undefined,
                },
              })
            }
            placeholder="例如: 127.0.0.1:9090 (留空不开启)"
          />
          <Input
            label="Clash API 密钥 (secret)"
            value={clashApi.secret || ""}
            onChange={(e) =>
              updateExp({
                clash_api: {
                  ...clashApi,
                  secret: e.target.value || undefined,
                },
              })
            }
            placeholder="留空无密码"
          />
          <Input
            label="默认模式 (default_mode)"
            value={clashApi.default_mode || ""}
            onChange={(e) =>
              updateExp({
                clash_api: {
                  ...clashApi,
                  default_mode: e.target.value || undefined,
                },
              })
            }
            placeholder="如: Rule"
          />
        </div>
      </div>

      {/* HTTP Clients Section */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-200">
              HTTP 客户端池 (http_clients) — 共 {httpClients.length} 个
            </h4>
            <p className="text-[11px] text-slate-400">
              供远程规则集 (rule_set) 下载等模块复用的命名 HTTP 客户端。
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={addHttpClient}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 HTTP 客户端
          </Button>
        </div>

        {httpClients.map((hc, idx) => (
          <div
            key={`${hc.tag || idx}-${idx}`}
            className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
          >
            <div className="sm:col-span-4">
              <Input
                label="客户端标签 (tag)"
                value={hc.tag || ""}
                onChange={(e) =>
                  updateHttpClientAt(idx, { ...hc, tag: e.target.value })
                }
                placeholder="如: direct, proxy"
              />
            </div>
            <div className="sm:col-span-4">
              <Select
                label="出站绕行 (detour)"
                value={hc.detour || ""}
                onChange={(val) =>
                  updateHttpClientAt(idx, {
                    ...hc,
                    detour: val || undefined,
                  })
                }
                options={[
                  { value: "", label: "直连 (无 detour)" },
                  ...outboundTags
                    .filter((t) => t !== "direct")
                    .map((t) => ({ value: t, label: t })),
                ]}
              />
            </div>
            <div className="sm:col-span-3">
              <Input
                label="连接超时 (connect_timeout)"
                value={hc.connect_timeout || ""}
                onChange={(e) =>
                  updateHttpClientAt(idx, {
                    ...hc,
                    connect_timeout: e.target.value || undefined,
                  })
                }
                placeholder="例如: 10s"
              />
            </div>
            <div className="sm:col-span-1 flex justify-end pb-1">
              <button
                type="button"
                onClick={() => removeHttpClientAt(idx)}
                className="p-2 rounded-lg text-rose-400 hover:text-rose-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* NTP Section */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200">
            NTP 时间同步服务 (ntp)
          </h4>
          <Switch
            checked={Boolean(ntp.enabled)}
            onChange={(val) => updateNtp({ enabled: val || undefined })}
          />
        </div>
        {ntp.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="NTP 服务器地址 (server)"
              value={ntp.server || ""}
              onChange={(e) =>
                updateNtp({ server: e.target.value || undefined })
              }
              placeholder="time.apple.com"
            />
            <Input
              label="同步间隔 (interval)"
              value={ntp.interval || ""}
              onChange={(e) =>
                updateNtp({ interval: e.target.value || undefined })
              }
              placeholder="30m"
            />
            <Select
              label="出站绕行 (detour)"
              value={ntp.detour || ""}
              onChange={(val) => updateNtp({ detour: val || undefined })}
              options={[
                { value: "", label: "直连 (无 detour)" },
                ...outboundTags
                  .filter((t) => t !== "direct")
                  .map((t) => ({ value: t, label: t })),
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
};
