"use client";

import { useEffect, useState } from "react";
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
import { KeyRound, ShieldCheck, Percent } from "lucide-react";
import { getVatRate, updateVatRate } from "@/lib/firestore/settings";

export default function SettingsPage() {
  const { appUser } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({ current: "", newPass: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [vatRateInput, setVatRateInput] = useState("");
  const [vatSaving, setVatSaving] = useState(false);

  useEffect(() => {
    getVatRate().then((r) => setVatRateInput(String(r)));
  }, []);

  async function handleVatSave() {
    const rate = parseFloat(vatRateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showToast("يجب أن تكون النسبة بين 0 و 100", "error");
      return;
    }
    setVatSaving(true);
    try {
      await updateVatRate(rate);
      showToast("تم تحديث نسبة الضريبة");
    } catch {
      showToast("حدث خطأ", "error");
    } finally {
      setVatSaving(false);
    }
  }

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

      {/* VAT Rate — admin only */}
      {appUser?.role === "admin" && (
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <Percent size={20} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">نسبة الضريبة المضافة (VAT)</h3>
              <p className="text-xs text-slate-400">تُطبَّق على جميع الحفلات الجديدة</p>
            </div>
          </div>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label="النسبة (%)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={vatRateInput}
                onChange={(e) => setVatRateInput(e.target.value)}
                placeholder="15"
              />
            </div>
            <Button onClick={handleVatSave} loading={vatSaving} className="shrink-0">
              حفظ
            </Button>
          </div>

          {vatRateInput && parseFloat(vatRateInput) >= 0 && (
            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm">
              <p className="text-amber-700 font-medium mb-1">مثال على سعر حفلة 1000 ريال:</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">الضريبة ({vatRateInput}%): </span>
                  <span className="font-bold text-amber-700">
                    {(1000 * parseFloat(vatRateInput) / 100).toLocaleString("ar-SA")} ريال
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">بدون ضريبة: </span>
                  <span className="font-bold text-slate-700">
                    {(1000 * (1 - parseFloat(vatRateInput) / 100)).toLocaleString("ar-SA")} ريال
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-[#EEF1F7] rounded-xl flex items-center justify-center">
            <KeyRound size={20} className="text-[#1C2D50]" />
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
