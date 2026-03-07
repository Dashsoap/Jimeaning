# JiMeaning Implementation Plan

## Phase 1: Foundation
**Goal**: Project skeleton with DB, Auth, UI Shell, Docker
**Status**: Complete

## Phase 2: Provider System
**Goal**: ImageGenerator / VideoGenerator / AudioGenerator interfaces + factory
**Status**: Complete

## Phase 3: Core Pipeline
**Goal**: Text analysis → Storyboard → Image → Video pipeline
**Status**: Complete

## Phase 4: Voice & Composition
**Goal**: Multi-provider TTS + FFmpeg video composition
**Status**: Complete

## Phase 5: Polish
**Goal**: Batch generation + Templates + Global Assets
**Status**: Complete

---

## Production Stability Round (2026-03)

### Stage 1: Infrastructure Hardening
**Goal**: Docker restart strategy, Redis client separation, build script fixes
**Status**: Complete

### Stage 2: Structured Logging
**Goal**: JSON logging with redaction, replacing console.log/error
**Status**: Complete

### Stage 3: Error Classification + Worker Retry
**Goal**: Unified error codes, retryable/non-retryable, BullMQ retry with exponential backoff
**Status**: Complete

### Stage 4: Task Watchdog + Boot Recovery
**Goal**: Zombie task detection via heartbeat, boot recovery for interrupted tasks
**Status**: Complete

### Stage 5: Vitest + Bull Board + Test Suite
**Goal**: Test infrastructure (29 tests), queue monitoring UI
**Status**: Complete

---

## Business Logic Alignment (2026-03)

### Phase 1: Interaction Experience Layer
**Goal**: Task cancel + dismiss + inline status + i18n error messages
**Status**: Complete

**Deliverables**:
- `cancelTask()` + `removeTaskJob()` in service/queues
- DELETE `/api/tasks/[taskId]` — cancel running tasks
- POST `/api/tasks/dismiss` — batch dismiss failed tasks
- `TASK_CANCELLED` error code
- `TaskStatusInline` component + `resolveTaskPresentationState()`
- `TaskProgressPanel` enhanced with cancel/dismiss buttons
- i18n: `errors.*` + `taskStatus.*` in zh/en

### Phase 2: Workflow Enhancement Layer
**Goal**: Panel variants + AI prompt modification + shot analysis
**Status**: Complete

---

## Phase 2 调研记录 (waoowaoo → jimeaning 适配)

### waoowaoo 架构对比

| 维度 | waoowaoo | jimeaning |
|------|----------|-----------|
| Panel 模型 | `NovelPromotionPanel` - 30+ 字段，含 imageHistory/candidateImages/photographyRules/actingNotes | `Panel` - 8 字段，精简 |
| 任务类型 | 37 种 (`TASK_TYPE` const object) | 11 种 (`TaskType` enum) |
| LLM 调用 | `executeAiTextStep`/`executeAiVisionStep` + streaming | `chatCompletion` (OpenAI SDK, 无 streaming) |
| Prompt 模板 | 文件系统 `.txt` + `buildPrompt()` i18n | 内联 TypeScript 常量 |
| Image 生成 | `resolveImageSourceFromGeneration` + COS 上传 | `ImageGenerator.generate()` 返回 URL/base64 |
| Worker 注册 | 4 worker files (image/video/voice/text)，各自 switch | 统一 `handlers` map + `processJob` |
| 面板变体 | 2-phase panelIndex 重排 + 同步建面板 + 异步生图 | 无此功能 |
| Prompt 修改 | 4 种修改 handler (shot/appearance/location/asset-hub) | 无此功能 |
| Shot 分析 | Vision API 分析图片 → 5-8 变体建议 (JSON array) | 无此功能 |

### 适配策略

**原则**: 保持 jimeaning 的简洁架构，不照搬 waoowaoo 的复杂度。

