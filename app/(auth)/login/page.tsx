"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/firestore/users";
import { getUserById } from "@/lib/firestore/users";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const credential = await signIn(email, password);
      const user = await getUserById(credential.user.uid);
      if (!user) throw new Error("المستخدم غير موجود");
      const dashboards: Record<string, string> = {
        admin:             "/admin",
        warehouse_manager: "/warehouse-manager",
        supervisor:        "/supervisor",
        employee:          "/employee",
      };
      router.push(dashboards[user.role] ?? "/");
    } catch {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, #080E1C 0%, #111D35 45%, #1C2D50 100%)" }}
    >
      {/* Background subtle texture circles */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          borderRadius: "50%",
          top: "-200px",
          left: "-150px",
          background: "radial-gradient(circle, rgba(38,60,110,0.35) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: 400,
          height: 400,
          borderRadius: "50%",
          bottom: "-100px",
          right: "-80px",
          background: "radial-gradient(circle, rgba(28,45,80,0.4) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-md relative z-10">

        {/* ── Logo ── */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="mb-5 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              width: 90,
              height: 90,
              background: "#1C2D50",
              boxShadow: "0 0 0 1px rgba(176,189,201,0.2), 0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <img
              src="/logo.jpg"
              alt="الفريج"
              style={{ width: 90, height: 90, objectFit: "cover", display: "block" }}
            />
          </div>
          <h1
            className="text-3xl font-bold tracking-wide"
            style={{ color: "#D4DCE8", letterSpacing: "0.04em" }}
          >
            الفريج
          </h1>
          <p className="text-sm mt-1.5" style={{ color: "#6B7E99" }}>
            نظام إدارة الفعاليات
          </p>
        </div>

        {/* ── Login Card ── */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{
            background: "#ffffff",
            boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
          }}
        >
          {/* Card header accent */}
          <div
            className="h-1 rounded-full mb-6 -mt-2 mx-auto"
            style={{
              width: 48,
              background: "linear-gradient(90deg, #1C2D50, #B0BDC9)",
            }}
          />

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none transition-colors"
                style={{ direction: "ltr" }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#1C2D50";
                  e.target.style.boxShadow = "0 0 0 3px rgba(28,45,80,0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "";
                  e.target.style.boxShadow = "";
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 pl-10 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none transition-colors"
                  style={{ direction: "ltr" }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#1C2D50";
                    e.target.style.boxShadow = "0 0 0 3px rgba(28,45,80,0.15)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "";
                    e.target.style.boxShadow = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#94a3b8" }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold rounded-xl py-3 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #1C2D50 0%, #263C6E 100%)",
                color: "#D4DCE8",
                boxShadow: "0 4px 15px rgba(28,45,80,0.35)",
              }}
              onMouseEnter={(e) => {
                if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.9";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = "1";
              }}
            >
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: "rgba(212,220,232,0.4)", borderTopColor: "#D4DCE8" }}
                  />
                  جارٍ تسجيل الدخول...
                </>
              ) : (
                "تسجيل الدخول"
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs mt-5" style={{ color: "#94a3b8" }}>
            الفريج · نظام إدارة الفعاليات
          </p>
        </div>
      </div>
    </div>
  );
}
