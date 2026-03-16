// Re-exports everything for backward compatibility
export { ApiError, apiFetch, authHeaders } from './client';
export { fetchInstances, createInstance, updateInstance, deleteInstance, createSandboxInstance, checkHealth, fetchTasks, uploadFiles } from './instances';
export { fetchTeams, fetchTeamTemplates, fetchTeam, createTeam, updateTeam, deleteTeam, addRoleToTeam, updateRole, deleteRole, bindInstanceToRole, unbindInstance } from './teams';
export { fetchExecutionsApi, fetchExecutionDetail, deleteExecutionApi, clearExecutionsApi } from './executions';
export { fetchSessions, fetchSessionDetail, fetchShareSessionDetail, deleteSessionApi, clearSessionsApi, updateSessionTopic } from './sessions';
export { createShareLink, fetchShareTokens, revokeShareToken, fetchShareView } from './share';
export { fetchSkillRegistry, searchSkillsApi, fetchInstanceSkills, installSkills, uninstallSkills, fetchSkillReadme, checkRemoteStatus, searchRemoteSkills, fetchRemoteSkillContent, installRemoteSkill, SkillsMPApiError } from './skills';
export type { RemoteSkill, SkillsMPErrorCode } from './skills';
export { configureSandboxGit, getSandboxGitStatus, configureTeamGit, getTeamGitStatus, listSandboxFiles, readSandboxFile, downloadSandboxFile, downloadSandboxArchive } from './sandbox';
export type { GitConfigPayload, GitConfigResult, GitStatusResult, TeamGitConfigResult, TeamRoleGitStatus, TeamGitStatusResult, SandboxFileListResult, SandboxFileReadResult } from './sandbox';
export { loginWithGoogle, fetchCurrentUser } from './auth';
export { createWebSocket, createShareWebSocket } from './ws';
