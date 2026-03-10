"use client"

import { useAuth } from "../context/AuthContext"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import Image from "next/image"
import {
    LayoutDashboard,
    Upload,
    BarChart3,
    ShieldCheck,
    User,
} from "lucide-react"

const appNavItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/upload", label: "Upload invoices", icon: Upload },
    { href: "/analysis", label: "Analysis", icon: BarChart3 },
    { href: "/about", label: "About", icon: ShieldCheck },
]

const authNavItems = [
    { href: "/login", label: "Login" },
    { href: "/register", label: "Register" },
]

export default function Sidebar() {
    const pathname = usePathname()
    const { user, loading } = useAuth()

    return (
        <aside className="sticky top-6 flex h-[calc(100vh-3rem)] w-[260px] shrink-0 flex-col rounded-2xl bg-card/70 shadow-md backdrop-blur-md">
            {/* Brand */}
            <Link
                href="/"
                className="flex items-center justify-center pt-6"
            >
                <div className="flex justify-center">
                    <Image
                        src="/veripay-logo-light.png"
                        alt="VeriPay Logo"
                        width={220}
                        height={70}
                        priority
                        className="block dark:hidden"
                    />
                    <Image
                        src="/veripay-logo-dark.png"
                        alt="VeriPay Logo"
                        width={220}
                        height={70}
                        priority
                        className="hidden dark:block"
                    />
                </div>
            </Link>


            {/* Navigation */}
            <nav className="mt-6 flex flex-1 flex-col gap-1 px-3">
                {!loading && user && appNavItems.map((item) => {
                    const isActive = pathname === item.href
                    const Icon = item.icon
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {item.label}
                        </Link>
                    )
                })}

                {!loading && !user && (
                    <div className="flex flex-col gap-1">
                        <Link
                            href="/login"
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Login
                        </Link>
                        <Link
                            href="/register"
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Register
                        </Link>
                    </div>
                )}
            </nav>


            {/* Footer */}
            {user && (
                <div className="border-t border-border/30 px-3 py-4">
                    <Link
                        href="/profile"
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <User className="h-4 w-4" />
                        Profile
                    </Link>
                </div>
            )}
        </aside>
    )
}