import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  /** 固定列：left 固定在左侧，right 固定在右侧（横向滚动时保持可见） */
  sticky?: "left" | "right";
  /** 固定列宽度（px），用于计算多个相邻固定列的偏移量 */
  stickyWidth?: number;
  /** 固定布局下的列宽 class（作用于 <col>，如固定像素或百分比） */
  colWidthClass?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: keyof T | ((row: T) => string | number);
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  emptyText?: React.ReactNode;
  loading?: boolean;
  className?: string;
  /** 固定表格布局：列宽由各列的 className 宽度决定，配合 minWidth 实现「铺满容器、放不下才滚动」 */
  fixedLayout?: boolean;
  /** 表格最小宽度（px），容器窄于此值时出现横向滚动 */
  minWidth?: number;
}

export function Table<T>({
  columns,
  data,
  keyField = "id" as keyof T,
  sortKey,
  sortDirection,
  onSort,
  emptyText = "暂无数据",
  loading = false,
  className,
  fixedLayout = false,
  minWidth,
}: TableProps<T>) {
  const getKey = (row: T, index: number): string | number => {
    if (typeof keyField === "function") return keyField(row);
    return (row[keyField] as unknown as string | number) ?? index;
  };

  const hasSticky = columns.some((col) => col.sticky);

  const getCellStyle = (
    col: Column<T>,
    index: number,
    isHeader: boolean,
  ): React.CSSProperties => {
    const style: React.CSSProperties = {};
    if (!col.sticky) return style;
    let offset = 0;
    if (col.sticky === "left") {
      for (let i = 0; i < index; i++) {
        if (columns[i].sticky === "left") offset += columns[i].stickyWidth ?? 0;
      }
    } else {
      for (let i = columns.length - 1; i > index; i--) {
        if (columns[i].sticky === "right")
          offset += columns[i].stickyWidth ?? 0;
      }
    }
    return {
      ...style,
      position: "sticky",
      [col.sticky]: offset,
      zIndex: isHeader ? 30 : 20,
    } as React.CSSProperties;
  };

  const stickyCellClass = (col: Column<T>) =>
    clsx(
      col.sticky === "left" && "border-r border-slate-800",
      col.sticky === "right" && "border-l border-slate-800",
    );

  return (
    <div
      className={twMerge(
        clsx(
          "w-full overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/50",
          className,
        ),
      )}
    >
      <table
        style={minWidth !== undefined ? { minWidth } : undefined}
        className={clsx(
          "w-full text-left text-xs",
          fixedLayout && "table-fixed",
          hasSticky ? "border-separate border-spacing-0" : "border-collapse",
        )}
      >
        {fixedLayout && (
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} className={col.colWidthClass} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr
            className={clsx(
              "bg-slate-900/90 text-slate-400 font-medium select-none",
              !hasSticky && "border-b border-slate-800",
            )}
          >
            {columns.map((col, colIndex) => {
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  style={getCellStyle(col, colIndex, true)}
                  title={
                    typeof col.header === "string" ? col.header : undefined
                  }
                  onClick={() => col.sortable && onSort && onSort(col.key)}
                  className={twMerge(
                    clsx(
                      "px-4 py-3 text-xs tracking-wider",
                      fixedLayout ? "whitespace-normal" : "whitespace-nowrap",
                      fixedLayout && "overflow-hidden text-ellipsis",
                      col.sortable &&
                        "cursor-pointer hover:text-slate-200 transition-colors",
                      col.sticky && "bg-slate-900",
                      stickyCellClass(col),
                      hasSticky && "border-b border-slate-800",
                      col.className,
                    ),
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-slate-500">
                        {isSorted ? (
                          sortDirection === "asc" ? (
                            <ArrowUp className="w-3.5 h-3.5 text-sky-400" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={clsx(!hasSticky && "divide-y divide-slate-800/60")}>
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className={twMerge(
                  clsx(
                    "px-4 py-12 text-center text-slate-500",
                    hasSticky && "border-b border-slate-800/60",
                  ),
                )}
              >
                加载中...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={twMerge(
                  clsx(
                    "px-4 py-12 text-center text-slate-500",
                    hasSticky && "border-b border-slate-800/60",
                  ),
                )}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={getKey(row, index)}
                className="hover:bg-slate-800/40 transition-colors group text-slate-300"
              >
                {columns.map((col, colIndex) => (
                  <td
                    key={col.key}
                    style={getCellStyle(col, colIndex, false)}
                    className={twMerge(
                      clsx(
                        "px-4 py-3 whitespace-nowrap",
                        fixedLayout && "overflow-hidden text-ellipsis",
                        col.sticky && "bg-slate-900 group-hover:bg-slate-800",
                        stickyCellClass(col),
                        hasSticky && "border-b border-slate-800/60",
                        col.className,
                      ),
                    )}
                  >
                    {col.render
                      ? col.render(row, index)
                      : ((row as Record<string, unknown>)[
                          col.key
                        ] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
