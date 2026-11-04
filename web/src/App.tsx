import React, { useState, useEffect, useCallback } from "react";
import { Sidebar, NavTab } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { GatekeeperModal } from "./components/layout/GatekeeperModal";
import { ToastProvider } from "./components/ui/Toast";
import { useToast } from "./hooks/useToast";
import { useKernelGuard } from "./hooks/useKernelGuard";
import { useServiceStatus } from "./hooks/useServiceStatus";
import { api, setUnauthorizedHandler } from "./api/client";
import { getErrorMessage } from "./utils/format";
import {
  SystemInfo,
  ConfigProfile,
  Subscription,
  NodeItem,
  NodeGroup,
} from "./types/api";

// Views
import { DashboardView } from "./components/views/DashboardView";
import { SimpleModeView } from "./components/views/SimpleModeView";
import { ProfilesView } from "./components/views/ProfilesView";
import { SubscriptionsView } from "./components/views/SubscriptionsView";
import { NodesView } from "./components/views/NodesView";
import { NodeGroupsView } from "./components/views/NodeGroupsView";
import { AutoUpdateView } from "./components/views/AutoUpdateView";
import { ServiceLogsView } from "./components/views/ServiceLogsView";
import { SettingsView } from "./components/views/SettingsView";
import { LoginView } from "./components/views/LoginView";

const AppContent: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentTab, setCurrentTab] = useState<NavTab>("dashboard");

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [configs, setConfigs] = useState<ConfigProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [versionCode, setVersionCode] = useState<string>("");

  const { success, error } = useToast();

  const {
    kernelInfo,
    loading: kernelLoading,
    downloading,
    takingOver,
    takeoverDiagnose,
    isReady: isKernelReady,
    downloadKernel,
    takeoverService,
    isSudoModalOpen,
    sudoError,
    sudoActionLoading,
    closeSudoModal,
    handleTakeoverWithSudo,
  } = useKernelGuard();

  const {
    status: serviceStatus,
    actionLoading,
    startService,
    stopService,
    restartService,
    toggleSystemProxy,
    refreshStatus,
  } = useServiceStatus();

  const checkAuthStatus = useCallback(async () => {
    const authed = await api.checkAuth();
    setIsAuthenticated(authed);
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const [sys, cfgs, subs, nds, grps] = await Promise.allSettled([
        api.getSystemInfo(),
        api.listConfigs(),
        api.listSubscriptions(),
        api.listNodes(),
        api.listNodeGroups(),
      ]);

      if (sys.status === "fulfilled") setSystemInfo(sys.value);
      if (cfgs.status === "fulfilled") setConfigs(cfgs.value);
      if (subs.status === "fulfilled") setSubscriptions(subs.value);
      if (nds.status === "fulfilled") setNodes(nds.value);
      if (grps.status === "fulfilled") {
        setNodeGroups(grps.value.groups);
        setVersionCode(String(grps.value.version_code ?? ""));
      }
    } catch (err: unknown) {
      console.warn("Failed to load application data:", getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
    setUnauthorizedHandler(() => {
      setIsAuthenticated(false);
    });
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [isAuthenticated, loadAllData]);

  // If kernel is not ready and user is on a locked tab, fall back to dashboard
  useEffect(() => {
    const lockedTabs: NavTab[] = [
      "simple",
      "profiles",
      "subscriptions",
      "nodes",
      "groups",
      "auto-update",
    ];
    if (!kernelLoading && !isKernelReady && lockedTabs.includes(currentTab)) {
      setCurrentTab("dashboard");
    }
  }, [kernelLoading, isKernelReady, currentTab]);

  const handleSwitchMode = async (mode: "simple" | "logical") => {
    try {
      await api.setAppMode(mode, false);
      success(
        "已切换工作模式",
        `已切换至 ${mode === "simple" ? "小白模式" : "专业模式"}`,
      );
      await loadAllData();
      await refreshStatus();
    } catch (err: unknown) {
      error("切换模式失败", getErrorMessage(err));
    }
  };

  const runningProfile =
    configs.find((c) => c.id === systemInfo?.running_config_id) || null;

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">
        加载中...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isKernelReady={isKernelReady}
        appMode={systemInfo?.app_mode ?? "simple"}
        versionCode={versionCode}
        nodeCount={nodes.length}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          systemInfo={systemInfo}
          serviceStatus={serviceStatus}
          runningProfile={runningProfile}
          actionLoading={actionLoading}
          onStartService={startService}
          onStopService={stopService}
          onRestartService={restartService}
          onToggleSystemProxy={toggleSystemProxy}
          onSwitchMode={handleSwitchMode}
          onLogout={() => {
            api.logout();
            setIsAuthenticated(false);
          }}
        />

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {/* Gatekeeper Warning Card when kernel is invalid or has conflicts */}
          <GatekeeperModal
            kernelInfo={kernelInfo}
            takeoverDiagnose={takeoverDiagnose}
            loading={kernelLoading}
            downloading={downloading}
            takingOver={takingOver}
            onDownloadKernel={downloadKernel}
            onTakeover={takeoverService}
            isSudoModalOpen={isSudoModalOpen}
            sudoError={sudoError}
            sudoActionLoading={sudoActionLoading}
            onCloseSudoModal={closeSudoModal}
            onSubmitSudo={handleTakeoverWithSudo}
          />

          {/* Active View Routing */}
          {currentTab === "dashboard" && (
            <DashboardView
              systemInfo={systemInfo}
              serviceStatus={serviceStatus}
              configs={configs}
              runningProfile={runningProfile}
              onRefreshConfigs={loadAllData}
              onNavigateTab={setCurrentTab}
            />
          )}

          {currentTab === "simple" && <SimpleModeView nodes={nodes} />}

          {currentTab === "profiles" && (
            <ProfilesView
              configs={configs}
              runningProfile={runningProfile}
              systemInfo={systemInfo}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === "subscriptions" && (
            <SubscriptionsView
              subscriptions={subscriptions}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === "nodes" && (
            <NodesView nodes={nodes} onRefresh={loadAllData} />
          )}

          {currentTab === "groups" && (
            <NodeGroupsView
              groups={nodeGroups}
              versionCode={versionCode}
              nodes={nodes}
              onRefresh={loadAllData}
            />
          )}

          {currentTab === "auto-update" && <AutoUpdateView />}

          {currentTab === "logs" && <ServiceLogsView />}

          {currentTab === "settings" && (
            <SettingsView
              systemInfo={systemInfo}
              onRefreshSystemInfo={loadAllData}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};
