export type PlatformType = "linux" | "macos" | "windows" | "android";

export interface ConfigProfile {
  id: number;
  name: string;
  platform: PlatformType;
  token: string;
  version_code: string;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceStatus {
  running: boolean;
  ready: boolean;
  pid: number | null;
  uptime_secs: number;
  mixed_port: number | null;
  is_tun: boolean;
  tun_interface: string | null;
  cpu_usage: number;
  memory_bytes: number;
  last_error: string | null;
  active_mode: "simple" | "logical";
  running_config_id: number | null;
  system_proxy_enabled?: boolean;
}

export interface KernelInfo {
  binary_path: string;
  installed: boolean;
  version: string | null;
  supported_versions: string[];
  pinned_version: string;
  ready: boolean;
  gatekeeper_blocked: boolean;
  message: string | null;
}

export interface TakeoverDiagnoseResult {
  has_conflict: boolean;
  conflict_type: string;
  service_name?: string;
  details: string;
  suggestion: string;
  can_auto_takeover: boolean;
}

export interface NodeItem {
  id: number;
  subscription_id: number | null;
  tag: string;
  node_type: string;
  server: string;
  port: number;
  raw_json: string;
  enabled: boolean;
  is_active: boolean;
  latency_ms?: number | null;
  created_at: string;
  updated_at: string;
}

export interface NodeGroup {
  id: number;
  tag: string;
  group_type: string;
  filter_rules: string;
  static_nodes: string;
  default_selected: string | null;
  created_at: string;
  updated_at?: string;
}

export interface NodeGroupsListResponse {
  groups: NodeGroup[];
  version_code: string;
}

export interface Subscription {
  id: number;
  name: string;
  url: string;
  user_agent: string;
  enabled: boolean;
  auto_update: boolean;
  update_interval_mins: number;
  last_updated_at: string | null;
  node_count: number;
  upload_bytes: number | null;
  download_bytes: number | null;
  total_bytes: number | null;
  expire_timestamp: number | null;
}

export interface SimpleDnsConfig {
  mode: string;
  domestic_dns: string;
  foreign_dns: string;
}

export interface SimpleInboundConfig {
  inbound_type: string;
  mixed_port: number;
  allow_lan: boolean;
  tun_stack: string;
  tun_auto_route: boolean;
}

export interface SimpleRouteConfig {
  mode: "smart" | "global" | "gfw" | "direct_all";
  block_ads: boolean;
  bypass_lan: boolean;
  default_outbound: string;
}

export interface SimpleLogConfig {
  level: string;
  timestamp: boolean;
  disabled: boolean;
  output: string;
}

export interface SimpleConfig {
  log: SimpleLogConfig;
  dns: SimpleDnsConfig;
  inbound: SimpleInboundConfig;
  route: SimpleRouteConfig;
}

export interface AutoUpdateSettings {
  cron_expression: string;
  sync_running_config: boolean;
  reload_service: boolean;
}

export interface AutoUpdateSnapshot {
  id: number;
  config_id: number | null;
  description: string;
  created_at: string;
  config_json?: string;
}

export interface SystemInfo {
  host_os: "linux" | "macos" | "windows" | "unknown";
  host_arch: string;
  default_tun_stack: string;
  sudo_configured: boolean;
  portable_mode: boolean;
  app_mode: "simple" | "logical";
  running_config_id: number | null;
}
