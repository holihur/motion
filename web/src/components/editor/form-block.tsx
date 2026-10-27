import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ClipboardList, Eye, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Block, FormData, FormField } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { uid } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const FIELD_TYPES: FormField["type"][] = ["text", "email", "number", "date", "textarea", "select", "checkbox"]

export function defaultForm(): FormData {
  return {
    title: tr("Untitled form"),
    description: "",
    submitLabel: tr("Submit"),
    fields: [
      { id: uid(), label: tr("Name"), type: "text", required: true },
      { id: uid(), label: tr("Email"), type: "email", required: true },
    ],
  }
}

export function FormBlock({
  block, pageId, readOnly, autoFocus, onUpdate,
}: {
  block: Block
  pageId: string
  readOnly: boolean
  autoFocus?: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const form = useMemo(() => block.form ?? defaultForm(), [block.form])
  const fields = form.fields ?? []
  const [editing, setEditing] = useState(autoFocus || fields.length === 0)
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const [responses, setResponses] = useState<{ id: string; values: Record<string, string>; submittedAt: string }[]>([])
  const [responsesOpen, setResponsesOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!block.form) onUpdate({ form: defaultForm() })
    if (autoFocus) titleRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id])

  function save(next: FormData) {
    onUpdate({ form: next })
  }
  function setField(index: number, patch: Partial<FormField>) {
    save({ ...form, fields: fields.map((field, i) => i === index ? { ...field, ...patch } : field) })
  }
  function addField() {
    save({ ...form, fields: [...fields, { id: uid(), label: tr("Question"), type: "text", required: false }] })
  }
  function removeField(index: number) {
    save({ ...form, fields: fields.filter((_, i) => i !== index) })
  }
  async function submit(values: Record<string, string>) {
    if (pending) return
    setPending(true)
    try {
      await api.pages.submitForm(pageId, block.id, values)
      setSubmitted(true)
      toast.success(tr("Response submitted"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not submit form"))
    } finally {
      setPending(false)
    }
  }
  async function openResponses() {
    try {
      setResponses(await api.pages.formSubmissions(pageId, block.id))
      setResponsesOpen(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not load responses"))
    }
  }

  const fieldInput = (field: FormField) => {
    if (field.type === "textarea") return <textarea name={field.id} defaultValue="" rows={3} required={field.required} className="w-full resize-y rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
    if (field.type === "select") return <select name={field.id} defaultValue="" required={field.required} className="h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none"><option value="">{tr("Choose…")}</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
    if (field.type === "checkbox") return <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={field.id} /> {field.label}</label>
    return <Input name={field.id} type={field.type} defaultValue="" required={field.required} className="h-9 text-sm" />
  }

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <ClipboardList className="size-3.5 text-brand" />
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tr("Form")}</span>
        {!readOnly && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setEditing((value) => !value)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
              {editing ? <Eye className="size-3" /> : <Pencil className="size-3" />} {editing ? tr("Preview") : tr("Edit form")}
            </button>
            <button type="button" onClick={() => void openResponses()} className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">{tr("Responses")}</button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3 p-3.5">
          <input ref={titleRef} value={form.title ?? ""} onChange={(event) => save({ ...form, title: event.target.value })} placeholder={tr("Form title")} className="h-9 w-full rounded-md border bg-background px-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
          <textarea value={form.description ?? ""} onChange={(event) => save({ ...form, description: event.target.value })} rows={2} placeholder={tr("Description (optional)")} className="w-full resize-y rounded-md border bg-background px-2.5 py-2 text-xs outline-none" />
          {fields.map((field, index) => (
            <div key={field.id} className="space-y-2 rounded-lg border p-2.5">
              <div className="flex items-center gap-2">
                <Input value={field.label} onChange={(event) => setField(index, { label: event.target.value })} placeholder={tr("Question")} className="h-8 flex-1 text-xs" />
                <select value={field.type} onChange={(event) => setField(index, { type: event.target.value as FormField["type"] })} className="h-8 rounded border bg-background px-1 text-xs">
                  {FIELD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground"><input type="checkbox" checked={field.required} onChange={(event) => setField(index, { required: event.target.checked })} /> {tr("Required")}</label>
                <button type="button" onClick={() => removeField(index)} aria-label={tr("Remove field")} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button>
              </div>
              {field.type === "select" && <Input value={(field.options ?? []).join(", ")} onChange={(event) => setField(index, { options: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder={tr("Options, comma separated")} className="h-8 text-xs" />}
            </div>
          ))}
          <button type="button" onClick={addField} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-3" /> {tr("Add field")}</button>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <div>
            <div className="text-base font-semibold">{form.title || tr("Untitled form")}</div>
            {form.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{form.description}</p>}
          </div>
          {submitted ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-4 text-sm text-emerald-700 dark:text-emerald-300"><Check className="size-4" /> {tr("Thanks! Your response has been recorded.")}</div>
          ) : (
            <form onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              const next: Record<string, string> = {}
              fields.forEach((field) => {
                const value = field.type === "checkbox" ? (data.get(field.id) ? "true" : "") : String(data.get(field.id) ?? "")
                next[field.id] = value
              })
              void submit(next)
            }} className="space-y-3">
              {fields.map((field) => (
                <label key={field.id} className="block space-y-1.5 text-xs font-medium">
                  {field.type !== "checkbox" && <span>{field.label}{field.required && <span className="text-destructive"> *</span>}</span>}
                  {fieldInput(field)}
                </label>
              ))}
              <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="size-3.5 animate-spin" />} {form.submitLabel || tr("Submit")}</Button>
            </form>
          )}
        </div>
      )}

      <Dialog open={responsesOpen} onOpenChange={setResponsesOpen}>
        <DialogContent className="max-h-[80svh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{form.title || tr("Form")} · {tr("Responses")}</DialogTitle></DialogHeader>
          {responses.length === 0 ? <p className="text-sm text-muted-foreground">{tr("No responses yet.")}</p> : (
            <div className="space-y-2">
              {responses.map((response) => (
                <div key={response.id} className="rounded-lg border p-2.5 text-xs">
                  {fields.map((field) => <div key={field.id} className="flex gap-2 py-0.5"><span className="w-32 shrink-0 text-muted-foreground">{field.label}</span><span className="whitespace-pre-wrap">{response.values[field.id] ?? "—"}</span></div>)}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
