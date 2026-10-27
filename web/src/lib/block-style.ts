import type { BlockType } from "@/lib/types"

export type BlockColor = {
  value: string
  label: string
  swatch: string
  className: string
}

export const TEXT_COLORS: BlockColor[] = [
  { value: "default", label: "Default", swatch: "bg-foreground", className: "" },
  { value: "gray", label: "Gray", swatch: "bg-gray-500", className: "text-gray-600 dark:text-gray-300" },
  { value: "brown", label: "Brown", swatch: "bg-amber-800", className: "text-amber-800 dark:text-amber-300" },
  { value: "orange", label: "Orange", swatch: "bg-orange-500", className: "text-orange-600 dark:text-orange-400" },
  { value: "yellow", label: "Yellow", swatch: "bg-yellow-500", className: "text-yellow-700 dark:text-yellow-400" },
  { value: "green", label: "Green", swatch: "bg-green-600", className: "text-green-700 dark:text-green-400" },
  { value: "blue", label: "Blue", swatch: "bg-blue-600", className: "text-blue-700 dark:text-blue-400" },
  { value: "purple", label: "Purple", swatch: "bg-purple-600", className: "text-purple-700 dark:text-purple-400" },
  { value: "pink", label: "Pink", swatch: "bg-pink-500", className: "text-pink-700 dark:text-pink-400" },
  { value: "red", label: "Red", swatch: "bg-red-600", className: "text-red-600 dark:text-red-400" },
]

export const BACKGROUND_COLORS: BlockColor[] = [
  { value: "default", label: "Default", swatch: "border border-border bg-background", className: "" },
  { value: "gray", label: "Gray", swatch: "bg-gray-200 dark:bg-gray-700", className: "bg-gray-100/75 dark:bg-gray-800/60" },
  { value: "brown", label: "Brown", swatch: "bg-amber-200 dark:bg-amber-800", className: "bg-amber-100/70 dark:bg-amber-900/25" },
  { value: "orange", label: "Orange", swatch: "bg-orange-200 dark:bg-orange-800", className: "bg-orange-100/70 dark:bg-orange-900/25" },
  { value: "yellow", label: "Yellow", swatch: "bg-yellow-200 dark:bg-yellow-800", className: "bg-yellow-100/75 dark:bg-yellow-900/25" },
  { value: "green", label: "Green", swatch: "bg-green-200 dark:bg-green-800", className: "bg-green-100/70 dark:bg-green-900/25" },
  { value: "blue", label: "Blue", swatch: "bg-blue-200 dark:bg-blue-800", className: "bg-blue-100/70 dark:bg-blue-900/25" },
  { value: "purple", label: "Purple", swatch: "bg-purple-200 dark:bg-purple-800", className: "bg-purple-100/70 dark:bg-purple-900/25" },
  { value: "pink", label: "Pink", swatch: "bg-pink-200 dark:bg-pink-800", className: "bg-pink-100/70 dark:bg-pink-900/25" },
  { value: "red", label: "Red", swatch: "bg-red-200 dark:bg-red-800", className: "bg-red-100/70 dark:bg-red-900/25" },
]

export const TEXT_STYLE_TYPES = new Set<BlockType>([
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted",
  "numbered",
  "todo",
  "quote",
  "callout",
  "toggle",
  "toggleHeading1",
  "toggleHeading2",
  "toggleHeading3",
])

export const ALIGN_STYLE_TYPES = new Set<BlockType>([
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "quote",
  "callout",
  "toggle",
  "toggleHeading1",
  "toggleHeading2",
  "toggleHeading3",
])

function classFor(options: BlockColor[], value?: string) {
  return options.find((option) => option.value === value)?.className ?? ""
}

export function textColorClass(value?: string) {
  return classFor(TEXT_COLORS, value)
}

export function backgroundColorClass(value?: string) {
  return classFor(BACKGROUND_COLORS, value)
}

export function alignClass(value?: string) {
  if (value === "center") return "text-center"
  if (value === "right") return "text-right"
  return ""
}

export function imageWidthClass(value?: string) {
  if (value === "small") return "w-full max-w-[320px]"
  if (value === "medium") return "w-full max-w-[560px]"
  return "w-full"
}

export function imageAlignClass(value?: string) {
  if (value === "left") return "mr-auto ml-0"
  if (value === "right") return "ml-auto mr-0"
  return "mx-auto"
}
