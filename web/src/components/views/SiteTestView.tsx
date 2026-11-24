import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Clapperboard,
  Globe,
  Globe2,
  MessageCircle,
  Play,
  Search,
  Send,
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { TabItem, Tabs } from "../ui/Tabs";
import { api } from "../../api/client";
import { SiteProbeResponse } from "../../types/api";
import { formatLatency, getErrorMessage } from "../../utils/format";

type Category = "search" | "social" | "media" | "dev";
type CategoryFilter = "all" | Category;

interface PresetSite {
  id: string;
  name: string;
  domain: string;
  url: string;
  category: Category;
  categoryName: string;
  icon: React.ReactNode;
  iconClass: string;
}

interface SiteState {
  testing: boolean;
  result: SiteProbeResponse | null;
}

const CATEGORIES: Array<{ id: CategoryFilter; name: string }> = [
  { id: "all", name: "全部网站" },
  { id: "search", name: "搜索与百科" },
  { id: "social", name: "社交与通讯" },
  { id: "media", name: "视频与流媒体" },
  { id: "dev", name: "开发与 AI" },
];

const PRESET_SITES: PresetSite[] = [
  {
    id: "google",
    name: "Google",
    domain: "www.google.com",
    url: "https://www.google.com",
    category: "search",
    categoryName: "搜索引擎",
    icon: <Search className="h-5 w-5 text-sky-400" />,
    iconClass: "bg-sky-500/10",
  },
  {
    id: "youtube",
    name: "YouTube",
    domain: "www.youtube.com",
    url: "https://www.youtube.com",
    category: "media",
    categoryName: "视频流媒体",
    icon: <Clapperboard className="h-5 w-5 text-rose-400" />,
    iconClass: "bg-rose-500/10",
  },
  {
    id: "twitter",
    name: "Twitter / X",
    domain: "twitter.com",
    url: "https://twitter.com",
    category: "social",
    categoryName: "社交媒体",
    icon: <MessageCircle className="h-5 w-5 text-cyan-400" />,
    iconClass: "bg-cyan-500/10",
  },
  {
    id: "github",
    name: "GitHub",
    domain: "github.com",
    url: "https://github.com",
    category: "dev",
    categoryName: "开发者服务",
    icon: <Globe className="h-5 w-5 text-slate-300" />,
    iconClass: "bg-slate-700/50",
  },
  {
    id: "chatgpt",
    name: "OpenAI / ChatGPT",
    domain: "chatgpt.com",
    url: "https://chatgpt.com",
    category: "dev",
    categoryName: "AI 服务",
    icon: <Bot className="h-5 w-5 text-emerald-400" />,
    iconClass: "bg-emerald-500/10",
  },
  {
    id: "telegram",
    name: "Telegram Web",
    domain: "web.telegram.org",
    url: "https://web.telegram.org",
    category: "social",
    categoryName: "即时通讯",
    icon: <Send className="h-5 w-5 text-sky-400" />,
    iconClass: "bg-sky-500/10",
  },
  {
    id: "wikipedia",
    name: "Wikipedia",
    domain: "www.wikipedia.org",
    url: "https://www.wikipedia.org",
    category: "search",
    categoryName: "百科知识",
    icon: <Globe2 className="h-5 w-5 text-indigo-400" />,
    iconClass: "bg-indigo-500/10",
  },
  {
    id: "netflix",
    name: "Netflix",
    domain: "www.netflix.com",
    url: "https://www.netflix.com",
    category: "media",
    categoryName: "视频流媒体",
    icon: <Clapperboard className="h-5 w-5 text-rose-400" />,
    iconClass: "bg-rose-500/10",
  },
  {
    id: "reddit",
    name: "Reddit",
    domain: "www.reddit.com",
    url: "https://www.reddit.com",
    category: "social",
    categoryName: "社区论坛",
    icon: <MessageCircle className="h-5 w-5 text-orange-400" />,
    iconClass: "bg-orange-500/10",
  },
  {
    id: "discord",
    name: "Discord",
    domain: "discord.com",
    url: "https://discord.com",
    category: "social",
    categoryName: "通讯社区",
    icon: <MessageCircle className="h-5 w-5 text-indigo-400" />,
    iconClass: "bg-indigo-500/10",
  },
];

const MAX_CONCURRENCY = 3;

