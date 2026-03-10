"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  ShieldCheck,
  Brain,
  Lock,
  FileCheck,
  Database,
  Users,
} from "lucide-react"

export default function AboutPage() {
  return (
    <div className="relative flex flex-col gap-10">
      {/* Subtle radial glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/[0.05] blur-3xl" />

      {/* Hero Section */}
      <section className="relative flex flex-col gap-4">
        <Badge
          variant="secondary"
          className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          About VeriPay
        </Badge>

        <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
          Secure invoice verification for the AI era.
        </h1>

        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          VeriPay is a secure invoice verification platform designed to
          protect organizations from modern financial fraud in the age of
          Generative AI. As digital transactions become increasingly automated,
          the risk of forged or AI-generated invoices has grown significantly.
          VeriPay introduces a trusted verification layer that ensures invoice
          authenticity, issuer legitimacy, and payment integrity.
        </p>
      </section>

      {/* Problem & Solution */}
      <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Closing the Verification Gap
            </h2>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Traditional reimbursement systems primarily match receipts and
            purchase orders, but they often fail to confirm whether the bank
            account receiving payment truly belongs to the verified invoice
            issuer.
          </p>

          <p className="text-sm leading-relaxed text-muted-foreground">
            VeriPay addresses this critical gap by combining cryptographic
            validation, issuer–payee binding, AI-assisted document analysis,
            and immutable audit logging to deliver trusted financial workflows.
          </p>
        </CardContent>
      </Card>

      {/* Core Capabilities Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <InfoCard
          icon={FileCheck}
          title="Multi-layer Validation"
          description="Invoices undergo rule-based checks, digital signature verification (JWS), SHA-256 hashing for integrity assurance, and OCR-based content extraction."
        />
        <InfoCard
          icon={Brain}
          title="AI-Assisted Detection"
          description="Anomaly detection mechanisms flag suspicious invoices while finance officers review, approve, or reject submissions via a secure dashboard."
        />
        <InfoCard
          icon={Lock}
          title="Cryptographic Security"
          description="Each upload is cryptographically validated to ensure authenticity, issuer legitimacy, and tamper resistance."
        />
        <InfoCard
          icon={Database}
          title="Modern Architecture"
          description="Built with Next.js, FastAPI (Python), PostgreSQL with SQLAlchemy ORM, and Tesseract OCR for scalable, secure performance."
        />
        <InfoCard
          icon={ShieldCheck}
          title="Compliance-Focused"
          description="Aligned with data protection principles such as PIPEDA and GDPR to ensure responsible handling of financial data."
        />
        <InfoCard
          icon={Users}
          title="Built by Engineers"
          description="Developed by a team of computer science students dedicated to secure software engineering and trustworthy system design."
        />
      </div>

      {/* Mission Section */}
      <Card className="border-0 bg-card/65 shadow-sm backdrop-blur-xl">
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="text-sm font-semibold text-foreground">
            Our Mission
          </h2>

          <p className="text-sm leading-relaxed text-muted-foreground">
            VeriPay demonstrates how cryptography, artificial intelligence,
            and structured system design can work together to build trustworthy
            financial infrastructure in an increasingly AI-driven world.
          </p>

          <p className="text-sm leading-relaxed text-muted-foreground">
            We believe secure systems must be intentional, verifiable, and
            resilient — especially when automation and generative models are
            involved in financial decision-making.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------------- Reusable Info Card ---------------- */

function InfoCard({
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
    bg-card/65
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
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>

        <h3 className="text-sm font-semibold text-foreground">{title}</h3>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}
