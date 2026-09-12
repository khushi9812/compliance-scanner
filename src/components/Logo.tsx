import { cn } from "@/lib/utils";

/**
 * MetroScan mark: a scan-line over a stamped seal — evokes metrology
 * verification stamps without any external asset.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-md border-2 border-primary bg-primary/5 text-primary",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[60%]"
      >
        <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
        <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
        <path d="M2 12h20" strokeDasharray="3 2.2" />
      </svg>
    </span>
  );
}
