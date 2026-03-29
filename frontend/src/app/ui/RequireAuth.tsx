"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const publicRoutes = ["/", "/login", "/register", "/forgot-password", "/about"];

  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    if (loading) return;

    // 🔒 Not logged in → block protected routes
    if (!user && !isPublicRoute) {
      router.replace("/login");
    }

    // 🚫 Logged in → block login/register
    if (user && (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password")) {
      router.replace("/dashboard");
    }

  }, [user, loading, pathname, router]);

  // ⏳ Prevent flicker while checking auth
  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        Checking authentication…
      </div>
    );
  }

  return <>{children}</>;
}
