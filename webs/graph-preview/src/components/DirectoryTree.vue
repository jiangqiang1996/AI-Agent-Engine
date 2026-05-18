<script setup lang="ts">
import { computed, h, nextTick, ref, watch } from 'vue'
import type { VNode } from 'vue'
import { ElTree, ElButton } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import type { DirectoryStat } from '../graph-types'

interface TreeNode {
  label: string
  name: string
  path: string
  kind: 'directory' | 'file'
  files: number
  relations: number
  children?: TreeNode[]
}

interface Props {
  dirs: DirectoryStat[]
  unselectedDirs: Set<string>
  collapsedDirs: Set<string>
}

interface Emits {
  (e: 'setCheckedDirs', paths: string[]): void
  (e: 'selectAllDirs'): void
  (e: 'unselectAllDirs'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const treeRef = ref<InstanceType<typeof ElTree>>()
const expandedDirs = ref<Set<string>>(new Set())
let skipNextCheckedSync = false

const treeIndex = computed(() => {
  const root: TreeNode[] = []
  const map = new Map<string, TreeNode>()
  const descendantsByPath = new Map<string, string[]>()

  for (const dir of props.dirs) {
    const parts = dir.path.split('/')
    const name = parts[parts.length - 1] || dir.path
    const node: TreeNode = {
      label: name,
      name,
      path: dir.path,
      kind: dir.kind,
      files: dir.files,
      relations: dir.relations,
    }
    map.set(dir.path, node)

    if (parts.length === 1) {
      root.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = map.get(parentPath)
      if (parent) {
        if (!parent.children) {
          parent.children = []
        }
        parent.children.push(node)
      }
    }
  }

  const collect = (node: TreeNode): string[] => {
    const paths: string[] = []
    for (const child of node.children ?? []) {
      paths.push(child.path, ...collect(child))
    }
    descendantsByPath.set(node.path, paths)
    return paths
  }

  for (const node of root) {
    collect(node)
  }

  return { root, descendantsByPath }
})

const treeData = computed(() => treeIndex.value.root)

// Tree expects checked keys to mean "selected"
// But our model is "unselectedDirs" - so checked = NOT in unselectedDirs
const checkedKeys = computed(() => {
  return props.dirs
    .filter((dir) => !props.unselectedDirs.has(dir.path))
    .map((dir) => dir.path)
})

const allDirsSelected = computed(() => checkedKeys.value.length === props.dirs.length)
const expandedKeys = computed(() => Array.from(expandedDirs.value))

function toggleAllDirs() {
  if (allDirsSelected.value) {
    emit('unselectAllDirs')
    return
  }
  emit('selectAllDirs')
}

function onCheck(data: TreeNode, state: { checkedKeys: Array<string | number> }) {
  const checked = new Set(state.checkedKeys.map(String))
  const isChecked = checked.has(data.path)
  const descendants = treeIndex.value.descendantsByPath.get(data.path) ?? []
  for (const path of descendants) {
    if (isChecked) {
      checked.add(path)
    } else {
      checked.delete(path)
    }
    treeRef.value?.setChecked(path, isChecked, false)
  }
  skipNextCheckedSync = true
  emit('setCheckedDirs', Array.from(checked))
}

function customNodeClass(_data: TreeNode): string {
  return ''
}

function restoreExpandedDirs() {
  nextTick(() => {
    for (const path of expandedDirs.value) {
      const node = treeRef.value?.getNode(path)
      if (node) {
        node.expanded = true
      }
    }
  })
}

function onNodeExpand(data: TreeNode) {
  expandedDirs.value.add(data.path)
}

function onNodeCollapse(data: TreeNode) {
  expandedDirs.value.delete(data.path)
}

function renderNode(_h: typeof h, context: unknown): VNode {
  const data = (context as { data: TreeNode }).data
  const meta = data.kind === 'file' ? '文件' : `${data.files} · ${data.relations}`
  return h(
    'span',
    { class: ['tree-node-label', `tree-node-${data.kind}`, customNodeClass(data)] },
    [
      h('span', { class: 'tree-node-name', title: data.path }, data.name),
      h('span', { class: 'tree-node-meta' }, meta),
    ],
  )
}

// Watch for changes and update tree
watch(
  () => props.unselectedDirs,
  () => {
    if (skipNextCheckedSync) {
      skipNextCheckedSync = false
      return
    }
    treeRef.value?.setCheckedKeys(checkedKeys.value, false)
    restoreExpandedDirs()
  },
)

watch(
  () => props.dirs,
  () => {
    treeRef.value?.setCheckedKeys(checkedKeys.value, false)
    restoreExpandedDirs()
  },
)
</script>

<template>
  <aside id="sidebar">
    <div class="side-head">
      <h2>项目节点</h2>
      <div class="side-help">勾选控制图谱可见范围；顶级展示图谱中的根节点，箭头展开或折叠下级。</div>
    </div>
    <div class="side-actions">
      <ElButton size="small" type="primary" :icon="Check" @click="toggleAllDirs">
        {{ allDirsSelected ? '全不选' : '全选' }}
      </ElButton>
    </div>
    <div class="tree-wrapper">
      <ElTree
        ref="treeRef"
        class="directory-tree"
        :data="treeData"
        node-key="path"
        :default-checked-keys="checkedKeys"
        :default-expanded-keys="expandedKeys"
        show-checkbox
        check-strictly
        :props="{ label: 'label', children: 'children' }"
        :render-content="renderNode"
        @check="onCheck"
        @node-expand="onNodeExpand"
        @node-collapse="onNodeCollapse"
      />
    </div>
  </aside>
</template>

<style scoped>
#sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.side-head {
  padding: 12px 14px 8px;
  border-bottom: 1px solid #e1e4e8;
  background: #fff;
  flex-shrink: 0;
}

.side-head h2 {
  font-size: 14px;
  margin-bottom: 3px;
  color: #172640;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.side-help {
  font-size: 11px;
  line-height: 1.45;
  color: #656d76;
}

.side-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid #e1e4e8;
  flex-shrink: 0;
}

