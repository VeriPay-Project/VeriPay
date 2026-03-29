"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/context/AuthContext"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Eye, EyeOff } from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export default function LoginPage() {
  const router = useRouter()
  const { refresh } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setStatus("Signing in…")

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        await refresh()
        const error = await response.json()
        setStatus(
          Array.isArray(error.detail)
            ? error.detail.map((e: any) => e.msg).join(", ")
            : error.detail ?? "Login failed."
        )
        setLoading(false)
        return
      }

      setStatus("Welcome back.")
      await refresh()

      setSuccess(true)

      setTimeout(() => {
        router.push("/dashboard")
      }, 500)
    } catch {
      setStatus("Unable to reach the API.")
      setLoading(false)
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.04] blur-3xl dark:bg-primary/[0.12]" />
        <div className="absolute left-1/2 top-24 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-2xl dark:bg-primary/[0.16]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        <Card className="border-border/40 bg-card/65 backdrop-blur-xl shadow-2xl">
          <CardHeader className="items-center gap-3 pb-2 pt-8">
            <Link href="/">
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

            <CardTitle className="text-xl font-semibold">
              Sign in to VeriPay
            </CardTitle>

            <CardDescription className="text-center text-sm text-muted-foreground">
              AI-powered invoice verification for modern finance teams
            </CardDescription>
          </CardHeader>

          <CardContent className="px-7 pb-2 pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  placeholder="you@veripay.io"
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={success}
                />
              </div>

              <div>
                <Label>Password</Label>

                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    placeholder="••••••••"
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={success}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link href="/forgot-password" className="text-sm">
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || success}
              >
                {success ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Signed in
                  </>
                ) : loading ? (
                  "Signing in…"
                ) : (
                  "Sign in"
                )}
              </Button>

              {status && (
                <p className="text-center text-sm text-muted-foreground">
                  {status}
                </p>
              )}
            </form>
          </CardContent>

          <CardFooter className="justify-center pb-8 pt-4">
            <p className="text-sm text-muted-foreground">
              Don’t have an account?{" "}
              <Link href="/register" className="font-medium">
                Create one
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}