"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserById } from "@/lib/firestore/users";
import { getCustomRoleById } from "@/lib/firestore/roles";
import { canAccess, canFeature, firstAllowedPath } from "@/lib/permissions";
import { AppUser, CustomRole, PermissionPage } from "@/types";

interface AuthContextValue {
  firebaseUser: User | null;
  appUser: AppUser | null;
  customRole: CustomRole | null;
  loading: boolean;
  /** هل يستطيع فتح الصفحة؟ */
  can: (page: PermissionPage) => boolean;
  /** هل يملك ميزة محددة داخل الصفحة؟ */
  feat: (page: PermissionPage, feature: string) => boolean;
  homePath: () => string;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  appUser: null,
  customRole: null,
  loading: true,
  can: () => false,
  feat: () => false,
  homePath: () => "/login",
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [customRole, setCustomRole] = useState<CustomRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userData = await getUserById(user.uid);
        // Load the custom role BEFORE clearing loading so permission checks
        // never run against a half-loaded session.
        if (userData?.role === "custom" && userData.customRoleId) {
          setCustomRole(await getCustomRoleById(userData.customRoleId).catch(() => null));
        } else {
          setCustomRole(null);
        }
        setAppUser(userData);
      } else {
        setAppUser(null);
        setCustomRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const can = useCallback(
    (page: PermissionPage) => canAccess(appUser, customRole, page),
    [appUser, customRole]
  );

  const feat = useCallback(
    (page: PermissionPage, feature: string) => canFeature(appUser, customRole, page, feature),
    [appUser, customRole]
  );

  const homePath = useCallback(
    () => firstAllowedPath(appUser, customRole),
    [appUser, customRole]
  );

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, customRole, loading, can, feat, homePath }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
