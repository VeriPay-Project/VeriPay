"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/app/context/AuthContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ShieldCheck,
  Brain,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react"

/* ---------------- Animated Counter ---------------- */

function Counter({ target }: { target: number }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let start = 0
    const duration = 1200
    const increment = target / (duration / 16)

    const interval = setInterval(() => {
      start += increment
      if (start >= target) {
        start = target
        clearInterval(interval)
      }
      setCount(Math.floor(start))
    }, 16)

    return () => clearInterval(interval)
  }, [target])

  return <span>{count}</span>
}

export default function Home() {
  const { user } = useAuth()
  const isAuthenticated = !!user

  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center px-6 py-24 overflow-hidden">

      {/* Parallax radial glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl animate-pulse" />

      <div className="relative w-full max-w-6xl flex flex-col gap-20">

        {/* ================= HERO ================= */}
        <section className="flex flex-col items-center gap-6 text-center motion-safe:animate-in motion-safe:fade-in duration-700">

          <Badge
            variant="secondary"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            VeriPay Platform
          </Badge>

          {/* Gradient animated headline */}
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight lg:text-5xl bg-gradient-to-r from-primary via-foreground to-primary bg-[length:200%_200%] bg-clip-text text-transparent animate-[gradientMove_6s_ease_infinite]">
            Secure invoice verification built for modern finance teams.
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground lg:text-base">
            Verify digital signatures, detect anomalies, and maintain
            audit-ready trails — all within a single AI-powered workflow.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button className="gap-2">
                  Go to dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button>Login</Button>
                </Link>
                <Link href="/register">
                  <Button variant="outline">Create account</Button>
                </Link>
              </>
            )}
          </div>
        </section>

        {/* ================= METRICS STRIP ================= */}
        <section className="grid grid-cols-3 gap-6 text-center motion-safe:animate-in motion-safe:fade-in duration-1000">
          <Metric title="Invoices analyzed" value={<Counter target={12847} />} />
          <Metric title="Fraud signals detected" value={<Counter target={532} />} />
          <Metric title="Verification accuracy" value="99.2%" />
        </section>

        {/* ================= FEATURES ================= */}
        <section className="grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={ShieldCheck}
            title="Identity-first access"
            description="Every session is tied to a verified operator profile with secure, hashed credentials stored in PostgreSQL."
          />
          <FeatureCard
            icon={Brain}
            title="AI-powered anomaly detection"
            description="Detect unusual formatting patterns, suspicious totals, and document drift using vector embeddings and statistical scoring."
          />
          <FeatureCard
            icon={ClipboardCheck}
            title="Audit-ready compliance"
            description="Log every upload, verification result, and decision for compliance reporting and future dispute resolution."
          />
        </section>

        {/* ================= TRUST SECTION ================= */}
        <section className="flex flex-col items-center gap-6 text-center pt-10 border-t border-border/40">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Trusted by finance teams and audit professionals
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 text-sm font-medium text-muted-foreground">
            <span>Enterprise Finance</span>
            <span>Audit & Compliance</span>
            <span>Accounts Payable</span>
            <span>Fraud Prevention</span>
          </div>
        </section>
      </div>

      {/* Gradient animation keyframes */}
      <style jsx global>{`
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </main>
  )
}

/* ---------------- Reusable Components ---------------- */

function Metric({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <Card className="border-0
    bg-card/70
    backdrop-blur-sm
    shadow-sm
    transition-all
    duration-200
    hover:-translate-y-0.5
    hover:shadow-md
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:slide-in-from-bottom-2">
      <CardContent className="flex flex-col items-center gap-2 p-6">
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
      </CardContent>
    </Card>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <Card className="border-0
    bg-card/70
    backdrop-blur-sm
    shadow-sm
    transition-all
    duration-200
    hover:-translate-y-0.5
    hover:shadow-md
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:slide-in-from-bottom-2">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}
