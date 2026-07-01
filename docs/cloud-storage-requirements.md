# Obsidian Clipper v15.x 云存储功能需求文档

## 一、目标

在 `obsidian-clipper v1.7.0 (commit 48228dc)` 基础上，新增统一云存储功能：

- **4 种后端**：Git 仓库 / WebDAV / S3 / Fast Note Sync
- **Settings 页面**：UI 管理配置的增删改查
- **Popup 弹窗**：新增"保存到云"按钮

**核心原则**：复用原版能力，保持架构一致，便于合并上游更新。

---

## 二、设计原则

| 原则 | 实现方式 |
|---|---|
| **复用优先** | 直接 import 原版工具函数，不重复造轮子 |
| **解耦存储** | 原版字段不修改，云配置独立存储，互不影响 |
| **渐进增强** | cloud 功能作为增量存在，上游更新不受影响 |
| **Schema + Factory** | 用纯数据 schema + 工厂函数生成 adapter，减少 class 样板 |
| **动态加载** | cloud 模块懒加载，不增加主 bundle 体积 |

---

## 三、复用原版能力

### 3.1 可直接复用的模块

| 模块 | 位置 | 用途 |
|---|---|---|
| `getMessage()` | `src/utils/i18n.ts` | 国际化（含自动 fallback） |
| `debounce()` | `src/utils/debounce.ts` | 防抖 |
| `showModal()` / `hideModal()` | `src/utils/modal-utils.ts` | 弹窗基础能力 |
| `initializeIcons()` / `createIcons()` | `src/icons/icons.ts` | 图标渲染 |
| `createElementWithClass()` / `createElementWithHTML()` | `src/utils/dom-utils.ts` | DOM 创建 |
| `storage.local` / `storage.sync` | 原生 browser API | 配置持久化 |
| 现有 modal 样式 | `src/styles/modals.scss` | 直接复用 |

### 3.2 可直接复用的 UI 模式

- **Provider/Model 弹窗模式**：参考 `settings.html` 里的 `#provider-modal` 和 `#model-modal`，结构完全相同
- **表单布局**：参考现有 setting-item 结构
- **Sidebar 导航**：在 `#general-section` 的 form 关闭后追加 cloud section

---

## 四、文件清单

### 4.1 原版改动（仅追加，不修改已有逻辑）

| 文件 | 改动 |
|---|---|
| `src/settings.html` | 在 `</form>` 关闭标签后、`<div id="import-modal">` 前，追加 mount point + dynamic import script |
| `src/types/types.ts` | 追加 4 个 Config interface、CloudTarget union type、SaveBehavior 加 `'cloud'`、Settings 加 8 个可选字段 |
| `src/utils/storage-utils.ts` | 追加 CRUD helper 函数（直接用 `browser.storage.sync.set`，不调用 `saveSettings()`）、secret 存 `storage.local` |
| `src/core/popup.ts` | 追加 `handleSaveToCloud()` 函数、`determineMainAction()` 加 `'cloud'` case、`getActionIcon()` 加 `case 'cloud'` |
| `src/_locales/en/messages.json` | 追加 ~30 个 i18n key |
| `src/_locales/zh_CN/messages.json` | 同上 |

### 4.2 新增文件

```
src/ext/cloud/
├── index.ts                    # 入口，导出主要接口
├── types.ts                   # CloudTarget 相关类型（独立，不污染原 types.ts）
├── adapters/
│   ├── base.ts               # RemoteTarget 工厂函数 + 共用 helper
│   ├── git-repo.ts           # Git adapter
│   ├── webdav.ts             # WebDAV adapter
│   ├── s3.ts                 # S3 adapter
│   └── fast-note.ts          # Fast Note adapter
├── clients/
│   ├── git-repo-client.ts    # GitHub/Gitee REST 客户端
│   ├── webdav-client.ts      # WebDAV 客户端
│   ├── s3-client.ts          # S3 客户端（含 SigV4）
│   └── fast-note-client.ts   # Fast Note 客户端
├── upload.ts                  # 上传分发逻辑
├── ui/
│   ├── cloud-settings.ts     # Settings 页面 cloud section UI
│   └── cloud-modal.ts        # cloud editor modal（复用原 modal 样式）
└── __tests__/
    ├── base.test.ts
    ├── s3-client.test.ts
    └── fast-note-client.test.ts
```

---

## 五、核心类型设计

### 5.1 src/ext/cloud/types.ts

