'use client'

import { History, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AssistantSessionSummary {
  id: string
  title: string
}

interface AssistantHistoryControlsProps {
  sessions: AssistantSessionSummary[]
  sessionId: string | null
  onLoadSession: (id: string) => void
  onNewChat: () => void
  onDeleteSession: (id: string) => void
}

export function AssistantHistoryControls({
  sessions,
  sessionId,
  onLoadSession,
  onNewChat,
  onDeleteSession,
}: AssistantHistoryControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
            title="Chat history"
            type="button"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] border-white/10 bg-[#151620] text-white/85 sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-white/90">Chat History</DialogTitle>
            <DialogDescription className="text-white/50">
              Resume a previous conversation or start clean.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
              onClick={onNewChat}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              New chat
            </Button>
          </div>
          <ScrollArea className="h-[min(52vh,360px)] pr-3">
            <div className="space-y-1.5">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border px-2 py-1.5"
                  style={{
                    background: session.id === sessionId ? 'rgba(56,189,248,0.12)' : 'transparent',
                    borderColor: session.id === sessionId ? 'rgba(56,189,248,0.18)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onLoadSession(session.id)}
                    className="min-w-0 flex-1 truncate px-2 text-left text-sm text-white/70"
                  >
                    {session.title || 'Untitled Chat'}
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-white/35 hover:bg-red-500/10 hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-white/10 bg-[#1b1d28] text-white/85">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white/90">Delete this chat?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/50">
                          This removes the saved conversation history.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDeleteSession(session.id)}
                          className="border border-red-500/25 bg-red-500/15 text-red-300 hover:bg-red-500/20"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="py-10 text-center text-sm text-white/25">
                  No chat history yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
        onClick={onNewChat}
        title="New chat"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
