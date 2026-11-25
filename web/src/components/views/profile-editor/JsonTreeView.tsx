import React, {
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface JsonTreeViewHandle {
  expandAll: () => void;
  collapseAll: () => void;
}

interface JsonTreeViewProps {
  value: unknown;
  className?: string;
}

// Unit separator: safe even if a config key happens to contain "/" or ".".
const PATH_SEP = "\u001f";

function pathKey(parts: string[]): string {
  return parts.join(PATH_SEP);
}

function collectContainerPaths(
  value: unknown,
  parts: string[] = [],
  out: string[] = [],
): string[] {
  if (value === null || typeof value !== "object") return out;
  out.push(pathKey(parts));
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectContainerPaths(item, [...parts, String(i)], out),
    );
  } else {
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) =>
      collectContainerPaths(child, [...parts, key], out),
    );
  }
  return out;
}

function leafClass(value: unknown): string {
  if (typeof value === "string") return "text-emerald-300";
  if (typeof value === "number") return "text-amber-300";
  if (typeof value === "boolean") return "text-fuchsia-300";
  return "text-slate-500";
}

// JSON.stringify already wraps strings in quotes and escapes them correctly.
// Other primitives stringify to their literal JSON form.
function leafText(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

interface JsonNodeProps {
  value: unknown;
  parts: string[];
  depth: number;
  isLast: boolean;
  showKey: boolean;
  nodeKey?: string;
  collapsedPaths: Set<string>;
  onToggle: (key: string) => void;
}

const JsonNode: React.FC<JsonNodeProps> = ({
  value,
  parts,
  depth,
  isLast,
  showKey,
  nodeKey,
  collapsedPaths,
  onToggle,
}) => {
  const indent = { paddingLeft: depth * 14 };
  const isContainer = value !== null && typeof value === "object";

  if (!isContainer) {
    return (
      <div
        className="json-line flex items-baseline gap-1 leading-5"
        style={indent}
      >
        {/* Spacer keeps leaves aligned with container rows that have a toggle. */}
        <span className="w-4 shrink-0" aria-hidden="true" />
        {showKey && (
          <span>
            <span className="text-sky-300">{JSON.stringify(nodeKey)}</span>
            <span className="text-slate-500">:</span>
          </span>
        )}
        <span className={leafClass(value)}>{leafText(value)}</span>
        {!isLast && <span className="text-slate-500">,</span>}
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((item, i) => [String(i), item])
    : Object.entries(value as Record<string, unknown>);
  const key = pathKey(parts);
  const collapsed = collapsedPaths.has(key);
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";
  const label = showKey
    ? nodeKey
    : parts.length > 0
      ? `第 ${Number(parts[parts.length - 1]) + 1} 项`
      : "根节点";

  return (
    <div className="json-node">
      <div
        className="json-line flex items-baseline gap-1 leading-5"
        style={indent}
      >
        <button
          type="button"
          onClick={() => onToggle(key)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "展开" : "折叠"} ${label}`}
          title={collapsed ? `展开（${entries.length} 项）` : "折叠节点"}
          className="inline-flex items-center justify-center w-4 h-4 shrink-0 text-slate-500 hover:text-sky-300 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
        {showKey && (
          <span>
            <span className="text-sky-300">{JSON.stringify(nodeKey)}</span>
            <span className="text-slate-500">:</span>
          </span>
        )}
        <span className="text-slate-400">{open}</span>
        {collapsed && (
          <>
            <button
              type="button"
              onClick={() => onToggle(key)}
              title={`${entries.length} 项，点击展开`}
              className="text-slate-500 hover:text-sky-300 transition-colors"
            >
              …
            </button>
            <span className="text-slate-400">{close}</span>
          </>
        )}
        {collapsed && !isLast && <span className="text-slate-500">,</span>}
      </div>

      {!collapsed && (
        <>
          {entries.map(([childKey, childValue], i) => (
            <JsonNode
              key={pathKey([...parts, childKey])}
              nodeKey={isArray ? undefined : childKey}
              showKey={!isArray}
              value={childValue}
              parts={[...parts, childKey]}
              depth={depth + 1}
              isLast={i === entries.length - 1}
              collapsedPaths={collapsedPaths}
              onToggle={onToggle}
            />
          ))}
          <div
            className="json-line flex items-baseline gap-1 leading-5"
            style={indent}
          >
            <span className="w-4 shrink-0" aria-hidden="true" />
            <span className="text-slate-400">{close}</span>
            {!isLast && <span className="text-slate-500">,</span>}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Read-only, selectable JSON tree with per-node folding.
 *
 * When every node is expanded the rendered textContent equals the compact,
 * valid JSON of `value`, so it can still be selected/copied or asserted on in
 * tests. Folding a node replaces its children with an ellipsis placeholder.
 */
export const JsonTreeView = React.forwardRef<
  JsonTreeViewHandle,
  JsonTreeViewProps
>(({ value, className = "" }, ref) => {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [allCollapsed, setAllCollapsed] = useState(false);
  const allContainerPaths = useMemo(
    () => collectContainerPaths(value),
    [value],
  );

  useImperativeHandle(
    ref,
    () => ({
      expandAll: () => {
        setAllCollapsed(false);
        setCollapsedPaths(new Set());
      },
      collapseAll: () => {
        setAllCollapsed(true);
        setCollapsedPaths(new Set(allContainerPaths));
      },
    }),
    [allContainerPaths],
  );

  // Re-apply "collapse all" after the live JSON changes, so new nodes do not
  // unexpectedly pop open while the user has chosen a fully folded view.
  useEffect(() => {
    if (allCollapsed) setCollapsedPaths(new Set(allContainerPaths));
  }, [allContainerPaths, allCollapsed]);

  const togglePath = (key: string) => {
    setAllCollapsed(false);
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className={`font-mono text-xs text-slate-200 ${className}`}>
      <JsonNode
        value={value}
        parts={[]}
        depth={0}
        isLast
        showKey={false}
        collapsedPaths={collapsedPaths}
        onToggle={togglePath}
      />
    </div>
  );
});
JsonTreeView.displayName = "JsonTreeView";
