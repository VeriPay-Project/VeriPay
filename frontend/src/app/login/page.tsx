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
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      {/* Subtle radial background glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="
    absolute left-1/2 top-0
    h-[600px] w-[800px]
    -translate-x-1/2 -translate-y-1/2
    rounded-full
    bg-foreground/[0.04]
    blur-3xl
    dark:bg-primary/[0.12]
    motion-safe:animate-glow-in
  "
        />
        <div
          className="
    absolute left-1/2 top-24
    h-[400px] w-[600px]
    -translate-x-1/2
    rounded-full
    bg-primary/[0.06]
    blur-2xl
    dark:bg-primary/[0.16]
    motion-safe:animate-glow-in
  "
        />
      </div>

      <div className="relative w-full max-w-[400px]">
        {/* Glass morphism login card */}
        <Card
          className="
    border-border/40
    bg-card/65
    backdrop-blur-xl
    shadow-2xl shadow-background/80
    motion-safe:animate-in
    motion-safe:fade-in
    motion-safe:zoom-in-95
    duration-300
  "
        >
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
            <div className="flex flex-col items-center gap-1.5">
              <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                Sign in to VeriPay
              </CardTitle>
              <CardDescription className="text-center text-sm text-muted-foreground">
                AI-powered invoice verification for modern finance teams
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="px-7 pb-2 pt-4">
            <LoginForm />
          </CardContent>

          <CardFooter className="justify-center pb-8 pt-4">
            <p className="text-sm text-muted-foreground">
              {"Don't have an account? "}
              <Link
                href="/register"
                className="font-medium text-foreground transition-colors hover:text-foreground/80"
              >
                Create an account
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
