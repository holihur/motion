import { BookOpen, FunctionSquare, TriangleAlert } from "lucide-react"
import { tr } from "@/lib/i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const EXAMPLES: { formula: string; description: string }[] = [
  { formula: "=A1+B1", description: "Add two cells" },
  { formula: "=SUM(A1:A10)", description: "Total a range" },
  { formula: "=AVERAGE(B1:B5)", description: "Average a range" },
  { formula: "=IF(C1>=60,\"Pass\",\"Fail\")", description: "Show different text based on a condition" },
  { formula: "=ROUND(A1/B1,2)", description: "Divide and round to 2 decimals" },
  { formula: "=CONCAT(A1,\" \",B1)", description: "Join text from two cells" },
]

const FUNCTIONS: { group: string; items: string }[] = [
  { group: "Math", items: "SUM · PRODUCT · AVERAGE/AVG · MIN · MAX · MEDIAN · ABS · INT · SQRT · POWER · ROUND · ROUNDUP · ROUNDDOWN" },
  { group: "Counting", items: "COUNT · COUNTA · COUNTBLANK" },
  { group: "Logic", items: "IF · IFERROR · AND · OR · NOT · TRUE · FALSE" },
  { group: "Text", items: "CONCAT · CONCATENATE · LEN · UPPER · LOWER · TRIM · TEXT" },
]

const ERRORS: { code: string; description: string }[] = [
  { code: "#ERROR!", description: "The formula could not be parsed" },
  { code: "#REF!", description: "A cell reference is outside the table" },
  { code: "#DIV/0!", description: "Division by zero" },
  { code: "#NAME?", description: "Unknown function or name" },
  { code: "#CYCLE!", description: "Formulas refer to each other in a loop" },
  { code: "#VALUE!", description: "A value has the wrong type" },
  { code: "#NUM!", description: "The result is not a valid number" },
]

export function FormulaHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-brand" /> {tr("Formula help")}
          </DialogTitle>
          <DialogDescription>
            {tr("Use formulas in text columns to calculate values from other cells in the same table.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          <section className="rounded-xl border bg-muted/20 px-3 py-2.5">
            <div className="font-medium">{tr("Getting started")}</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-5 text-muted-foreground">
              <li>{tr("Select a text cell and type = to start a formula, or use the Formula menu below the table.")}</li>
              <li>{tr("A1 is the first data row and first column. The header row is not counted.")}</li>
              <li>{tr("Separate ranges with a colon, for example A1:B5. Use quotes for text, e.g. \"Done\".")}</li>
              <li>{tr("Formulas recalculate automatically when cells change. The table stores the calculated value for exports and published pages.")}</li>
            </ul>
          </section>

          <section>
            <div className="mb-1.5 flex items-center gap-1.5 font-medium"><FunctionSquare className="size-3.5 text-brand" /> {tr("Examples")}</div>
            <div className="overflow-hidden rounded-xl border">
              {EXAMPLES.map((item, index) => (
                <div key={item.formula} className={index > 0 ? "flex flex-wrap items-baseline gap-2 border-t px-3 py-2" : "flex flex-wrap items-baseline gap-2 px-3 py-2"}>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{item.formula}</code>
                  <span className="text-[11px] text-muted-foreground">{tr(item.description)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-1.5 font-medium">{tr("Supported functions")}</div>
            <div className="space-y-1.5 rounded-xl border px-3 py-2.5">
              {FUNCTIONS.map((group) => (
                <div key={group.group} className="flex flex-wrap items-baseline gap-2">
                  <span className="w-16 shrink-0 text-[11px] font-medium text-muted-foreground">{tr(group.group)}</span>
                  <code className="min-w-0 flex-1 font-mono text-[11px] leading-5">{group.items}</code>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-1.5 font-medium">{tr("Operators")}</div>
            <div className="rounded-xl border px-3 py-2.5 font-mono text-[11px] leading-5">+ · - · * · / · % · ^ · &amp; · = · &lt;&gt; · &lt; · &gt; · &lt;= · &gt;=</div>
          </section>

          <section>
            <div className="mb-1.5 flex items-center gap-1.5 font-medium"><TriangleAlert className="size-3.5 text-amber-500" /> {tr("Error values")}</div>
            <div className="overflow-hidden rounded-xl border">
              {ERRORS.map((item, index) => (
                <div key={item.code} className={index > 0 ? "flex gap-3 border-t px-3 py-1.5" : "flex gap-3 px-3 py-1.5"}>
                  <code className="w-20 shrink-0 font-mono text-[11px] text-destructive">{item.code}</code>
                  <span className="text-[11px] text-muted-foreground">{tr(item.description)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-5 text-amber-900 dark:text-amber-100">
            {tr("Formulas are values, not stored as expressions in exports. Keep a source column if you need to edit the calculation later.")}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
