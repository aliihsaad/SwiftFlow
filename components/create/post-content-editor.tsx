import { Platform } from "@/types/post"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Wand2, Smile, Hash, AtSign, Bold, Italic, Link, BarChart3, RefreshCw } from "lucide-react"

interface PostContentEditorProps {
    content: string
    activeTab: Platform | 'all'
    onChange: (content: string) => void
    onRewrite: () => void
    isRewriting?: boolean
}

const SUGGESTED_HASHTAGS = [
    "#OpenSource", "#CommunityImpact", "#SkillDevelopment", "#CareerGrowth", "#TechTrends"
]

export function PostContentEditor({
    content,
    activeTab,
    onChange,
    onRewrite,
    isRewriting = false
}: PostContentEditorProps) {
    return (
        <div className="space-y-4">
            <div className="relative border rounded-xl overflow-hidden bg-muted/20 focus-within:bg-background focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <Textarea
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="If you only do ONE thing this week..."
                    className="min-h-[180px] resize-none border-0 focus-visible:ring-0 bg-transparent text-lg p-6 leading-relaxed"
                />

                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-t">
                    <div className="flex items-center gap-1 text-muted-foreground">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background hover:text-foreground rounded-lg">
                            <Smile className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-4 bg-border/50 mx-1" />
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background hover:text-foreground rounded-lg">
                            <Bold className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background hover:text-foreground rounded-lg">
                            <Italic className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background hover:text-foreground rounded-lg">
                            <Link className="h-4 w-4" />
                        </Button>
                        <div className="w-px h-4 bg-border/50 mx-1" />
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background hover:text-foreground rounded-lg">
                            <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 hover:bg-background hover:text-purple-500 rounded-lg ${isRewriting ? 'animate-pulse text-purple-500' : ''}`}
                            onClick={onRewrite}
                        >
                            <Wand2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <span className={`text-xs font-mono font-medium px-2 py-1 rounded-md ${content.length > 200 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>
                        {content.length}
                    </span>
                </div>
            </div>

            {/* Suggested Hashtags */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Suggested Hashtags <RefreshCw className="h-3 w-3 cursor-pointer hover:text-foreground transition-colors" />
                </div>
                <div className="flex flex-wrap gap-2">
                    {SUGGESTED_HASHTAGS.map(tag => (
                        <button
                            key={tag}
                            onClick={() => onChange(content + (content ? " " : "") + tag)}
                            className="bg-muted/50 hover:bg-muted text-xs px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-all"
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}
