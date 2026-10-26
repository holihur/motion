import type { Block, BlockType } from "@/lib/types"
import { uid } from "@/lib/utils"

export interface PageTemplate {
  id: string
  title: string
  description: string
  icon: string
  gradient: string
  blocks: () => Block[]
}

function block(type: BlockType, text: string, extra: Partial<Block> = {}): Block {
  return { id: uid(), type, text, checked: false, ...extra }
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "meeting",
    title: "Meeting notes",
    description: "Agenda, decisions and action items in one place.",
    icon: "🗓️",
    gradient: "from-sky-500/12 to-indigo-500/10",
    blocks: () => [
      block("callout", "Date: \nAttendees: \nFacilitator: ", { color: "blue" }),
      block("heading2", "Agenda"),
      block("bulleted", "Context and goals"),
      block("bulleted", "Open questions"),
      block("heading2", "Decisions"),
      block("paragraph", "Capture the decisions, not the whole discussion."),
      block("heading2", "Action items"),
      block("todo", "Owner · due date · next step"),
      block("todo", "Follow up with the team"),
    ],
  },
  {
    id: "project",
    title: "Project brief",
    description: "A one-page north star for the team.",
    icon: "🚀",
    gradient: "from-violet-500/12 to-fuchsia-500/10",
    blocks: () => [
      block("callout", "One sentence: what are we building, for whom, and why now?", { color: "amber" }),
      block("heading2", "Problem"),
      block("paragraph", "What is painful today?"),
      block("heading2", "Outcome"),
      block("paragraph", "What will be true when this succeeds?"),
      block("heading2", "Scope"),
      block("bulleted", "In scope"),
      block("bulleted", "Out of scope"),
      block("heading2", "Milestones"),
      block("table", "", {
        table: {
          columns: ["Milestone", "Owner", "Date"],
          rows: [["Research", "", ""], ["Beta", "", ""], ["Launch", "", ""]],
          header: true,
        },
      }),
      block("heading2", "Risks"),
      block("paragraph", "What could stop us? What is the mitigation?"),
    ],
  },
  {
    id: "weekly",
    title: "Weekly review",
    description: "Reflect, reset and choose next week's focus.",
    icon: "🧭",
    gradient: "from-emerald-500/12 to-teal-500/10",
    blocks: () => [
      block("heading2", "Wins"),
      block("bulleted", "What moved forward?"),
      block("heading2", "Lessons"),
      block("bulleted", "What did we learn?"),
      block("heading2", "Blockers"),
      block("bulleted", "What needs help?"),
      block("heading2", "Next week"),
      block("todo", "One outcome that matters most"),
      block("todo", "One thing to stop doing"),
    ],
  },
  {
    id: "reading",
    title: "Reading list",
    description: "Collect sources and turn them into notes.",
    icon: "📚",
    gradient: "from-amber-500/12 to-orange-500/10",
    blocks: () => [
      block("callout", "Add links, then write one sentence about why each source matters.", { color: "amber" }),
      block("heading2", "To read"),
      block("bulleted", "Title — link — why it matters"),
      block("heading2", "Notes"),
      block("paragraph", "Write a short summary after each reading session."),
      block("heading2", "Quotes"),
      block("quote", "A line worth keeping."),
    ],
  },
]

export function templateBlocks(template: PageTemplate): Block[] {
  return template.blocks()
}
