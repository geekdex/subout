import React, { useState } from "react";
import { X, Plus } from "lucide-react";

interface TagListInputProps {
  label: string;
  values: (string | number)[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  suggestions?: { value: string; label?: string }[];
  numeric?: boolean;
  onChangeNumeric?: (next: number[]) => void;
}

export const TagListInput: React.FC<TagListInputProps> = ({
  label,
  values,
  onChange,
  placeholder = "输入后按回车或逗号添加...",
  hint,
  suggestions,
  numeric = false,
  onChangeNumeric,
}) => {
  const [draft, setDraft] = useState("");

  const strValues = (values || []).map((v) => String(v));

  const commitTokens = (raw: string) => {
    const parts = raw
      .split(/[\n,，;；]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    if (numeric && onChangeNumeric) {
      const currentNums = (values || [])
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n));
      const nextNums = [...currentNums];
      for (const p of parts) {
        const num = Number(p);
        if (
          Number.isInteger(num) &&
          num >= 1 &&
          num <= 65535 &&
          !nextNums.includes(num)
        ) {
          nextNums.push(num);
        }
      }
      onChangeNumeric(nextNums);
    } else {
      const next = [...strValues];
      for (const p of parts) {
        if (!next.includes(p)) {
          next.push(p);
        }
      }
      onChange(next);
    }
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTokens(draft);
    } else if (
      e.key === "Backspace" &&
      draft === "" &&
      strValues.length > 0
    ) {
      e.preventDefault();
      if (numeric && onChangeNumeric) {
        onChangeNumeric(
          strValues
            .slice(0, -1)
            .map((v) => Number(v))
            .filter((n) => Number.isInteger(n)),
        );
      } else {
        onChange(strValues.slice(0, -1));
      }
    }
  };

  const removeAt = (idx: number) => {
    const next = strValues.filter((_, i) => i !== idx);
    if (numeric && onChangeNumeric) {
      onChangeNumeric(next.map((v) => Number(v)));
    } else {
      onChange(next);
    }
  };

  const toggleSuggestion = (val: string) => {
    if (strValues.includes(val)) {
      const next = strValues.filter((item) => item !== val);
      if (numeric && onChangeNumeric) {
        onChangeNumeric(next.map((v) => Number(v)));
      } else {
        onChange(next);
      }
    } else {
      commitTokens(val);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-300 select-none">
          {label}
        </label>
        {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
      </div>

      <div className="min-h-[38px] p-1.5 rounded-lg bg-slate-950/90 border border-slate-800 focus-within:border-sky-500/70 focus-within:ring-1 focus-within:ring-sky-500/30 flex flex-wrap items-center gap-1.5 transition-colors">
        {strValues.map((item, idx) => (
          <span
            key={`${item}-${idx}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono bg-sky-500/15 text-sky-300 border border-sky-500/30"
          >
            <span>{item}</span>
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="text-sky-400/70 hover:text-rose-400 transition-colors"
              title={`移除 ${item}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        <div className="flex-1 min-w-[140px] flex items-center gap-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (draft.trim()) commitTokens(draft);
            }}
            placeholder={strValues.length === 0 ? placeholder : "继续添加..."}
            aria-label={label}
            className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none px-1.5 py-1 font-mono"
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={() => commitTokens(draft)}
              className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 text-[11px] flex items-center gap-0.5 shrink-0"
            >
              <Plus className="w-3 h-3" />
              添加
            </button>
          )}
        </div>
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="text-[10px] text-slate-500 mr-0.5">快捷点选:</span>
          {suggestions.map((s) => {
            const active = strValues.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleSuggestion(s.value)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all border ${
                  active
                    ? "bg-sky-500/25 text-sky-200 border-sky-500/50"
                    : "bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                {active ? `✓ ${s.label || s.value}` : `+ ${s.label || s.value}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
