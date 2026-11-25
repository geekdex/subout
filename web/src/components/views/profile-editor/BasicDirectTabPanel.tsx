import React from "react";

import { Plus, Trash2, Sliders, Sparkles } from "lucide-react";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";

import { SingBoxVisualConfig } from "./types";

/* ============================================================================
 * 5. Direct Form Rendering for Log, Experimental, NTP, Certificate
 * ("log这类配置，理论上不需要那么复杂，那么就把相关组件直接渲染出来选择就完事了")
 * ========================================================================== */
interface BasicDirectTabPanelProps {
  config: SingBoxVisualConfig;
  onChange: (next: SingBoxVisualConfig) => void;
  outboundTags: string[];
  /** Quick view shows curated shortcuts only; experts see all raw fields. */
  quick?: boolean;
}

export const BasicDirectTabPanel: React.FC<BasicDirectTabPanelProps> = ({
  quick = false,
  config,
  onChange,
  outboundTags,
}) => {
  const log = config.log || {};
  const exp = config.experimental || {};
  const cacheFile = exp.cache_file || {};
  const clashApi = exp.clash_api || {};
  const ntp = config.ntp || {};
  const cert = config.certificate || {};

  const updateLog = (
    patch: Partial<NonNullable<SingBoxVisualConfig["log"]>>,
  ) => {
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

  const updateNtp = (
    patch: Partial<NonNullable<SingBoxVisualConfig["ntp"]>>,
  ) => {
    onChange({
      ...config,
      ntp: { ...ntp, ...patch },
    });
  };

  const updateCert = (
    patch: Partial<NonNullable<SingBoxVisualConfig["certificate"]>>,
  ) => {
    onChange({
      ...config,
      certificate: { ...cert, ...patch },
    });
  };

  return (
    <div className="space-y-4">
      {/* Direct Rendering: Log Section */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span>日志配置 (log) — 直接选择即可生效</span>
          </h4>
          {Object.keys(log).length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...config, log: {} })}
              className="text-[11px] text-slate-400 hover:text-rose-300"
            >
              重置为空对象 &#123;&#125;
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                禁用日志 (disabled)
              </span>
              <span className="text-[10px] text-slate-500">
                关闭所有日志输出
              </span>
            </div>
            <Switch
              checked={Boolean(log.disabled)}
              onChange={(val) => updateLog({ disabled: val || undefined })}
            />
          </div>

          <Select
            label="日志级别 (log.level)"
            value={log.level || ""}
            onChange={(val) =>
              updateLog({
                level: (val || undefined) as NonNullable<
                  SingBoxVisualConfig["log"]
                >["level"],
              })
            }
            options={[
              { value: "", label: "未设置 (默认)" },
              { value: "trace", label: "trace (追踪)" },
              { value: "debug", label: "debug (调试)" },
              { value: "info", label: "info (常规信息 - 推荐)" },
              { value: "warn", label: "warn (警告)" },
              { value: "error", label: "error (错误)" },
              { value: "fatal", label: "fatal (致命)" },
              { value: "panic", label: "panic (崩溃)" },
            ]}
          />

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-slate-300 block">
                输出时间戳 (timestamp)
              </span>
              <span className="text-[10px] text-slate-500">
                每行日志附带时间
              </span>
            </div>
            <Switch
              checked={Boolean(log.timestamp)}
              onChange={(val) => updateLog({ timestamp: val || undefined })}
            />
          </div>

          <Input
            label="日志文件路径 (log.output)"
            value={log.output || ""}
            onChange={(e) => updateLog({ output: e.target.value || undefined })}
            placeholder="留空输出到控制台"
          />
        </div>
      </div>

      {!quick && (
        <>
          {/* Direct Rendering: Experimental Cache & Clash API */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>实验性缓存与 Clash 面板接口 (experimental)</span>
              </h4>
              {Object.keys(exp).length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ ...config, experimental: {} })}
                  className="text-[11px] text-slate-400 hover:text-rose-300"
                >
                  重置为空对象 &#123;&#125;
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-300 block">
                    启用缓存文件 (cache_file.enabled)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    本地持久化远程规则集 (.srs)
                  </span>
                </div>
                <Switch
                  checked={Boolean(cacheFile.enabled)}
                  onChange={(val) =>
                    updateExp({
                      cache_file: { ...cacheFile, enabled: val || undefined },
                    })
                  }
                />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-300 block">
                    持久化 FakeIP (store_fakeip)
                  </span>
                  <span className="text-[10px] text-slate-500">
                    重启后保持 FakeIP 映射表
                  </span>
                </div>
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
                label="Clash API 监听地址 (external_controller)"
                value={clashApi.external_controller || ""}
                onChange={(e) =>
                  updateExp({
                    clash_api: {
                      ...clashApi,
                      external_controller: e.target.value || undefined,
                    },
                  })
                }
                placeholder="如: 127.0.0.1:9090"
              />
              <Input
                label="Clash API 访问密钥 (secret)"
                value={clashApi.secret || ""}
                onChange={(e) =>
                  updateExp({
                    clash_api: {
                      ...clashApi,
                      secret: e.target.value || undefined,
                    },
                  })
                }
                placeholder="留空无密钥"
              />
              <Input
                label="默认路由模式 (default_mode)"
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

          {/* Direct Rendering: NTP & Certificate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200">
                  NTP 时间同步 (ntp)
                </h4>
                <Switch
                  checked={Boolean(ntp.enabled)}
                  onChange={(val) => updateNtp({ enabled: val || undefined })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Input
                  label="NTP 服务器 (ntp.server)"
                  value={ntp.server || ""}
                  onChange={(e) =>
                    updateNtp({ server: e.target.value || undefined })
                  }
                  placeholder="如: time.apple.com"
                />
                <Input
                  label="同步间隔 (ntp.interval)"
                  value={ntp.interval || ""}
                  onChange={(e) =>
                    updateNtp({ interval: e.target.value || undefined })
                  }
                  placeholder="如: 30m"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200">
                  证书信任库与 Schema (certificate & $schema)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Select
                  label="系统根证书库 (certificate.store)"
                  value={cert.store || ""}
                  onChange={(val) =>
                    updateCert({
                      store: (val || undefined) as NonNullable<
                        SingBoxVisualConfig["certificate"]
                      >["store"],
                    })
                  }
                  options={[
                    { value: "", label: "未设置 (默认)" },
                    { value: "system", label: "系统根证书 (system)" },
                    { value: "mozilla", label: "Mozilla 内置根证书 (mozilla)" },
                    { value: "chrome", label: "Chrome 根证书 (chrome)" },
                    { value: "none", label: "不加载默认证书 (none)" },
                  ]}
                />
                <Input
                  label="JSON Schema 引用 ($schema)"
                  value={
                    config.$schema ||
                    "https://sing-box.sagernet.org/schema.json"
                  }
                  onChange={(e) =>
                    onChange({
                      ...config,
                      $schema:
                        e.target.value ||
                        "https://sing-box.sagernet.org/schema.json",
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* HTTP Clients Direct List */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200">
                  HTTP 客户端池 (http_clients) — 共{" "}
                  {(config.http_clients || []).length} 个
                </h4>
                <p className="text-[11px] text-slate-400">
                  供远程规则集下载等模块复用的 HTTP 客户端定义
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...config,
                      http_clients: [
                        { tag: "direct" },
                        {
                          tag: "proxy",
                          detour:
                            outboundTags.find((t) => t !== "direct") || "proxy",
                        },
                      ],
                    })
                  }
                >
                  + 一键生成 direct + proxy 客户端
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...config,
                      http_clients: [
                        ...(config.http_clients || []),
                        {
                          tag: `client-${(config.http_clients || []).length + 1}`,
                        },
                      ],
                    })
                  }
                  icon={<Plus className="w-3.5 h-3.5" />}
                >
                  新增客户端
                </Button>
              </div>
            </div>

            {(config.http_clients || []).length > 0 && (
              <div className="space-y-2">
                {(config.http_clients || []).map((hc, idx) => (
                  <div
                    key={`http-client-${idx}`}
                    className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                  >
                    <div className="sm:col-span-4">
                      <Input
                        label="标签 (tag)"
                        value={hc.tag || ""}
                        onChange={(e) => {
                          const next = [...(config.http_clients || [])];
                          next[idx] = { ...hc, tag: e.target.value };
                          onChange({ ...config, http_clients: next });
                        }}
                        placeholder="如: direct, proxy"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Select
                        label="出站绕行 (detour)"
                        value={hc.detour || ""}
                        onChange={(val) => {
                          const next = [...(config.http_clients || [])];
                          next[idx] = { ...hc, detour: val || undefined };
                          onChange({ ...config, http_clients: next });
                        }}
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
                        onChange={(e) => {
                          const next = [...(config.http_clients || [])];
                          next[idx] = {
                            ...hc,
                            connect_timeout: e.target.value || undefined,
                          };
                          onChange({ ...config, http_clients: next });
                        }}
                        placeholder="如: 5s"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end pb-1">
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...config,
                            http_clients: (config.http_clients || []).filter(
                              (_, i) => i !== idx,
                            ),
                          })
                        }
                        className="p-1.5 rounded text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
