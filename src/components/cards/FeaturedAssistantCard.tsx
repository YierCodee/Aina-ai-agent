import { FEATURED_CARD } from '@/data/cards'
import { BadgeCheck, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardShell, CardHeader, CardBadge, CardFooter } from '@/components/ui/card'

type FeaturedAssistantCardProps = {
  onLaunch: () => void
}

/** Kartu hero inverted — surface-dark #1E1E2D. */
export function FeaturedAssistantCard({ onLaunch }: FeaturedAssistantCardProps) {
  return (
    <CardShell variant="dark" aria-labelledby="featured-assistant-title">
      <div
        aria-hidden="true"
        className="absolute -right-8 -top-8 w-36 h-36 bg-secondary/30 rounded-full blur-2xl pointer-events-none group-hover:bg-secondary/45 transition-colors motion-reduce:hidden"
      />

      <div className="relative z-10 flex flex-col">
        <CardHeader>
          <CardBadge variant="dark">{FEATURED_CARD.tag}</CardBadge>
          <div className="size-8 rounded-full bg-white/10 flex items-center justify-center text-secondary-fixed">
            <BadgeCheck size={18} aria-hidden="true" />
          </div>
        </CardHeader>

        <h3
          id="featured-assistant-title"
          className="font-headline-md text-headline-md text-on-primary font-bold tracking-tight mb-2"
        >
          {FEATURED_CARD.name}
        </h3>
        <p
          className="font-body-sm text-body-sm text-secondary-fixed-dim line-clamp-3 leading-relaxed"
          title={FEATURED_CARD.description}
        >
          {FEATURED_CARD.description}
        </p>
      </div>

      <CardFooter className="relative z-10 pt-6">
        <span className="font-label-sm text-label-sm text-secondary-fixed-dim font-medium">
          {FEATURED_CARD.status}
        </span>
        <Button
          variant="primary"
          size="icon"
          onClick={onLaunch}
          aria-label="Launch Raka assistant"
          className="bg-on-primary text-text-primary hover:bg-secondary-fixed hover:text-on-secondary-fixed shadow-md group-hover:scale-105 active:scale-95 focus-visible:outline-secondary"
        >
          <ArrowRight size={20} aria-hidden="true" />
        </Button>
      </CardFooter>
    </CardShell>
  )
}
