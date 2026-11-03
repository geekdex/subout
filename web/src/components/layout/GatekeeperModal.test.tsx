import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { GatekeeperModal } from './GatekeeperModal';

describe('GatekeeperModal', () => {
  it('does not render anything when kernel is ready', () => {
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
        takeoverDiagnose={null}
        downloading={false}
        onDownloadKernel={vi.fn()}
        onTakeover={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
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
});
