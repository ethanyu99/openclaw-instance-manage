import { useEffect, useState } from 'react';

export interface SandboxStep {
  message: string;
  done: boolean;
}

interface SandboxLoadingAnimationProps {
  steps: SandboxStep[];
}

export function SandboxLoadingAnimation({ steps }: SandboxLoadingAnimationProps) {
  const [elapsed, setElapsed] = useState(0);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCursor(v => !v), 530);
    return () => clearInterval(interval);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="rounded-md bg-[#1a1a2e] text-[#e0e0e0] font-mono text-xs p-3 mt-1 border border-[#2a2a4a]">
      <div className="flex items-center justify-between mb-2 text-[#888]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          creating sandbox
        </span>
        <span>{pad(mins)}:{pad(secs)}</span>
      </div>
      <div className="space-y-0.5">
        {steps.map((step, i) => {
          const isLast = !step.done && (i === steps.length - 1 || steps[i + 1]?.done === false);
          const isActive = !step.done && isLast;
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span className={step.done ? 'text-emerald-400' : 'text-yellow-400'}>
                {step.done ? '✓' : '›'}
              </span>
              <span className={step.done ? 'text-[#888]' : 'text-[#e0e0e0]'}>
                {step.message}{isActive && (cursor ? '█' : ' ')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
