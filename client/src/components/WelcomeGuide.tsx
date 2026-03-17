import { AddInstanceDialog } from './AddInstanceDialog';

interface WelcomeGuideProps {
  onCreated: () => void;
}

export function WelcomeGuide({ onCreated }: WelcomeGuideProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-6">
      <div className="w-full max-w-2xl mx-auto text-center">
        <pre className="text-[11px] leading-tight text-muted-foreground/50 font-mono select-none mb-4">{`
  _        _       _              ___                  _
 | |   ___| |__ __| |_ ___ _ _  / __| __ _ _  _ __ _ __| |
 | |__/ _ \\ '_ (_-<  _/ -_) '_| \\__ \\/ _\` | || / _\` / _\` |
 |____\\___/_.__/__/\\__\\___|_|   |___/\\__, |\\_,_\\__,_\\__,_|
                                        |_|
        `.trim()}</pre>

        <p className="text-sm text-muted-foreground mb-6">
          AI coding instance orchestration platform
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 font-mono text-xs">
          <div className="bg-card border border-border/60 rounded-lg px-3 py-3 text-left">
            <div className="text-primary font-semibold mb-1">01 <span className="text-foreground">Connect</span></div>
            <div className="text-muted-foreground leading-snug">Add an instance or spin up a sandbox</div>
          </div>
          <div className="bg-card border border-border/60 rounded-lg px-3 py-3 text-left opacity-60">
            <div className="text-primary font-semibold mb-1">02 <span className="text-foreground">Dispatch</span></div>
            <div className="text-muted-foreground leading-snug">Send tasks, stream output in real-time</div>
          </div>
          <div className="bg-card border border-border/60 rounded-lg px-3 py-3 text-left opacity-60">
            <div className="text-primary font-semibold mb-1">03 <span className="text-foreground">Collaborate</span></div>
            <div className="text-muted-foreground leading-snug">Multi-agent teams: PM, Dev, QA</div>
          </div>
        </div>

        <AddInstanceDialog onCreated={onCreated} />
      </div>
    </div>
  );
}