/** DNS / route trace rows, shared by the custom-URL banner and site cards. */
const TraceRows: React.FC<{ result: SiteProbeResponse }> = ({ result }) => {
  if (!result.dns_rule && !result.route_rule) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t border-slate-700/60 pt-3 text-[11px]">
      {result.dns_rule && (
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge variant="info" size="sm">
            DNS
          </Badge>
          <span className="min-w-0 truncate text-slate-300" title={result.dns_rule}>
            {result.dns_rule}
          </span>
          {result.dns_server && (
            <>
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-600" />
              <span
                className="min-w-0 truncate text-sky-400"
                title={result.dns_server}
              >
                {result.dns_server}
              </span>
            </>
          )}
        </div>
      )}
      {result.route_rule && (
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge variant="success" size="sm">
            出口
          </Badge>
          <span className="min-w-0 truncate text-slate-300" title={result.route_rule}>
            {result.route_rule}
          </span>
          {result.outbound && (
            <>
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-600" />
              <span
                className="min-w-0 truncate text-emerald-400"
                title={result.outbound}
              >
                {result.outbound}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const SiteCard: React.FC<{
  site: PresetSite;
  state: SiteState | undefined;
  disabled: boolean;
  onTest: (site: PresetSite) => void;
}> = ({ site, state, disabled, onTest }) => {
  const testing = state?.testing ?? false;
  const result = state?.result ?? null;
  const latency = result?.latency_ms ?? null;
  const latencyInfo = formatLatency(latency);
  const borderColor = testing
    ? "border-l-sky-400"
    : result?.success
      ? "border-l-emerald-400"
      : result
        ? "border-l-rose-400"
        : "border-l-slate-700";
  const dotColor = testing
    ? "bg-sky-400 animate-pulse"
    : result?.success
      ? "bg-emerald-400"
      : result
        ? "bg-rose-400"
        : "bg-slate-600";
  const statusText = testing
    ? "测试中"
    : result
      ? result.success
        ? "可达"
        : "不可达"
      : "未测试";

  return (
    <div
      data-testid={`site-card-${site.id}`}
      className={`flex flex-col rounded-xl border border-slate-800 border-l-2 ${borderColor} bg-slate-900/60 p-4 transition-colors hover:bg-slate-900`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${site.iconClass}`}
        >
          {site.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-100">
            {site.name}
          </h3>
          <p className="truncate text-xs text-slate-500" title={site.domain}>
            {site.domain}
          </p>
        </div>
        <Badge variant="neutral" size="sm">
          {site.categoryName}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500">HTTP 状态</div>
          <div className="mt-0.5 text-sm font-semibold">
            {result?.status_code != null ? (
              <span
                className={
                  result.status_code < 400 ? "text-emerald-400" : "text-amber-400"
                }
              >
                {result.status_code}
              </span>
            ) : (
              <span className="text-slate-600">--</span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500">响应延迟</div>
          <div
            className={`mt-0.5 text-sm font-semibold ${result ? latencyInfo.color : "text-slate-600"}`}
          >
            {result ? latencyInfo.text : "--"}
          </div>
        </div>
      </div>

      {result && <TraceRows result={result} />}

      {result?.error && (
        <p className="mt-2 truncate text-[11px] text-rose-400" title={result.error}>
          {result.error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-slate-800/80 pt-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          {statusText}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || testing}
          onClick={() => onTest(site)}
          aria-label={`测试 ${site.name}`}
        >
          {testing ? "测试中" : "单项测试"}
        </Button>
      </div>
    </div>
  );
};

export const SiteTestView: React.FC = () => {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [siteStates, setSiteStates] = useState<Record<string, SiteState>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [testedCount, setTestedCount] = useState(0);
  const [customUrl, setCustomUrl] = useState("");
  const [customTesting, setCustomTesting] = useState(false);
  const [customResult, setCustomResult] = useState<SiteProbeResponse | null>(
    null,
  );

  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
    };
  }, []);

  const probe = async (url: string): Promise<SiteProbeResponse> => {
    try {
      return await api.probeSite(url, 4500);
    } catch (err: unknown) {
      return {
        url,
        latency_ms: null,
        status_code: null,
        success: false,
        error: getErrorMessage(err),
      };
    }
  };

  const testSingleSite = async (site: PresetSite) => {
    if (testingAll || siteStates[site.id]?.testing) return;
    const runId = runIdRef.current;
    setSiteStates((prev) => ({
      ...prev,
      [site.id]: { testing: true, result: null },
    }));
    const result = await probe(site.url);
    if (!mountedRef.current || runId !== runIdRef.current) return;
    setSiteStates((prev) => ({
      ...prev,
      [site.id]: { testing: false, result },
    }));
  };

  const testAll = async () => {
    if (testingAll) return;
    const runId = ++runIdRef.current;
    setTestingAll(true);
    setTestedCount(0);
    const initial: Record<string, SiteState> = {};
    for (const site of PRESET_SITES) {
      initial[site.id] = { testing: false, result: null };
    }
    setSiteStates(initial);

    // Fixed worker pool with an atomic index: never more than MAX_CONCURRENCY
    // requests in flight, and no shared mutable queue to race on.
    let nextIndex = 0;
    const worker = async () => {
      for (;;) {
        const index = nextIndex++;
        if (index >= PRESET_SITES.length) return;
        const site = PRESET_SITES[index];
        if (!mountedRef.current || runId !== runIdRef.current) return;
        setSiteStates((prev) => ({
          ...prev,
          [site.id]: { testing: true, result: null },
        }));
        const result = await probe(site.url);
        if (!mountedRef.current || runId !== runIdRef.current) return;
        setSiteStates((prev) => ({
          ...prev,
          [site.id]: { testing: false, result },
        }));
        setTestedCount((count) => count + 1);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENCY, PRESET_SITES.length) }, worker),
    );
    if (mountedRef.current && runId === runIdRef.current) {
      setTestingAll(false);
    }
  };

  const testCustomUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = customUrl.trim();
    if (!url || customTesting) return;
    const runId = runIdRef.current;
    setCustomTesting(true);
    setCustomResult(null);
    const result = await probe(url);
    if (!mountedRef.current || runId !== runIdRef.current) return;
    setCustomResult(result);
    setCustomTesting(false);
  };

  const stats = useMemo(() => {
    const results = Object.values(siteStates)
      .map((state) => state.result)
      .filter((result): result is SiteProbeResponse => result !== null);
    const success = results.filter((result) => result.success).length;
    const latencies = results
      .filter(
        (result) =>
          result.success &&
          typeof result.latency_ms === "number" &&
          result.latency_ms > 0,
      )
      .map((result) => result.latency_ms as number);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length)
      : 0;
    return {
      total: results.length,
      success,
      fail: results.length - success,
      avgLatency,
    };
  }, [siteStates]);

  const countFor = (id: CategoryFilter) =>
    id === "all"
      ? PRESET_SITES.length
      : PRESET_SITES.filter((site) => site.category === id).length;

  const tabs: TabItem[] = CATEGORIES.map((item) => ({
    id: item.id,
    label: (
      <>
        {item.name} <span className="text-slate-500">({countFor(item.id)})</span>
      </>
    ),
  }));

  const filteredSites =
    category === "all"
      ? PRESET_SITES
      : PRESET_SITES.filter((site) => site.category === category);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10">
              <Activity className="h-4 w-4 text-sky-400" />
            </span>
            <h1 className="text-xl font-semibold text-slate-100">网络检测</h1>
          </div>
          <p className="text-xs text-slate-400">
            检测当前主机网络对常见站点的连通性与响应延迟，并展示当前配置下的 DNS / 出口命中情况（支持直连、系统代理与 TUN）。
          </p>
        </div>
        <Button
          icon={<Play className="h-4 w-4" />}
          loading={testingAll}
          disabled={testingAll}
          onClick={testAll}
        >
          {testingAll ? (
            <span aria-live="polite">
              正在检测 ({testedCount}/{PRESET_SITES.length})
            </span>
          ) : (
            "一键检测全部网站"
          )}
        </Button>
      </div>

      {stats.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Activity className="h-4 w-4 text-sky-400" />
            系统网络连通性概览
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success" dot>
              可达 <strong className="ml-1">{stats.success}</strong>
            </Badge>
            {stats.fail > 0 && (
              <Badge variant="danger" dot>
                不可达 <strong className="ml-1">{stats.fail}</strong>
              </Badge>
            )}
            {stats.avgLatency > 0 && (
              <Badge variant="info">
                平均延迟 <strong className="ml-1">{stats.avgLatency} ms</strong>
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
          <Globe2 className="h-4 w-4 text-sky-400" />
          手动检测自定义网址
        </div>
        <form
          onSubmit={testCustomUrl}
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
        >
          <div className="min-w-0 flex-1">
            <Input
              type="url"
              value={customUrl}
              onChange={(event) => setCustomUrl(event.target.value)}
              placeholder="https://example.com"
              aria-label="自定义检测网址"
              disabled={customTesting}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            loading={customTesting}
            disabled={!customUrl.trim() || customTesting}
          >
            检测网址
          </Button>
        </form>

        {customResult && (
          <div
            aria-live="polite"
            className={`mt-3 rounded-lg border p-3 text-sm ${
              customResult.success
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-rose-500/40 bg-rose-500/10"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Badge
                  variant={customResult.success ? "success" : "danger"}
                >
                  {customResult.success ? "访问成功" : "访问失败"}
                </Badge>
                <span
                  className="truncate font-mono text-xs text-slate-200"
                  title={customResult.url}
                >
                  {customResult.url}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {customResult.status_code != null && (
                  <span className="text-slate-300">
                    HTTP {customResult.status_code}
                  </span>
                )}
                {customResult.latency_ms != null && (
                  <span className={formatLatency(customResult.latency_ms).color}>
                    {formatLatency(customResult.latency_ms).text}
                  </span>
                )}
                {customResult.error && (
                  <span className="text-rose-400">{customResult.error}</span>
                )}
              </div>
            </div>
            <TraceRows result={customResult} />
          </div>
        )}
      </div>

      <Tabs
        tabs={tabs}
        activeTab={category}
        onChange={(id) => setCategory(id as CategoryFilter)}
        variant="pills"
        className="w-full justify-start"
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredSites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            state={siteStates[site.id]}
            disabled={testingAll}
            onTest={testSingleSite}
          />
        ))}
      </div>
    </div>
  );
};
