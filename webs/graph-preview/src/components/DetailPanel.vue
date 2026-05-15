<script setup lang="ts">
import { computed } from 'vue'
import { ElTag, ElDescriptions, ElDescriptionsItem } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import type { CyNodeData, GraphFileNode, GraphRelation } from '../graph-types'
import { nodeId, fileColors, fileBadges, relationSourceId, relationTargetId, relationEndpointLabel } from '../graph-service'

interface Props {
  visible: boolean
  nodeData: CyNodeData | null
  allNodes: GraphFileNode[]
  allRelations: GraphRelation[]
}

interface Emits {
  (e: 'close'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const originalNode = computed(() => {
  if (!props.nodeData) return null
  return props.allNodes.find((n) => nodeId(n) === props.nodeData!.id) ?? null
})

const outEdges = computed(() => {
  if (!props.nodeData) return []
  const isSymbol = props.nodeData.type === 'symbol'
  return props.allRelations.filter(
    (r) => relationSourceId(r) === props.nodeData!.id || (!isSymbol && r.sourcePath === props.nodeData!.path)
  )
})

const inEdges = computed(() => {
  if (!props.nodeData) return []
  const isSymbol = props.nodeData.type === 'symbol'
  return props.allRelations.filter(
    (r) => relationTargetId(r) === props.nodeData!.id || (!isSymbol && r.targetPath === props.nodeData!.path)
  )
})

function badge(type: string, label: string) {
  const map: Record<string, string> = {
    source: 'src',
    document: 'doc',
    config: 'cfg',
    directory: 'dir',
    asset: 'asset',
    external: 'ext',
    symbol: 'symbol',
    rel: 'rel',
    src: 'src',
    doc: 'doc',
    cfg: 'cfg',
    dir: 'dir',
  }
  const safeType = map[type] || 'asset'
  return { type: safeType === 'rel' ? 'info' : 'primary', label }
}

function escapeHtml(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return str.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || ch))
}
</script>

