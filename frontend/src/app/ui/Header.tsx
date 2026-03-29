"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "../context/AuthContext"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, LogOut, Search, User, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"


export default function Header() {
    const { theme, setTheme } = useTheme()
    const router = useRouter()
    const { user, refresh } = useAuth()

    const [mounted, setMounted] = useState(false)

    const [searchOpen, setSearchOpen] = useState(false)
    const [searchValue, setSearchValue] = useState("")

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) return null

    async function handleLogout() {
        await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            credentials: "include",
        })
        await refresh()
        router.push("/login")
    }
    return (
        <header className="sticky top-0 z-30 flex items-center justify-between rounded-2xl bg-card/70 px-6 py-3 shadow-sm backdrop-blur-md">
            <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Signed in
                </p>
                <p className="text-sm font-semibold text-foreground">
                    {user?.full_name ?? user?.email}
                </p>
            </div>

            <div className="flex items-center gap-2">
                {user && (
                    <div className="flex items-center transition-all duration-300">
                        <input
                            type="text"
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            placeholder="Search..."
                            className={`bg-transparent outline-none text-sm transition-all duration-300 ease-in-out border-b border-border/50 placeholder:text-muted-foreground ${searchOpen ? "w-40 px-2 opacity-100 ml-2" : "w-0 px-0 opacity-0"}`}
                            onBlur={() => setSearchOpen(false)}
                            autoFocus={searchOpen}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && searchValue) {
                                    router.push(`/invoices?q=${searchValue}`)
                                }
                            }}
                        />

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                if (searchOpen && searchValue) {
                                    router.push(`/invoices?q=${searchValue}`)
                                } else {
                                    setSearchOpen(true)
                                }
                            }}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <Search className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="text-muted-foreground hover:text-foreground transition-transform duration-150 active:scale-95"
                    aria-label="Toggle dark mode"
                >
                    {theme === "dark" ? (
                        <Sun
                            key="sun"
                            className="h-4 w-4 animate-in zoom-in-95 fade-in duration-200"
                        />
                    ) : (
                        <Moon
                            key="moon"
                            className="h-4 w-4 animate-in zoom-in-95 fade-in duration-200"
                        />
                    )}
                </Button>

                <div className="mx-2 h-6 w-px bg-border/40" />
                <div className="flex items-center gap-3">
                    {user ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                            {user?.full_name
                                                ? user.full_name
                                                    .split(" ")
                                                    .map(n => n[0])
                                                    .join("")
                                                    .slice(0, 2)
                                                    .toUpperCase()
                                                : user?.email?.[0]?.toUpperCase()}

                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-48" align="end" sideOffset={8}>
                                <div className="px-2 py-1.5">
                                    <p className="text-sm font-medium text-foreground">{user?.full_name}</p>
                                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                    <Link
                                        href="/profile"
                                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors"
                                    >
                                        <User className="mr-2 h-4 w-4" />
                                        Profile
                                    </Link>

                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={handleLogout}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Link href="/login">
                                <Button variant="ghost" size="sm">
                                    Login
                                </Button>
                            </Link>
                            <Link href="/register">
                                <Button size="sm">
                                    Register
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}