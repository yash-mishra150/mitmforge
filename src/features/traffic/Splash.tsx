import { Globe, Loader2 } from "lucide-react";

/** Full-screen startup splash; fades out (stays mounted, pointer-events-none) when hidden. */
export function Splash({ show }: { show: boolean }) {
  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-app/70 backdrop-blur-xl transition-opacity duration-500 ${
        show ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 rounded-2xl bg-accent/10 animate-pulse" />
        <span className="absolute inset-0 rounded-2xl border border-accent/20" />
        <Globe className="h-9 w-9 text-accent" />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight text-fg">mitmforge</h1>
        <p className="mt-1 text-xs text-muted">Starting things up — intercepting on 127.0.0.1:8080</p>
      </div>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-line">
        <div className="h-full w-1/2 rounded-full bg-accent animate-[splash-slide_1.2s_ease-in-out_infinite]" />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        booting engine…
      </div>
    </div>
  );
}