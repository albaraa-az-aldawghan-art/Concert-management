"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { KeyRound, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.newPass.length < 6) {
      showToast("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل", "error");
      return;
    }
    if (form.newPass !== form.confirm) {
      showToast("كلمة المرور الجديدة وتأكيدها غير متطابقتين", "error");
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("not_logged_in");

      // Re-authenticate before updating
      const credential = EmailAuthProvider.credential(user.email, form.current);
      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, form.newPass);
      showToast("تم تغيير كلمة المرور بنجاح");
      setForm({ current: "", newPass: "", confirm: "" });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        showToast("كلمة المرور الحالية غير صحيحة", "error");
      } else if (code === "auth/too-many-requests") {
        showToast("محاولات كثيرة جداً، حاول لاحقاً", "error");
      } else {
        showToast("حدث خطأ، حاول مرة أخرى", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">الإعدادات</h2>
        <p className="text-sm text-slate-500 mt-0.5">{appUser?.email}</p>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <KeyRound size={20} className="text-blue-700" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">تغيير كلمة المرور</h3>
            <p className="text-xs text-slate-400">يجب إدخال كلمة المرور الحالية للتحقق</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="كلمة المرور الحالية"
            type="password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
            required
            placeholder="أدخل كلمة مرورك الحالية"
          />
          <Input
            label="كلمة المرور الجديدة"
            type="password"
            value={form.newPass}
            onChange={(e) => setForm({ ...form, newPass: e.target.value })}
            required
            placeholder="6 أحرف على الأقل"
            helperText="يجب أن تكون 6 أحرف على الأقل"
          />
          <Input
            label="تأكيد كلمة المرور الجديدة"
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            required
            placeholder="أعد إدخال كلمة المرور الجديدة"
          />
          <Button type="submit" loading={saving} className="w-full gap-2">
            <ShieldCheck size={16} />
            تحديث كلمة المرور
          </Button>
        </form>
      </Card>
    </div>
  );
}
