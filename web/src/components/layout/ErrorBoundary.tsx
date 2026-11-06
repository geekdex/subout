import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught render error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-lg w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-8 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                页面渲染遇到错误
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                前端发生未捕获的渲染异常。请点击下方按钮重新加载。
              </p>
            </div>
            {this.state.error && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-rose-300 overflow-x-auto">
                {this.state.error.message}
              </div>
            )}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-sm font-medium transition"
              >
                <RefreshCw className="w-4 h-4" />
                重新加载页面
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
