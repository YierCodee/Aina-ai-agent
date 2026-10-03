import { SUGGESTED_PROMPT } from '@/data/cards'
import { Lightbulb, MoreHorizontal, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardShell, CardHeader, CardBadge, CardFooter } from '@/components/ui/card'

type SuggestedPromptCardProps = {
  onTryPrompt: () => void
}

export function SuggestedPromptCard({ onTryPrompt }: SuggestedPromptCardProps) {
  return (
    <CardShell variant="light" aria-labelledby="suggested-prompt-title">
      <div>
        <CardHeader>
          <CardBadge variant="light">
            <Lightbulb size={14} className="text-secondary" aria-hidden="true" />
            <span id="suggested-prompt-title">Suggested Prompt</span>
          </CardBadge>
          <Button
            variant="ghost"
            size="sm"
            className="size-7 px-0 rounded-full shadow-none text-text-secondary hover:bg-surface-container hover:text-text-primary"
            aria-label="Prompt options"
            aria-haspopup="menu"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </Button>
        </CardHeader>

        <blockquote
          className="font-body-md text-body-md text-text-primary leading-relaxed pt-1"
          title={SUGGESTED_PROMPT.text}
        >
          {SUGGESTED_PROMPT.text}
        </blockquote>
      </div>

      <CardFooter>
        <span className="font-label-sm text-label-sm text-text-secondary">
          {SUGGESTED_PROMPT.meta}
        </span>
        <Button variant="soft" size="sm" onClick={onTryPrompt}>
          <span>Try prompt</span>
          <Send size={12} aria-hidden="true" />
        </Button>
      </CardFooter>
    </CardShell>
  )
}
