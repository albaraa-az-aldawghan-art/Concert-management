"use client";

/* إعدادات النظام المشتركة: الميزات المفعّلة والمسمّيات ونسبة الضريبة. */
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  getSystemSettings, SystemSettings, DEFAULT_FEATURES, DEFAULT_LABELS, SystemFeatures,
} from "@/lib/firestore/system";

/* إعدادات النظام تُقرأ مرة واحدة عند الدخول وتُشارَك على كل الصفحات.
   الافتراضي «كل الميزات مفتوحة» حتى لو فشلت القراءة — إيقاف ميزة قرارٌ
   صريح، ولا يصح أن يتسبب فيه انقطاع شبكة. */

interface SystemCtx {
  settings: SystemSettings;
  loading: boolean;
  feature: (k: keyof SystemFeatures) => boolean;
  reload: () => Promise<void>;
}

const fallback: SystemSettings = { vatRate: 15, features: DEFAULT_FEATURES, labels: DEFAULT_LABELS };

const Ctx = createContext<SystemCtx>({
  settings: fallback,
  loading: true,
  feature: () => true,
  reload: async () => {},
});

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(fallback);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setSettings(await getSystemSettings());
    } catch {
      setSettings(fallback);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const feature = useCallback(
    (k: keyof SystemFeatures) => settings.features[k] !== false,
    [settings]
  );

  return <Ctx.Provider value={{ settings, loading, feature, reload }}>{children}</Ctx.Provider>;
}

export function useSystem() {
  return useContext(Ctx);
}
