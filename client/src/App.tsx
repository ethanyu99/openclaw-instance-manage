import { useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'sonner';
import { StatusBar } from '@/components/StatusBar';
import { InstanceCard } from '@/components/InstanceCard';
import { AddInstanceDialog } from '@/components/AddInstanceDialog';
import { TaskInput } from '@/components/TaskInput';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { CreateTeamDialog } from '@/components/CreateTeamDialog';
import { TeamCard } from '@/components/TeamCard';
import { ExecutionPanel } from '@/components/ExecutionPanel';
import { ExecutionReportDialog } from '@/components/ExecutionReportDialog';
import { ShareView } from '@/components/ShareView';
import { WelcomeGuide } from '@/components/WelcomeGuide';
import { ChatPanel } from '@/components/ChatPanel';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { useInstanceStore } from '@/stores/instanceStore';
import { useExecutionStore } from '@/stores/executionStore';
import { useTeamStore } from '@/stores/teamStore';
import { useWSStore } from '@/stores/wsStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ExecutionHistory } from '@/hooks/types';
import type { InstancePublic } from '@shared/types';

type ViewTab = 'instances' | 'teams';

function getShareToken(): string | null {
  const match = window.location.pathname.match(/^\/share\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const LOADING_FRAMES = [
  `  _        _       _              ___                  _
 | |   ___| |__ __| |_ ___ _ _  / __| __ _ _  _ __ _ __| |
 | |__/ _ \\ '_ (_-<  _/ -_) '_| \\__ \\/ _\` | || / _\` / _\` |
 |____\\___/_.__/__/\\__\\___|_|   |___/\\__, |\\_,_\\__,_\\__,_|
                                        |_|`,
];

function LoadingScreen() {
  const [dots, setDots] = useState('');
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const dotTimer = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    const cursorTimer = setInterval(() => setCursor(c => !c), 530);
    return () => { clearInterval(dotTimer); clearInterval(cursorTimer); };
  }, []);

  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20">
      <pre className="text-[11px] leading-tight text-muted-foreground/30 font-mono select-none mb-6 transition-opacity duration-500">
        {LOADING_FRAMES[0]}
      </pre>
      <div className="font-mono text-xs text-muted-foreground/60 flex items-center gap-1">
        <span className="text-primary/60">$</span>
        <span>loading instances{dots}</span>
        <span className={`${cursor ? 'opacity-100' : 'opacity-0'} transition-opacity text-primary/60`}>█</span>
      </div>
    </div>
  );
}

