<script setup lang="ts">
import { ElInput, ElSelect, ElOption, ElButton, ElTag } from 'element-plus'
import { Search, FullScreen } from '@element-plus/icons-vue'

interface Props {
  dirFilter: string
  relationSearch: string
  granularity: string
  typeFilter: string
  layoutMode: string
  nodeLimit: number
  statusText: string
  statusType: 'success' | 'warning' | 'danger' | 'info'
}

interface Emits {
  (e: 'update:dirFilter', value: string): void
  (e: 'update:relationSearch', value: string): void
  (e: 'update:granularity', value: string): void
  (e: 'update:typeFilter', value: string): void
  (e: 'update:layoutMode', value: string): void
  (e: 'update:nodeLimit', value: number): void
  (e: 'render'): void
  (e: 'fit'): void
  (e: 'clearDir'): void
  (e: 'showHidden'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const relationTypes = [
  { label: '全部', value: '' },
  { label: 'contains', value: 'contains' },
  { label: 'import', value: 'import' },
  { label: 'require', value: 'require' },
  { label: 'include', value: 'include' },
  { label: 'link', value: 'link' },
  { label: 'directory', value: 'directory' },
  { label: 'external', value: 'external' },
]

const granularityModes = [
  { label: '文件级', value: 'file' },
  { label: '内部元素', value: 'symbol' },
  { label: '文件+元素', value: 'mixed' },
]

const layoutModes = [
  { label: '力导向', value: 'cose' },
  { label: '依赖层级', value: 'breadthfirst' },
  { label: '网格', value: 'grid' },
]

const nodeLimits = [
  { label: '80', value: 80 },
  { label: '150', value: 150 },
  { label: '500', value: 500 },
  { label: '全部', value: 0 },
]

</script>

<template>
  <div class="toolbar">
    <div class="brand">
      <div class="brand-mark">AE</div>
      <div class="brand-title">关系图谱<span class="brand-sub">代码结构、依赖与影响面预览</span></div>
    </div>

    <div class="tb-section filters">
      <div class="control-group">
        <label>目录</label>
        <ElInput
          :model-value="props.dirFilter"
          @update:model-value="v => emit('update:dirFilter', v)"
          placeholder="如 src/services"
          size="small"
          style="width: 140px"
          @keyup.enter="emit('render')"
        />
      </div>

      <div class="control-group">
        <label>关系</label>
        <ElInput
          :model-value="props.relationSearch"
          @update:model-value="v => emit('update:relationSearch', v)"
          placeholder="搜索关系、证据或路径"
          size="small"
          style="width: 160px"
          @keyup.enter="emit('render')"
        />
      </div>

      <div class="control-group">
        <label>类型</label>
        <ElSelect
          :model-value="props.typeFilter"
          @update:model-value="v => emit('update:typeFilter', v as string)"
          size="small"
          style="width: 110px"
          @change="() => emit('render')"
        >
          <ElOption
            v-for="item in relationTypes"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </div>
    </div>

    <div class="tb-divider" />

    <div class="tb-section view">
      <div class="control-group">
        <label>粒度</label>
        <ElSelect
          :model-value="props.granularity"
          @update:model-value="v => emit('update:granularity', v as string)"
          size="small"
          style="width: 100px"
          @change="() => emit('render')"
        >
          <ElOption
            v-for="item in granularityModes"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </div>

      <div class="control-group">
        <label>布局</label>
        <ElSelect
          :model-value="props.layoutMode"
          @update:model-value="v => emit('update:layoutMode', v as string)"
          size="small"
          style="width: 110px"
          @change="() => emit('render')"
        >
          <ElOption
            v-for="item in layoutModes"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </div>

      <div class="control-group">
        <label>最大节点</label>
        <ElSelect
          :model-value="props.nodeLimit"
          @update:model-value="v => emit('update:nodeLimit', v as number)"
          size="small"
          style="width: 80px"
          @change="() => emit('render')"
        >
          <ElOption
            v-for="item in nodeLimits"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
      </div>

      <ElButton type="primary" size="small" :icon="Search" @click="emit('render')">
        渲染
      </ElButton>
      <ElButton size="small" :icon="FullScreen" @click="emit('fit')">
        适应
      </ElButton>
    </div>

    <div class="tb-section status">
      <ElTag :type="statusType" size="small" effect="light">{{ statusText }}</ElTag>
      <span class="legend">
        <span class="dot" style="background:#0969da"></span>源码
        <span class="dot" style="background:#1a7f37"></span>文档
        <span class="dot" style="background:#9a6700"></span>配置
        <span class="dot" style="background:#8250df"></span>元素
        <span class="dot" style="background:#6e7781"></span>目录
      </span>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 10px 18px;
  background: #fff;
  border-bottom: 1px solid #e1e4e8;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 5;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 14px;
  border-right: 1px solid #e1e4e8;
  margin-right: 2px;
  min-width: 0;
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
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: #172640;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand-sub {
  font-size: 11px;
  color: #656d76;
  font-weight: 500;
  letter-spacing: 0;
  white-space: nowrap;
}

.tb-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  min-width: 0;
}

.tb-divider {
  width: 1px;
  height: 24px;
  background: #e1e4e8;
  flex-shrink: 0;
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

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #656d76;
  flex-wrap: wrap;
  padding: 4px 10px;
  border-radius: 6px;
  background: #f6f8fa;
  border: 1px solid #e1e4e8;
  white-space: nowrap;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

@media (max-width: 1180px) {
  .brand-sub {
    display: none;
  }
}

@media (max-width: 760px) {
  .toolbar {
    padding: 8px 12px;
    gap: 6px 10px;
  }
  .tb-divider {
    display: none;
  }
  .control-group {
    gap: 4px;
  }
}
</style>
