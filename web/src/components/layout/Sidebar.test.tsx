import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

describe('Sidebar & Header with numeric version_code', () => {
  it('Sidebar renders without crashing when versionCode is a number or numeric string', () => {
    render(
      <Sidebar
        currentTab="dashboard"
        onSelectTab={vi.fn()}
        isKernelReady={true}
        appMode="expert"
        versionCode={20261103212000 as unknown as string}
        nodeCount={5}
      />
    );

    // Should display slice of versionCode
    expect(screen.getByText('节点组合')).toBeDefined();
    expect(screen.getByText('v2000')).toBeDefined();
  });

  it('Header renders without crashing when runningProfile.version_code is a number', () => {
    render(
      <Header
        systemInfo={{
          host_os: 'macos',
          host_arch: 'arm64',
          default_tun_stack: 'system',
          sudo_configured: true,
          portable_mode: false,
          app_mode: 'expert',
          running_config_id: 1,
        }}
        serviceStatus={{
          running: true,
          ready: true,
          pid: 1234,
          uptime_secs: 100,
          mixed_port: 7890,
          is_tun: true,
          tun_interface: 'utun3',
          cpu_usage: 1.2,
          memory_bytes: 10485760,
          last_error: null,
          active_mode: 'expert',
          running_config_id: 1,
        }}
        runningProfile={{
          id: 1,
          name: '默认配置',
          platform: 'macos',
          token: '550e8400-e29b-41d4-a716-446655440000',
          version_code: 20261103212000 as unknown as string,
          content: '{}',
        }}
        actionLoading={false}
        onStartService={vi.fn()}
        onStopService={vi.fn()}
        onRestartService={vi.fn()}
        onToggleSystemProxy={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogout={vi.fn()}
      />
    );

    expect(screen.getByText('默认配置')).toBeDefined();
    expect(screen.getByText('(212000)')).toBeDefined();
  });
});
