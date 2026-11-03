import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = "请选择...",
  searchable = false,
  disabled = false,
  className,
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = searchable
    ? options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          opt.value.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : options;

  return (
    <div
      className={twMerge(
        clsx("w-full flex flex-col gap-1.5 relative", className),
      )}
      ref={containerRef}
    >
      {label && (
        <label className="text-xs font-medium text-slate-300 select-none">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={clsx(
          "w-full flex items-center justify-between bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-left transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500",
          disabled && "opacity-50 cursor-not-allowed",
          error && "border-rose-500",
        )}
      >
        <span className={clsx("truncate", !selectedOption && "text-slate-500")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={clsx(
            "w-4 h-4 ml-2 text-slate-400 transition-transform shrink-0",
            isOpen && "transform rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 max-h-60 overflow-auto">
          {searchable && (
            <div className="p-2 border-b border-slate-800 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索选项..."
                className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                autoFocus
              />
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500 text-center">
              无匹配项
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearchTerm("");
                    }
                  }}
                  className={clsx(
                    "px-3.5 py-2 text-xs flex items-center justify-between cursor-pointer transition-colors",
                    opt.disabled
                      ? "opacity-40 cursor-not-allowed"
                      : isSelected
                        ? "bg-sky-500/10 text-sky-400 font-medium"
                        : "hover:bg-slate-800 text-slate-200",
                  )}
                >
                  <div className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.description && (
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {opt.description}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-sky-400 shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
};
