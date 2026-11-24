import React from "react";

import {
  Plus,
  Trash2,
  Sparkles,
  Network,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../../ui/Button";
import { Badge } from "../../ui/Badge";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { PlatformType } from "../../../types/api";

import {
  SingBoxVisualConfig,
  InboundItem,
} from "./types";
import { TagListInput } from "./TagListInput";
import { CollapsibleToolbar } from "./CollapsibleToolbar";

import { moveArrayItem } from "./shared";

/**
 * Private/LAN IPv4 ranges that normally host the system resolver.
 * Excluding one of these from TUN also bypasses sing-box's DNS hijack: the
 * query leaves via the physical interface, the domain never reaches the route
 * rules, and traffic falls through to direct (TLS handshake reset).
 */
const LAN_DNS_V4_RANGES = [
  { base: 0x7f000000, bits: 8 }, // 127.0.0.0/8 (e.g. 127.0.0.53)
  { base: 0x0a000000, bits: 8 }, // 10.0.0.0/8
  { base: 0xac100000, bits: 12 }, // 172.16.0.0/12
  { base: 0xc0a80000, bits: 16 }, // 192.168.0.0/16
] as const;

function ipv4CidrOverlaps(
  entry: string,
  range: { base: number; bits: number },
): boolean {
  const [ip, prefixRaw] = entry.trim().split("/");
  const octets = ip.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)
  ) {
    return false;
  }
  const bits = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  // A single host (/32) is typically a VPN peer that deliberately bypasses
  // TUN; it cannot cover the LAN DNS subnet, so don't warn about it.
  if (bits === 32) return false;
  const addr =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
    0;
  const compareBits = Math.min(bits, range.bits);
  const mask =
    compareBits === 0 ? 0 : (0xffffffff << (32 - compareBits)) >>> 0;
  return ((addr & mask) >>> 0) === ((range.base & mask) >>> 0);
}

/** Entries in route_exclude_address that would bypass TUN DNS hijacking. */
function findLanDnsExclusionRisks(addresses: string[] | undefined): string[] {
  if (!addresses?.length) return [];
  return addresses.filter((entry) =>
    LAN_DNS_V4_RANGES.some((range) => ipv4CidrOverlaps(entry, range)),
  );
}

/* ============================================================================
 * 3. Inbounds Tab (Top Collapsible Toolbar + Bottom Reorderable List)
 * ========================================================================== */
interface InboundsTabPanelProps {
  platform: PlatformType;
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  /** Quick view shows curated shortcuts only; experts see all raw fields. */
  quick?: boolean;
}

