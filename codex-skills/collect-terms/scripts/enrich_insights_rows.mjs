#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ZH_NAMES = {
  'FEngineLoop::Tick': '引擎主循环 Tick',
  TickActors: 'Actor Tick 遍历',
  Tick_PrePhysics: '物理前 Tick',
  Tick_DuringPhysics: '物理期间 Tick',
  Tick_PostPhysics: '物理后 Tick',
  TickComponents: '组件 Tick 遍历',
  TimerManager: '定时器管理器',
  LatentAction: '潜在动作管理器',
  ProcessAsyncLoading: '异步加载完成处理',
  LoadPackage: '同步加载资源包',
  StaticLoadObject: '静态加载对象',
  Event_DeferredPostLoad: '延迟后加载初始化',
  FlushAsyncLoading: '等待异步加载完成',
  GC: '垃圾回收',
  WorldTick: '世界 Tick',
  Tick_Particle: '粒子系统 Tick',
  Tick_Animation: '动画 Tick',
  CharacterMovement: '角色移动',
  Physics: '物理模拟',
  Timer_PreRender: '渲染前计时',
  Timer_PostRender: '渲染后计时',
  'BeginFrame + EndFrame': '帧起止标记',
  Basepass: '基础通道',
  Prepass: '深度预通道',
  Shadows: '阴影渲染',
  Translucency: '半透明渲染',
  PostProcessing: '后处理',
  ScreenSpaceReflections: '屏幕空间反射',
  Lumen: '动态全局光照',
  Nanite: '虚拟几何体',
  MediaTextureResource: '媒体纹理资源',
  WorldTick_GPU: 'GPU 世界更新',
  SlateUI_GPU: 'Slate UI GPU 渲染',
  RDG_Execute: '执行渲染依赖图',
  InitViews: '视图初始化',
  ComputeLightGrid: '光照网格计算',
  FXSystem: '特效系统',
  UpdateGPUScene: '更新 GPU 场景',
  PrepareDistanceField: '准备距离场',
  VirtualTextureSystem: '虚拟纹理系统',
  Renderer_RDG: 'RDG 渲染器',
  RHIThread_Submit: 'RHI 线程提交',
  RHICmdList_Flush: '刷新 RHI 命令列表',
  RHICmdList_Submit: '提交 RHI 命令列表',
  D3D12_CreateBuffer: '创建 D3D12 缓冲区',
  D3D12_AllocatePoolResource: '分配 D3D12 池资源',
  FAsyncLoadingThread: '异步加载线程',
  IoDispatcher: 'I/O 调度器',
  IoService: 'I/O 服务',
  'FAsyncTask::SyncCompletion': '异步任务同步完成',
  WaitForTasks: '等待任务',
  GameThreadWaitForTask: '游戏线程等待任务',
  Sync_RenderingThread: '同步渲染线程',
  ConditionalFinishLoading: '条件性完成加载',
  ForEachObjectOfClass: '遍历类实例',
  UInputComponent_ConditionalBuildKeyMap: '重建输入键映射',
  LoadObject: '加载对象',
  ParallelFor: '并行 For 循环',
  TaskGraph: '任务图系统',
  'SWidget::Invalidate': 'Slate 控件失效',
  SConstraintCanvas: 'Slate 约束画布',
  'AkComponent::TickComponent': 'Wwise 组件 Tick',
  AkAudioDevice: 'Wwise 音频设备',
  MergeIntoLocalQueue: '合并到本地队列',
  FRenderCommandPipe_StartRecording: '开始记录渲染命令',
  FRenderCommandPipe_StopRecording: '停止记录渲染命令',
  'FRenderCommandFence::BeginFence': '插入渲染命令栅栏',
  PSOPrecompilePool: 'PSO 预编译池',
  SlateLoadingThread: 'Slate 加载线程',
  FileIO: '文件 I/O',
  PakPrecacher: 'Pak 预缓存器',
  StreamableManager: '可流送资源管理器',
  LevelStreaming: '关卡流送',
};

const IPA = {
  Basepass: '/beɪs pæs/',
  Prepass: '/ˈpriːpæs/',
  Shadows: '/ˈʃædoʊz/',
  Translucency: '/trænzˈluːsənsi/',
  PostProcessing: '/poʊst ˈprɑːsesɪŋ/',
  ScreenSpaceReflections: '/skriːn speɪs rɪˈflekʃənz/',
  Lumen: '/ˈluːmən/',
  Physics: '/ˈfɪzɪks/',
  CharacterMovement: '/ˈkærəktər ˈmuːvmənt/',
  ParallelFor: '/ˈpærəlel fɔːr/',
  TaskGraph: '/tæsk ɡræf/',
  LevelStreaming: '/ˈlevəl ˈstriːmɪŋ/',
};