1. **Prompt 模板**: 沿用 jimeaning 内联 TypeScript 常量风格（不引入文件系统模板）
2. **LLM 调用**: 复用现有 `chatCompletion`，新增 `chatCompletionJson` 包装（JSON response_format）
3. **Image 生成**: 复用现有 `ImageGenerator` 接口
4. **Worker 注册**: 沿用现有 `handlers` map 模式，新增 handler 直接加入

### 2A. 分镜变体系统

**waoowaoo 流程**:
1. API 同步创建新 Panel (无图)，2-phase 重排 panelIndex
2. 提交 `PANEL_VARIANT` 任务，Worker 收集参考图 + 构建变体 prompt → 生图
3. 前端乐观更新 → temp panel → 替换真实 ID

**jimeaning 适配**:
- Panel 无 panelIndex，用 `sortOrder` 排序
- 无 COS 存储，直接存 URL/base64
- 无参考图系统（waoowaoo 的 `collectPanelReferenceImages`），简化为：原面板描述 + 变体指令 → LLM 生成新 imagePrompt → 生图
- 不做乐观更新（复杂度大），API 返回 taskId 后前端轮询

**新增文件**:

| 文件 | 说明 |
|------|------|
| `src/app/api/projects/[projectId]/panel-variant/route.ts` | POST: 创建变体面板 + 提交任务 |
| `src/lib/workers/handlers/panel-variant.ts` | Worker: LLM 改写 prompt → 生图 → 保存 |
| `src/lib/llm/prompts/panel-variant.ts` | 变体 prompt 模板 (内联 TS) |

**修改文件**:

| 文件 | 说明 |
|------|------|
| `src/lib/task/types.ts` | 新增 `PANEL_VARIANT` |
| `src/lib/task/queues.ts` | `getQueueByType` 添加路由 |
| `src/lib/workers/index.ts` | 注册新 handler |

**数据流**:
```
POST /api/projects/:pid/panel-variant
  body: { panelId, variant: { description, shot_type, camera_move } }
  → 查原面板信息
  → 创建新 Panel (sortOrder = 原面板 + 1, shift 后续面板)
  → 提交 PANEL_VARIANT 任务
  → 返回 { taskId, panelId }

Worker:
  → 获取新面板 + 原面板
  → LLM: 原描述 + 变体指令 → 新 imagePrompt
  → ImageGenerator.generate(新 imagePrompt)
  → 保存 imageUrl
  → completeTask
```

### 2B. AI 改写提示词

**waoowaoo 流程**:
1. API 接收 currentPrompt + modifyInstruction
2. Worker 用 `NP_IMAGE_PROMPT_MODIFY` 模板调 LLM
3. 返回 `{ modifiedImagePrompt, modifiedVideoPrompt }`
4. 前端更新面板 prompt，可选重新生图

**jimeaning 适配**:
- 简化为只修改 imagePrompt（jimeaning 无 videoPrompt 字段）
- 复用 `chatCompletion` + JSON response format

**新增文件**:

| 文件 | 说明 |
|------|------|
| `src/app/api/projects/[projectId]/ai-modify-prompt/route.ts` | POST: 提交 prompt 修改任务 |
| `src/lib/workers/handlers/ai-modify-prompt.ts` | Worker: LLM 改写 prompt |
| `src/lib/llm/prompts/modify-prompt.ts` | 改写 prompt 模板 |

**修改文件**:

| 文件 | 说明 |
|------|------|
| `src/lib/task/types.ts` | 新增 `AI_MODIFY_PROMPT` |
| `src/lib/workers/index.ts` | 注册 handler |

**数据流**:
```
POST /api/projects/:pid/ai-modify-prompt
  body: { panelId, currentPrompt, modifyInstruction }
  → 提交 AI_MODIFY_PROMPT 任务
  → 返回 { taskId }

Worker:
  → LLM(当前 prompt + 用户修改指令) → 新 imagePrompt (JSON)
  → 更新 Panel.imagePrompt
  → completeTask({ modifiedPrompt })
```

### 2C. 镜头分析 (Shot Variants)

**waoowaoo 流程**:
1. API 接收 panelId
2. Worker 用 Vision API 分析面板图片 → 5-8 变体建议
3. 返回 `{ suggestions: [...] }`

