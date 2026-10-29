import { tr } from "@/lib/i18n"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function ProfileSection({ name, setName, onSave }: { name: string; setName: (v: string) => void; onSave: () => void }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{tr("Profile")}</div>
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Display name")} className="h-8 flex-1" />
        <Button size="sm" onClick={onSave}>{tr("Save")}</Button>
      </div>
    </div>
  )
}

export function AppearanceSection({ theme, setTheme }: { theme: string; setTheme: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{tr("Appearance")}</div>
      <select value={theme} onChange={(e) => setTheme(e.target.value)} className="h-8 rounded border bg-background px-2 text-xs">
        <option value="light">{tr("Light")}</option>
        <option value="dark">{tr("Dark")}</option>
        <option value="system">{tr("System")}</option>
      </select>
    </div>
  )
}