```typescript
// 每个 adapter 的配置类型
export interface GitRepoConfig {
  type: 'gitRepo';
  id: string;
  name: string;
  provider: 'github' | 'gitee';
  owner: string;
  repo: string;
  branch: string;
  defaultPath?: string;
}

export interface WebdavConfig {
  type: 'webdav';
  id: string;
  name: string;
  url: string;
  username: string;
  defaultPath?: string;
}

export interface S3Config {
  type: 's3';
  id: string;
  name: string;
  endpoint: string;
  bucket: string;
  region: string;
  pathStyle?: boolean;
  defaultPath?: string;
}

export interface FastNoteConfig {
  type: 'fastNote';
  id: string;
  name: string;
  endpoint: string;
  username: string;
  noteId?: string;
  defaultPath?: string;
}

// union type
export type CloudTarget = GitRepoConfig | WebdavConfig | S3Config | FastNoteConfig;
export type CloudTargetType = CloudTarget['type'];

// RemoteTarget 基础接口（所有 adapter 实现）
export interface RemoteTarget {
  readonly type: CloudTargetType;
  readonly typeLabel: string;
  readonly i18nPrefix: string;
  readonly storageKey: string;      // e.g., 'git_repos'
  readonly activeIdKey: string;     // e.g., 'active_git_repo_id'
  readonly secretPrefix: string;    // e.g., 'git_repo'

  // CRUD（实现复用 makeCRUD 工厂）
  list(): Promise<CloudTarget[]>;
  getActiveId(): Promise<string | null>;
  save(config: CloudTarget): Promise<void>;
  delete(id: string): Promise<void>;

  // 能力
  testConnection(config: CloudTarget): Promise<boolean>;
  createClient(config: CloudTarget): RemoteClient;
  mapBehaviorToMode(behavior: TemplateBehavior): 'create' | 'append' | 'prepend' | 'overwrite';
}

// 底层客户端接口
export interface RemoteClient {
  upload(path: string, content: string, mode: 'create' | 'append' | 'prepend' | 'overwrite'): Promise<void>;
}
```

### 5.2 src/types/types.ts 追加

```typescript
// 在 SaveBehavior 类型里加 'cloud'
export type SaveBehavior = 'addToObsidian' | 'saveFile' | 'copyToClipboard' | 'cloud';

// 在 Settings interface 里加可选字段
export interface Settings {
  // ... 原版字段不动 ...

  // Cloud 配置
  gitRepos?: GitRepoConfig[];        // 不含 secret
  activeGitRepoId?: string;
  webdavs?: WebdavConfig[];
  activeWebdavId?: string;
  s3Targets?: S3Config[];
  activeS3Id?: string;
  fastNoteTargets?: FastNoteConfig[];
  activeFastNoteId?: string;

  // Stats
  stats: {
    addToObsidian: number;
    saveFile: number;
    copyToClipboard: number;
    share: number;
    cloud?: number;  // 新增
  };
}
```

---

## 六、存储设计

### 6.1 存储 key 命名（与原版风格一致）

| 类型 | sync key（配置数据） | local key（secret） |
|---|---|---|
| Git | `git_repos` | `cloud_secret_git_repo_{id}` |
| WebDAV | `webdavs` | `cloud_secret_webdav_{id}` |
| S3 | `s3_targets` | `cloud_secret_s3_{id}` |
| Fast Note | `fast_note_targets` | `cloud_secret_fast_note_{id}` |
| Active | `active_git_repo_id` 等 | — |

### 6.2 读写策略

```typescript
// 写入：直接用 browser.storage.sync.set，不调用原版 saveSettings()
async function saveGitRepoConfig(config: GitRepoConfig): Promise<void> {
  const existing = await browser.storage.sync.get('git_repos');
  const list: GitRepoConfig[] = existing.git_repos || [];
  const index = list.findIndex(c => c.id === config.id);
  if (index >= 0) {
    list[index] = config;
  } else {
    list.push(config);
  }
  await browser.storage.sync.set({ git_repos: list });
}

// Secret 存 local（不被导出覆盖）
async function setGitRepoToken(id: string, token: string): Promise<void> {
  await browser.storage.local.set({ [`cloud_secret_git_repo_${id}`]: token });
}
```

### 6.3 导入/导出的影响

- **导出**：cloud 配置（非 secret）会被包含，因为存在 `storage.sync`
- **导入**：secret 不会被覆盖，用户需重新输入
- **无需额外处理**：这是合理的安全边界