**jimeaning 适配**:
- jimeaning 的 `chatCompletion` 目前不支持 Vision
- 方案：用文本分析替代 Vision（基于 sceneDescription + cameraAngle），LLM 推荐变体
- 如果面板有 imageUrl 且是 URL（非 base64），可以后续升级支持 Vision

**新增文件**:

| 文件 | 说明 |
|------|------|
| `src/app/api/projects/[projectId]/analyze-shot-variants/route.ts` | POST: 提交分析任务 |
| `src/lib/workers/handlers/analyze-shot-variants.ts` | Worker: LLM 分析 → 变体建议 |
| `src/lib/llm/prompts/analyze-shots.ts` | 分析 prompt 模板 |

**修改文件**:

| 文件 | 说明 |
|------|------|
| `src/lib/task/types.ts` | 新增 `ANALYZE_SHOT_VARIANTS` |
| `src/lib/workers/index.ts` | 注册 handler |

**数据流**:
```
POST /api/projects/:pid/analyze-shot-variants
  body: { panelId }
  → 提交 ANALYZE_SHOT_VARIANTS 任务
  → 返回 { taskId }

Worker:
  → 获取面板 sceneDescription + cameraAngle + 项目角色信息
  → LLM 分析 → 5 种变体建议 (JSON array)
  → completeTask({ suggestions })
```

### 前端改动

**StoryboardTab.tsx 增强**:
- 面板卡片增加操作菜单 (⋯ 按钮)
  - 「AI 改写提示词」→ 弹出对话框
  - 「分析镜头方案」→ 弹出结果面板
  - 「生成变体」→ 弹出变体选择
- 新增组件:
  - `PanelActionMenu.tsx` — 操作下拉菜单
  - `AiModifyPromptDialog.tsx` — 修改提示词对话框
  - `ShotVariantsPanel.tsx` — 变体建议展示
  - `PanelVariantDialog.tsx` — 变体生成确认

### 实施步骤

```
Step 1: 后端基础 (types + queues + LLM helpers)
  - 新增 3 个 TaskType
  - 新增 chatCompletionJson helper
  - getQueueByType 路由更新
  Status: Complete

Step 2: AI 改写提示词 (最简单，先做)
  - prompt 模板 + handler + API route
  Status: Complete

Step 3: 镜头分析
  - prompt 模板 + handler + API route
  Status: Complete

Step 4: 分镜变体
  - Panel sortOrder 重排逻辑
  - prompt 模板 + handler + API route
  Status: Complete

Step 5: 前端组件
  - PanelActionMenu + 3 个对话框/面板
  - StoryboardTab 集成
  Status: Complete

Step 6: i18n + 验证
  - zh/en 翻译
  - npm test + next build
  Status: Complete
```

---

### Phase 3: Global Asset Hub
**Goal**: Character/Location/Voice global management + cross-project reuse
**Status**: Complete

**Deliverables**:
- Schema: added `userId` to Character/Location, new Voice model
- 9 CRUD API routes:
  - GET/POST `/api/asset-hub/characters` + GET/PATCH/DELETE `characters/[characterId]`
  - GET/POST `/api/asset-hub/locations` + GET/PATCH/DELETE `locations/[locationId]`
  - GET/POST `/api/asset-hub/voices` + GET/PATCH/DELETE `voices/[voiceId]`
- 2 AI image generation routes + workers:
  - POST `characters/[characterId]/generate-image` → `IMAGE_CHARACTER` task
  - POST `locations/[locationId]/generate-image` → `IMAGE_LOCATION` task
- Frontend: Full 3-tab asset page (Characters/Locations/Voices) with grid, create modal, delete, AI generate image
- i18n: `assets.*` translations in zh/en

---

## Phase 3 调研记录 (waoowaoo → jimeaning 适配)

### waoowaoo 资产库架构
- 6 个 Prisma 模型: GlobalAssetFolder, GlobalCharacter, GlobalCharacterAppearance, GlobalLocation, GlobalLocationImage, GlobalVoice
- 20+ API 路由 (CRUD + 图片生成/上传/选择/撤销 + 声音设计 + AI 设计)
- COS 存储、image label bar、多图变体、undo 支持

