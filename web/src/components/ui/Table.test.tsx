import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Table, Column } from "./Table";

interface Row {
  id: number;
  name: string;
}

const columns: Column<Row>[] = [
  { key: "name", header: "名称", sortable: true },
  { key: "id", header: "ID" },
];

const data: Row[] = [
  { id: 2, name: "Beta" },
  { id: 1, name: "Alpha" },
];

describe("Table component", () => {
  it("renders rows and emits sort events", () => {
    const onSort = vi.fn();
    render(
      <Table
        columns={columns}
        data={data}
        sortKey="name"
        sortDirection="asc"
        onSort={onSort}
      />,
    );
    expect(screen.getByText("Alpha")).toBeDefined();
    fireEvent.click(screen.getByText("名称"));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("pins sticky columns with header above body", () => {
    const stickyColumns: Column<Row>[] = [
      { key: "id", header: "ID", sticky: "left", stickyWidth: 40 },
      ...columns,
      { key: "actions", header: "操作", sticky: "right" },
    ];
    const { container } = render(<Table columns={stickyColumns} data={data} />);
    const headers = container.querySelectorAll<HTMLElement>("thead th");
    const cells = container.querySelectorAll<HTMLElement>(
      "tbody tr:first-child td",
    );

    expect(headers[0].style.position).toBe("sticky");
    expect(headers[0].style.zIndex).toBe("30");
    expect(headers[headers.length - 1].style.right).toBe("0px");
    expect(cells[0].style.position).toBe("sticky");
    expect(cells[0].style.zIndex).toBe("20");
    expect(cells[cells.length - 1].style.position).toBe("sticky");
  });

  it("renders empty and loading states with a spanning cell", () => {
    const { container, rerender } = render(
      <Table columns={columns} data={[]} emptyText="没有数据" />,
    );
    expect(screen.getByText("没有数据")).toBeDefined();
    expect(container.querySelector("td")?.getAttribute("colspan")).toBe("2");

    rerender(<Table columns={columns} data={[]} loading />);
    expect(screen.getByText("加载中...")).toBeDefined();
  });

  it("applies fixed layout only when requested", () => {
    const { container, rerender } = render(
      <Table columns={columns} data={data} />,
    );
    expect(container.querySelector("table")?.className).not.toContain(
      "table-fixed",
    );
    rerender(
      <Table columns={columns} data={data} fixedLayout minWidth={640} />,
    );
    const table = container.querySelector("table") as HTMLTableElement;
    expect(table.className).toContain("table-fixed");
    expect(table.style.minWidth).toBe("640px");
  });
});
