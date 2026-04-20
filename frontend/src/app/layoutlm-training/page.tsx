"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Brain, CheckCircle2, Loader2, Play, Trash2, XCircle } from "lucide-react"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"

type DatasetSummary = {
  total_labeled: number
  ready_for_training: number
  approved_count: number
  rejected_count: number
  missing_file_count: number
  can_train: boolean
  label_mapping: Record<string, number>
}

type LayoutLMModel = {
  id: string
  source_model_id?: string
  name: string
  model_type: string
  trained_sample_count?: number | null
  approved_count?: number
  rejected_count?: number
  created_at?: string | null
  is_baseline?: boolean
  is_latest?: boolean
  is_best?: boolean
  label_source?: string
  production_ready?: boolean
  metrics?: {
    accuracy?: number
    precision_approved?: number
    recall_approved?: number
    f1_approved?: number
    evaluation_mode?: string
    train_count?: number
    test_count?: number
  } | null
}

type LayoutLMModelsResponse = {
  default_model_id?: string
  models?: LayoutLMModel[]
}

const emptySummary: DatasetSummary = {
  total_labeled: 0,
  ready_for_training: 0,
  approved_count: 0,
  rejected_count: 0,
  missing_file_count: 0,
  can_train: false,
  label_mapping: { approved: 1, rejected: 0 },
}

function StatBox({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string | number
  tone?: "default" | "approved" | "rejected"
}) {
  const toneClass =
    tone === "approved"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
      : tone === "rejected"
        ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
        : "border-border/60 bg-muted/30 text-foreground"

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-75">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "N/A"
}

function formatDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "N/A"
}

function modelKey(model: LayoutLMModel): string {
  return `${model.id}-${model.source_model_id ?? ""}`
}

function ModelTags({ model }: { model: LayoutLMModel }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {model.is_best && (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
          Best
        </span>
      )}
      {model.is_latest && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          Latest
        </span>
      )}
    </span>
  )
}

function ModelOption({ model }: { model: LayoutLMModel }) {
  return (
    <span className="flex min-h-6 items-center gap-2">
      <span>{model.name}</span>
      <ModelTags model={model} />
    </span>
  )
}