---

## 七、Settings 页面 UI

### 7.1 mount point 位置

在 `src/settings.html` 的 `#general-section` 里，`</form>` 关闭后追加：

```html
<!-- 在 <div id="import-modal"> 之前 -->
<div id="cloud-section" class="settings-section" style="display: none;">
  <!-- 内容由 cloud-settings.ts 动态渲染 -->
</div>
```

### 7.2 Dynamic import

在 `settings.html` 末尾的 `<script type="module">` 里追加：

```typescript
// 在 <script type="module" src="settings.js"></script> 之后
import('./ext/cloud/index').then(({ mountCloudSettings }) => {
  mountCloudSettings();
});
```

**注意**：不需要在 webpack entry 加 `'ext-cloud-mount'`，dynamic import 会自动生成 chunk。

### 7.3 Cloud Settings UI 布局

参考原版 `general-settings.ts` 的模式：

```typescript
// src/ext/cloud/ui/cloud-settings.ts
import { getMessage } from '../../utils/i18n';
import { initializeIcons } from '../../icons/icons';
import { ALL_TARGETS, renderCloudTargetList } from '../index';

export function mountCloudSettings(): void {
  const container = document.getElementById('cloud-section');
  if (!container) return;

  // 渲染 section header
  container.innerHTML = `
    <div class="settings-section-header">
      <h2 data-i18n="cloudSettings">Cloud Storage</h2>
    </div>
    <div class="setting-group">
      <div class="setting-items">
        <div class="setting-item">
          <label data-i18n="cloudActiveTarget">Active cloud target</label>
          <select id="cloud-active-target">
            <option value="">—</option>
          </select>
        </div>
      </div>
      <div id="cloud-target-list"></div>
      <button type="button" id="add-cloud-target-btn" class="mod-cta">
        + <span data-i18n="cloudAddTarget">Add cloud target</span>
      </button>
    </div>
  `;

  // 事件绑定 + 渲染列表
  bindCloudEvents();
  renderCloudTargetList();
  initializeIcons(container);
}
```

### 7.4 Modal 复用原版结构

```typescript
// src/ext/cloud/ui/cloud-modal.ts
// 直接复用 settings.html 里的 modal 结构和样式
// 在 body 末尾创建 modal，不修改 settings.html

export function openCloudEditorModal(targetType?: CloudTargetType, existingConfig?: CloudTarget): void {
  // 复用原版 modal 样式
  const modalHtml = `
    <div id="cloud-editor-modal" class="modal-container">
      <div class="modal-bg"></div>
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" data-i18n="cloudEditorTitle">Cloud Target</div>
        </div>
        <div class="modal-content">
          <form id="cloud-editor-form">
            <div class="setting-item">
              <label data-i18n="cloudType">Type</label>
              <select id="cloud-type-select">...</select>
            </div>
            <!-- type-specific fields by data-type attribute -->
            <div id="cloud-fields-gitRepo" class="cloud-fields" style="display:none">...</div>
            <div id="cloud-fields-webdav" class="cloud-fields" style="display:none">...</div>
            ...
          </form>
        </div>
        <div class="modal-button-container">
          <button class="cloud-save-btn mod-cta" data-i18n="save">Save</button>
          <button class="cloud-test-btn" data-i18n="cloudTest">Test connection</button>
          <button class="cloud-delete-btn mod-warning" data-i18n="delete">Delete</button>
          <button class="cloud-cancel-btn" data-i18n="cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;
  // 挂载到 body
  // 绑定事件...
}
```

---

## 八、Popup 集成

### 8.1 追加 handleSaveToCloud

在 `src/core/popup.ts` 末尾追加：

```typescript
// src/core/popup.ts 末尾追加

async function handleSaveToCloud(): Promise<void> {
  if (!currentTemplate) return;

  const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
  const noteNameField = document.getElementById('note-name-field') as HTMLTextAreaElement;
  if (!noteContentField) return;

  try {
    // 收集字段
    const properties = getPropertiesFromDOM();
    const frontmatter = await generateFrontmatter(properties);
    const content = frontmatter + noteContentField.value;
    const title = noteNameField?.value || 'Untitled';

    // 动态 import cloud 模块
    const { executeRemoteUpload } = await import('../ext/cloud/upload');

    const result = await executeRemoteUpload({
      template: currentTemplate,
      title,
      content
    });

    if (result.success) {
      await incrementStat('cloud');
      showSuccess('cloudSaveSuccess');
      if (!isSidePanel) {
        setTimeout(() => window.close(), 500);
      }
    } else {
      showError(result.error || 'cloudSaveFailed');
    }
  } catch (error) {
    console.error('Cloud save error:', error);
    showError('cloudSaveFailed');
  }
}
```

### 8.2 determineMainAction 加 'cloud' case

```typescript
// src/core/popup.ts determineMainAction() 函数里追加

