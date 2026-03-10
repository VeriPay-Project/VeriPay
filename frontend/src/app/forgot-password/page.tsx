"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [step, setStep] = useState<1 | 2>(1)
  const [status, setStatus] = useState("")

  async function handleEmailSubmit() {
    setStatus("Checking account...")

    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      const error = await res.json()
      setStatus(error.detail ?? "Error")
      return
    }

    const data = await res.json()
    setQuestion(data.security_question)
    setStep(2)
    setStatus("")
  }

  async function handleReset() {
    setStatus("Resetting password...")

    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        security_answer: answer,
        new_password: newPassword,
      }),
    })

    if (!res.ok) {
      const error = await res.json()
      setStatus(error.detail ?? "Error")
      return
    }

    setStatus("Password reset successful. You can now sign in.")
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      {/* Same glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.04] blur-3xl dark:bg-primary/[0.12]" />
        <div className="absolute left-1/2 top-24 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-2xl dark:bg-primary/[0.16]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        <Card className="border-border/40 bg-card/65 backdrop-blur-xl shadow-2xl shadow-background/80">
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
              Reset your password
            </CardTitle>

            <CardDescription className="text-center text-sm text-muted-foreground">
              Answer your security question to continue
            </CardDescription>
          </CardHeader>

          <CardContent className="px-7 pb-8 pt-4 space-y-4">
            {step === 1 && (
              <>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button onClick={handleEmailSubmit} className="w-full">
                  Next
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <p className="font-medium text-sm">{question}</p>

                <Label>Answer</Label>
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />

                <Label>New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <Button onClick={handleReset} className="w-full">
                  Reset Password
                </Button>
              </>
            )}

            {status && (
              <p className="text-center text-sm text-muted-foreground">
                {status}
              </p>
            )}

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}