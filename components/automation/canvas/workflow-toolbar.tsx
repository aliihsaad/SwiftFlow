"use client"

import { ArrowLeft, Save, Power, PowerOff, Undo, Redo, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WorkflowToolbarProps {
  automationName: string
  isActive: boolean
  isSaving: boolean
  canUndo: boolean
  canRedo: boolean
  onBack: () => void
  onSave: () => void
  onToggleActive: () => void
  onUndo: () => void
  onRedo: () => void
  onAutoLayout: () => void
  onNameChange: (name: string) => void
}

export function WorkflowToolbar({
  automationName,
  isActive,
  isSaving,
  canUndo,
  canRedo,
  onBack,
  onSave,
  onToggleActive,
  onUndo,
  onRedo,
  onAutoLayout,
  onNameChange,
}: WorkflowToolbarProps) {
  return (
    <div className="flex items-center justify-between h-14 px-4 border-b border-border bg-background shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <input
          type="text"
          value={automationName}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-ring rounded px-2 py-1 w-48"
          placeholder="Automation name"
        />
      </div>

      {/* Center */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} className="h-8 w-8">
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} className="h-8 w-8">
          <Redo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onAutoLayout} className="h-8 text-xs">
          <LayoutDashboard className="h-3.5 w-3.5 mr-1" />
          Auto Layout
        </Button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <Button
          variant={isActive ? "outline" : "secondary"}
          size="sm"
          onClick={onToggleActive}
          className="h-8 text-xs"
        >
          {isActive ? (
            <>
              <Power className="h-3.5 w-3.5 mr-1 text-green-500" />
              Active
            </>
          ) : (
            <>
              <PowerOff className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              Inactive
            </>
          )}
        </Button>
        <Button size="sm" onClick={onSave} disabled={isSaving} className="h-8">
          <Save className="h-3.5 w-3.5 mr-1" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
