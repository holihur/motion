import type { Block, BlockType, TableData } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { uid } from "@/lib/utils"
import { defaultChartTable, defaultGanttTable } from "@/components/editor/data-blocks"
import { defaultColumnsTable } from "@/components/editor/link-blocks"
import { defaultForm } from "@/components/editor/form-block"

const DEFAULT_DIAGRAM = `flowchart LR
  Idea[Idea] --> Draft[Draft]
  Draft --> Review{Review}
  Review -->|Yes| Ship[Ship it]
  Review -->|No| Draft`

export function createBlock(type: BlockType = "paragraph"): Block {
  return {
    id: uid(),
    type,
    text: type === "diagram" ? DEFAULT_DIAGRAM : "",
    checked: false,
    ...(type === "code" ? { language: "auto" } : {}),
    ...(type === "callout" ? { color: "amber" } : {}),
    ...(type === "table"
      ? {
          table: {
            columns: ["Column 1", "Column 2", "Column 3"],
            rows: [["", "", ""], ["", "", ""]],
            header: true,
          },
        }
      : {}),
    ...(type === "database"
      ? {
          database: {
            columns: [
              { id: "c1", name: "Name", type: "text" as const, width: 200 },
              { id: "c2", name: "Status", type: "status" as const, options: ["Todo", "Doing", "Done"] },
              { id: "c3", name: "Due", type: "date" as const },
            ],
            rows: [{ c1: "Task 1", c2: "Todo", c3: "" }],
            viewMode: "table" as const,
          },
        }
      : {}),
    ...(type === "jsonVisual"
      ? {
          text: JSON.stringify(
            {
              direction: "LR",
              nodes: [
                { id: "start", label: tr("Start"), x: 100, y: 220, color: "blue", shape: "ellipse" },
                { id: "step", label: tr("Double-click to rename"), x: 320, y: 220, color: "violet", shape: "rect" },
                { id: "check", label: tr("Condition?"), x: 540, y: 220, color: "amber", shape: "diamond" },
              ],
              edges: [
                { from: "start", to: "step" },
                { from: "step", to: "check", label: tr("Next") },
              ],
            },
            null,
            2,
          ),
        }
      : {}),
    ...(type === "gantt" ? { table: defaultGanttTable() } : {}),
    ...(type === "chart" ? { table: defaultChartTable(), language: "bar" } : {}),
    ...(type === "columns" ? { table: defaultColumnsTable() } : {}),
    ...(type === "qrcode" ? { language: "280" } : {}),
    ...(type === "barcode" ? { language: "CODE128" } : {}),
    ...(type === "form" ? { form: defaultForm() } : {}),
    ...(type === "map" ? { map: { lat: 37.7749, lng: -122.4194, zoom: 12, label: "San Francisco", provider: "mapbox" } } : {}),
  }
}
