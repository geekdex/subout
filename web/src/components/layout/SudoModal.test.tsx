import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SudoModal } from './SudoModal';

describe('SudoModal', () => {
  it('does not render when open is false', () => {
    const { container } = render(
      <SudoModal
        open={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders title, explanation, conflict PIDs, and security notice when open', () => {
    render(
      <SudoModal
        open={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        conflictPids={[73023]}
        conflictName="外部独立 sing-box 进程"
      />
    );

    expect(screen.getByText('需要系统管理员 (Sudo) 授权')).toBeDefined();
    expect(screen.getByText(/PID: 73023/)).toBeDefined();
    expect(screen.getByText(/外部独立 sing-box 进程/)).toBeDefined();
    expect(screen.getByText(/内存会话模式/)).toBeDefined();
    expect(screen.getByText(/绝不会保存到数据库或磁盘配置文件中/)).toBeDefined();
  });

  it('allows typing sudo password and submitting', () => {
    const handleSubmit = vi.fn();
    render(
      <SudoModal
        open={true}
        onClose={vi.fn()}
        onSubmit={handleSubmit}
        conflictPids={[73023]}
      />
    );

    const input = screen.getByPlaceholderText('输入 Sudo 密码...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mypassword123' } });
    expect(input.value).toBe('mypassword123');

    const submitBtn = screen.getByText('授权并接管');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith('mypassword123');
  });

  it('displays inline error when error prop is provided', () => {
    render(
      <SudoModal
        open={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        error="Sudo 密码不正确，请重新输入"
      />
    );

    expect(screen.getByText('Sudo 密码不正确，请重新输入')).toBeDefined();
  });

  it('disables submit button when password is empty or loading', () => {
    const { rerender } = render(
      <SudoModal
        open={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        loading={false}
      />
    );

    const submitBtn = screen.getByText('授权并接管') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    rerender(
      <SudoModal
        open={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        loading={true}
      />
    );
    expect(submitBtn.disabled).toBe(true);
  });
});
