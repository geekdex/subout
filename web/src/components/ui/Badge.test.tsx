import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Badge } from "./Badge";

describe("Badge component", () => {
  it("renders text with variant styles", () => {
    render(<Badge variant="success">已运行</Badge>);
    expect(screen.getByText("已运行")).toBeDefined();
  });

  it("renders platform specific badges", () => {
    const { rerender } = render(<Badge platform="linux">LINUX</Badge>);
    expect(screen.getByText("LINUX")).toBeDefined();

    rerender(<Badge platform="android">ANDROID</Badge>);
    expect(screen.getByText("ANDROID")).toBeDefined();
  });
});