// 在 default case 之后、函数结束前追加：
case 'cloud':
  mainButton.textContent = getMessage('saveToCloud');
  mainButton.onclick = handleSaveToCloud;
  // 不加 secondary action（cloud 本身已经是增强功能）
  break;
```

### 8.3 getActionIcon 加 'cloud' case

```typescript
// src/core/popup.ts getActionIcon() 函数里追加

case 'cloud': return 'cloud';
```

---

## 九、Adapter 实现要点

### 9.1 工厂函数 makeRemoteTarget

```typescript
// src/ext/cloud/adapters/base.ts

interface TargetSchema<T extends CloudTarget> {
  type: T['type'];
  storageKey: string;
  activeIdKey: string;
  secretPrefix: string;
  typeLabel: string;
  i18nPrefix: string;
  validate(config: CloudTarget): string | null;  // 返回错误消息或 null
  createClient(config: T, secret: string): RemoteClient;
}

export function makeRemoteTarget<T extends CloudTarget>(
  schema: TargetSchema<T>
): RemoteTarget {
  return {
    get type() { return schema.type; },
    get typeLabel() { return schema.typeLabel; },
    get i18nPrefix() { return schema.i18nPrefix; },
    get storageKey() { return schema.storageKey; },
    get activeIdKey() { return schema.activeIdKey; },
    get secretPrefix() { return schema.secretPrefix; },

    async list() {
      const data = await browser.storage.sync.get(schema.storageKey);
      return data[schema.storageKey] || [];
    },

    async getActiveId() {
      const data = await browser.storage.sync.get(schema.activeIdKey);
      return data[schema.activeIdKey] || null;
    },

    async save(config: T) {
      const list = await this.list();
      const index = list.findIndex(c => c.id === config.id);
      if (index >= 0) {
        list[index] = config;
      } else {
        list.push(config);
      }
      await browser.storage.sync.set({ [schema.storageKey]: list });
    },

    async delete(id: string) {
      const list = await this.list();
      const filtered = list.filter(c => c.id !== id);
      await browser.storage.sync.set({ [schema.storageKey]: filtered });
      await browser.storage.local.remove(`${schema.secretPrefix}_${id}`);
    },

    async testConnection(config: T) {
      try {
        const secret = await getSecret(schema.secretPrefix, config.id);
        const client = schema.createClient(config, secret);
        await client.ping();  // 简单连通性测试
        return true;
      } catch {
        return false;
      }
    },

    createClient(config: T) {
      // 需要 secret，从 storage.local 读取
      // 这里返回 client，upload 时再读取 secret
    },

    mapBehaviorToMode(behavior) {
      // 复用 defaultMapBehaviorToMode
    }
  };
}

// 辅助函数
async function getSecret(prefix: string, id: string): Promise<string> {
  const data = await browser.storage.local.get(`${prefix}_${id}`);
  return data[`${prefix}_${id}`] || '';
}
```

### 9.2 4 个 Adapter 示例（Git）

```typescript
// src/ext/cloud/adapters/git-repo.ts

import { makeRemoteTarget } from './base';
import { GitRepoConfig } from '../types';
import { GitRepoClient } from '../clients/git-repo-client';

