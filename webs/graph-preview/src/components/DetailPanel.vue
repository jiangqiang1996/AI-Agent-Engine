<script setup lang="ts">
import { computed } from 'vue'
import { ElTag } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import type { CyNodeData, GraphFileNode, GraphRelation } from '../graph-types'
import { nodeId, symbolNodeId, fileColors, fileBadges, relationSourceId, relationTargetId, relationEndpointLabel, relationLabel, typeColors } from '../graph-service'

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
  const data = props.nodeData
  return props.allNodes.find((n) => {
    const nid = n.kind === 'symbol' ? symbolNodeId(n) : nodeId(n)
    return nid === data.id
  }) ?? null
})

const relationIndex = computed(() => {
  const bySource = new Map<string, GraphRelation[]>()
  const byTarget = new Map<string, GraphRelation[]>()
  for (const r of props.allRelations) {
    const src = relationSourceId(r)
    const tgt = relationTargetId(r)
    let list = bySource.get(src)
    if (!list) { list = []; bySource.set(src, list) }
    list.push(r)
    list = byTarget.get(tgt)
    if (!list) { list = []; byTarget.set(tgt, list) }
    list.push(r)
  }
  return { bySource, byTarget }
})

const allNodeEdges = computed(() => {
  if (!props.nodeData) return { out: [] as GraphRelation[], in: [] as GraphRelation[] }
  const nid = props.nodeData.id
  const isSymbol = props.nodeData.type === 'symbol'
  if (isSymbol) {
    return { out: relationIndex.value.bySource.get(nid) ?? [], in: relationIndex.value.byTarget.get(nid) ?? [] }
  }
  const path = props.nodeData.path
  const out: GraphRelation[] = []
  const inn: GraphRelation[] = []
  for (const r of props.allRelations) {
    if (r.sourcePath === path) out.push(r)
    if (r.targetPath === path) inn.push(r)
  }
  return { out, in: inn }
})

const outEdges = computed(() => allNodeEdges.value.out)
const inEdges = computed(() => allNodeEdges.value.in)

const groupedOutEdges = computed(() => groupEdgesByType(outEdges.value))
const groupedInEdges = computed(() => groupEdgesByType(inEdges.value))

function groupEdgesByType(edges: GraphRelation[]): Map<string, GraphRelation[]> {
  const map = new Map<string, GraphRelation[]>()
  for (const edge of edges) {
    const type = edge.relationType ?? edge.type ?? 'unknown'
    const group = map.get(type)
    if (group) {
      group.push(edge)
    } else {
      map.set(type, [edge])
    }
  }
  return map
}

