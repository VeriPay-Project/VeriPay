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
import { Eye, EyeOff } from "lucide-react"
import { motion } from "framer-motion"
import type { Variants } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

export default function ForgotPasswordPage() {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [step, setStep] = useState<1 | 2>(1)
  const [status, setStatus] = useState("")

  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const isStrongPassword =
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword)

  const pageVariants: Variants = {
    initial: { opacity: 0, y: 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.35,
        ease: "easeOut",
      },
    },
    exit: {
      opacity: 0,
      y: -12,
      transition: {
        duration: 0.2,
        ease: "easeIn",
      },
    },
  }

  const getPasswordStrength = (password: string) => {
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[a-z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    return score
  }

  const strength = getPasswordStrength(newPassword)

  const strengthLabel = [
    "Very Weak",
    "Weak",
    "Fair",
    "Good",
    "Strong",
    "Very Strong",
  ][strength]

  const strengthColor = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-blue-500",
    "bg-green-500",
    "bg-emerald-600",
  ][strength]

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/



  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword

  async function handleEmailSubmit() {
    setStatus("Checking account...")

    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    if (!email.trim()) {
      toast({
        title: "Missing email",
        description: "Please enter your email.",
        variant: "destructive",
      })
      return
    }

    if (!emailRegex.test(email)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      })
      return
    }

    if (!res.ok) {
      const error = await res.json()

      let message = "Something went wrong."

      if (Array.isArray(error?.detail)) {
        message = error.detail.map((e: any) => e.msg).join(", ")
      } else if (typeof error?.detail === "string") {
        message = error.detail
      }

      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
      return
    }

    const data = await res.json()
    setQuestion(data.security_question)
    setStep(2)
    setStatus("")
  }

  async function handleReset() {
    // 🔒 Frontend validation first
    if (!isStrongPassword) {
      toast({
        title: "Weak password",
        description: "Please meet all password requirements.",
        variant: "destructive",
      })
      return
    }

    if (!passwordsMatch) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match.",
        variant: "destructive",
      })
      return
    }

    if (!answer.trim()) {
      toast({
        title: "Missing answer",
        description: "Please answer the security question.",
        variant: "destructive",
      })
      return
    }

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          security_answer: answer,
          new_password: newPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: "Reset failed",
          description: Array.isArray(data?.detail)
            ? data.detail.join(", ")
            : data?.detail || "Something went wrong.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Password reset successful",
        description: "You can now sign in.",
      })

      setTimeout(() => {
        window.location.href = "/login"
      }, 1500)

    } catch {
      toast({
        title: "Network error",
        description: "Unable to reach the server.",
        variant: "destructive",
      })
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      {/* Same glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.04] blur-3xl dark:bg-primary/[0.12]"
        />
        <div className="absolute left-1/2 top-24 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-2xl dark:bg-primary/[0.16]" />
      </div>

      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative w-full max-w-[400px]"
      >
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
                  placeholder="you@veripay.io"
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

                {/* New Password */}
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNew ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Strength Indicator */}
                {newPassword && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${strengthColor}`}
                        style={{ width: `${(strength / 5) * 100}%` }}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Strength: <span className="font-medium">{strengthLabel}</span>
                    </p>

                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className={newPassword.length >= 8 ? "text-green-600" : ""}>
                        • At least 8 characters
                      </li>
                      <li className={/[A-Z]/.test(newPassword) ? "text-green-600" : ""}>
                        • Uppercase letter
                      </li>
                      <li className={/[a-z]/.test(newPassword) ? "text-green-600" : ""}>
                        • Lowercase letter
                      </li>
                      <li className={/[0-9]/.test(newPassword) ? "text-green-600" : ""}>
                        • Number
                      </li>
                      <li className={/[^A-Za-z0-9]/.test(newPassword) ? "text-green-600" : ""}>
                        • Special character
                      </li>
                    </ul>
                  </div>
                )}

                {/* Confirm Password */}
                <Label>Confirm Password</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNew ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-red-500">
                    Passwords do not match
                  </p>
                )}

                {confirmPassword && passwordsMatch && (
                  <p className="text-xs text-green-600">
                    Passwords match
                  </p>
                )}

                <Button
                  onClick={handleReset}
                  className="w-full"
                  disabled={!isStrongPassword || !passwordsMatch || !answer}
                >
                  Reset Password
                </Button>
              </>
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
      </motion.div>
    </main>
  )
}