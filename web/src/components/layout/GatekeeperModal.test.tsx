import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GatekeeperModal } from './GatekeeperModal';

describe('GatekeeperModal', () => {
  it('does not render anything when kernel is ready and no conflict', () => {
    const { container } = render(
      <GatekeeperModal
        kernelInfo={{
          binary_path: '/usr/bin/sing-box',
          installed: true,
          version: '1.14.4',
          supported_versions: ['1.14.*'],
          pinned_version: '1.14.4',
          ready: true,
          gatekeeper_blocked: false,
          message: null,
        }}
        takeoverDiagnose={{
          has_conflict: false,
          conflict_type: '',
          details: '',
          suggestion: '',
          can_auto_takeover: false,
        }}
        downloading={false}
        onDownloadKernel={vi.fn()}
        onTakeover={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render anything when loading is true or kernelInfo is null to prevent flashing', () => {
    const { container: c1 } = render(
      <GatekeeperModal
        kernelInfo={null}
        takeoverDiagnose={null}
        loading={true}
        downloading={false}
        onDownloadKernel={vi.fn()}
        onTakeover={vi.fn()}
      />
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <GatekeeperModal
        kernelInfo={null}
        takeoverDiagnose={null}
        loading={false}
        downloading={false}
        onDownloadKernel={vi.fn()}
        onTakeover={vi.fn()}
      />
    );
    expect(c2.firstChild).toBeNull();
  });

  it('renders gatekeeper warning and download button when kernel is not ready', () => {
    const handleDownload = vi.fn();
    render(
      <GatekeeperModal
        kernelInfo={{
          binary_path: '/usr/bin/sing-box',
          installed: true,
          version: '1.12.0',
          supported_versions: ['1.14.*'],
          pinned_version: '1.14.4',
          ready: false,
          gatekeeper_blocked: true,
          message: 'Unsupported version',
        }}
        takeoverDiagnose={null}
        downloading={false}
        onDownloadKernel={handleDownload}
        onTakeover={vi.fn()}
      />
    );

    expect(screen.getByText(/内核门禁警告/)).toBeDefined();
    expect(screen.getByText('1.12.0')).toBeDefined();

    const btn = screen.getByText('一键下载 1.14.4 内核');
    fireEvent.click(btn);
    expect(handleDownload).toHaveBeenCalledTimes(1);
  });

  it('renders process conflict banner and takeover button when kernel is ready but conflict exists', () => {
    const handleTakeover = vi.fn();
    render(
      <GatekeeperModal
        kernelInfo={{
          binary_path: '/Library/Application Support/Subout/bin/sing-box',
          installed: true,
          version: '1.14.4',
          supported_versions: ['1.14.*'],
          pinned_version: '1.14.4',
          ready: true,
          gatekeeper_blocked: false,
          message: null,
        }}
        takeoverDiagnose={{
          has_conflict: true,
          conflict_type: 'running_processes',
          conflict_name: '外部独立 sing-box 进程',
          details: '检测到 1 个正在运行的外部 sing-box 进程 (PID: 12345)。',
          suggestion: '建议点击一键接管。',
          suggestion_command: 'sudo kill -9 12345',
          pids: [12345],
          can_auto_takeover: true,
        }}
        downloading={false}
        onDownloadKernel={vi.fn()}
        onTakeover={handleTakeover}
      />
    );

    // Should NOT show download kernel button
    expect(screen.queryByText(/内核门禁警告/)).toBeNull();

    // Should show conflict header & details
    expect(screen.getByText(/检测到系统外部进程\/服务冲突/)).toBeDefined();
    expect(screen.getByText(/外部独立 sing-box 进程/)).toBeDefined();
    expect(screen.getAllByText(/PID: 12345/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sudo kill -9 12345/)).toBeDefined();

    // Click takeover button
    const takeoverBtn = screen.getByText('一键接管并终止冲突进程');
    fireEvent.click(takeoverBtn);
    expect(handleTakeover).toHaveBeenCalledTimes(1);
  });

  it('renders SudoModal when isSudoModalOpen is true', () => {
    const handleCloseSudo = vi.fn();
    const handleSubmitSudo = vi.fn();

    render(
      <GatekeeperModal
        kernelInfo={{
          binary_path: '/usr/bin/sing-box',
          installed: true,
          version: '1.14.4',
          supported_versions: ['1.14.*'],
          pinned_version: '1.14.4',
          ready: true,
          gatekeeper_blocked: false,
          message: null,
        }}
        takeoverDiagnose={{
          has_conflict: true,
          conflict_type: 'running_processes',
          conflict_name: '外部独立 sing-box 进程',
          details: '外部进程 (PID: 73023) 属于系统守护进程或 Root 用户',
          suggestion: '请授权接管',
          suggestion_command: 'sudo kill -9 73023',
          pids: [73023],
          can_auto_takeover: true,
        }}
        downloading={false}
        onDownloadKernel={vi.fn()}
        onTakeover={vi.fn()}
        isSudoModalOpen={true}
        sudoError="Sudo 密码不正确，请重新输入"
        onCloseSudoModal={handleCloseSudo}
        onSubmitSudo={handleSubmitSudo}
      />
    );

    expect(screen.getByText('需要系统管理员 (Sudo) 授权')).toBeDefined();
    expect(screen.getByText('Sudo 密码不正确，请重新输入')).toBeDefined();

    const input = screen.getByPlaceholderText('输入 Sudo 密码...');
    fireEvent.change(input, { target: { value: 'testpass' } });

    const submitBtn = screen.getByText('授权并接管');
    fireEvent.click(submitBtn);

    expect(handleSubmitSudo).toHaveBeenCalledWith('testpass');
  });

  it('renders live download progress, speed, bytes and cancel button when downloading', () => {
    const handleCancel = vi.fn();
    render(
      <GatekeeperModal
        kernelInfo={{
          binary_path: '',
          installed: false,
          version: null,
          supported_versions: ['1.14.*'],
          pinned_version: '1.14.4',
          ready: false,
          gatekeeper_blocked: true,
          message: null,
          os: 'linux',
          arch: 'amd64',
        }}
        takeoverDiagnose={null}
        downloading={true}
        downloadStatus={{
          status: 'downloading',
          progress: 45.67,
          downloaded_bytes: 14500000,
          total_bytes: 31710753,
          speed_bytes_per_sec: 2500000,
          error: null,
        }}
        onDownloadKernel={vi.fn()}
        onCancelDownload={handleCancel}
        onTakeover={vi.fn()}
      />
    );

    // Progress percentage
    expect(screen.getByText('45.7%')).toBeDefined();
    // Status text
    expect(screen.getByText(/正在下载 sing-box 1.14.4 内核/)).toBeDefined();
    // Metrics
    expect(screen.getByText(/已下载:/)).toBeDefined();
    expect(screen.getByText(/速度:/)).toBeDefined();
    expect(screen.getByText(/2.38 MB\/s/)).toBeDefined();

    // Cancel button
    const cancelBtn = screen.getByText('取消下载');
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });

  it('renders extracting status when archive is unpacking', () => {
    render(
      <GatekeeperModal
        kernelInfo={{
          binary_path: '',
          installed: false,
          version: null,
          supported_versions: ['1.14.*'],
          pinned_version: '1.14.4',
          ready: false,
          gatekeeper_blocked: true,
          message: null,
        }}
        takeoverDiagnose={null}
        downloading={true}
        downloadStatus={{
          status: 'extracting',
          progress: 100,
          downloaded_bytes: 31710753,
          total_bytes: 31710753,
          speed_bytes_per_sec: 0,
          error: null,
        }}
        onDownloadKernel={vi.fn()}
        onTakeover={vi.fn()}
      />
    );

    expect(screen.getByText(/下载完成，正在解压与校验内核文件/)).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    // Cancel button is hidden during extraction
    expect(screen.queryByText('取消下载')).toBeNull();
  });

  it('renders error banner with retry button on download error', () => {
    const handleDownload = vi.fn();
    render(
      <GatekeeperModal
        kernelInfo={{
          binary_path: '',
          installed: false,
          version: null,
          supported_versions: ['1.14.*'],
          pinned_version: '1.14.4',
          ready: false,
          gatekeeper_blocked: true,
          message: null,
        }}
        takeoverDiagnose={null}
        downloading={false}
        downloadStatus={{
          status: 'error',
          progress: 0,
          downloaded_bytes: 0,
          total_bytes: 0,
          speed_bytes_per_sec: 0,
          error: '网络连接超时，请切换镜像源重试',
        }}
        onDownloadKernel={handleDownload}
        onTakeover={vi.fn()}
      />
    );

    expect(screen.getByText('网络连接超时，请切换镜像源重试')).toBeDefined();
    const retryBtn = screen.getByText('重试下载');
    fireEvent.click(retryBtn);
    expect(handleDownload).toHaveBeenCalledTimes(1);
  });
});
