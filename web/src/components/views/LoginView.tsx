import React, { useState } from "react";
import { Lock, ArrowRight } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { api } from "../../api/client";
import { useToast } from "../../hooks/useToast";
import { getErrorMessage } from "../../utils/format";

interface LoginViewProps {
  onLoginSuccess: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { success, error } = useToast();

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
      {/* Subtle background glow */}
      <div className="absolute w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none translate-x-32 translate-y-32" />

      <div className="w-full max-w-sm glass-panel p-8 relative z-10 border border-slate-800 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl mb-3 shadow-lg shadow-sky-500/20">
            S
          </div>
          <h1 className="text-xl font-bold text-white">Subout Panel</h1>
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

        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500 font-mono">
          默认密码: admin (首次启动请前往设置修改)
        </div>
      </div>
    </div>
  );
};
