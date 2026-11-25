import React, { useEffect, useState } from "react";
import { Lock, ArrowRight, HelpCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
import { Dialog } from "../ui/Dialog";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [passwordState, setPasswordState] = useState({
    is_default: false,
    is_env_set: false,
  });
  const { success, error } = useToast();

  useEffect(() => {
    let cancelled = false;
    void api
      .getPasswordState()
      .then((state) => {
        if (!cancelled) setPasswordState(state);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      error("请输入管理密码");
      return;
    }

    setLoading(true);
    try {
      await api.login(password);
      success("登录成功", "欢迎使用 Subout 管理面板");
      onLoginSuccess();
    } catch (err: unknown) {
      error("登录失败", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Top-right Theme Switcher */}
      <div className="fixed top-4 right-4 z-20">
        <ThemeSwitcher variant="compact" />
      </div>

      {/* Subtle background glow */}
      <div className="absolute w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none translate-x-32 translate-y-32" />

      <div className="w-full max-w-sm glass-panel p-8 relative z-10 border border-slate-800 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl mb-3 shadow-lg shadow-sky-500/20">
            S
          </div>
          <h1 className="text-xl font-bold text-slate-100">Subout Panel</h1>
          <p className="text-xs text-slate-400 mt-1">
            sing-box 订阅与配置管理中台
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="输入管理员密码..."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock className="w-4 h-4" />}
            autoFocus
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            className="w-full"
            iconRight={<ArrowRight className="w-4 h-4" />}
          >
            立即登录
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-sky-300 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            忘记密码？
          </button>
        </div>

        {passwordState.is_default && !passwordState.is_env_set && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500 font-mono">
            当前仍在使用默认密码: admin，登录后请尽快修改
          </div>
        )}

        <Dialog
          open={forgotOpen}
          onClose={() => setForgotOpen(false)}
          title="重置管理密码"
          description="出于安全考虑，面板不提供在线找回密码。请在运行 Subout 的宿主机上手动重置。"
          size="md"
          footer={
            <Button variant="primary" onClick={() => setForgotOpen(false)}>
              我知道了
            </Button>
          }
        >
          {passwordState.is_env_set ? (
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>
                当前密码由环境变量{" "}
                <code className="text-sky-300">ADMIN_PASSWORD</code>{" "}
                管理，命令行重置无效。
              </p>
              <p>请修改该环境变量后重启 Subout 服务，再用新密码登录。</p>
            </div>
          ) : (
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <p>在宿主机执行（需使用启动 Subout 的同一用户）：</p>
              <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sky-200 overflow-x-auto">
                <code>subout reset-password</code>
              </pre>
              <p>
                密码会重置为 <code className="text-amber-300">admin</code>
                ，登录后请立即到「系统与安全设置」修改。
              </p>
              <p>也可直接指定新密码（注意命令行历史会记录该参数）：</p>
              <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-sky-200 overflow-x-auto">
                <code>subout reset-password --new-password '你的新密码'</code>
              </pre>
              <p className="text-rose-300">
                不要删除数据库文件来"重置"，那会同时丢失订阅、节点与配置。
              </p>
            </div>
          )}
        </Dialog>
      </div>
    </div>
  );
};
