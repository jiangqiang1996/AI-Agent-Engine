<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import Toolbar from './components/Toolbar.vue'
import DirectoryTree from './components/DirectoryTree.vue'
import GraphCanvas from './components/GraphCanvas.vue'
import DetailPanel from './components/DetailPanel.vue'
import type { CyData, CyNodeData, GraphFileNode, GraphIndex, GraphRelation, GraphSelectedLayer, LoadedGraph } from './graph-types'
import { LAYER_DEFS } from './graph-types'
import {
  loadGraphData,
  buildDirectoryStats,
  buildCyData,
  getAvailableRelationTypes,
  layerStats,
} from './graph-service'

const allNodes = ref<GraphFileNode[]>([])
const allRelations = ref<GraphRelation[]>([])
const graphIndex = ref<GraphIndex | null>(null)
const loaded = ref(false)
const loading = ref(false)
const error = ref('')

const selectedLayer = ref<GraphSelectedLayer>('full')
const dirFilter = ref('')
const relationSearch = ref('')
const granularity = ref('file')
const typeFilter = ref('')
const layoutMode = ref('cose')
const nodeLimit = ref(80)
const unselectedDirs = ref<Set<string>>(new Set())
const collapsedDirs = ref<Set<string>>(new Set())

const statusText = ref('加载中...')
const statusType = ref<'success' | 'warning' | 'danger' | 'info'>('info')

const cyData = ref<CyData | null>(null)
const detailVisible = ref(false)
const selectedNode = ref<CyNodeData | null>(null)
let renderFrame = 0

const directoryStats = computed(() => buildDirectoryStats(allNodes.value, allRelations.value))

const graphCanvasRef = ref<InstanceType<typeof GraphCanvas>>()

const relationTypeOptions = computed(() => {
  if (!graphIndex.value) return []
  return getAvailableRelationTypes(graphIndex.value, selectedLayer.value, granularity.value)
})

const layerRelCounts = computed(() => {
  if (!graphIndex.value) return { full: 0, code: 0, document: 0, artifact: 0 }
  return layerStats(graphIndex.value)
})

async function init() {
  loading.value = true
  try {
    const data: LoadedGraph = await loadGraphData('.')
    allNodes.value = data.files
    allRelations.value = data.relations
    graphIndex.value = data.index
    loaded.value = true
    statusText.value = `已加载: ${allNodes.value.length} 文件 / ${allRelations.value.length} 关系 | 正在渲染...`
    statusType.value = 'success'
    doRender()
    ElMessage.success(`已加载 ${allNodes.value.length} 个文件和 ${allRelations.value.length} 条关系`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = message
    statusText.value = `加载失败: ${message}`
    statusType.value = 'danger'
    ElMessage.error(`加载失败: ${message}`)
  } finally {
    loading.value = false
  }
}

function onLayerChange(layer: GraphSelectedLayer) {
  selectedLayer.value = layer
  typeFilter.value = ''
  doRender()
}

function onGranularityChange() {
  typeFilter.value = ''
  doRender()
}

function renderNow() {
  if (!loaded.value || !graphIndex.value) return
  const data = buildCyData({
    index: graphIndex.value,
    selectedLayer: selectedLayer.value,
    fileFilter: dirFilter.value.trim().replace(/\/+$/, ''),
    typeFilter: typeFilter.value,
    nodeLimit: nodeLimit.value,
    granularity: granularity.value,
    relationSearch: relationSearch.value.trim(),
    unselectedDirs: unselectedDirs.value,
  })
  cyData.value = data
  const layerLabel = LAYER_DEFS.find((l) => l.id === selectedLayer.value)?.label ?? selectedLayer.value
  const granLabel = granularity.value === 'symbol' ? '元素' : granularity.value === 'mixed' ? '混合' : '文件'
  statusText.value = `${layerLabel} · ${granLabel} | ${data.stats.nodes} 节点 / ${data.stats.edges} 边 | 候选: ${data.stats.filteredFiles} 文件 / ${data.stats.filteredRelations} 关系`
}

function doRender() {
  if (renderFrame) cancelAnimationFrame(renderFrame)
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0
    renderNow()
  })
}

function setCheckedDirs(paths: string[]) {
  const checked = new Set(paths)
  unselectedDirs.value = new Set(directoryStats.value.map((dir) => dir.path).filter((path) => !checked.has(path)))
  doRender()
}

function clearUnselected() {
  dirFilter.value = ''
  doRender()
}

function selectAllDirs() {
  unselectedDirs.value = new Set()
  doRender()
  ElMessage.success('已全选所有目录')
}

function unselectAllDirs() {
  unselectedDirs.value = new Set(directoryStats.value.map((dir) => dir.path))
  doRender()
  ElMessage.success('已取消所有目录')
}

function fitGraph() {
  graphCanvasRef.value?.fit()
}

function onNodeTap(nodeData: CyNodeData) {
  selectedNode.value = nodeData
  detailVisible.value = true
}

function onCanvasTap() {
  detailVisible.value = false
}

onMounted(() => {
  init()
})
</script>

<template>
  <div class="app">
    <Toolbar
      v-model:selected-layer="selectedLayer"
      v-model:dir-filter="dirFilter"
      v-model:relation-search="relationSearch"
      v-model:granularity="granularity"
      v-model:type-filter="typeFilter"
      v-model:layout-mode="layoutMode"
      v-model:node-limit="nodeLimit"
      :relation-type-options="relationTypeOptions"
      :layer-rel-counts="layerRelCounts"
      :status-text="statusText"
      :status-type="statusType"
      @layer-change="onLayerChange"
      @granularity-change="onGranularityChange"
      @render="doRender"
      @fit="fitGraph"
      @clear-dir="clearUnselected"
      @show-hidden="selectAllDirs"
    />

    <div class="main">
      <DirectoryTree
        :dirs="directoryStats"
        :unselected-dirs="unselectedDirs"
        :collapsed-dirs="collapsedDirs"
        @set-checked-dirs="setCheckedDirs"
        @select-all-dirs="selectAllDirs"
        @unselect-all-dirs="unselectAllDirs"
      />

      <GraphCanvas
        ref="graphCanvasRef"
        :cy-data="cyData"
        :layout-mode="layoutMode"
        @node-tap="onNodeTap"
        @canvas-tap="onCanvasTap"
      />

      <DetailPanel
        :visible="detailVisible"
        :node-data="selectedNode"
        :all-nodes="allNodes"
        :all-relations="allRelations"
        @close="detailVisible = false"
      />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f4f6f8;
}

.main {
  display: grid;
  grid-template-columns: minmax(260px, 18vw) minmax(0, 1fr);
  flex: 1;
  overflow: hidden;
  padding: 12px;
  gap: 12px;
  position: relative;
}

@media (max-width: 1180px) {
  .main {
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
  }
}

@media (max-width: 980px) {
  .main {
    grid-template-columns: 220px minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .main {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(40vh, 1fr);
    padding: 8px;
    gap: 8px;
  }
}
</style>
