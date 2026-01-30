"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type InvoiceSummary = {
  invoice_id: number;
  status: string;
  created_at: string;
};

type AnalysisResult = {
  invoice_id: number;
  file_type: string;

  crypto: {
    signature_present: boolean;
    signature_integrity: string;
    certificate_trust: string;
    signer_fingerprint: string | null;
    vendor_status?: string;
    signer_identity?: string;
  };

  ai: {
    status: string;
    message?: string;
    anomaly_score?: number;
    risk_level?: string;
    review_required?: boolean;
    embedding_distance?: number;
    distance_z_score?: number;
    explanations?: string[];
  };

  semantic: {
    invoice_number?: string | null;
    vendor_name?: string | null;
    customer_name?: string | null;
    invoice_date?: string | null;
    subtotal?: number | null;
    tax?: number | null;
    total?: number | null;
    currency?: string | null;
  } | null;

  rules: {
    status: string;
    word_count?: number;
    font_count?: number;
    line_item_count?: number;
    line_item_sum?: number | null;
    subtotal?: number | null;
    tax?: number | null;
    total?: number | null;
    checks?: {
      subtotal_matches_items?: boolean | null;
      subtotal_delta?: number | null;
      total_matches_subtotal_tax?: boolean | null;
      total_delta?: number | null;
    };
  };
};