function edgeColor(type: string): string {
  return typeColors[type] ?? '#6e7781'
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
      <p class="node-path">{{ nodeData.path }}</p>
      <p v-if="nodeData.type === 'symbol'" class="node-symbol">
        <strong>{{ nodeData.symbolKind ? nodeData.symbolKind + ' ' : '' }}</strong>
        <code>{{ nodeData.label }}</code>
      </p>

      <div class="tag-row">
        <ElTag
          size="small"
          :style="{ backgroundColor: fileColors[nodeData.type] + '22', color: fileColors[nodeData.type], borderColor: fileColors[nodeData.type] + '44' }"
        >
          {{ fileBadges[nodeData.type] || nodeData.type }}
        </ElTag>
        <ElTag v-if="nodeData.language" size="small" type="info">{{ nodeData.language }}</ElTag>
        <ElTag v-if="nodeData.ecosystem" size="small" type="warning">{{ nodeData.ecosystem }}</ElTag>
        <ElTag v-if="originalNode?.symbolKind" size="small" type="warning">{{ originalNode.symbolKind }}</ElTag>
        <ElTag v-if="originalNode?.version" size="small" effect="plain">{{ originalNode.version }}</ElTag>
      </div>

      <div class="edge-section" v-if="outEdges.length > 0">
        <p class="section-title">依赖 ({{ outEdges.length }})</p>
        <div v-for="([type, edges], idx) in [...groupedOutEdges.entries()]" :key="'ot-' + idx">
          <div class="edge-group-label">
            <span class="edge-type-dot" :style="{ background: edgeColor(type) }"></span>
            {{ relationLabel(type) }}
            <span class="edge-count">({{ edges.length }})</span>
          </div>
          <ul>
            <li v-for="(r, i) in edges" :key="`out-${idx}-${i}`">
              <div class="edge-target">
                <span class="edge-arrow">→</span>
                <span class="edge-name">{{ relationEndpointLabel(allNodes, r, relationTargetId(r), false) }}</span>
              </div>
              <div v-if="[r.confidence, r.parser, r.range, r.reason].some(Boolean)" class="edge-meta">
                <ElTag v-if="r.confidence" size="small" effect="plain">{{ r.confidence }}</ElTag>
                <ElTag v-if="r.parser" size="small" effect="plain">{{ r.parser }}</ElTag>
                <ElTag v-if="r.range" size="small" effect="plain">L{{ r.range.startLine }}</ElTag>
              </div>
              <div v-if="r.evidence" class="edge-evidence">{{ r.evidence }}</div>
            </li>
          </ul>
        </div>
      </div>

      <div class="edge-section" v-if="inEdges.length > 0">
        <p class="section-title">被依赖 ({{ inEdges.length }})</p>
        <div v-for="([type, edges], idx) in [...groupedInEdges.entries()]" :key="'it-' + idx">
          <div class="edge-group-label">
            <span class="edge-type-dot" :style="{ background: edgeColor(type) }"></span>
            {{ relationLabel(type) }}
            <span class="edge-count">({{ edges.length }})</span>
          </div>
          <ul>
            <li v-for="(r, i) in edges" :key="`in-${idx}-${i}`">
              <div class="edge-target">
                <span class="edge-arrow">←</span>
                <span class="edge-name">{{ relationEndpointLabel(allNodes, r, relationSourceId(r), true) }}</span>
              </div>
              <div v-if="[r.confidence, r.parser, r.range, r.reason].some(Boolean)" class="edge-meta">
                <ElTag v-if="r.confidence" size="small" effect="plain">{{ r.confidence }}</ElTag>
                <ElTag v-if="r.parser" size="small" effect="plain">{{ r.parser }}</ElTag>
                <ElTag v-if="r.range" size="small" effect="plain">L{{ r.range.startLine }}</ElTag>
              </div>
              <div v-if="r.evidence" class="edge-evidence">{{ r.evidence }}</div>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="outEdges.length === 0 && inEdges.length === 0" class="edge-section">
        <p class="no-edges">无关联关系</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
#panel {
  width: 380px;
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
}

.close {
  cursor: pointer;
  font-size: 18px;
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

.node-path {
  margin-bottom: 6px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  color: #0969da;
  word-break: break-all;
}

.node-symbol {
  margin-bottom: 10px;
}

.node-symbol code {
  background: #f6f8fa;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #8250df;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 14px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #172640;
}

.edge-section {
  margin-top: 14px;
}

.edge-group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 4px;
  font-size: 11px;
  font-weight: 600;
  color: #656d76;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.edge-type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.edge-count {
  font-weight: 400;
  color: #8c959f;
}

ul {
  margin: 4px 0 12px;
  list-style: none;
  padding: 0;
}

li {
  word-break: break-all;
  padding: 10px 0;
  border-bottom: 1px solid #e1e4e8;
}

li:last-child {
  border-bottom: none;
}

.edge-target {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
}

.edge-arrow {
  color: #8c959f;
  font-weight: 600;
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 1px;
}

.edge-name {
  color: #1f2328;
  font-weight: 500;
  word-break: break-all;
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
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.no-edges {
  color: #8c959f;
  font-style: italic;
}

@media (max-width: 1180px) {
  #panel {
    width: 340px;
  }
}

@media (max-width: 980px) {
  #panel {
    position: fixed;
    top: 64px;
    right: 10px;
    bottom: 10px;
    width: min(360px, 86vw);
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
