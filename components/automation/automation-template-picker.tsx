"use client"

import { Sparkles, MessageCircle, Mail, Users, Instagram, Facebook, Plus } from "lucide-react"
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl p-0 overflow-hidden"
        style={{ background: "#0e0d1c", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5">
          <DialogTitle className="flex items-center gap-2 text-base" style={{ color: "rgba(255,255,255,0.9)" }}>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "rgba(139,92,246,0.12)" }}
            >
              <Sparkles className="h-4 w-4" style={{ color: "#a78bfa" }} />
            </div>
            Automation Templates
          </DialogTitle>
          <DialogDescription style={{ color: "rgba(255,255,255,0.45)" }}>
            Start from a prebuilt canvas workflow. After loading a template, select the account/post and review messages before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 grid gap-4 md:grid-cols-2">
          {AUTOMATION_TEMPLATES.map((template) => {
            const CategoryIcon = getCategoryIcon(template.category)
            return (
              <div
                key={template.id}
                className="rounded-xl p-4 transition-all"
                style={{
                  background: "#12111e",
                  border: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.20)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                        style={{ background: "rgba(139,92,246,0.12)" }}
                      >
                        <CategoryIcon className="h-4 w-4" style={{ color: "#a78bfa" }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.88)" }}>
                          {template.name}
                        </h3>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="text-[10px] border-white/10 text-white/60">
                            {getCategoryLabel(template.category)}
                          </Badge>
                          {template.supportedPlatforms.map((platform) => (
                            <Badge
                              key={`${template.id}-${platform}`}
                              variant="outline"
                              className={
                                platform === "instagram"
                                  ? "text-[10px] border-pink-400/20 text-pink-300"
                                  : "text-[10px] border-blue-400/20 text-blue-300"
                              }
                            >
                              {platform === "instagram" ? (
                                <Instagram className="h-2.5 w-2.5" />
                              ) : (
                                <Facebook className="h-2.5 w-2.5" />
                              )}
                              {platform}
                            </Badge>
                          ))}
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
                    className="h-8 text-xs"
                    onClick={() => onSelectTemplate(template)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Use Template
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