export default function AnalysisPage() {
  const searchParams = useSearchParams();
  const presetId = searchParams.get("invoiceId");

  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [selectedId, setSelectedId] = useState(presetId ?? "");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canAnalyze = useMemo(
    () => selectedId.trim().length > 0,
    [selectedId]
  );

  useEffect(() => {
    fetch(`${API_BASE}/invoices/`)
      .then((r) => r.json())
      .then(setInvoices)
      .catch(() => setStatus("Unable to fetch invoices"));
  }, []);

  const handleAnalyze = async () => {
    if (!canAnalyze) return;

    try {
      setStatus("Running analysis...");
      setResult(null);

      const response = await fetch(
        `${API_BASE}/invoices/${selectedId}/analyze`,
        { method: "POST" }
      );

      const data = await response.json();
      if (!response.ok) {
        setStatus("Analysis failed.");
        return;
      }

      setResult(data);
      setStatus("Analysis complete.");
    } catch {
      setStatus("Unable to reach the API.");
    }
  };

  return (
     <main className="page">
      <section className="panel">
        <span className="tag">Analysis</span>
        <h1 className="title">Analyze uploaded invoices.</h1>
        <p className="subtitle">
          Select an invoice, run crypto verification, and review AI anomaly
          signals in one place.
        </p>
      </section>

      <section className="card">
        <div className="field">
          <label htmlFor="invoiceId">Invoice ID</label>
          <input
            id="invoiceId"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            placeholder="Enter invoice ID"
          />
        </div>
        <div className="field">
          <label htmlFor="invoiceList">Choose from uploads</label>
          <select
            id="invoiceList"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Select invoice</option>
            {invoices.map((invoice) => (
              <option key={invoice.invoice_id} value={invoice.invoice_id}>
                #{invoice.invoice_id} • {invoice.status} •{" "}
                {invoice.created_at?.slice(0, 10)}
              </option>
            ))}
          </select>
        </div>
        <div className="actions">
          <button className="button" type="button" onClick={handleAnalyze}>
            Run analysis
          </button>
          <span className="hint">
            PDF invoices include signature verification and AI scoring.
          </span>
        </div>
        {status ? <p className="status">{status}</p> : null}
      </section>

      {result && (
        <section className="grid analysis-grid">
          {/* 🔐 CRYPTO */}
          <article className="card">
            <h3>Cryptographic verification</h3>
            <p>Signature present: {String(result.crypto.signature_present)}</p>
            <p>Signature integrity: {result.crypto.signature_integrity}</p>
            <p>Certificate trust: {result.crypto.certificate_trust}</p>
            {result.crypto.signer_fingerprint && (
              <p className="mono">{result.crypto.signer_fingerprint}</p>
            )}
          </article>

          {/* 🤖 AI ANOMALY — UNCHANGED */}
          <article className="card">
            <h3>AI anomaly analysis</h3>

            {result.ai.status !== "ok" ? (
              <p className="status">
                {result.ai.message ?? "AI analysis unavailable."}
              </p>
            ) : (
              <div className="analysis-list">
                <div>
                  <p className="metric-label">Anomaly score</p>
                  <p className="metric-value">{result.ai.anomaly_score}</p>
                </div>
                <div>
                  <p className="metric-label">Risk level</p>
                  <p className="metric-value">{result.ai.risk_level}</p>
                </div>
                <div>
                  <p className="metric-label">Review required</p>
                  <p className="metric-value">
                    {String(result.ai.review_required)}
                  </p>
                </div>
                <div>
                  <p className="metric-label">Embedding distance</p>
                  <p className="metric-value">
                    {result.ai.embedding_distance}
                  </p>
                </div>
                <div>
                  <p className="metric-label">Distance z-score</p>
                  <p className="metric-value">
                    {result.ai.distance_z_score}
                  </p>
                </div>
              </div>
            )}

            {result.ai.explanations?.length ? (
              <ul className="analysis-notes">
                {result.ai.explanations.map((note, idx) => (
                  <li key={`${idx}-${note}`}>{note}</li>
                ))}
              </ul>
            ) : null}
          </article>

          {/* 🧠 SEMANTIC EXTRACTION */}
          <article className="card">
            <h3>Semantic extraction (LLM)</h3>

            {!result.semantic ? (
              <p className="status">No semantic data extracted</p>
            ) : (
              <div className="analysis-list">
                <p>Invoice #: {result.semantic.invoice_number ?? "N/A"}</p>
                <p>Vendor: {result.semantic.vendor_name ?? "N/A"}</p>
                <p>Customer: {result.semantic.customer_name ?? "N/A"}</p>
                <p>Date: {result.semantic.invoice_date ?? "N/A"}</p>
                <p>Subtotal: {result.semantic.subtotal ?? "N/A"}</p>
                <p>Tax: {result.semantic.tax ?? "N/A"}</p>
                <p>Total: {result.semantic.total ?? "N/A"}</p>
                <p>Currency: {result.semantic.currency ?? "N/A"}</p>
              </div>
            )}
          </article>

          {/* 📐 RULE-BASED CHECKS */}
          <article className="card">
            <h3>Rule-based checks</h3>

            <div className="analysis-list">
              <p>Word count: {result.rules.word_count ?? "N/A"}</p>
              <p>Font count: {result.rules.font_count ?? "N/A"}</p>
              <p>Line items: {result.rules.line_item_count ?? "N/A"}</p>
              <p>Line item sum: {result.rules.line_item_sum ?? "N/A"}</p>
              <p>Subtotal: {result.rules.subtotal ?? "N/A"}</p>
              <p>Tax: {result.rules.tax ?? "N/A"}</p>
              <p>Total: {result.rules.total ?? "N/A"}</p>
            </div>

            {result.rules.checks && (
              <ul className="analysis-notes">
                <li>
                  Subtotal vs items:{" "}
                  {String(result.rules.checks.subtotal_matches_items)}
                </li>
                <li>
                  Total vs subtotal+tax:{" "}
                  {String(result.rules.checks.total_matches_subtotal_tax)}
                </li>
                <li>
                  Subtotal delta: {result.rules.checks.subtotal_delta ?? "N/A"}
                </li>
                <li>
                  Total delta: {result.rules.checks.total_delta ?? "N/A"}
                </li>
              </ul>
            )}
          </article>
        </section>
      )}

      <p className="hint">
        API endpoint: <span className="mono">{API_BASE}</span>
      </p>
    </main>
  );
}
