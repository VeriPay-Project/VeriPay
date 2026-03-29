"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Eye,
} from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

const securityQuestions = [
  "What was your first pet's name?",
  "What is your mother's maiden name?",
  "What city were you born in?",
  "What was the name of your first school?",
  "What is your favorite childhood friend's name?",
]

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 100 }, (_, i) => currentYear - i)
const months = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

type StepId =
  | "email"
  | "fullName"
  | "password"
  | "confirmPassword"
  | "dob"
  | "securityQuestion"
  | "securityAnswer"

interface StepDef {
  id: StepId
  label: string
  sublabel: string
}

const steps: StepDef[] = [
  { id: "email", label: "Email address", sublabel: "We'll use this to sign you in" },
  { id: "fullName", label: "Full name", sublabel: "As it appears on your documents" },
  { id: "password", label: "Create a password", sublabel: "Must be strong enough to protect your account" },
  { id: "confirmPassword", label: "Confirm password", sublabel: "Re-enter your password to confirm" },
  { id: "dob", label: "Date of birth", sublabel: "Required for identity verification" },
  { id: "securityQuestion", label: "Security question", sublabel: "Choose a question only you can answer" },
  { id: "securityAnswer", label: "Your answer", sublabel: "This will be used for account recovery" },
]

function getDaysInMonth(month: string, year: string) {
  if (!month || !year) return 31
  return new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()
}

function getPasswordStrength(password: string) {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}

const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong", "Very Strong"]
const strengthColors = [
  "bg-destructive",
  "bg-destructive/70",
  "bg-accent",
  "bg-primary/60",
  "bg-primary",
  "bg-primary",
]

const stepVariants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
}

