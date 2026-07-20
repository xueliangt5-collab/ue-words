import IMPORTED_ARTICLES from './imported-articles.json';

const CORE_ARTICLES = [
  {
    id: 'understanding-fengineloop-tick',
    titleEn: 'Reading FEngineLoop::Tick in Unreal Insights',
    titleZh: '在 Unreal Insights 中理解 FEngineLoop::Tick',
    summaryEn: 'A practical introduction to reading the engine main loop and following expensive child events.',
    summaryZh: '从引擎主循环开始，学习如何沿子事件定位一帧中的实际耗时。',
    category: '性能分析',
    level: '入门',
    tags: ['Unreal Insights', 'GameThread', 'Tick', 'Frame Budget'],
    source: '术语随身学原创',
    sections: [
      {
        id: 'main-loop',
        headingEn: 'Start with the main loop',
        headingZh: '从主循环开始',
        en: 'FEngineLoop::Tick is the top-level engine loop that runs once per frame. In Unreal Insights, a large duration here tells you that the frame is expensive, but it does not identify the final cause by itself.',
        zh: 'FEngineLoop::Tick 是每帧执行一次的引擎顶层主循环。在 Unreal Insights 中，它的耗时较大说明这一帧整体偏重，但仅凭这个标记还不能确定最终原因。',
        termLinks: [
          {
            termId: 'imported-fengineloop-tick',
            textEn: 'FEngineLoop::Tick',
            textZh: 'FEngineLoop::Tick',
            note: '引擎主循环入口，每帧执行一次。',
          },
        ],
      },
      {
        id: 'frame-boundaries',
        headingEn: 'Confirm the frame boundaries',
        headingZh: '确认帧边界',
        en: 'Use BeginFrame + EndFrame to confirm the measured frame range. Then expand WorldTick and nearby child events instead of treating the parent duration as a single operation.',
        zh: '先通过 BeginFrame + EndFrame 确认统计的帧范围，再展开 WorldTick 及其附近的子事件，不要把父级耗时当成一个单独操作。',
        termLinks: [
          {
            termId: 'imported-beginframe-endframe',
            textEn: 'BeginFrame + EndFrame',
            textZh: 'BeginFrame + EndFrame',
            note: '用于确认一帧开始与结束的边界标记。',
          },
          {
            termId: 'imported-worldtick',
            textEn: 'WorldTick',
            textZh: 'WorldTick',
            note: '游戏世界逐帧更新的主要入口之一。',
          },
        ],
      },
      {
        id: 'follow-the-cost',
        headingEn: 'Follow the expensive branch',
        headingZh: '沿高耗时分支继续展开',
        en: 'If TickActors is expensive, inspect the actor and component updates below it. Also check for synchronous loading, object iteration, and wait points before deciding which system needs optimization.',
        zh: '如果 TickActors 耗时较高，应继续检查其下方的 Actor 与组件更新。同时排查同步加载、对象遍历和等待点，再判断真正需要优化的系统。',
        termLinks: [
          {
            termId: 'imported-tickactors',
            textEn: 'TickActors',
            textZh: 'TickActors',
            note: '集中执行 Actor Tick 的阶段，应继续向下寻找具体对象或组件。',
          },
        ],
      },
    ],
  },
];

export const ARTICLES = [...CORE_ARTICLES, ...IMPORTED_ARTICLES]
  .sort((left, right) => left.titleEn.localeCompare(right.titleEn, 'en'));
