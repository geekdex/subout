import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Select } from "./Select";

const options = [
  { value: "a", label: "苹果" },
  { value: "b", label: "香蕉" },
  { value: "c", label: "橙子", disabled: true },
];

describe("Select component", () => {
  it("opens a listbox with accessible options and selects by click", () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={options} />);

    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeDefined();

    const opts = screen.getAllByRole("option");
    expect(opts.length).toBe(3);
    expect(opts[0].getAttribute("aria-selected")).toBe("true");

    fireEvent.click(opts[1]);
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("supports keyboard navigation and ignores disabled options", () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={options} />);
    const trigger = screen.getByRole("button");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeDefined();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowUp" }); // highlight c (disabled)
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("flips the dropdown above the trigger near the viewport bottom", () => {
    render(<Select value="a" onChange={vi.fn()} options={options} />);
    const trigger = screen.getByRole("button");
    // jsdom returns 0 for getBoundingClientRect -> window.innerHeight - 0 >= 260,
    // so default is downward. Mock a rect close to the bottom.
    trigger.getBoundingClientRect = () =>
      ({ bottom: window.innerHeight - 10 }) as DOMRect;
    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox.className).toContain("bottom-full");
  });
});
