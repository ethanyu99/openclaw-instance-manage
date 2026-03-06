import { useState, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { StatusBar } from '@/components/StatusBar';
import { InstanceCard } from '@/components/InstanceCard';
import { AddInstanceDialog } from '@/components/AddInstanceDialog';
import { TaskInput } from '@/components/TaskInput';
import { HistoryDrawer } from '@/components/HistoryDrawer';
import { CreateTeamDialog } from '@/components/CreateTeamDialog';
import { TeamCard } from '@/components/TeamCard';
import { TeamExecutionDetailDialog } from '@/components/TeamExecutionDetailDialog';
import { ExecutionPanel } from '@/components/ExecutionPanel';
import { ExecutionReportDialog } from '@/components/ExecutionReportDialog';
import { ShareView } from '@/components/ShareView';
import { useInstanceManager, type ExecutionHistory } from '@/hooks/useInstanceManager';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchTeams } from '@/lib/api';
import type { TeamPublic } from '@shared/types';
import type { TeamExecutionHistory } from '@/lib/storage';

type ViewTab = 'instances' | 'teams';

function getShareToken(): string | null {
  const match = window.location.pathname.match(/^\/share\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function LoginPage() {
  const { handleGoogleLogin, loading } = useAuth();
  const [error, setError] = useState('');

  return (
    <div className="h-screen flex items-center justify-center bg-[#f8f9fa]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm mx-auto px-6">
        <div className="bg-card rounded-2xl border border-border/80 shadow-lg p-8 text-center">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <img src="/favicon.svg" alt="Lobster Squad" className="w-8 h-8" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">Lobster Squad</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-8">Sign in to manage your instances</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-center">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </div>
            ) : (
              <GoogleLogin
                onSuccess={(res) => {
                  if (res.credential) {
                    handleGoogleLogin(res.credential).catch(() => setError('Login failed, please try again'));
                  }
                }}
                onError={() => setError('Google login failed, please try again')}
                size="large"
                theme="outline"
                shape="rectangular"
                text="signin_with"
                width="300"
              />
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
      <div className="h-screen flex items-center justify-center bg-[#f8f9fa]">
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
  const {
    instances, stats, taskStreams, connected,
    dispatchTask, dispatchTeamTask,
    cancelTask, cancelExecution,
    teamExecutions,
    refreshInstances,
    executionLogs, executionStreams, executions, activeExecution,
    clearExecutionLogs,
    setNotifyCallback,
  } = useInstanceManager();
  const { notify, enabled: notifEnabled, toggleEnabled: toggleNotif, supported: notifSupported } = useNotification();

  useEffect(() => {
    setNotifyCallback(notify);
  }, [notify, setNotifyCallback]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('instances');
  const [teams, setTeams] = useState<TeamPublic[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<TeamExecutionHistory | null>(null);
  const [executionDetailOpen, setExecutionDetailOpen] = useState(false);
  const [selectedAutoExecution, setSelectedAutoExecution] = useState<ExecutionHistory | null>(null);
  const [autoExecDetailOpen, setAutoExecDetailOpen] = useState(false);

  const loadTeams = useCallback(async () => {
    try {
      const data = await fetchTeams();
      setTeams(data.teams);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const handleTeamRefresh = useCallback(() => {
    loadTeams();
    refreshInstances();
  }, [loadTeams, refreshInstances]);

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fa] text-foreground font-sans selection:bg-primary/20 selection:text-primary">
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
              <div className="p-6 pt-2 grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {instances.length === 0 ? (
                  <div className="col-span-full text-center py-32 text-muted-foreground bg-card/50 rounded-xl border border-dashed border-border/60 backdrop-blur-sm">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <span className="text-2xl">⚡️</span>
                    </div>
                    <p className="text-xl font-semibold mb-2 text-foreground/80">No instances configured</p>
                    <p className="text-sm">Add an instance to get your Lobster Squad started</p>
                  </div>
                ) : (
                  instances.map(inst => (
                    <InstanceCard
                      key={inst.id}
                      instance={inst}
                      taskStream={taskStreams[inst.id]}
                      onRefresh={refreshInstances}
                      onCancelTask={cancelTask}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="p-6 pt-2 grid gap-6 grid-cols-1 lg:grid-cols-2">
                {teams.length === 0 ? (
                  <div className="col-span-full text-center py-32 text-muted-foreground bg-card/50 rounded-xl border border-dashed border-border/60 backdrop-blur-sm">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                      <span className="text-2xl">👥</span>
                    </div>
                    <p className="text-xl font-semibold mb-2 text-foreground/80">No teams yet</p>
                    <p className="text-sm mb-4">Create a team from a template or define custom roles</p>
                    <CreateTeamDialog onCreated={handleTeamRefresh} />
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

      {/* Execution panel */}
      {executionLogs.length > 0 && (
        <ExecutionPanel
          logs={executionLogs}
          streams={executionStreams}
          activeExecution={activeExecution}
          latestExecution={executions[0]}
          onClear={clearExecutionLogs}
          onCancelExecution={cancelExecution}
          onViewDetail={(exec: ExecutionHistory) => {
            setSelectedAutoExecution(exec);
            setAutoExecDetailOpen(true);
          }}
        />
      )}

      <TaskInput instances={instances} teams={teams} onDispatch={dispatchTask} onTeamDispatch={dispatchTeamTask} />

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        teamExecutions={teamExecutions}
        onViewTeamExecution={(exec) => {
          setSelectedExecution(exec);
          setExecutionDetailOpen(true);
        }}
        executions={executions}
        onViewExecution={(exec) => {
          setSelectedAutoExecution(exec);
          setAutoExecDetailOpen(true);
        }}
      />

      <TeamExecutionDetailDialog
        execution={selectedExecution}
        open={executionDetailOpen}
        onOpenChange={setExecutionDetailOpen}
      />

      <ExecutionReportDialog
        execution={selectedAutoExecution}
        open={autoExecDetailOpen}
        onOpenChange={setAutoExecDetailOpen}
      />
    </div>
  );
}