const ALIASES = {
  Basepass: ['Base Pass'],
  Prepass: ['Pre Pass'],
  PostProcessing: ['Post Processing'],
  ScreenSpaceReflections: ['Screen Space Reflections', 'SSR'],
  CharacterMovement: ['Character Movement'],
  MediaTextureResource: ['Media Texture Resource'],
  VirtualTextureSystem: ['Virtual Texture System'],
  LevelStreaming: ['Level Streaming'],
  FileIO: ['File I/O'],
  IoDispatcher: ['IO Dispatcher'],
  IoService: ['IO Service'],
};

const RELATED = {
  'FEngineLoop::Tick': ['Tick', 'WorldTick', 'TickActors'],
  Tick_PrePhysics: ['Tick_DuringPhysics', 'Tick_PostPhysics'],
  Tick_DuringPhysics: ['Tick_PrePhysics', 'Tick_PostPhysics'],
  Tick_PostPhysics: ['Tick_PrePhysics', 'Tick_DuringPhysics'],
  LoadPackage: ['LoadObject', 'ProcessAsyncLoading', 'FlushAsyncLoading'],
  FlushAsyncLoading: ['ProcessAsyncLoading', 'ConditionalFinishLoading'],
  ProcessAsyncLoading: ['FAsyncLoadingThread', 'StreamableManager'],
  RDG_Execute: ['Renderer_RDG', 'InitViews'],
  Renderer_RDG: ['RDG_Execute'],
  RHIThread_Submit: ['RHICmdList_Submit', 'RHICmdList_Flush'],
  RHICmdList_Flush: ['RHICmdList_Submit', 'RHIThread_Submit'],
  RHICmdList_Submit: ['RHIThread_Submit', 'RHICmdList_Flush'],
  FAsyncLoadingThread: ['ProcessAsyncLoading', 'IoDispatcher'],
  GameThreadWaitForTask: ['WaitForTasks', 'TaskGraph'],
  WaitForTasks: ['TaskGraph', 'GameThreadWaitForTask'],
  Sync_RenderingThread: ['RDG_Execute', 'RHIThread_Submit'],
  StreamableManager: ['LevelStreaming', 'ProcessAsyncLoading'],
  LevelStreaming: ['StreamableManager', 'LoadPackage'],
};

const EXPERIENCE = {
  'FEngineLoop::Tick': '卡顿时先用它定位游戏线程慢帧，再展开子事件；顶层耗时高不代表主循环本身就是根因。',
  TickActors: 'Actor 数量和启用 Tick 的比例都会放大这里的耗时，优先查找不必要的每帧 Tick。',
  LoadPackage: '出现尖峰时检查是否在游戏线程进行了同步加载；优先改为异步加载或提前预热。',
  FlushAsyncLoading: '显式等待会把异步工作重新变成同步阻塞，应追查调用位置和触发条件。',
  GameThreadWaitForTask: '这里高通常代表游戏线程在等其他任务，不要只优化等待函数本身，要追踪被等待的任务。',
  Sync_RenderingThread: '这里高说明游戏线程在等待渲染线程，继续对照 RenderThread 轨道寻找阻塞源。',
  RHICmdList_Flush: '频繁 Flush 会减少并行度；检查资源创建、读回或显式同步是否发生在帧内。',
  D3D12_CreateBuffer: '帧内频繁创建 GPU Buffer 容易产生尖峰，优先复用、池化或提前创建资源。',
  PakPrecacher: '命中率低或 Seek 频繁时，检查资源布局、预取范围和磁盘读取模式。',
};

const CATEGORY_EXPERIENCE = {
  GameThread: '持续偏高时，展开子事件并检查蓝图逻辑、Actor Tick、同步加载和等待点。',
  'GameThread/GPU': '同时对照 GameThread 与 GPU 轨道，先判断瓶颈究竟位于 CPU 还是 GPU。',
  GPU: '持续偏高时，展开具体 GPU Pass，并结合 GPU Visualizer 判断是否为 GPU Bound。',
  RenderThread: '持续偏高时，检查可见性计算、场景数据更新、渲染命令生成及任务等待。',
  RHIThread: '持续偏高时，检查驱动提交、资源创建、命令队列刷新和 CPU/GPU 同步。',
  AsyncLoading: '持续偏高时，检查磁盘读取、解压、资源依赖和加载完成后的主线程工作。',
  IO: '持续偏高时，检查读取请求数量、缓存命中、文件布局和随机 Seek。',
  AllThreads: '从调用者和子任务两端分析，不要把跨线程聚合耗时直接归因于单一线程。',
  AsyncWorker: '检查任务是否过多、粒度是否过小，以及是否最终造成主线程等待。',
  Loading: '检查加载线程工作是否影响交互响应，以及是否存在与主线程的同步点。',
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('Usage: enrich_insights_rows.mjs --input <rows.json> --output <terms.json>');
    args[key.slice(2)] = value;
  }
  return args;
}

