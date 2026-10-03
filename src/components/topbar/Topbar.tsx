import { ModelSelector } from "./ModelSelector";
import { SidecarBadge } from "./SidecarBadge";
import { Menu, Settings, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type TopbarProps = {
  model: string;
  onSelectModel: (model: string) => void;
  onToggleSidebar: () => void;
  onNewChat: () => void;
};

export function Topbar({
  model,
  onSelectModel,
  onToggleSidebar,
  onNewChat,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-border-subtle bg-surface-card/80 backdrop-blur-xl">
      <div className="flex h-full w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 rounded-full px-0 text-on-surface-variant hover:bg-surface-container hover:text-on-surface md:hidden"
            aria-label="Toggle chat sidebar"
            onClick={onToggleSidebar}
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <span className="max-w-[110px] truncate text-headline-sm font-semibold tracking-tight text-text-primary min-[420px]:max-w-[140px] sm:max-w-none">
            Aina — Personal AI Agent
          </span>
          <div className="min-w-0">
            <ModelSelector model={model} onSelect={onSelectModel} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <SidecarBadge />
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-full px-0 text-on-surface-variant"
            aria-label="Configuration (segera hadir)"
            title="Configuration — segera hadir"
            disabled
          >
            <Settings className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 rounded-full px-0 text-on-surface-variant"
            aria-label="Share (segera hadir)"
            title="Share — segera hadir"
            disabled
          >
            <Share2 className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onNewChat}
            className="h-9 px-4"
            aria-label="Start a new chat"
          >
            <span className="hidden min-[420px]:inline">New Chat</span>
            <span className="min-[420px]:hidden">New</span>
            <Sparkles className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </header>
  );
}
