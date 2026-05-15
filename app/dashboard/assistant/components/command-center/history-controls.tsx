'use client'

import { useState } from 'react'
import { History, RefreshCw, Trash2, X } from 'lucide-react'
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ASSISTANT_HISTORY_ACTIONS_CLASS,
  ASSISTANT_HISTORY_DELETE_DIALOG_CLASS,
  ASSISTANT_HISTORY_DIALOG_CLASS,
  ASSISTANT_HISTORY_HEADER_CLASS,
  ASSISTANT_HISTORY_ROW_CLASS,
  ASSISTANT_HISTORY_SCROLL_CLASS,
} from '@/lib/assistant/history-modal-layout'
import { ASSISTANT_TOUCH_ICON_BUTTON_CLASS } from '@/lib/assistant/mobile-control-layout'

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
  const [historyOpen, setHistoryOpen] = useState(false)

  const handleLoadSession = (id: string) => {
    onLoadSession(id)
    setHistoryOpen(false)
  }

  const handleNewChat = () => {
    onNewChat()
    setHistoryOpen(false)
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogTrigger asChild>
          <button
            className={`${ASSISTANT_TOUCH_ICON_BUTTON_CLASS} flex items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white/80`}
            title="Chat history"
            type="button"
          >
            <History className="h-3.5 w-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent showCloseButton={false} className={ASSISTANT_HISTORY_DIALOG_CLASS}>
          <div className={ASSISTANT_HISTORY_HEADER_CLASS}>
            <div className="flex items-start gap-3">
              <DialogHeader className="min-w-0 flex-1 pr-2 text-left">
                <DialogTitle className="text-base text-white/90 md:text-lg">Chat History</DialogTitle>
                <DialogDescription className="text-xs leading-relaxed text-white/50 md:text-sm">
                  Resume a previous conversation or start clean.
                </DialogDescription>
              </DialogHeader>
              <DialogClose asChild>
                <button
                  type="button"
                  className={`${ASSISTANT_TOUCH_ICON_BUTTON_CLASS} flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white/80`}
                  aria-label="Close chat history"
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogClose>
            </div>
          </div>
          <div className={ASSISTANT_HISTORY_ACTIONS_CLASS}>
            <Button
              size="sm"
              variant="outline"
              className="h-10 w-full border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white md:h-9"
              onClick={handleNewChat}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              New chat
            </Button>
          </div>
          <div className="min-h-0 px-3 pb-3 md:px-4 md:pb-4">
            <ScrollArea className={ASSISTANT_HISTORY_SCROLL_CLASS}>
              <div className="space-y-1.5">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={ASSISTANT_HISTORY_ROW_CLASS}
                    style={{
                      background: session.id === sessionId ? 'rgba(56,189,248,0.12)' : 'transparent',
                      borderColor: session.id === sessionId ? 'rgba(56,189,248,0.18)' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadSession(session.id)}
                      className="min-h-9 min-w-0 flex-1 truncate px-2 text-left text-sm text-white/70"
                    >
                      {session.title || 'Untitled Chat'}
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/35 hover:bg-red-500/10 hover:text-red-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className={ASSISTANT_HISTORY_DELETE_DIALOG_CLASS}>
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
          </div>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        className={`${ASSISTANT_TOUCH_ICON_BUTTON_CLASS} flex items-center justify-center rounded-lg border border-white/8 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white/80`}
        onClick={onNewChat}
        title="New chat"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
