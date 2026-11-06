import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Tooltip } from "./Tooltip";

describe("Tooltip Component", () => {
  it("renders children and shows tooltip on mouse hover with correct alignment", () => {
    render(
      <Tooltip content="这是一段测试提示内容" position="bottom" align="end">
        <button type="button">测试按钮</button>
      </Tooltip>,
    );

    const trigger = screen.getByText("测试按钮");
    expect(screen.queryByText("这是一段测试提示内容")).toBeNull();

    // Mouse enter triggers tooltip
    fireEvent.mouseEnter(trigger.parentElement!);
    const tooltipContent = screen.getByText("这是一段测试提示内容");
    expect(tooltipContent).toBeDefined();

    // Verify alignment class
    expect(tooltipContent.className).toContain("right-0");
    expect(tooltipContent.className).toContain("top-full");

    // Mouse leave hides tooltip
    fireEvent.mouseLeave(trigger.parentElement!);
    expect(screen.queryByText("这是一段测试提示内容")).toBeNull();
  });

  it("supports start and center alignment", () => {
    const { rerender } = render(
      <Tooltip content="左对齐提示" position="top" align="start">
        <button type="button">按钮1</button>
      </Tooltip>,
    );

    fireEvent.mouseEnter(screen.getByText("按钮1").parentElement!);
    const startTooltip = screen.getByText("左对齐提示");
    expect(startTooltip.className).toContain("left-0");
    expect(startTooltip.className).toContain("bottom-full");

    rerender(
      <Tooltip content="居中提示" position="bottom" align="center">
        <button type="button">按钮2</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("按钮2").parentElement!);
    const centerTooltip = screen.getByText("居中提示");
    expect(centerTooltip.className).toContain("left-1/2");
    expect(centerTooltip.className).toContain("-translate-x-1/2");
  });
});