export const InboundsTabPanel: React.FC<InboundsTabPanelProps> = ({
  quick = false,
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

  const appendInbound = (item: InboundItem) => {
    updateInbounds([...inbounds, item]);
  };

  const updateInboundAt = (idx: number, nextItem: InboundItem) => {
    const next = [...inbounds];
    next[idx] = nextItem;
    updateInbounds(next);
  };

  const removeInboundAt = (idx: number) => {
    updateInbounds(inbounds.filter((_, i) => i !== idx));
  };

  const moveInboundTo = (fromIdx: number, toIdx: number) => {
    updateInbounds(moveArrayItem(inbounds, fromIdx, toIdx));
  };

  return (
    <div className="space-y-4">
      {/* TOP PANE: Collapsible Inbounds Toolbar */}
      <CollapsibleToolbar
        defaultOpen={!!quick}
        title="入站监听快捷工具箱 (参考 sing-box /manual/proxy/client/)"
        subtitle="支持三种客户端代理接入方式：虚拟网卡 (Virtual Interface - TUN)、系统代理 (System Proxy - Mixed/HTTP/SOCKS)、防火墙透明转发 (TProxy/Redirect)"
      >
        <div className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-slate-800/80">
          <span className="text-[11px] font-semibold text-slate-300 mr-1">
            客户端入站方式:
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "tun",
                tag: `tun-in${inbounds.length ? `-${inbounds.length + 1}` : ""}`,
                address: ["172.19.0.1/30"],
                auto_route: true,
                strict_route: true,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 TUN 虚拟网卡
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "mixed",
                tag: `mixed-in${inbounds.length ? `-${inbounds.length + 1}` : ""}`,
                listen: "127.0.0.1",
                listen_port: 2080,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 Mixed 混合端口
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "socks",
                tag: "socks-in",
                listen: "127.0.0.1",
                listen_port: 1080,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 SOCKS5 入站
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appendInbound({
                type: "http",
                tag: "http-in",
                listen: "127.0.0.1",
                listen_port: 8080,
              })
            }
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            新增 HTTP 入站
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            官方客户端手册预设:
          </span>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "tun",
                tag: "tun-in",
                address: ["172.19.0.1/30"],
                auto_route: true,
                strict_route: true,
                ...(platform === "linux" ? { auto_redirect: true } : {}),
              })
            }
            className="px-2.5 py-1 rounded-md text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/30"
          >
            ★ 官方客户端：TUN 虚拟网卡 (IPv4 Only)
          </button>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "tun",
                tag: "tun-in",
                address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
                mtu: 9000,
                auto_route: true,
                strict_route: true,
                ...(platform === "linux" ? { auto_redirect: true } : {}),
              })
            }
            className="px-2.5 py-1 rounded-md text-[11px] bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-500/30"
          >
            + IPv4/IPv6 双栈高性能 TUN 网卡
          </button>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "mixed",
                tag: "mixed-in",
                listen: "127.0.0.1",
                listen_port: 2080,
                set_system_proxy: true,
              })
            }
            className="px-2.5 py-1 rounded-md text-[11px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30"
          >
            ★ 官方客户端：System Proxy (Mixed 127.0.0.1:2080)
          </button>
          <button
            type="button"
            onClick={() =>
              appendInbound({
                type: "mixed",
                tag: "mixed-lan",
                listen: "0.0.0.0",
                listen_port: 2080,
              })
            }
            className="px-2 py-1 rounded-md text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70"
          >
            + 局域网共享 Mixed 代理 (0.0.0.0:2080)
          </button>
        </div>
      </CollapsibleToolbar>

      {!quick && (
        <>
      {/* BOTTOM PANE: Inbounds Reorderable List */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs font-bold text-slate-200">
              入站配置列表 (inbounds)
            </span>
            <Badge variant="info" size="sm">
              {inbounds.length} 个
            </Badge>
          </div>
          {inbounds.length > 0 && (
            <button
              type="button"
              onClick={() => updateInbounds([])}
              className="px-2 py-1 rounded text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20"
            >
              清空入站列表
            </button>
          )}
        </div>

        {inbounds.length === 0 ? (
          <div className="p-8 rounded-lg bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
            当前入站列表为空 (<code className="text-sky-300">[]</code>
            )。请从上方快捷工具栏添加 TUN 或 Mixed 入站。
          </div>
        ) : (
          <div className="space-y-3">
            {inbounds.map((inb, idx) => {
              const isTun = inb.type === "tun";
              const dnsHijackRisk = isTun
                ? findLanDnsExclusionRisks(inb.route_exclude_address)
                : [];
              return (
                <div
                  key={`inbound-${idx}`}
                  className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-sky-300">
                        #{idx + 1}
                      </span>
                      <Badge variant="info" size="sm">
                        {(inb.type || "mixed").toUpperCase()}
                      </Badge>
                      <span className="text-xs font-mono text-slate-200">
                        {inb.tag || `inbound-${idx + 1}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveInboundTo(idx, idx - 1)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                        title="上移"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === inbounds.length - 1}
                        onClick={() => moveInboundTo(idx, idx + 1)}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-100 disabled:opacity-30"
                        title="下移"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeInboundAt(idx)}
                        className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                        title="删除入站"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                        {
                          value: "mixed",
                          label: "HTTP+SOCKS 混合代理 (mixed)",
                        },
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
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="网卡名称 (interface_name)"
                          value={inb.interface_name || ""}
                          onChange={(e) =>
                            updateInboundAt(idx, {
                              ...inb,
                              interface_name: e.target.value || undefined,
                            })
                          }
                          placeholder={
                            platform === "macos"
                              ? "留空或 utun9"
                              : "留空自动分配"
                          }
                        />
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
                          placeholder="默认 (如 9000)"
                        />
                      </div>
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

                        {(platform === "linux" ||
                          Boolean(inb.auto_redirect)) && (
                          <div
                            className={`p-2.5 rounded-lg border flex items-center justify-between ${
                              platform !== "linux" && Boolean(inb.auto_redirect)
                                ? "bg-rose-500/10 border-rose-500/40"
                                : "bg-slate-900/80 border-slate-800"
                            }`}
                          >
                            <div>
                              <span
                                className={`text-xs block ${
                                  platform !== "linux" &&
                                  Boolean(inb.auto_redirect)
                                    ? "text-rose-200 font-semibold"
                                    : "text-slate-300"
                                }`}
                              >
                                NFTables 自动重定向 (auto_redirect)
                              </span>
                              {platform !== "linux" &&
                                Boolean(inb.auto_redirect) && (
                                  <span className="text-[10px] text-rose-300">
                                    仅 Linux 支持，当前平台不支持，请关闭后保存
                                  </span>
                                )}
                            </div>
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

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300 block">
                          TUN 协议栈类型 (stack)
                        </label>
                        <select
                          value={(inb.stack as string) || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateInboundAt(idx, {
                              ...inb,
                              stack: val || undefined,
                            });
                          }}
                          className="w-full text-xs bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">未指定 (系统默认)</option>
                          <option value="system">
                            system (系统网络协议栈 - 性能好开销低)
                          </option>
                          <option value="gvisor">
                            gvisor (用户态沙盒协议栈 - 跨平台隔离)
                          </option>
                          <option value="mixed">
                            mixed (混合协议栈 - TCP系统/UDP gVisor)
                          </option>
                        </select>
                      </div>

                      {/* TUN 入站层排除：命中条件的流量不进入 TUN，由系统按原路由直连 */}
                      <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-slate-200">
                            排除路由 / 不劫持流量 (TUN 入站层)
                          </span>
                          <span className="text-[10px] text-slate-500">
                            命中条件的流量不进入 TUN，由系统按原路由直连
                          </span>
                        </div>

                        <TagListInput
                          label="排除目标 IP / IP 段 (route_exclude_address)"
                          values={inb.route_exclude_address || []}
                          onChange={(v) =>
                            updateInboundAt(idx, {
                              ...inb,
                              route_exclude_address: v.length ? v : undefined,
                            })
                          }
                          placeholder="如: 10.0.0.0/8, 192.168.1.100, fd00::/8"
                          hint={
                            inb.auto_route
                              ? undefined
                              : "需开启 auto_route 才生效"
                          }
                        />

                        {inb.auto_route && dnsHijackRisk.length > 0 && (
                          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-1">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold text-amber-200">
                                  排除网段可能让 DNS 劫持失效
                                </p>
                                <p className="text-[10px] text-amber-100/80 leading-relaxed">
                                  {dnsHijackRisk.join("、")} 属于私网/局域网段，通常包含系统 DNS
                                  服务器。命中这些网段的查询不会进入 TUN，sing-box 无法劫持，域名无法传给路由规则，相关流量可能落到直连。
                                </p>
                                <p className="text-[10px] text-amber-100/70 leading-relaxed">
                                  建议移除这些网段：LAN 直连由 route 规则中的
                                  <code className="font-mono text-amber-100">
                                    {" "}ip_is_private → direct{" "}
                                  </code>
                                  保证，无需在此排除。此处仅提示，不会自动修改配置。
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div
                          className={
                            platform !== "linux" &&
                            Boolean(inb.exclude_interface?.length)
                              ? "p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 space-y-1.5"
                              : "space-y-1.5"
                          }
                        >
                          <TagListInput
                            label="排除网卡名称 (exclude_interface)"
                            values={inb.exclude_interface || []}
                            onChange={(v) =>
                              updateInboundAt(idx, {
                                ...inb,
                                exclude_interface: v.length ? v : undefined,
                              })
                            }
                            placeholder="如: tailscale0, zt0, wg0"
                            hint="按来源网卡排除，适合 P2P 组网虚拟网卡"
                          />
                          {platform !== "linux" &&
                            Boolean(inb.exclude_interface?.length) && (
                              <div className="text-[10px] text-rose-300">
                                仅 Linux 支持网卡名称分流，当前平台不支持，请清空后再保存
                              </div>
                            )}
                        </div>

                        <TagListInput
                          label="排除 IP 规则集 (route_exclude_address_set)"
                          values={inb.route_exclude_address_set || []}
                          onChange={(v) =>
                            updateInboundAt(idx, {
                              ...inb,
                              route_exclude_address_set: v.length
                                ? v
                                : undefined,
                            })
                          }
                          placeholder="如: geoip-cn"
                          hint="需先在 route.rule_set 中定义同名规则集"
                        />

                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          P2P 组网建议同时填写 exclude_interface（按来源网卡）与
                          route_exclude_address（按对端网段）。若开启 strict_route，
                          回程流量不会自动排除，需把相关接口（如 br-lan、
                          pppoe-wan）一并加入 exclude_interface，或把对应网段加入
                          route_exclude_address。
                        </p>
                      </div>

                      {(isAndroid ||
                        Boolean(
                          inb.include_package?.length ||
                          inb.exclude_package?.length,
                        )) && (
                        <div
                          className={`grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 ${
                            !isAndroid
                              ? "p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40"
                              : ""
                          }`}
                        >
                          {!isAndroid && (
                            <div className="md:col-span-2 flex items-center justify-between text-xs text-rose-200">
                              <span>
                                当前非 Android 平台配置包含 Android
                                专属包名分流字段，请清空后再保存：
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateInboundAt(idx, {
                                    ...inb,
                                    include_package: undefined,
                                    exclude_package: undefined,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 border border-rose-500/30"
                              >
                                一键清空包名字段
                              </button>
                            </div>
                          )}
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

                  {(inb.type === "mixed" || inb.type === "http") && (
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium text-slate-300 block">
                          自动配置系统代理 (set_system_proxy)
                        </span>
                        <span className="text-[10px] text-slate-500">
                          客户端启动时自动将该入站端口注册为操作系统 HTTP 代理
                        </span>
                      </div>
                      <Switch
                        checked={Boolean(inb.set_system_proxy)}
                        onChange={(val) =>
                          updateInboundAt(idx, {
                            ...inb,
                            set_system_proxy: val || undefined,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};