function splitIdentifier(value) {
  let spoken = String(value)
    .replace(/::|_|\+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  const replacements = {
    RHI: 'R H I', RDG: 'R D G', GPU: 'G P U', PSO: 'P S O', IO: 'I O', GC: 'G C',
    FX: 'F X', UI: 'U I', D3D12: 'D 3 D 12', UObject: 'U Object', UMG: 'U M G',
  };
  for (const [token, replacement] of Object.entries(replacements)) {
    spoken = spoken.replace(new RegExp(`\\b${token}\\b`, 'g'), replacement);
  }
  return spoken.replace(/^F (?=[A-Z])/, 'F ').replace(/^S (?=[A-Z])/, 'S ').replace(/^U (?=[A-Z])/, 'U ').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return `imported-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

function splitExplanation(value) {
  return String(value).split(/[。；]/).map(item => item.trim()).filter(Boolean);
}

function sentence(value) {
  const normalized = String(value).trim();
  return /[。！？]$/.test(normalized) ? normalized : `${normalized}。`;
}

function exampleFor(term, category) {
  if (category === 'GPU') return [`Inspect ${term} on the GPU track when the frame is GPU-bound.`, `当帧受 GPU 限制时，在 GPU 轨道检查 ${term}。`];
  if (category === 'RenderThread') return [`Inspect ${term} when the Render Thread exceeds its frame budget.`, `当渲染线程超过帧预算时，检查 ${term}。`];
  if (category === 'RHIThread') return [`Inspect ${term} when the RHI Thread stalls.`, `当 RHI 线程发生阻塞时，检查 ${term}。`];
  return [`Inspect ${term} in Unreal Insights when profiling a slow frame.`, `分析慢帧时，在 Unreal Insights 中检查 ${term}。`];
}

const args = parseArgs(process.argv.slice(2));
const input = JSON.parse(await readFile(path.resolve(args.input), 'utf8'));
if (JSON.stringify(input.headers) !== JSON.stringify(['TimerName', 'Category', 'Explanation_CN'])) {
  throw new Error('Expected TimerName, Category, Explanation_CN columns');
}

const knownNames = new Set(input.rows.map(row => String(row[0]).trim()));
const terms = input.rows.map((row, index) => {
  const [term, threadCategory, rawExplanation] = row.map(value => String(value || '').trim());
  if (!term || !threadCategory || !rawExplanation) throw new Error(`Row ${index + 2} has an empty required field`);
  const parts = splitExplanation(rawExplanation);
  if (!parts.length) throw new Error(`Row ${index + 2} has no usable explanation text`);
  const categoryExperience = CATEGORY_EXPERIENCE[threadCategory] || '结合相邻帧和子事件判断，不要只根据单个计时项下结论。';
  const experience = EXPERIENCE[term]
    || `分析 ${term} 时先确认它记录的是“${rawExplanation.replace(/[。；]+$/g, '')}”；${categoryExperience}`;
  const related = new Set(RELATED[term] || []);
  if (/Tick/i.test(term) && term !== 'Tick') related.add('Tick');
  const relatedTerms = [...related]
    .filter(name => name === 'Tick' || knownNames.has(name))
    .map(name => ({ term: name, relation: '性能分析关联', explanation: `${term} 与 ${name} 位于相同流程或存在上下级分析关系。` }));
  const [example, exampleZh] = exampleFor(term, threadCategory);
  return {
    id: slugify(term),
    term,
    spokenForm: splitIdentifier(term),
    ipa: IPA[term] || '',
    zh: ZH_NAMES[term] || parts[0],
    category: '性能分析',
    threadCategory,
    definition: sentence(rawExplanation),
    example,
    exampleZh,
    tags: `Unreal Insights timer 性能分析 ${threadCategory} ${splitIdentifier(term)}`,
    aliases: ALIASES[term] || [],
    relatedTerms,
    contexts: [{
      phrase: `Unreal Insights · ${threadCategory}`,
      explanation: `CSV 将 ${term} 归入 ${threadCategory} 线程或轨道分类。`,
      experience,
    }],
    usageNotes: [],
    source: 'UE5_Timer_Glossary.csv',
  };
});

const termsByZh = new Map();
for (const record of terms) {
  const group = termsByZh.get(record.zh) || [];
  group.push(record);
  termsByZh.set(record.zh, group);
}
for (const group of termsByZh.values()) {
  if (group.length > 1) {
    for (const record of group) record.zh = `${record.zh} · ${record.term}`;
  }
}

for (const [label, values] of [
  ['term', terms.map(record => record.term)],
  ['zh', terms.map(record => record.zh)],
  ['definition', terms.map(record => record.definition)],
  ['example', terms.map(record => record.example)],
  ['exampleZh', terms.map(record => record.exampleZh)],
  ['experience', terms.map(record => record.contexts[0].experience)],
]) {
  if (new Set(values).size !== values.length) throw new Error(`Batch contains duplicate ${label} values`);
}

await writeFile(path.resolve(args.output), `${JSON.stringify(terms, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  rows: input.rows.length,
  terms: terms.length,
  uniqueDefinitions: new Set(terms.map(term => term.definition)).size,
  uniqueExamples: new Set(terms.map(term => term.example)).size,
  uniqueExperiences: new Set(terms.map(term => term.contexts[0].experience)).size,
  threadCategories: [...new Set(terms.map(term => term.threadCategory))].sort(),
}));
