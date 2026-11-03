import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Button } from './Button';

describe('Button component', () => {
  it('renders children text correctly', () => {
    render(<Button>点击测试</Button>);
    expect(screen.getByText('点击测试')).toBeDefined();
  });

  it('handles click callback when active', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>操作</Button>);
    fireEvent.click(screen.getByText('操作'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not trigger click when disabled or loading', () => {
    const handleClick = vi.fn();
    const { unmount } = render(<Button disabled onClick={handleClick}>禁用</Button>);
    fireEvent.click(screen.getByText('禁用'));
    expect(handleClick).not.toHaveBeenCalled();
    unmount();

    const handleLoadingClick = vi.fn();
    render(<Button loading onClick={handleLoadingClick}>加载中</Button>);
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);
  });
});
