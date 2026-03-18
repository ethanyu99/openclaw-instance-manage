// Re-exports everything for backward compatibility
export { ApiError, apiFetch, authHeaders } from './client';
export { fetchInstances, createInstance, updateInstance, deleteInstance, createSandboxInstance, checkHealth, fetchTasks, uploadFiles } from './instances';
export { fetchTeams, fetchTeamTemplates, fetchTeam, createTeam, updateTeam, deleteTeam, addRoleToTeam, updateRole, deleteRole, bindInstanceToRole, unbindInstance } from './teams';
export { fetchExecutionsApi, fetchExecutionDetail, deleteExecutionApi, clearExecutionsApi, fetchExecutionsPaginated } from './executions';
export { fetchSessions, fetchSessionDetail, fetchShareSessionDetail, deleteSessionApi, clearSessionsApi, updateSessionTopic, fetchActiveSessions, fetchSessionsPaginated } from './sessions';
export type { ActiveSessionInfo } from './sessions';
export type { PaginatedResponse, PaginationMeta, PaginationQuery } from './types';
export { createShareLink, fetchShareTokens, revokeShareToken, fetchShareView } from './share';
export { configureSandboxGit, getSandboxGitStatus, configureTeamGit, getTeamGitStatus, listSandboxFiles, readSandboxFile, downloadSandboxFile, downloadSandboxArchive, uploadFileToSandbox } from './sandbox';
export type { GitConfigPayload, GitConfigResult, GitStatusResult, TeamGitConfigResult, TeamRoleGitStatus, TeamGitStatusResult, SandboxFileListResult, SandboxFileReadResult } from './sandbox';
export { loginWithGoogle, fetchCurrentUser } from './auth';
export { createWebSocket, createShareWebSocket } from './ws';
