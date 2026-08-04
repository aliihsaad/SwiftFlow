"use client"

import { Sparkles, MessageCircle, Mail, Users, Instagram, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AUTOMATION_TEMPLATES,
  type AutomationTemplateDefinition,
} from "@/lib/automation-templates"
import { SUPPORTED_CANVAS_TRIGGER_TYPES } from "@/types/automation-graph"

interface AutomationTemplatePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTemplate: (template: AutomationTemplateDefinition) => void
}

function getCategoryIcon(category: AutomationTemplateDefinition["category"]) {
  switch (category) {
    case "messages":
      return Mail
    case "growth":
      return Users
    default:
      return MessageCircle
  }
}

function getCategoryLabel(category: AutomationTemplateDefinition["category"]) {
  switch (category) {
    case "messages":
      return "Messages"
    case "growth":
      return "Growth"
    default:
      return "Comments"
  }
}

export function AutomationTemplatePicker({
  open,
  onOpenChange,
  onSelectTemplate,
}: AutomationTemplatePickerProps) {
  const supportedTriggers = new Set<string>(SUPPORTED_CANVAS_TRIGGER_TYPES)
  const templates = AUTOMATION_TEMPLATES.filter((template) => {
    if (!template.supportedPlatforms.includes("instagram")) return false
    const trigger = template.buildGraph().nodes.find((node) => String(node.data?.type || "").startsWith("trigger_"))
    return trigger ? supportedTriggers.has(String(trigger.data.type)) : false
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-3rem)]"
        style={{ background: "#151620", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <DialogHeader className="shrink-0 border-b border-white/5 px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-6">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-sm sm:text-base" style={{ color: "rgba(255,255,255,0.9)" }}>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.18)" }}
            >
              <Sparkles className="h-4 w-4" style={{ color: "#67e8f9" }} />
            </div>
            <span className="truncate">Automation Templates</span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed sm:text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
            Templates load ready node sets into the canvas. Select the social account, review the messages, then save when the workflow is correct.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-3 overflow-y-auto p-4 sm:gap-4 sm:p-6 md:grid-cols-2">
          {templates.map((template) => {
            const CategoryIcon = getCategoryIcon(template.category)
            return (
              <div
                key={template.id}
                className="rounded-lg p-3 transition-all sm:p-4"
                style={{
                  background: "#1b1d28",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                        style={{ background: "rgba(251,113,133,0.10)", border: "1px solid rgba(251,113,133,0.16)" }}
                      >
                        <CategoryIcon className="h-4 w-4" style={{ color: "#fda4af" }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold leading-snug sm:truncate" style={{ color: "rgba(255,255,255,0.88)" }}>
                          {template.name}
                        </h3>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="text-[10px] border-white/10 text-white/60">
                            {getCategoryLabel(template.category)}
                          </Badge>
                          <Badge variant="outline" className="border-rose-300/25 text-[10px] text-rose-200">
                            <Instagram className="h-2.5 w-2.5" />
                            Instagram
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {template.description}
                    </p>
                    {template.tags?.length ? (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {template.tags.slice(0, 4).map((tag) => (
                          <span
                            key={`${template.id}-${tag}`}
                            className="rounded-full px-2 py-0.5 text-[10px]"
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              color: "rgba(255,255,255,0.45)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <Button
                    size="sm"
                    className="h-8 w-full text-xs sm:w-auto"
                    style={{
                      background: "linear-gradient(135deg, #38bdf8, #fb7185)",
                      color: "#fff",
                      boxShadow: "0 2px 14px rgba(56,189,248,0.18)",
                    }}
                    onClick={() => onSelectTemplate(template)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Load Canvas
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
