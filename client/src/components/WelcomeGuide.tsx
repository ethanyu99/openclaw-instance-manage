import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Rocket, Terminal, Users, FolderOpen } from 'lucide-react';
import { AddInstanceDialog } from './AddInstanceDialog';

interface WelcomeGuideProps {
  onCreated: () => void;
}

export function WelcomeGuide({ onCreated }: WelcomeGuideProps) {
  return (
    <div className="col-span-full max-w-2xl mx-auto py-16 px-4">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Rocket className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to Lobster Squad! 🦞</h2>
        <p className="text-muted-foreground">
          Manage and orchestrate your AI coding instances in one place.
        </p>
      </div>

      <div className="grid gap-4 mb-8">
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold text-primary">1</span>
              添加你的第一个实例
            </CardTitle>
            <CardDescription>
              连接一个 OpenClaw 实例，或创建一个沙箱实例来开始。
              实例是你的 AI 代理运行环境。
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-dashed opacity-60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="bg-muted rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
              派发任务
            </CardTitle>
            <CardDescription>
              使用底部输入框向实例发送编程任务，实时查看输出。
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="border-dashed opacity-60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="bg-muted rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
              组建团队协作
            </CardTitle>
            <CardDescription>
              创建团队，让多个实例扮演不同角色（PM、开发、测试），协作完成复杂任务。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="text-center">
        <AddInstanceDialog onCreated={onCreated} />
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 text-center text-xs text-muted-foreground">
        <div className="flex flex-col items-center gap-1">
          <Terminal className="h-4 w-4" />
          <span>Web 终端</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <FolderOpen className="h-4 w-4" />
          <span>文件浏览</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Users className="h-4 w-4" />
          <span>多实例协作</span>
        </div>
      </div>
    </div>
  );
}
