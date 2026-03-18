import { AddInstanceDialog } from './AddInstanceDialog';

interface WelcomeGuideProps {
  onCreated: () => void;
}

export function WelcomeGuide({ onCreated }: WelcomeGuideProps) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-12">
      <div className="w-full max-w-lg mx-auto text-center">
        <pre className="text-[11px] leading-tight text-muted-foreground/40 font-mono select-none mb-5">{`
  _        _       _              ___                  _
 | |   ___| |__ __| |_ ___ _ _  / __| __ _ _  _ __ _ __| |
 | |__/ _ \\ '_ (_-<  _/ -_) '_| \\__ \\/ _\` | || / _\` / _\` |
 |____\\___/_.__/__/\\__\\___|_|   |___/\\__, |\\_,_\\__,_\\__,_|
                                        |_|
        `.trim()}</pre>

        <p className="text-sm text-muted-foreground mb-2">
          AI coding instance orchestration platform
        </p>
        <p className="text-xs text-muted-foreground/60 mb-8 leading-relaxed max-w-sm mx-auto">
          Connect instances or spin up sandboxes, dispatch tasks with real-time streaming, and orchestrate multi-agent teams.
        </p>

        <AddInstanceDialog onCreated={onCreated} />

        <p className="text-[11px] text-muted-foreground/40 mt-6 font-mono">
          Create your first instance to get started
        </p>
      </div>
    </div>
  );
}