### jimeaning 适配策略 (大幅简化)
1. 复用已有 Character + Location 模型 (projectId? null=全局)
2. 不引入 COS / 多图变体 / undo / folder
3. 声音库: 复用已有 Voice 模型

---

### Phase 5: Creator Workflow Polish
**Goal**: Panel CRUD + Episode CRUD + Download/Export + Project Duplication
**Status**: Complete

**Deliverables**:
- Panel CRUD: GET/PATCH/DELETE `/api/projects/[projectId]/panels/[panelId]` + POST duplicate + POST reorder
- Episode CRUD: GET/POST `/api/projects/[projectId]/episodes` + GET/PATCH/DELETE `episodes/[episodeId]`
- Download: GET `/api/projects/[projectId]/download?type=images|videos|composition`
- Project duplication: POST `/api/projects/[projectId]/duplicate` — deep clone with characters, locations, episodes, clips, panels
- Frontend: Panel action menu with duplicate/delete, download images button, project duplicate button

### Phase 4: Novel Import Mode
**Goal**: Novel text → episodes → scripts → storyboard pipeline
**Status**: Complete

**Deliverables**:
- 2 new task types: `EPISODE_SPLIT`, `ANALYZE_NOVEL`
- 2 LLM prompt templates: `episode-split.ts`, `analyze-novel.ts`
- 2 worker handlers: `handleEpisodeSplit`, `handleAnalyzeNovel`
- 3 API routes:
  - POST `/api/projects/[projectId]/split-episodes` — AI episode split
  - POST `/api/projects/[projectId]/analyze-novel` — extract characters/locations
  - POST `/api/projects/[projectId]/episodes/batch` — batch save episodes
- Frontend: SmartImportWizard 3-step modal (Source → Parse → Preview)
  - Fast path: regex marker detection for common chapter formats
  - AI path: LLM-powered episode splitting via task queue
  - Preview: edit episode titles, remove episodes, confirm import
- i18n: `import.*` translations in zh/en

**Adaptation from waoowaoo**:
- Simplified from 6+ task types to 2 (EPISODE_SPLIT + ANALYZE_NOVEL)
- Removed: script-to-storyboard orchestrator (reuses existing GENERATE_STORYBOARD)
- Removed: screenplay conversion, clip boundary matching, multi-phase storyboard plan
- Kept: marker detection (fast path) + AI split, character/location extraction, batch episode save

---

### Phase 6: Storyboard Pipeline Enhancement
**Goal**: Multi-phase storyboard generation aligned with waoowaoo's orchestrated pipeline
**Status**: Complete

**Schema Changes**:
- Clip: added `screenplay` (JSON text) for structured screenplay data
- Panel: added `shotType` (establishing/action/dialogue/reaction/detail/transition) and `cameraMove` (static/pan/tilt/zoom/dolly/tracking)

**Pipeline (3 phases per clip)**:
1. **Storyboard Planning**: Clip content + screenplay → 2-6 panels with shotType, cameraAngle, cameraMove, duration, sourceText
2. **Detail Refinement**: Plan panels + character/location descriptions → refined sceneDescription + imagePrompt
3. **Voice Line Extraction**: Clip content + panels → voice lines matched to panels by panelNumber

**Enhanced Prompts**:
- `analyze-script.ts`: Now generates structured screenplay per clip (INT/EXT headings, action/dialogue/voiceover breakdown)
- `extract-entities.ts`: Richer visual descriptions for consistent image generation
- `generate-storyboard-text.ts`: 3 prompt pairs (plan, detail, voice) replacing single monolithic prompt

**Adaptation from waoowaoo**:
- waoowaoo: 4-phase parallel (plan → cinematography ∥ acting → detail) + voice extraction
- jimeaning: 3-phase sequential (plan → detail → voice) — simpler but same quality output
- Not included: separate cinematography/acting agents (merged into detail phase)
- Not included: screenplay conversion as separate task (inline in analyze-script)
