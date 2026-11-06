import React, { useState } from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";

interface CollapsibleToolbarProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const CollapsibleToolbar: React.FC<CollapsibleToolbarProps> = ({
  title,
  subtitle,
  defaultOpen = true,
  headerActions,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl bg-gradient-to-b from-slate-900/95 to-slate-900/75 border border-sky-500/30 shadow-md shadow-sky-500/5 overflow-hidden">
      {/* Toolbar Header */}
      <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left group"
        >
          <div className="p-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 group-hover:bg-sky-500/25 transition-colors">
            <Wrench className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-100">{title}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-300 border border-sky-500/25">
                快捷工具栏
              </span>
            </div>
            {subtitle && (
              <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/70 transition-colors"
          >
            {open ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                <span>收起工具栏</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
                <span>展开工具栏</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Body with smooth height & opacity transition */}
      <div
        className={`grid transition-all duration-200 ease-out ${
          open
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0 pointer-events-none"
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-3.5 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
};