export const gitRepoTarget = makeRemoteTarget<GitRepoConfig>({
  type: 'gitRepo',
  storageKey: 'git_repos',
  activeIdKey: 'active_git_repo_id',
  secretPrefix: 'git_repo',
  typeLabel: 'Git Repository',
  i18nPrefix: 'cloudGitRepo',

  validate(config) {
    if (!config.provider) return 'cloudGitRepoErrorProvider';
    if (!config.owner) return 'cloudGitRepoErrorOwner';
    if (!config.repo) return 'cloudGitRepoErrorRepo';
    if (!config.branch) return 'cloudGitRepoErrorBranch';
    return null;
  },

  createClient(config, token) {
    return new GitRepoClient({
      provider: config.provider,
      token,
      owner: config.owner,
      repo: config.repo,
      branch: config.branch
    });
  }
});
```

### 9.3 客户端实现要点

**GitRepoClient**：调用 GitHub/Gitee REST API，PUT `/repos/{owner}/{repo}/contents/{path}`

**WebdavClient**：Basic auth，PROPFIND + PUT

**S3Client**：完整 SigV4 签名（4 次 HMAC-SHA256 链），默认 path-style

**FastNoteClient**：登录获取 token，请求带 Authorization header，401 自动重登

---

## 十、i18n

### 10.1 需要的 key（~30 个）

```
cloudSettings           - Cloud Storage（标题）
cloudActiveTarget       - Active cloud target
cloudAddTarget          - Add cloud target
cloudEditorTitle        - Cloud Target Editor
cloudType               - Type
cloudSaveSuccess        - Saved to cloud successfully
cloudSaveFailed         - Failed to save to cloud
cloudTest               - Test connection
cloudTestSuccess        - Connection successful
cloudTestFailed         - Connection failed
cloudDeleteConfirm      - Delete this target?
cloudLabelName          - Name
cloudLabelToken         - Token / Password
cloudLabelUrl           - URL
cloudLabelUsername      - Username
cloudLabelEndpoint      - Endpoint
cloudLabelBucket        - Bucket
cloudLabelRegion        - Region
cloudLabelPathStyle     - Path-style URL
cloudLabelProvider      - Provider
cloudLabelOwner         - Owner
cloudLabelRepo          - Repository
cloudLabelBranch        - Branch
cloudLabelNoteId        - Note ID
cloudGitRepoError*       - 验证错误消息
cloudWebdavError*
cloudS3Error*
cloudFastNoteError*
```

### 10.2 使用方式

```typescript
// 在 cloud 模块里直接 import
import { getMessage } from '../../utils/i18n';

const title = getMessage('cloudSettings');
// 原版 getMessage 已有 fallback 机制，不需要额外处理
```

---

## 十一、验证步骤

```bash
# 1. TypeScript 检查
npx tsc --noEmit

# 2. 单元测试
npx vitest run

# 3. 构建
npm run build:firefox

# 4. 手动测试
# - Settings 页面能显示 Cloud Storage section
# - 能增删改查 4 种类型的 cloud target
# - 能测试连接
# - Popup 里有"保存到云"按钮
# - 导入导出设置后 cloud 配置保留（secret 除外）
```

---

## 十二、注意事项

### 12.1 不要做的事

- ❌ **不要**修改 `src/managers/general-settings.ts`
- ❌ **不要**修改 `src/core/settings.ts`
- ❌ **不要**修改 `src/manifest.*.json`（除非功能需要额外权限）
- ❌ **不要**把 cloud 表单放在 `#general-settings-form` 内（会触发自动保存）
- ❌ **不要**直接 import 原版的 `saveSettings()`（用 `browser.storage.sync.set` 单独写 key）

### 12.2 manifest 权限（如需要）

如果 cloud 后端需要跨域请求，在 `manifest.*.json` 里加：

```json
{
  "permissions": ["storage"],
  "optional_host_permissions": ["https://*/*", "http://*/*"]
}
```

用户可以在扩展管理页面自行授权特定域名。

### 12.3 合并上游更新时

- 原版 types.ts 改动 → 手动合并 cloud 追加的类型
- 原版 storage-utils.ts 改动 → 检查是否影响 cloud 的 CRUD 函数
- 原版 settings.html 改动 → 检查 mount point 位置是否仍然有效
- 原版 i18n 改动 → 检查 messages.json 的 key 格式

---

## 十三、预估工作量

| 部分 | 估算行数 |
|---|---|
| 原版 types.ts 追加 | ~30 |
| 原版 storage-utils.ts 追加 | ~80 |
| 原版 popup.ts 追加 | ~60 |
| 原版 settings.html 追加 | ~15 |
| 原版 messages.json 追加 | ~150 行 key |
| cloud/types.ts | ~50 |
| cloud/adapters/base.ts | ~100 |
| cloud/adapters/*.ts（4 个） | ~200 |
| cloud/clients/*.ts（4 个） | ~400 |
| cloud/upload.ts | ~80 |
| cloud/ui/*.ts | ~200 |
| cloud/__tests__/*.ts | ~100 |
| **总计** | **~1465 行** |
