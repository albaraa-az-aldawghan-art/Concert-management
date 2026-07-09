"use client";

import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem("splashShown");
    if (alreadyShown) return;

    setVisible(true);
    const fadeTimer = setTimeout(() => setFadeOut(true), 2000);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      sessionStorage.setItem("splashShown", "1");
    }, 2600);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1C2D50",
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.6s ease-in-out",
        pointerEvents: "all",
      }}
    >
      <img
        src="/logo.jpg"
        alt="الفريج"
        style={{
          width: 200,
          height: 200,
          objectFit: "contain",
          borderRadius: 24,
        }}
      />
    </div>
  );
}