function LoginPage() {
  const { handleGoogleLogin, loading } = useAuth();
  const [error, setError] = useState('');
  const [processingRedirect, setProcessingRedirect] = useState(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return false;
    const params = new URLSearchParams(hash.substring(1));
    return !!params.get('access_token');
  });

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    if (!accessToken) return;

    window.history.replaceState(null, '', window.location.pathname);

    handleGoogleLogin(accessToken, 'access_token')
      .catch(() => setError('Login failed, please try again'))
      .finally(() => setProcessingRedirect(false));
  }, [handleGoogleLogin]);

  const startGoogleLogin = () => {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: window.location.origin,
      response_type: 'token',
      scope: 'openid email profile',
      prompt: 'select_account',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  const isLoading = loading || processingRedirect;

  return (
    <div className="h-screen flex items-center justify-center bg-[#f8f9fa] dark:bg-[#0d1117]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm mx-auto px-6">
        <div className="bg-card rounded-2xl border border-border/80 shadow-lg p-8 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <img src="/favicon.svg" alt="Lobster Squad" className="w-8 h-8" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">Lobster Squad</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-8">Sign in to manage your instances</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-center">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </div>
            ) : (
              <button
                type="button"
                onClick={startGoogleLogin}
                className="flex items-center gap-3 px-6 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-sm font-medium text-foreground shadow-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/60 mt-6 leading-relaxed">
            Your existing instances and data will be preserved after sign-in.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const shareToken = getShareToken();
  if (shareToken) {
    return <ShareView token={shareToken} />;
  }

  if (!GOOGLE_CLIENT_ID) {
    return <MainApp />;
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthGate />
    </GoogleOAuthProvider>
  );
}

function AuthGate() {
  const { isLoggedIn, validating } = useAuth();

  if (validating) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8f9fa] dark:bg-[#0d1117]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  return <MainApp />;
}

function MainApp() {
  // ── Store subscriptions ──
  const instances = useInstanceStore(s => s.instances);
  const loaded = useInstanceStore(s => s.loaded);
  const stats = useInstanceStore(s => s.stats);
  const setNotifyCallback = useInstanceStore(s => s.setNotifyCallback);
  const refreshInstances = useInstanceStore(s => s.loadInstances);
  const taskStreams = useInstanceStore(s => s.taskStreams);

  const executionLogs = useExecutionStore(s => s.executionLogs);
  const executions = useExecutionStore(s => s.executions);

  const teams = useTeamStore(s => s.teams);
  const loadTeams = useTeamStore(s => s.loadTeams);

  const connected = useWSStore(s => s.connected);
  const initWS = useWSStore(s => s.init);
  const dispatchTask = useWSStore(s => s.dispatchTask);
  const dispatchTeamTask = useWSStore(s => s.dispatchTeamTask);

  const { notify, enabled: notifEnabled, toggleEnabled: toggleNotif, supported: notifSupported } = useNotification();

  // ── Initialize WebSocket + load data ──
  useEffect(() => {
    const cleanup = initWS();
    loadTeams();
    return cleanup;
  }, [initWS, loadTeams]);

  useEffect(() => {
    setNotifyCallback(notify);
  }, [notify, setNotifyCallback]);

  // ── Local UI state ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('instances');
  const [selectedAutoExecution, setSelectedAutoExecution] = useState<ExecutionHistory | null>(null);
  const [autoExecDetailOpen, setAutoExecDetailOpen] = useState(false);
  const [chatTargetIds, setChatTargetIds] = useState<string[]>([]);



  // Chat panel: active instances being chatted with
  const chatInstances = chatTargetIds.map(id => instances.find(i => i.id === id)).filter(Boolean) as InstancePublic[];
  const chatBusy = chatInstances.some(i => i.status === 'busy' && i.currentTask?.status === 'running');

  const handleTeamRefresh = () => {
    loadTeams();
    refreshInstances();
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fa] dark:bg-[#0d1117] text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      <StatusBar
        stats={stats}
        instances={instances}
        connected={connected}
        onHistoryClick={() => setHistoryOpen(true)}
        notifSupported={notifSupported}
        notifEnabled={notifEnabled}
        onToggleNotif={toggleNotif}
      />

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="h-full flex flex-col relative z-10">
          <div className="px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-0.5 border border-border/50">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-all ${
                  activeTab === 'instances'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('instances')}
              >
                Instances ({instances.length})
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-all ${
                  activeTab === 'teams'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('teams')}
              >
                Teams ({teams.length})
              </button>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'instances' ? (
                <AddInstanceDialog onCreated={refreshInstances} />
              ) : (
                <CreateTeamDialog onCreated={handleTeamRefresh} />
              )}
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0 px-2">
            {activeTab === 'instances' ? (
              <div className="p-4 pt-2 grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {!loaded ? (
                  <LoadingScreen />
                ) : instances.length === 0 ? (
                  <WelcomeGuide onCreated={refreshInstances} />
                ) : (
                  instances.map(inst => (
                    <InstanceCard
                      key={inst.id}
                      instance={inst}
                      onRefresh={refreshInstances}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="p-6 pt-2 grid gap-6 grid-cols-1 lg:grid-cols-2">
                {teams.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-6">
                    <div className="w-full max-w-2xl mx-auto text-center">
                      <pre className="text-[11px] leading-tight text-muted-foreground/50 font-mono select-none mb-4">{`
 _____ ___   _   __  __
|_   _| __| /_\\ |  \\/  |___
  | | | _| / _ \\| |\\/| (_-<
  |_| |___/_/ \\_\\_|  |_/__/
                      `.trim()}</pre>

                      <p className="text-sm text-muted-foreground mb-6">
                        Multi-agent orchestration with roles and collaboration
                      </p>

                      <div className="grid grid-cols-3 gap-3 mb-6 font-mono text-xs">
                        <div className="bg-card border border-border/60 rounded-lg px-3 py-3 text-left">
                          <div className="text-primary font-semibold mb-1">01 <span className="text-foreground">Define</span></div>
                          <div className="text-muted-foreground leading-snug">Create a team with roles: PM, Dev, QA</div>
                        </div>
                        <div className="bg-card border border-border/60 rounded-lg px-3 py-3 text-left">
                          <div className="text-primary font-semibold mb-1">02 <span className="text-foreground">Bind</span></div>
                          <div className="text-muted-foreground leading-snug">Assign instances to each role</div>
                        </div>
                        <div className="bg-card border border-border/60 rounded-lg px-3 py-3 text-left">
                          <div className="text-primary font-semibold mb-1">03 <span className="text-foreground">Execute</span></div>
                          <div className="text-muted-foreground leading-snug">Dispatch goals, agents collaborate automatically</div>
                        </div>
                      </div>

                      <CreateTeamDialog onCreated={handleTeamRefresh} />
                    </div>
                  </div>
                ) : (
                  teams.map(team => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      instances={instances}
                      onRefresh={handleTeamRefresh}
                    />
                  ))
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {executionLogs.length > 0 && (
        <ExecutionPanel
          onViewDetail={(exec: ExecutionHistory) => {
            setSelectedAutoExecution(exec);
            setAutoExecDetailOpen(true);
          }}
        />
      )}

      {/* Inline chat panel — above TaskInput */}
      {chatInstances.length > 0 && (
        <div className="border-t border-border/40 bg-card/80 px-6 py-3 shrink-0" style={{ maxHeight: 'clamp(220px, 35vh, 420px)' }}>
          <ChatPanel instances={chatInstances} taskStreams={taskStreams} onClose={() => setChatTargetIds([])} />
        </div>
      )}

      <TaskInput
        instances={instances}
        teams={teams}
        onDispatch={dispatchTask}
        onTeamDispatch={dispatchTeamTask}
        onChatStart={(ids) => setChatTargetIds(ids)}
        disabled={chatBusy}
      />

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        executions={executions}
        onViewExecution={(exec) => {
          setSelectedAutoExecution(exec);
          setAutoExecDetailOpen(true);
        }}
      />

      <ExecutionReportDialog
        execution={selectedAutoExecution}
        open={autoExecDetailOpen}
        onOpenChange={setAutoExecDetailOpen}
      />

      <Toaster
        position="bottom-right"
        closeButton
        toastOptions={{
          className: 'font-mono text-xs !rounded-lg !border-border/60 !shadow-lg',
          style: { fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: '12px' },
        }}
        gap={6}
      />
    </div>
  );
}