export default function LayoutLMTrainingPage() {
  const [summary, setSummary] = useState<DatasetSummary>(emptySummary)
  const [models, setModels] = useState<LayoutLMModel[]>([])
  const [iterations, setIterations] = useState(200)
  const [epochs, setEpochs] = useState(1)
  const [minSamples, setMinSamples] = useState(2)
  const [selectedModelId, setSelectedModelId] = useState("baseline_unsupervised")
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)
  const [status, setStatus] = useState("")
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null)

  const visibleModels = useMemo(() => {
    const trainedModels = models.filter((model) => !model.is_baseline)
    return trainedModels.length ? trainedModels : models
  }, [models])

  const selectedModel = useMemo(
    () =>
      visibleModels.find((model) => model.id === selectedModelId) ??
      visibleModels[0],
    [visibleModels, selectedModelId]
  )

  const loadTrainingState = useCallback(async () => {
    try {
      const [summaryRes, modelsRes] = await Promise.all([
        fetch(`${API_BASE}/layoutlm/dataset-summary`, { credentials: "include" }),
        fetch(`${API_BASE}/layoutlm/models`, { credentials: "include" }),
      ])

      if (summaryRes.ok) {
        setSummary((await summaryRes.json()) as DatasetSummary)
      }
      if (modelsRes.ok) {
        const modelData = (await modelsRes.json()) as LayoutLMModelsResponse
        const nextModels = modelData.models ?? []
        const trainedModels = nextModels.filter((model) => !model.is_baseline)
        const visibleNextModels = trainedModels.length ? trainedModels : nextModels
        const defaultModelId =
          modelData.default_model_id && visibleNextModels.some((model) => model.id === modelData.default_model_id)
            ? modelData.default_model_id
            : visibleNextModels[0]?.id
        setModels(nextModels)
        setSelectedModelId(defaultModelId ?? "baseline_unsupervised")
      }
    } catch {
      setStatus("Unable to load LayoutLMv3 training data.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTrainingState()
  }, [loadTrainingState])

  const trainModel = async () => {
    setTraining(true)
    setStatus("Training LayoutLMv3 supervised classifier...")

    try {
      const response = await fetch(`${API_BASE}/layoutlm/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          iterations,
          epochs,
          min_samples: minSamples,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const detail = data?.detail
        const msg = Array.isArray(detail)
          ? detail.map((e: { msg?: string }) => e.msg ?? String(e)).join("; ")
          : typeof detail === "string"
          ? detail
          : "Training failed."
        setStatus(msg)
        return
      }

      setStatus(`Trained ${data.model?.id ?? "new LayoutLMv3 model"}.`)
      if (data.models?.default_model_id) {
        setSelectedModelId(data.models.default_model_id)
      }
      await loadTrainingState()
    } catch {
      setStatus("Unable to reach the API.")
    } finally {
      setTraining(false)
    }
  }

  const handleDelete = async (modelId: string) => {
    if (!confirm(`Delete ${modelId}? This cannot be undone.`)) return
    setDeletingModelId(modelId)
    try {
      const res = await fetch(`${API_BASE}/layoutlm/models/${encodeURIComponent(modelId)}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setStatus(typeof data?.detail === "string" ? data.detail : "Failed to delete model.")
        return
      }
      await loadTrainingState()
    } catch {
      setStatus("Unable to reach the API.")
    } finally {
      setDeletingModelId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <Badge
          variant="secondary"
          className="w-fit text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          LayoutLMv3
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
          Model training
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Train the AI anomaly card from the latest human reviewer decisions.
          Approved invoices use label 1. Rejected invoices use label 0.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <StatBox label="Ready labels" value={summary.ready_for_training} />
        <StatBox label="Approved" value={summary.approved_count} tone="approved" />
        <StatBox label="Rejected" value={summary.rejected_count} tone="rejected" />
        <StatBox label="Missing files" value={summary.missing_file_count} />
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            Train supervised classifier
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="iterations" className="mb-2 block text-xs">
                Iterations
              </Label>
              <Input
                id="iterations"
                type="number"
                min={50}
                max={5000}
                value={iterations}
                onChange={(event) => setIterations(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="epochs" className="mb-2 block text-xs">
                Epochs
              </Label>
              <Input
                id="epochs"
                type="number"
                min={1}
                max={100}
                value={epochs}
                onChange={(event) => setEpochs(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="minSamples" className="mb-2 block text-xs">
                Minimum labels
              </Label>
              <Input
                id="minSamples"
                type="number"
                min={2}
                max={10000}
                value={minSamples}
                onChange={(event) => setMinSamples(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={trainModel}
              disabled={training || loading || !summary.can_train}
              className="gap-2"
            >
              {training ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Training...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Train model
                </>
              )}
            </Button>
            {status && (
              <span className="text-sm text-muted-foreground">{status}</span>
            )}
            {!summary.can_train && !loading && (
              <span className="text-sm text-muted-foreground">
                Add at least one approved and one rejected review.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Available LayoutLMv3 models</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,420px)_1fr]">
            <div>
              <Label htmlFor="layoutlmModelCatalog" className="mb-2 block text-xs">
                Model catalog
              </Label>
              <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                <SelectTrigger id="layoutlmModelCatalog" className="h-10">
                  <SelectValue placeholder="Select a saved LayoutLMv3 model" />
                </SelectTrigger>
                <SelectContent>
                  {visibleModels.map((model) => (
                    <SelectItem
                      key={modelKey(model)}
                      value={model.id}
                      textValue={model.name}
                    >
                      <ModelOption model={model} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Selected model
              </p>
              <p className="mt-2 break-all text-sm font-semibold text-foreground">
                {selectedModel?.name ?? "N/A"}
              </p>
              <div className="mt-3 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
                <span>Accuracy: {formatPercent(selectedModel?.metrics?.accuracy)}</span>
                <span>Labels: {selectedModel?.trained_sample_count ?? "Baseline"}</span>
                <span>Created: {formatDate(selectedModel?.created_at)}</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Labels</th>
                  <th className="py-2 pr-4">Approved</th>
                  <th className="py-2 pr-4">Rejected</th>
                  <th className="py-2 pr-4">Accuracy</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visibleModels.map((model) => (
                  <tr key={modelKey(model)}>
                    <td className="py-3 pr-4 font-medium text-foreground">
                      <div className="flex flex-col gap-1">
                        <span>{model.name}</span>
                        {model.source_model_id && (
                          <span className="break-all text-xs font-normal text-muted-foreground">
                            {model.source_model_id}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {model.trained_sample_count ?? "Baseline"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {model.approved_count ?? "N/A"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {model.rejected_count ?? "N/A"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {model.metrics?.evaluation_mode === "too_small"
                        ? <span className="text-xs text-amber-600 dark:text-amber-400">Too few samples</span>
                        : model.metrics?.accuracy !== undefined
                        ? <span title={model.metrics.evaluation_mode === "leave_one_out" ? "Leave-one-out CV (small dataset)" : model.metrics.evaluation_mode === "stratified_holdout" ? "Holdout test set" : ""}>
                            {formatPercent(model.metrics.accuracy)}
                            {model.metrics.evaluation_mode === "leave_one_out" && <span className="ml-0.5 text-[10px] text-amber-500" title="Leave-one-out CV">*</span>}
                          </span>
                        : "N/A"}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {formatDate(model.created_at)}
                    </td>
                    <td className="py-3 pr-4">
                      {model.is_baseline ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                          Baseline
                        </span>
                      ) : model.is_best || model.is_latest ? (
                        <span className="inline-flex flex-wrap gap-1">
                          {model.is_best && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              Best
                            </span>
                          )}
                          {model.is_latest && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                              <CheckCircle2 className="h-3 w-3" />
                              Latest
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                          <XCircle className="h-3 w-3" />
                          Previous
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {!model.is_baseline && (
                        <button
                          onClick={() => handleDelete(model.id)}
                          disabled={deletingModelId === model.id}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        >
                          {deletingModelId === model.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            * Accuracy marked with * uses leave-one-out cross-validation (small dataset). Accuracy without * uses a held-out test set.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
