"use client"

import React from "react"
import { usePathname } from "next/navigation"

import Sidebar from "./Sidebar"
import Header from "./Header"

export default function AppShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Pages that should NOT show dashboard chrome
  const hideShell =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password"

  if (hideShell) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen gap-6 p-6">
      <Sidebar />
      <div className="flex flex-1 flex-col gap-4">
        <Header />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}