export default function RegisterPage() {

  const { toast } = useToast()
  const [activeStep, setActiveStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  // Form state
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [day, setDay] = useState("")
  const [month, setMonth] = useState("")
  const [year, setYear] = useState("")
  const [securityQuestion, setSecurityQuestion] = useState("")
  const [securityAnswer, setSecurityAnswer] = useState("")

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [status, setStatus] = useState("")

  // const strengthLabel = strengthLabels[strength]
  // const strengthColor = strengthColors[strength]

  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  const strength = useMemo(() => getPasswordStrength(password), [password])

  const days = useMemo(
    () =>
      Array.from(
        { length: getDaysInMonth(month, year) },
        (_, i) => String(i + 1).padStart(2, "0")
      ),
    [month, year]
  )

  const dobDate = useMemo(() => {
    if (!day || !month || !year) return null
    const d = new Date(`${year}-${month}-${day}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }, [day, month, year])

  const isStepValid = useCallback(
    (stepIndex: number): boolean => {
      switch (steps[stepIndex].id) {
        case "email":
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        case "fullName":
          return fullName.trim().length >= 2
        case "password":
          return (
            password.length >= 8 &&
            /[A-Z]/.test(password) &&
            /[a-z]/.test(password) &&
            /[0-9]/.test(password) &&
            /[^A-Za-z0-9]/.test(password)
          )
        case "confirmPassword":
          return confirmPassword === password && confirmPassword.length > 0
        case "dob":
          // must be valid date and not in the future
          return !!dobDate && dobDate.getTime() < Date.now()
        case "securityQuestion":
          return securityQuestion !== ""
        case "securityAnswer":
          return securityAnswer.trim().length >= 2
        default:
          return false
      }
    },
    [email, fullName, password, confirmPassword, dobDate, securityQuestion, securityAnswer]
  )

  const scrollToStep = useCallback((idx: number) => {
    const el = stepRefs.current[idx]
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }, [])

  useEffect(() => {
    scrollToStep(activeStep)
  }, [activeStep, scrollToStep])

  const markCompleted = useCallback((idx: number) => {
    setCompletedSteps((prev) => (prev.includes(idx) ? prev : [...prev, idx]))
  }, [])

  const advanceStep = useCallback(() => {
    if (!isStepValid(activeStep)) return
    markCompleted(activeStep)
    if (activeStep < steps.length - 1) setActiveStep((p) => p + 1)
  }, [activeStep, isStepValid, markCompleted])

  const handleEditStep = useCallback(
    (idx: number) => {
      // collapse future steps so UI is consistent
      setCompletedSteps((prev) => prev.filter((i) => i <= idx))
      setActiveStep(idx)
    },
    []
  )

  const handleSubmit = useCallback(async () => {
    if (!isStepValid(activeStep)) return
    markCompleted(activeStep)
    setIsSubmitting(true)
    setStatus("Creating your account...")

    if (!day || !month || !year) {
      setStatus("Please select your complete date of birth.")
      return
    }


    try {
      const formattedDOB = `${year}-${month}-${day}`

      const response = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          date_of_birth: formattedDOB,
          security_question: securityQuestion,
          // normalize so it matches backend lower().strip() verification behavior
          security_answer: securityAnswer.trim().toLowerCase(),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        if (Array.isArray(error.detail)) {
          setStatus(error.detail.join(", "))
        } else {
          toast({
            title: "Registration failed",
            description: Array.isArray(error.detail)
              ? error.detail.join(", ")
              : error.detail || "Something went wrong",
            variant: "destructive",
          })
        }
        setIsSubmitting(false)
        return
      }

      const data = await response.json().catch(() => ({}))

      toast({
        title: "Account created",
        description: "Redirecting to login...",
      })

      setStatus(data.message ?? "Account created.")
      setSuccess(true)
      setIsSubmitting(false)

      setTimeout(() => {
        window.location.href = "/login"
      }, 2000)
    } catch {
      toast({
        title: "Network error",
        description: "Unable to reach the server. Try again.",
        variant: "destructive",
      })
      setIsSubmitting(false)
    }
  }, [
    activeStep,
    isStepValid,
    markCompleted,
    year,
    month,
    day,
    fullName,
    email,
    password,
    securityQuestion,
    securityAnswer,
  ])

  const isLastStep = activeStep === steps.length - 1

  return (
    <main className="relative flex min-h-svh items-center justify-center p-4">
      {/* Background glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.04] blur-3xl dark:bg-primary/[0.12]" />
        <div className="absolute left-1/2 top-24 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-2xl dark:bg-primary/[0.16]" />
      </div>

      <div className="relative w-full max-w-[460px]">
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="border-border/40 bg-card/65 shadow-2xl shadow-background/80 backdrop-blur-xl">
                <CardContent className="flex flex-col items-center gap-6 px-8 py-16">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      delay: 0.2,
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                    }}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
                  >
                    <CheckCircle2 className="h-10 w-10 text-primary" />
                  </motion.div>
                  <div className="flex flex-col items-center gap-2 text-center">
                    <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                      Account created
                    </h2>
                    <p className="text-sm text-muted-foreground">{status}</p>
                    <p className="text-xs text-muted-foreground">
                      Redirecting to sign in...
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Card className="border-border/40 bg-card/65 shadow-2xl shadow-background/80 backdrop-blur-xl">
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
                      Create your VeriPay account
                    </CardTitle>
                    <CardDescription className="text-center text-sm text-muted-foreground">
                      Get started with AI-powered invoice verification
                    </CardDescription>

                    <p className="pt-1 text-xs text-muted-foreground">
                      Step {activeStep + 1} of {steps.length}
                    </p>
                  </div>

                  {/* Progress dots */}
                  <div className="flex items-center gap-2 pt-2">
                    {steps.map((_, i) => (
                      <div
                        key={steps[i].id}
                        className={`h-1.5 rounded-full transition-all duration-500 ${completedSteps.includes(i)
                          ? "w-6 bg-primary"
                          : i === activeStep
                            ? "w-6 bg-primary/50"
                            : "w-1.5 bg-border"
                          }`}
                      />
                    ))}
                  </div>
                </CardHeader>

                <CardContent className="px-8 pb-2 pt-6">
                  <div className="flex flex-col gap-0">
                    {/* Completed steps */}
                    {completedSteps
                      .filter((i) => i < activeStep)
                      .sort((a, b) => a - b)
                      .map((stepIndex) => (
                        <motion.div
                          key={`completed-${steps[stepIndex].id}`}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center justify-between border-b border-border/30 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {steps[stepIndex].label}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEditStep(stepIndex)}
                            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                          >
                            Edit
                          </button>
                        </motion.div>
                      ))}

                    {/* Active Step */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`active-${steps[activeStep].id}`}
                        ref={(el) => {
                          stepRefs.current[activeStep] = el
                        }}
                        variants={stepVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="flex flex-col gap-4 py-5"
                      >
                        <div className="flex flex-col gap-1">
                          <Label className="text-sm font-semibold text-foreground">
                            {steps[activeStep].label}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {steps[activeStep].sublabel}
                          </p>
                        </div>

                        <StepInput
                          step={steps[activeStep]}
                          email={email}
                          setEmail={setEmail}
                          fullName={fullName}
                          setFullName={setFullName}
                          password={password}
                          setPassword={setPassword}
                          showPassword={showPassword}
                          setShowPassword={setShowPassword}
                          strength={strength}
                          confirmPassword={confirmPassword}
                          setConfirmPassword={setConfirmPassword}
                          day={day}
                          setDay={setDay}
                          month={month}
                          setMonth={setMonth}
                          year={year}
                          setYear={setYear}
                          days={days}
                          securityQuestion={securityQuestion}
                          setSecurityQuestion={setSecurityQuestion}
                          securityAnswer={securityAnswer}
                          setSecurityAnswer={setSecurityAnswer}
                          isValid={isStepValid(activeStep)}
                          onEnter={isLastStep ? handleSubmit : advanceStep}
                        />

                        {/* Action Button */}
                        <div className="flex items-center gap-3 pt-1">
                          {isLastStep ? (
                            <Button
                              onClick={handleSubmit}
                              disabled={!isStepValid(activeStep) || isSubmitting}
                              className="w-full gap-2"
                              size="lg"
                            >
                              {isSubmitting ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Creating account...
                                </>
                              ) : (
                                "Create account"
                              )}
                            </Button>
                          ) : (
                            <Button
                              onClick={advanceStep}
                              disabled={!isStepValid(activeStep)}
                              className="w-full gap-2"
                              size="lg"
                            >
                              Continue
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                      </motion.div>
                    </AnimatePresence>
                  </div>
                </CardContent>

                <CardFooter className="justify-center pb-8 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                      href="/login"
                      className="font-medium text-foreground transition-colors hover:text-foreground/80"
                    >
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )

  /* ------------------------------------------------------------------ */
  /*  Step Input Component                                               */
  /* ------------------------------------------------------------------ */

  interface StepInputProps {
    step: StepDef
    email: string
    setEmail: (v: string) => void
    fullName: string
    setFullName: (v: string) => void
    password: string
    setPassword: (v: string) => void
    showPassword: boolean
    setShowPassword: (v: boolean) => void
    strength: number
    confirmPassword: string
    setConfirmPassword: (v: string) => void
    day: string
    setDay: (v: string) => void
    month: string
    setMonth: (v: string) => void
    year: string
    setYear: (v: string) => void
    days: string[]
    securityQuestion: string
    setSecurityQuestion: (v: string) => void
    securityAnswer: string
    setSecurityAnswer: (v: string) => void
    isValid: boolean
    onEnter: () => void
  }

  function StepInput(props: StepInputProps) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        if (!props.isValid) return
        props.onEnter()
      }
    }

    switch (props.step.id) {
      case "email":
        return (
          <Input
            type="email"
            value={props.email}
            onChange={(e) => props.setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="you@veripay.io"
            className="h-12 text-base"
            autoFocus
          />
        )

      case "fullName":
        return (
          <Input
            value={props.fullName}
            onChange={(e) => props.setFullName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jordan Rivers"
            className="h-12 text-base"
            autoFocus
          />
        )

      case "password":
        return (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Input
                type={props.showPassword ? "text" : "password"}
                value={props.password}
                onChange={(e) => props.setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Create a strong password"
                className="h-12 pr-10 text-base"
                autoFocus
              />
              <button
                type="button"
                onClick={() => props.setShowPassword(!props.showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={props.showPassword ? "Hide password" : "Show password"}
              >
                {props.showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {props.password && (
              <div className="mt-3 flex flex-col gap-2">
                {/* Progress Bar */}
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strengthColors[props.strength]}`}
                    style={{ width: `${(props.strength / 5) * 100}%` }}
                  />
                </div>

                {/* Strength Label */}
                <p className="text-xs text-muted-foreground">
                  Strength:{" "}
                  <span className="font-medium">
                    {strengthLabels[props.strength]}
                  </span>
                </p>

                {/* Rules Checklist */}
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className={props.password.length >= 8 ? "text-green-600" : ""}>
                    • At least 8 characters
                  </li>
                  <li className={/[A-Z]/.test(props.password) ? "text-green-600" : ""}>
                    • Uppercase letter
                  </li>
                  <li className={/[a-z]/.test(props.password) ? "text-green-600" : ""}>
                    • Lowercase letter
                  </li>
                  <li className={/[0-9]/.test(props.password) ? "text-green-600" : ""}>
                    • Number
                  </li>
                  <li className={/[^A-Za-z0-9]/.test(props.password) ? "text-green-600" : ""}>
                    • Special character
                  </li>
                </ul>
              </div>
            )}
          </div>
        )

      case "confirmPassword":
        return (
          <div className="flex flex-col gap-2">
            <Input
              type="password"
              value={props.confirmPassword}
              onChange={(e) => props.setConfirmPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Re-enter your password"
              className="h-12 text-base"
              autoFocus
            />

            {props.confirmPassword &&
              props.confirmPassword !== props.password && (
                <p className="text-xs text-destructive">
                  Passwords do not match
                </p>
              )}

            {props.confirmPassword &&
              props.confirmPassword === props.password && (
                <p className="text-xs text-primary">
                  Passwords match ✓
                </p>
              )}
          </div>
        )

      case "dob":
        return (
          <div className="grid grid-cols-3 gap-3">
            <Select value={props.day} onValueChange={props.setDay}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                {props.days.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={props.month} onValueChange={props.setMonth}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={props.year} onValueChange={props.setYear}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )

      case "securityQuestion":
        return (
          <Select
            value={props.securityQuestion}
            onValueChange={props.setSecurityQuestion}
          >
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select a question" />
            </SelectTrigger>
            <SelectContent>
              {securityQuestions.map((q) => (
                <SelectItem key={q} value={q}>
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case "securityAnswer":
        return (
          <Input
            value={props.securityAnswer}
            onChange={(e) => props.setSecurityAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Your answer"
            className="h-12 text-base"
            autoFocus
          />
        )

      default:
        return null
    }
  }
}