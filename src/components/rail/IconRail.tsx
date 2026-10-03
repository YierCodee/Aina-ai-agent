import { RAIL_NAV } from "@/data/nav";
import { Moon, User } from "lucide-react";
import orbitaLogo from "@/assets/orbita-logo.jpg";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";

type IconRailProps = {
  activeId: string;
  onSelect: (id: string) => void;
  onToggleSidebar: () => void;
};

/**
 * Fixed icon navigation rail — 72px mobile, 84px desktop (md+).
 * Rail putih `surface-card`; ikon netral `text-secondary`,
 * aktif pill hitam `primary-container` + ikon `on-primary`.
 */
export function IconRail({
  activeId,
  onSelect,
  onToggleSidebar,
}: IconRailProps) {
  return (
    <aside className="fixed left-0 top-0 h-full w-[var(--rail-w)] bg-surface-card z-50 flex flex-col items-center justify-between py-5 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col items-center gap-6 w-full">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSidebar}
          aria-label="Toggle chat sidebar"
          className="flex items-center justify-center p-2 rounded-xl bg-transparent hover:bg-surface-container shadow-none transition-colors group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary w-auto h-auto px-2"
        >
          <img
            alt="Orbita 3D Sphere Logo"
            className="h-8 w-auto object-contain drop-shadow-[0_0_12px_rgba(33,112,228,0.35)]"
            src={orbitaLogo}
          />
        </Button>

        <motion.nav
          aria-label="Primary"
          layout
          className="flex flex-col items-center gap-2 w-full px-2"
        >
          {RAIL_NAV.map((item) => {
            const isActive = item.id === activeId;
            const Icon = item.icon;
            return (
              <motion.button
                key={item.id}
                onClick={() => onSelect(item.id)}
                title={item.title}
                aria-label={item.title}
                aria-current={isActive ? "page" : undefined}
                className="relative size-11 shrink-0 flex items-center justify-center rounded-xl text-text-secondary hover:bg-surface-container hover:text-text-primary transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                {isActive ? (
                  <motion.span
                    layoutId="rail-active"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl bg-primary-container shadow-md"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Icon
                  className={`relative size-[22px] ${
                    isActive ? "text-on-primary" : ""
                  }`}
                  aria-hidden="true"
                />
              </motion.button>
            );
          })}
        </motion.nav>
      </div>

      <div className="flex flex-col items-center gap-4 w-full px-2">
        <Button
          variant="ghost"
          size="sm"
          className="size-10 px-0 rounded-full bg-transparent text-text-secondary hover:bg-surface-container hover:text-text-primary shadow-none transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          aria-label="Toggle appearance theme"
        >
          <Moon className="size-5" aria-hidden="true" />
        </Button>
        <div className="relative flex items-center justify-center">
          <div className="size-8 rounded-full bg-primary flex items-center justify-center">
            <User className="text-on-primary size-[18px]" aria-hidden="true" />
          </div>
          <span className="absolute bottom-0 right-0 size-2.5 bg-success-emerald rounded-full ring-2 ring-surface-card" />
        </div>
      </div>
    </aside>
  );
}
