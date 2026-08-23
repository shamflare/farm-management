"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <div
      className="empty inline"
      style={{ justifyContent: "center", minHeight: "100vh" }}
    >
      <span className="spinner" />
      <span>جارٍ التحميل…</span>
    </div>
  );
}
