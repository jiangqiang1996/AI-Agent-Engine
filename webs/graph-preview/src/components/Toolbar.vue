<script setup lang="ts">
import { ElInput, ElSelect, ElOption, ElButton, ElTag } from 'element-plus'
import { FullScreen } from '@element-plus/icons-vue'
import { LAYER_DEFS, type GraphSelectedLayer } from '../graph-types.js'
import { fileColors } from '../graph-service.js'

interface Props {
  selectedLayer: GraphSelectedLayer
  dirFilter: string
  relationSearch: string
  granularity: string
  typeFilter: string
  layoutMode: string
  nodeLimit: number
  relationTypeOptions: Array<{ label: string; value: string }>
  layerRelCounts: Record<GraphSelectedLayer, number>
  statusText: string
  statusType: 'success' | 'warning' | 'danger' | 'info'
}

interface Emits {
  (e: 'update:selectedLayer', value: GraphSelectedLayer): void
  (e: 'update:dirFilter', value: string): void
  (e: 'update:relationSearch', value: string): void
  (e: 'update:granularity', value: string): void
  (e: 'update:typeFilter', value: string): void
  (e: 'update:layoutMode', value: string): void
  (e: 'update:nodeLimit', value: number): void
  (e: 'layerChange', value: GraphSelectedLayer): void
  (e: 'granularityChange'): void
  (e: 'render'): void
  (e: 'fit'): void
  (e: 'clearDir'): void
  (e: 'showHidden'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const granularityModes = [
  { label: '文件级', value: 'file' },
  { label: '元素级', value: 'symbol' },
  { label: '混合', value: 'mixed' },
]

const layoutModes = [
  { label: '力导向', value: 'cose' },
  { label: '依赖层级', value: 'breadthfirst' },
  { label: '圆形', value: 'circle' },
  { label: '同心圆', value: 'concentric' },
  { label: '网格', value: 'grid' },
]

const nodeLimits = [
  { label: '80', value: 80 },
  { label: '150', value: 150 },
  { label: '300', value: 300 },
  { label: '800', value: 800 },
  { label: '全部', value: 0 },
]

function onLayerClick(layer: GraphSelectedLayer) {
  if (layer !== props.selectedLayer) {
    emit('update:selectedLayer', layer)
    emit('layerChange', layer)
  }
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

const layerLegend: Partial<Record<GraphSelectedLayer, { label: string; color: string }[]>> = {
  full: [
    { label: '源码', color: fileColors.source },
    { label: '文档', color: fileColors.document },
    { label: '配置', color: fileColors.config },
    { label: '元素', color: fileColors.symbol },
    { label: '外部', color: fileColors.external },
  ],
  code: [
    { label: '源码', color: fileColors.source },
    { label: '元素', color: fileColors.symbol },
  ],
  document: [
    { label: '文档', color: fileColors.document },
  ],
  artifact: [
    { label: '外部包', color: fileColors.external },
  ],
}

</script>

<template>
  <div class="toolbar">
    <div class="tb-row top-row">
      <div class="brand">
        <div class="brand-mark">AE</div>
        <div class="brand-title">关系图谱</div>
      </div>

      <div class="layer-tabs">
        <button
          v-for="layer in LAYER_DEFS"
          :key="layer.id"
          class="layer-tab"
          :class="{ active: selectedLayer === layer.id }"
          :title="layer.description"
          @click="onLayerClick(layer.id)"
        >
          <span class="layer-tab-label">{{ layer.label }}</span>
          <span class="layer-tab-count">{{ fmtCount(layerRelCounts[layer.id]) }}</span>
        </button>
      </div>

      <div class="tb-spacer" />

      <div class="control-group">
        <ElInput
          :model-value="props.relationSearch"
          @update:model-value="v => emit('update:relationSearch', v)"
          placeholder="搜索关系、路径或证据…"
          size="small"
          style="width: 180px"
          @keyup.enter="emit('render')"
        />
      </div>

      <div class="control-group" v-if="selectedLayer !== 'artifact'">
        <label>粒度</label>
        <ElSelect
          :model-value="props.granularity"
          @update:model-value="v => { emit('update:granularity', v as string); emit('granularityChange') }"
          size="small"
          style="width: 80px"
          @change="() => emit('render')"
        >
          <ElOption v-for="item in granularityModes" :key="item.value" :label="item.label" :value="item.value" />
        </ElSelect>
      </div>
    </div>

    <div class="tb-row bottom-row">
      <div class="control-group">
        <label>目录</label>
        <ElInput
          :model-value="props.dirFilter"
          @update:model-value="v => emit('update:dirFilter', v)"
          placeholder="如 src/services"
          size="small"
          style="width: 130px"
          @keyup.enter="emit('render')"
        />
      </div>

      <div class="control-group" v-if="relationTypeOptions.length > 1">
        <label>关系</label>
        <ElSelect
          :model-value="props.typeFilter"
          @update:model-value="v => emit('update:typeFilter', v as string)"
          size="small"
          style="width: 120px"
          @change="() => emit('render')"
        >
          <ElOption v-for="item in relationTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </ElSelect>
      </div>

      <div class="control-group">
        <label>布局</label>
        <ElSelect
          :model-value="props.layoutMode"
          @update:model-value="v => emit('update:layoutMode', v as string)"
          size="small"
          style="width: 100px"
          @change="() => emit('render')"
        >
          <ElOption v-for="item in layoutModes" :key="item.value" :label="item.label" :value="item.value" />
        </ElSelect>
      </div>

      <div class="control-group">
        <label>上限</label>
        <ElSelect
          :model-value="props.nodeLimit"
          @update:model-value="v => emit('update:nodeLimit', v as number)"
          size="small"
          style="width: 70px"
          @change="() => emit('render')"
        >
          <ElOption v-for="item in nodeLimits" :key="item.value" :label="item.label" :value="item.value" />
        </ElSelect>
      </div>

      <div class="tb-divider" />

      <ElButton type="primary" size="small" @click="emit('render')">
        刷新
      </ElButton>
      <ElButton size="small" :icon="FullScreen" @click="emit('fit')" />

      <div class="tb-spacer" />

      <div class="status-group">
        <ElTag :type="statusType" size="small" effect="light">{{ statusText }}</ElTag>
        <span v-if="layerLegend[selectedLayer]" class="legend">
          <span v-for="item in layerLegend[selectedLayer]" :key="item.label" class="legend-item">
            <span class="dot" :style="{ background: item.color }"></span>
            {{ item.label }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: #fff;
  border-bottom: 1px solid #e1e4e8;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 5;
  flex-shrink: 0;
}

.tb-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 6px 16px;
}

.top-row {
  border-bottom: 1px solid #f0f2f5;
}

.bottom-row {
  padding-top: 5px;
  padding-bottom: 5px;
}

.tb-spacer {
  flex: 1;
  min-width: 8px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.brand-mark {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #fff;
  background: #172640;
  padding: 3px 6px;
  border-radius: 5px;
  line-height: 1;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #172640;
  white-space: nowrap;
}

.layer-tabs {
  display: flex;
  gap: 2px;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 2px;
}

.layer-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: #656d76;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.layer-tab:hover {
  color: #18212f;
  background: rgba(9, 105, 218, 0.06);
}

.layer-tab.active {
  background: #fff;
  color: #0969da;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.layer-tab-label {
  line-height: 1;
}

.layer-tab-count {
  font-size: 10px;
  color: #8c959f;
  font-weight: 500;
}

.layer-tab.active .layer-tab-count {
  color: #0969da;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.control-group label {
  font-size: 10px;
  color: #656d76;
  font-weight: 600;
  white-space: nowrap;
}

.tb-divider {
  width: 1px;
  height: 20px;
  background: #d0d7de;
  flex-shrink: 0;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #656d76;
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

@media (max-width: 900px) {
  .tb-row {
    padding: 6px 10px;
    gap: 4px 8px;
  }
  .control-group label {
    display: none;
  }
}

@media (max-width: 760px) {
  .brand-title, .layer-tab-count, .legend {
    display: none;
  }
}
</style>
