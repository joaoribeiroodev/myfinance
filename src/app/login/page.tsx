"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = isRegister ? "/auth/register" : "/auth/login";
      const body = isRegister ? { name, email, password } : { email, password };
      const data = await api<{ token: string }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setToken(data.token, rememberMe);
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center w-full px-5 py-10 bg-brand-gradient relative overflow-hidden">
      {/* blobs decorativos */}
      <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-black/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center mb-8"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-white/15 border border-white/20 backdrop-blur flex items-center justify-center text-3xl font-bold text-white shadow-glow mb-3">
          $
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">MyFinance</h1>
        <p className="text-sm text-white/70 mt-1">Suas finanças, sob controle.</p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: "spring", damping: 22, stiffness: 220 }}
        className="relative z-10 w-full max-w-sm bg-white dark:bg-surface-darkcard rounded-3xl shadow-2xl p-6 space-y-4"
      >
        <div className="text-center mb-2">
          <h2 className="text-lg font-bold">{isRegister ? "Criar conta" : "Bem-vindo de volta"}</h2>
          <p className="text-xs text-gray-400 mt-1">
            {isRegister ? "Primeiro acesso ao seu painel financeiro" : "Entre para ver seu resumo financeiro"}
          </p>
        </div>

        <AnimatePresence initial={false}>
          {isRegister && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <label className="label">Nome</label>
              <input
                className="input"
                placeholder="Seu nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="label">E-mail</label>
          <input
            className="input"
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Senha</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 select-none cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-brand-500"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Manter sessão ativa
        </label>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm text-expense-600 bg-expense-50 dark:bg-expense-500/10 rounded-lg px-3 py-2"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Entrando..." : isRegister ? "Criar conta" : "Entrar"}
        </button>

        <button
          type="button"
          className="text-xs text-gray-500 dark:text-gray-400 w-full text-center hover:text-brand-600"
          onClick={() => setIsRegister(!isRegister)}
        >
          {isRegister ? "Já tenho conta" : "Primeiro acesso? Criar conta"}
        </button>
      </motion.form>
    </div>
  );
}
