import { useEffect, useState } from "react"

export type OnboardingStep = "page" | "slash" | "comment" | "ai"

const KEY = "motion.onboarding.progress"

export function readOnboardingProgress(): Set<OnboardingStep> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(parsed) ? (parsed.filter((item) => typeof item === "string") as OnboardingStep[]) : [])
  } catch {
    return new Set()
  }
}

export function markOnboardingStep(step: OnboardingStep) {
  if (typeof window === "undefined") return
  const progress = readOnboardingProgress()
  if (progress.has(step)) return
  progress.add(step)
  window.localStorage.setItem(KEY, JSON.stringify([...progress]))
  window.dispatchEvent(new CustomEvent("motion:onboarding-changed", { detail: [...progress] }))
}

/** Shared progress state for the home onboarding card. */
export function useOnboardingProgress() {
  const [progress, setProgress] = useState<Set<OnboardingStep>>(() => readOnboardingProgress())

  useEffect(() => {
    const update = () => setProgress(readOnboardingProgress())
    window.addEventListener("motion:onboarding-changed", update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener("motion:onboarding-changed", update)
      window.removeEventListener("storage", update)
    }
  }, [])

  return progress
}
