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
}: TableProps<T>) {
  const getKey = (row: T, index: number): string | number => {
    if (typeof keyField === "function") return keyField(row);
    return (row[keyField] as unknown as string | number) ?? index;
  };

  return (
    <div
      className={twMerge(
        clsx(
          "w-full overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/50",
          className,
        ),
      )}
    >
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 font-medium select-none">
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  onClick={() => col.sortable && onSort && onSort(col.key)}
                  className={clsx(
                    "px-4 py-3 text-xs tracking-wider whitespace-nowrap",
                    col.sortable &&
                      "cursor-pointer hover:text-slate-200 transition-colors",
                    col.className,
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
        <tbody className="divide-y divide-slate-800/60">
          {loading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-slate-500"
              >
                加载中...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-slate-500"
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
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      "px-4 py-3 whitespace-nowrap",
                      col.className,
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
