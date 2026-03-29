"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, User, Mail, ShieldCheck, Pencil, Save, X, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type UserProfile = {
  id: number
  full_name: string
  email: string
  role?: string
  created_at?: string
  date_of_birth?: string
  security_question?: string
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [status, setStatus] = useState("")

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [day, setDay] = useState("")
  const [month, setMonth] = useState("")
  const [year, setYear] = useState("")


  const [confirmPassword, setConfirmPassword] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const { toast } = useToast()

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [securityAnswer, setSecurityAnswer] = useState("")
  const [deleting, setDeleting] = useState(false)

  const handleDeleteAccount = async () => {
    if (!securityAnswer.trim()) return

    try {
      setDeleting(true)

      const res = await fetch(`${API_BASE}/auth/delete-account?security_answer=${encodeURIComponent(securityAnswer)}`, {
        method: "DELETE",
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        toast({
          title: "Deletion failed",
          description: data?.detail || "Something went wrong",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Account deleted",
        description: "Your account has been permanently removed.",
      })

      // redirect to login
      window.location.href = "/login"

    } catch {
      toast({
        title: "Network error",
        description: "Unable to reach server",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  const [emailError, setEmailError] = useState("")


  const validateEmail = async (value: string) => {
    // basic format check
    const isValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

    if (!isValidFormat) {
      setEmailError("Invalid email format")
      return false
    }

    try {
      const res = await fetch(`${API_BASE}/auth/check-email?email=${value}`, {
        credentials: "include",
      })

      if (!res.ok) return false

      const data = await res.json()

      if (data.exists && value !== profile?.email) {
        setEmailError("Email already in use")
        return false
      }

      setEmailError("")
      return true
    } catch {
      return false
    }
  }

  const originalData = {
    full_name: profile?.full_name ?? "",
    email: profile?.email ?? "",
    date_of_birth: profile?.date_of_birth ?? "",
  }

  const currentDOB =
    year && month && day ? `${year}-${month}-${day}` : ""

  const hasChanges =
    fullName !== originalData.full_name ||
    email !== originalData.email ||
    currentDOB !== (originalData.date_of_birth ?? "")

  const isStrongPassword =
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword)

  /* ---------------- Fetch profile ---------------- */
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        })

        if (!response.ok) throw new Error()

        const data = await response.json()
        setProfile(data)
        setFullName(data.full_name)
        setEmail(data.email)

        if (data.date_of_birth) {
          const [y, m, d] = data.date_of_birth.split("-")
          setYear(y)
          setMonth(m)
          setDay(d)
        }
      } catch {
        setStatus("Unable to load profile.")
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  const currentYear = new Date().getFullYear()

  const years = Array.from(
    { length: 100 },
    (_, i) => currentYear - i
  )

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

  const getDaysInMonth = (month: string, year: string) => {
    if (!month || !year) return 31
    return new Date(Number(year), Number(month), 0).getDate()
  }

  const days = Array.from(
    { length: getDaysInMonth(month, year) },
    (_, i) => String(i + 1).padStart(2, "0")
  )


  /* ---------------- Save changes ---------------- */
  const handleSave = async () => {
    try {
      setSaving(true)

      const formattedDOB =
        year && month && day ? `${year}-${month}-${day}` : undefined

      const bodyData: any = {
        full_name: fullName,
        email,
      }

      if (formattedDOB) {
        bodyData.date_of_birth = formattedDOB
      }

      const response = await fetch(`${API_BASE}/auth/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        setStatus(errorData?.detail ?? "Update failed.")
        return
      }

      // Only parse JSON if response is OK
      const updated = await response.json()

      setProfile(updated)
      setFullName(updated.full_name)
      setEmail(updated.email)

      if (updated.date_of_birth) {
        const [y, m, d] = updated.date_of_birth.split("-")
        setYear(y)
        setMonth(m)
        setDay(d)
      }

      setEditMode(false)
      setStatus("Profile updated successfully.")

      setTimeout(() => {
        window.location.reload()
      }, 800)

    } catch (err) {
      console.error("PATCH error:", err)
      setStatus("Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const handlePasswordChange = async () => {
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
    if (!currentPassword) {
      toast({
        title: "Missing current password",
        description: "Enter your current password to continue.",
        variant: "destructive",
      })
      return
    }
    try {
      setChangingPassword(true)

      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast({
          title: "Password update failed",
          description: Array.isArray(data?.detail)
            ? data.detail.join(", ")
            : data?.detail || "Something went wrong.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      })

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      toast({
        title: "Network error",
        description: "Unable to reach the server.",
        variant: "destructive",
      })
    } finally {
      setChangingPassword(false)
    }
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

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  const formatDate = (isoDate?: string) => {
    if (!isoDate) return "Not provided"

    const [year, month, day] = isoDate.split("-")

    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    )

    return date.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <div className="relative flex flex-col gap-8">
      {/* Subtle glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-3xl" />

      {/* Hero */}
      <section className="relative flex flex-col gap-3">
        <Badge
          variant="secondary"
          className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Profile
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
          Your account profile
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Manage your personal information and account settings.
        </p>
      </section>

      {/* Profile Card */}
      <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
        <CardContent className="flex flex-col gap-6 p-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Account Information
                </p>
                <p className="text-xs text-muted-foreground">
                  Secure & verified operator profile
                </p>
              </div>
            </div>

            {!editMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditMode(true)}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditMode(false)}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>

          {/* Fields */}
          <div className="grid gap-5 md:grid-cols-2">

            {/* Full Name */}
            <div className="flex flex-col gap-2">
              <Label>Full Name</Label>
              {editMode ? (
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {profile?.full_name}
                </div>
              )}
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              {editMode ? (
                <Input
                  type="email"
                  value={email}
                  onChange={async (e) => {
                    const value = e.target.value
                    setEmail(value)
                    await validateEmail(value)
                    {
                      emailError && (
                        <p className="text-xs text-red-500">{emailError}</p>
                      )
                    }
                  }}
                />
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {profile?.email}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Date of Birth</Label>

              {editMode ? (
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Day</option>
                    {days.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Month</option>
                    {months.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Year</option>
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                  {formatDate(profile?.date_of_birth)}
                </div>
              )}
            </div>

            {/* Meta Info */}
            {profile?.created_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Account created: {profile.created_at.slice(0, 10)}
              </div>
            )}

            {/* Save button */}
            {editMode && (
              <div className="flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={
                    saving ||
                    !hasChanges ||
                    !!emailError ||
                    !fullName.trim() ||
                    !email.trim()
                  }
                  className="gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Status */}
            {status && (
              <p className="text-xs text-muted-foreground">{status}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
        <CardContent className="flex flex-col gap-6 p-6">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Change Password
            </p>
            <p className="text-xs text-muted-foreground">
              Update your account security credentials.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label>Current Password</Label>

              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10"
                />

                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
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
            </div>
            <div className="flex flex-col gap-2">
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
                  {showConfirm ? (
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
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handlePasswordChange}
              disabled={
                changingPassword ||
                !isStrongPassword ||
                !passwordsMatch ||
                !currentPassword
              }
            >
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </div>

        </CardContent>
      </Card>
      <Card className="border border-destructive/30 bg-destructive/5 shadow-sm">
        <CardContent className="flex flex-col gap-5 p-6">

          <div>
            <p className="text-sm font-semibold text-destructive">
              Delete Account
            </p>
            <p className="text-xs text-muted-foreground">
              This action is permanent. All your invoices and data will be lost.
            </p>
          </div>

          {!deleteOpen ? (
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete Account
            </Button>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Security Question
                </p>

                <div className="rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {profile?.security_question ?? "Not set"}
                </div>
              </div>

              <Input
                placeholder="Enter your answer"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
              />

              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={deleting || !securityAnswer}
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Confirm Delete"
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteOpen(false)
                    setSecurityAnswer("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}