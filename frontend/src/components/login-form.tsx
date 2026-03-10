"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/app/context/AuthContext"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Check, Eye, EyeOff } from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const router = useRouter()
  const { refresh } = useAuth()

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

      // 🔥 trigger success animation
      setSuccess(true)

      // ⏳ smooth exit before redirect
      setTimeout(() => {
        router.push("/dashboard")
      }, 500)
    } catch {
      setStatus("Unable to reach the API.")
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-4 transition-all ${success ? "auth-success" : ""
        }`}
    >
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input
          type="email"
          placeholder="you@veripay.io"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={success}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Password</Label>

        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={success}
          />

          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
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
        <Link
          href="/forgot-password"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Forgot password?
        </Link>
      </div>


      <Button
        type="submit"
        className="w-full flex items-center justify-center gap-2"
        disabled={loading || success}
      >
        {success ? (
          <>
            <Check className="h-4 w-4" />
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
  )
}