<template>
  <div id="panel" :class="{ open: visible }">
    <div class="panel-header">
      <h3>节点详情</h3>
      <span class="close" @click="emit('close')">
        <el-icon><Close /></el-icon>
      </span>
    </div>
    <div id="detail" v-if="nodeData">
      <p><strong>{{ nodeData.path }}</strong></p>
      <p v-if="nodeData.type === 'symbol'">
        <strong>元素：</strong>{{ nodeData.label }}
      </p>
      <p>
        <ElTag
          size="small"
          :type="badge(nodeData.type, nodeData.type).type === 'info' ? 'info' : undefined"
          :style="{ backgroundColor: fileColors[nodeData.type] + '22', color: fileColors[nodeData.type], borderColor: fileColors[nodeData.type] + '44' }"
        >
          {{ fileBadges[nodeData.type] || nodeData.type }}
        </ElTag>
        <ElTag v-if="nodeData.language" size="small" type="info">{{ nodeData.language }}</ElTag>
        <ElTag v-if="originalNode?.symbolKind" size="small" type="warning">{{ originalNode.symbolKind }}</ElTag>
      </p>

      <ElDescriptions :column="1" size="small" border>
        <ElDescriptionsItem v-if="nodeData.id" label="节点 ID">{{ nodeData.id }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="nodeData.type" label="类型">{{ nodeData.type }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="originalNode?.fileType" label="文件类型">{{ originalNode.fileType }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="originalNode?.language || nodeData.language" label="语言">{{ originalNode?.language || nodeData.language }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="originalNode?.sizeBytes" label="大小">{{ originalNode.sizeBytes + ' bytes' }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="originalNode?.parser" label="解析器">{{ originalNode.parser }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="originalNode?.parentId" label="父节点">{{ originalNode.parentId }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="originalNode?.nodePath" label="节点路径">{{ originalNode.nodePath }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="originalNode?.range" label="范围">L{{ originalNode.range.startLine }}</ElDescriptionsItem>
      </ElDescriptions>

      <div v-if="outEdges.length > 0" class="edge-section">
        <p><strong>依赖 ({{ outEdges.length }})</strong></p>
        <ul>
          <li v-for="(r, i) in outEdges" :key="`out-${i}`">
            <div class="edge-target">
              <ElTag size="small" type="info">{{ r.relationType || r.type }}</ElTag>
              <span class="edge-arrow">→</span>
              <span class="edge-name">{{ escapeHtml(relationEndpointLabel(allNodes, r, relationTargetId(r), false)) }}</span>
            </div>
            <div v-if="[r.confidence, r.parser, r.range, r.reason].some(Boolean)" class="edge-meta">
              <ElTag v-if="r.confidence" size="small" effect="plain">{{ r.confidence }}</ElTag>
              <ElTag v-if="r.parser" size="small" effect="plain">{{ r.parser }}</ElTag>
              <ElTag v-if="r.range" size="small" effect="plain">L{{ r.range.startLine }}</ElTag>
              <ElTag v-if="r.reason" size="small" effect="plain">{{ r.reason }}</ElTag>
            </div>
            <div v-if="r.evidence" class="edge-evidence">
              {{ escapeHtml(r.evidence) }}
            </div>
          </li>
        </ul>
      </div>

      <div v-if="inEdges.length > 0" class="edge-section">
        <p><strong>被依赖 ({{ inEdges.length }})</strong></p>
        <ul>
          <li v-for="(r, i) in inEdges" :key="`in-${i}`">
            <div class="edge-target">
              <ElTag size="small" type="info">{{ r.relationType || r.type }}</ElTag>
              <span class="edge-arrow">←</span>
              <span class="edge-name">{{ escapeHtml(relationEndpointLabel(allNodes, r, relationSourceId(r), true)) }}</span>
            </div>
            <div v-if="[r.confidence, r.parser, r.range, r.reason].some(Boolean)" class="edge-meta">
              <ElTag v-if="r.confidence" size="small" effect="plain">{{ r.confidence }}</ElTag>
              <ElTag v-if="r.parser" size="small" effect="plain">{{ r.parser }}</ElTag>
              <ElTag v-if="r.range" size="small" effect="plain">L{{ r.range.startLine }}</ElTag>
              <ElTag v-if="r.reason" size="small" effect="plain">{{ r.reason }}</ElTag>
            </div>
            <div v-if="r.evidence" class="edge-evidence">
              {{ escapeHtml(r.evidence) }}
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
#panel {
  width: 360px;
  display: none;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  position: absolute;
  right: 12px;
  top: 12px;
  bottom: 12px;
  z-index: 10;
}

#panel.open {
  display: flex;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e1e4e8;
  background: #fff;
  flex-shrink: 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #172640;
  letter-spacing: -0.01em;
}

.close {
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: #656d76;
  padding: 4px 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
}

.close:hover {
  color: #172640;
  background: #f6f8fa;
}

#detail {
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.6;
  color: #18212f;
  overflow-y: auto;
  flex: 1;
}

#detail p {
  margin-bottom: 8px;
}

#detail ul {
  margin: 4px 0 12px 0;
  list-style: none;
  padding: 0;
}

#detail li {
  word-break: break-all;
  padding: 10px 0;
  border-bottom: 1px solid #e1e4e8;
}

#detail li:last-child {
  border-bottom: none;
}

.edge-section {
  margin-top: 14px;
}

.edge-section p {
  margin-bottom: 8px;
  font-size: 13px;
}

.edge-target {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.edge-arrow {
  color: #8c959f;
  font-weight: 600;
  font-size: 12px;
}

.edge-name {
  color: #1f2328;
  font-weight: 500;
}

.edge-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.edge-evidence {
  font-size: 12px;
  color: #57606a;
  background: #f6f8fa;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #e1e4e8;
  line-height: 1.5;
}

:deep(.el-descriptions__cell) {
  padding: 6px 10px;
}

@media (max-width: 1180px) {
  #panel {
    width: 320px;
  }
}

@media (max-width: 980px) {
  #panel {
    position: fixed;
    top: 64px;
    right: 10px;
    bottom: 10px;
    width: min(340px, 86vw);
    z-index: 50;
  }
}

@media (max-width: 760px) {
  #panel {
    top: auto;
    right: 8px;
    bottom: 8px;
    left: 8px;
    width: auto;
    height: 50vh;
  }
}
</style>
