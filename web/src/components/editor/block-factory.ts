import type { Block, BlockType, TableData } from "@/lib/types"
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
    ...(type === "gantt" ? { table: defaultGanttTable() } : {}),
    ...(type === "chart" ? { table: defaultChartTable(), language: "bar" } : {}),
    ...(type === "columns" ? { table: defaultColumnsTable() } : {}),
    ...(type === "qrcode" ? { language: "280" } : {}),
    ...(type === "barcode" ? { language: "CODE128" } : {}),
    ...(type === "form" ? { form: defaultForm() } : {}),
    ...(type === "map" ? { map: { lat: 37.7749, lng: -122.4194, zoom: 12, label: "San Francisco", provider: "mapbox" } } : {}),
  }
}
