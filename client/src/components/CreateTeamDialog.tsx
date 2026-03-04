import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Star, X } from 'lucide-react';
import { fetchTeamTemplates, createTeam } from '@/lib/api';
import type { TeamTemplate, ClawRole } from '@shared/types';

interface CreateTeamDialogProps {
  onCreated: () => void;
}

type Mode = 'template' | 'custom';

interface CustomRole {
  name: string;
  description: string;
  capabilities: string;
  isLead: boolean;
}

const EMPTY_ROLE: CustomRole = { name: '', description: '', capabilities: '', isLead: false };

export function CreateTeamDialog({ onCreated }: CreateTeamDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('template');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [templates, setTemplates] = useState<TeamTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');

  // Custom mode
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([
    { ...EMPTY_ROLE, isLead: true },
    { ...EMPTY_ROLE },
  ]);

  useEffect(() => {
    if (open) {
      fetchTeamTemplates()
        .then(data => setTemplates(data.templates))
        .catch(() => {});
    }
  }, [open]);

  const resetForm = () => {
    setTeamName('');
    setTeamDesc('');
    setSelectedTemplate(null);
    setError('');
    setCustomRoles([{ ...EMPTY_ROLE, isLead: true }, { ...EMPTY_ROLE }]);
  };

  const handleSubmit = async () => {
    if (!teamName.trim()) {
      setError('请输入团队名称');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'template') {
        if (!selectedTemplate) {
          setError('请选择一个模板');
          setLoading(false);
          return;
        }
        await createTeam({
          name: teamName.trim(),
          description: teamDesc.trim(),
          templateId: selectedTemplate,
        });
      } else {
        const validRoles = customRoles.filter(r => r.name.trim());
        if (validRoles.length < 2) {
          setError('至少需要 2 个角色');
          setLoading(false);
          return;
        }
        if (!validRoles.some(r => r.isLead)) {
          setError('至少需要一个 Lead 角色');
          setLoading(false);
          return;
        }
        await createTeam({
          name: teamName.trim(),
          description: teamDesc.trim(),
          roles: validRoles.map(r => ({
            name: r.name.trim(),
            description: r.description.trim(),
            capabilities: r.capabilities
              .split(/[,，、]/)
              .map(s => s.trim())
              .filter(Boolean),
            isLead: r.isLead,
          })),
        });
      }
      resetForm();
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const updateCustomRole = (index: number, field: keyof CustomRole, value: string | boolean) => {
    setCustomRoles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'isLead' && value === true) {
        return next.map((r, i) => ({ ...r, isLead: i === index }));
      }
      return next;
    });
  };

  const removeCustomRole = (index: number) => {
    setCustomRoles(prev => prev.filter((_, i) => i !== index));
  };

  const addCustomRole = () => {
    setCustomRoles(prev => [...prev, { ...EMPTY_ROLE }]);
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Users className="h-4 w-4" />
          Create Team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建团队</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>团队名称</Label>
            <Input
              placeholder="My Team"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label>描述</Label>
            <Input
              placeholder="团队描述（可选）"
              value={teamDesc}
              onChange={e => setTeamDesc(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={mode === 'template' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('template')}
              disabled={loading}
            >
              从模板创建
            </Button>
            <Button
              variant={mode === 'custom' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => setMode('custom')}
              disabled={loading}
            >
              自定义角色
            </Button>
          </div>

          {mode === 'template' ? (
            <div className="space-y-3">
              {templates.map(tmpl => (
                <div
                  key={tmpl.id}
                  className={`rounded-lg border p-3 cursor-pointer transition-all ${
                    selectedTemplate === tmpl.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/60 hover:border-primary/40'
                  }`}
                  onClick={() => !loading && setSelectedTemplate(tmpl.id)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm">{tmpl.name}</span>
                    {selectedTemplate === tmpl.id && (
                      <Badge variant="default" className="text-[10px]">已选择</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{tmpl.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tmpl.roles.map((role, i) => (
                      <Badge
                        key={i}
                        variant={role.isLead ? 'default' : 'secondary'}
                        className="text-[10px] gap-1"
                      >
                        {role.isLead && <Star className="h-2.5 w-2.5" />}
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {customRoles.map((role, index) => (
                <div key={index} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="角色名称"
                        value={role.name}
                        onChange={e => updateCustomRole(index, 'name', e.target.value)}
                        className="h-8 w-32 text-sm"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => updateCustomRole(index, 'isLead', !role.isLead)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                          role.isLead
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                        disabled={loading}
                      >
                        <Star className="h-3 w-3" />
                        Lead
                      </button>
                    </div>
                    {customRoles.length > 2 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeCustomRole(index)}
                        disabled={loading}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <Input
                    placeholder="职责描述"
                    value={role.description}
                    onChange={e => updateCustomRole(index, 'description', e.target.value)}
                    className="h-8 text-xs"
                    disabled={loading}
                  />
                  <Input
                    placeholder="能力标签（逗号分隔，如：文案撰写，标题优化，SEO）"
                    value={role.capabilities}
                    onChange={e => updateCustomRole(index, 'capabilities', e.target.value)}
                    className="h-8 text-xs"
                    disabled={loading}
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={addCustomRole}
                disabled={loading}
              >
                <Plus className="h-3.5 w-3.5" />
                添加角色
              </Button>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? '创建中...' : '创建团队'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
