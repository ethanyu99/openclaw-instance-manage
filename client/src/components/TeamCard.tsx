import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Edit2, Star, Link, Unlink, Users } from 'lucide-react';
import type { TeamPublic, InstancePublic, ClawRole } from '@shared/types';
import { deleteTeam, updateTeam, bindInstanceToRole, unbindInstance } from '@/lib/api';

interface TeamCardProps {
  team: TeamPublic;
  instances: InstancePublic[];
  onRefresh: () => void;
}

export function TeamCard({ team, instances, onRefresh }: TeamCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDesc, setEditDesc] = useState(team.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [bindDialogRole, setBindDialogRole] = useState<ClawRole | null>(null);

  const unassignedInstances = instances.filter(
    inst => !inst.teamId || inst.teamId === team.id
  );

  const handleEditSave = async () => {
    if (!editName.trim()) {
      setError('名称不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateTeam(team.id, { name: editName.trim(), description: editDesc.trim() });
      setEditOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`删除团队 "${team.name}"？所有角色绑定将被解除。`)) return;
    setDeleting(true);
    try {
      await deleteTeam(team.id);
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  const handleBind = async (instanceId: string, roleId: string) => {
    try {
      await bindInstanceToRole(team.id, instanceId, roleId);
      setBindDialogRole(null);
      onRefresh();
    } catch (err) {
      console.error('Bind failed:', err);
    }
  };

  const handleUnbind = async (instanceId: string) => {
    try {
      await unbindInstance(team.id, instanceId);
      onRefresh();
    } catch (err) {
      console.error('Unbind failed:', err);
    }
  };

  const getMemberInstance = (roleId: string): InstancePublic | undefined => {
    const member = team.members.find(m => m.roleId === roleId);
    if (!member?.instanceId) return undefined;
    return instances.find(i => i.id === member.instanceId);
  };

  const statusColor: Record<string, string> = {
    online: 'bg-blue-500',
    busy: 'bg-emerald-500 animate-pulse',
    offline: 'bg-zinc-400',
  };

  return (
    <>
      <Card className="hover:border-primary/40 hover:shadow-md transition-all duration-200 bg-card border-border/80 shadow-sm">
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold tracking-tight">{team.name}</CardTitle>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
                {team.roles.length} roles
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted"
                onClick={() => { setEditName(team.name); setEditDesc(team.description); setError(''); setEditOpen(true); }}
              >
                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                onClick={handleDelete} disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {team.description && (
            <p className="text-xs text-muted-foreground mt-1.5">{team.description}</p>
          )}
        </CardHeader>
        <CardContent className="pt-4 space-y-2.5">
          {team.roles.map(role => {
            const boundInstance = getMemberInstance(role.id);
            return (
              <div
                key={role.id}
                className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5 bg-card hover:border-border transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {role.isLead && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                    <span className="text-sm font-semibold truncate">{role.name}</span>
                    {role.isLead && (
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-amber-600 border-amber-200 bg-amber-50/50">
                        Lead
                      </Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-[11px] text-muted-foreground truncate mb-1">{role.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {role.capabilities.slice(0, 4).map((cap, i) => (
                      <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0">
                        {cap}
                      </Badge>
                    ))}
                    {role.capabilities.length > 4 && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                        +{role.capabilities.length - 4}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="ml-3 shrink-0">
                  {boundInstance ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/5 border border-primary/20">
                        <span className={`w-2 h-2 rounded-full ${statusColor[boundInstance.status]}`} />
                        <span className="text-xs font-medium truncate max-w-[80px]">{boundInstance.name}</span>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => handleUnbind(boundInstance.id)}
                        title="解除绑定"
                      >
                        <Unlink className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setBindDialogRole(role)}
                    >
                      <Link className="h-3 w-3" />
                      绑定实例
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑团队</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bind Instance Dialog */}
      <Dialog open={!!bindDialogRole} onOpenChange={v => { if (!v) setBindDialogRole(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>绑定实例到「{bindDialogRole?.name}」</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {unassignedInstances.filter(i => !i.teamId).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">没有可用的实例，请先创建实例</p>
            ) : (
              unassignedInstances.filter(i => !i.teamId).map(inst => (
                <button
                  key={inst.id}
                  type="button"
                  className="w-full flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                  onClick={() => bindDialogRole && handleBind(inst.id, bindDialogRole.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${statusColor[inst.status]}`} />
                    <span className="text-sm font-medium">{inst.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{inst.status}</Badge>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
