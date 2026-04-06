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
    <div
      className="flex items-center justify-between h-14 px-4 shrink-0"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#151620' }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.72)' }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <input
          type="text"
          value={automationName}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-sm font-medium bg-transparent border-none outline-none rounded px-2 py-1 w-48"
          style={{ color: 'rgba(255,255,255,0.85)' }}
          placeholder="Automation name"
        />
      </div>

      {/* Center */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onUndo} disabled={!canUndo} className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.68)' }}>
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} disabled={!canRedo} className="h-8 w-8" style={{ color: 'rgba(255,255,255,0.68)' }}>
          <Redo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAutoLayout}
          className="h-8 text-xs"
          style={{ background: '#1b1d28', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.72)' }}
        >
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
          style={{
            background: isActive ? 'rgba(74,222,128,0.10)' : '#1b1d28',
            borderColor: isActive ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)',
            color: isActive ? '#86efac' : 'rgba(255,255,255,0.7)',
          }}
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
        <Button
          size="sm"
          onClick={onSave}
          disabled={isSaving}
          className="h-8"
          style={{ background: 'linear-gradient(135deg, #38bdf8, #fb7185)', color: '#fff', boxShadow: '0 2px 14px rgba(56,189,248,0.18)' }}
        >
          <Save className="h-3.5 w-3.5 mr-1" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