.tree-wrapper {
  flex: 1;
  overflow: auto;
  padding: 6px 0;
}

:deep(.directory-tree) {
  --el-tree-node-content-height: 32px;
  background: transparent;
  padding-left: 4px;
}

:deep(.el-tree-node) {
  position: relative;
}

:deep(.el-tree-node__children) {
  position: relative;
  margin-left: 14px;
  padding-left: 14px;
}

:deep(.el-tree-node__children::before) {
  content: "";
  position: absolute;
  top: 0;
  bottom: 8px;
  left: 6px;
  width: 1px;
  background: #d0d7de;
}

:deep(.el-tree-node__children .el-tree-node__content::before) {
  content: "";
  position: absolute;
  left: -8px;
  width: 12px;
  height: 1px;
  background: #d0d7de;
}

:deep(.el-tree-node__expand-icon) {
  color: #656d76;
}

:deep(.el-tree-node__content) {
  position: relative;
  height: 32px;
  padding-left: 6px !important;
  border-radius: 7px;
  margin: 2px 8px 2px 0;
  border-left: 3px solid transparent;
  transition: background-color 0.15s ease;
}

:deep(.el-tree-node__children .el-tree-node__content) {
  background: linear-gradient(90deg, rgba(246, 248, 250, 0.9), rgba(246, 248, 250, 0));
}

:deep(.el-tree-node__content:hover) {
  background-color: #f3f4f6;
  border-left-color: #0969da;
}

:deep(.tree-node-label) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  width: 100%;
  overflow: hidden;
  gap: 8px;
  padding-right: 4px;
}

:deep(.tree-node-name) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, SFMono, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  color: #1f2328;
  flex: 1;
}

:deep(.tree-node-meta) {
  font-size: 10px;
  color: #8c959f;
  white-space: nowrap;
  font-weight: 500;
  letter-spacing: 0.01em;
  background: #f6f8fa;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #e1e4e8;
}

@media (max-width: 760px) {
  #sidebar {
    max-height: 30vh;
    border-radius: 10px;
  }
}
</style>
