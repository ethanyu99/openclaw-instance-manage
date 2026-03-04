import type { TeamTemplate } from '../../shared/types';

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'fullstack-dev',
    name: '全栈开发组',
    description: '适用于软件开发项目，包含架构设计、编码实现、测试和代码审查全流程',
    roles: [
      {
        name: '架构师',
        description: '负责系统架构设计、技术方案选型和任务拆解，作为团队 Lead 统筹全局',
        capabilities: ['系统设计', '技术选型', '方案评估', 'API 设计', '任务拆解'],
        isLead: true,
      },
      {
        name: '开发者',
        description: '根据架构师的设计方案，编写高质量的代码实现',
        capabilities: ['全栈开发', 'React', 'Node.js', 'TypeScript', '数据库'],
        isLead: false,
      },
      {
        name: '测试',
        description: '为项目编写单元测试、集成测试，确保代码质量',
        capabilities: ['单元测试', '集成测试', 'E2E 测试', '测试策略', '边界分析'],
        isLead: false,
      },
      {
        name: '代码审查',
        description: '审查代码质量、安全性和性能，提出改进建议',
        capabilities: ['代码审查', '性能优化', '安全审计', '最佳实践', '重构建议'],
        isLead: false,
      },
    ],
  },
  {
    id: 'content-creation',
    name: '内容创作组',
    description: '适用于内容营销和创作场景，包含用户分析、文案撰写和多平台发布',
    roles: [
      {
        name: '内容策划',
        description: '负责内容策略制定、选题规划和团队协调，作为团队 Lead 统筹创作方向',
        capabilities: ['内容策略', '选题规划', '受众分析', '创意策划', '品牌调性'],
        isLead: true,
      },
      {
        name: '用户分析师',
        description: '深入分析目标用户画像、偏好和行为数据，为创作提供洞察',
        capabilities: ['用户调研', '数据分析', '画像构建', '趋势洞察', '竞品分析'],
        isLead: false,
      },
      {
        name: '文案',
        description: '根据用户画像和策划方向，创作有吸引力的文案内容',
        capabilities: ['文案撰写', '标题优化', '故事化表达', '情感共鸣', '多风格切换'],
        isLead: false,
      },
      {
        name: '发布运营',
        description: '将内容适配各平台格式和规范，执行发布和运营策略',
        capabilities: ['平台运营', '格式适配', '发布策略', 'SEO 优化', '数据追踪'],
        isLead: false,
      },
    ],
  },
  {
    id: 'data-analysis',
    name: '数据分析组',
    description: '适用于数据驱动的分析项目，包含数据处理、可视化和报告生成',
    roles: [
      {
        name: '分析主管',
        description: '负责分析框架设计、指标定义和结论提炼，作为团队 Lead 把控分析方向',
        capabilities: ['分析框架', '指标设计', '业务理解', '假设验证', '结论提炼'],
        isLead: true,
      },
      {
        name: '数据分析师',
        description: '执行数据清洗、探索性分析和统计建模',
        capabilities: ['数据清洗', '统计分析', 'SQL', 'Python', '特征工程'],
        isLead: false,
      },
      {
        name: '可视化',
        description: '将分析结果转化为直观的图表和可视化面板',
        capabilities: ['数据可视化', '图表设计', 'Dashboard', '交互设计', '叙事可视化'],
        isLead: false,
      },
      {
        name: '报告撰写',
        description: '将分析洞察整理成结构化的分析报告',
        capabilities: ['报告撰写', '结构化表达', '摘要提炼', '建议输出', '演示文稿'],
        isLead: false,
      },
    ],
  },
];
