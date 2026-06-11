<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import cytoscape from 'cytoscape'
import type { CyData, CyNodeData } from '../graph-types'

interface Props {
  cyData: CyData | null
  layoutMode: string
}

interface Emits {
  (e: 'nodeTap', nodeData: CyNodeData): void
  (e: 'canvasTap'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const containerRef = ref<HTMLDivElement>()
const tooltipRef = ref<HTMLDivElement>()
const cyInstance = ref<cytoscape.Core | null>(null)
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipPos = ref({ left: 0, top: 0 })
let focusedElements: cytoscape.CollectionReturnValue | null = null
let labelsHidden = false

const SHOW_LABELS_THRESHOLD = 60
const SIMPLE_LAYOUT_THRESHOLD = 250

function isLargeGraph(nodes: number): boolean {
  return nodes > SHOW_LABELS_THRESHOLD
}

function graphLayout(mode: string, count: number): cytoscape.LayoutOptions {
  if (mode === 'grid' || (mode === 'cose' && count > SIMPLE_LAYOUT_THRESHOLD)) {
    return {
      name: 'grid',
      animate: false,
      padding: 60,
      avoidOverlap: true,
      avoidOverlapPadding: 18,
      fit: true,
    } as cytoscape.LayoutOptions
  }
  if (mode === 'cose') {
    const repulsion = Math.min(22000 + Math.max(0, count - 80) * 60, 40000)
    const edgeLen = Math.max(200 - Math.max(0, count - 80) * 0.8, 80)
    const numIter = Math.max(800, Math.round(count * 3))
    return {
      name: 'cose',
      animate: false,
      nodeRepulsion: repulsion,
      idealEdgeLength: edgeLen,
      nodeOverlap: 20,
      numIter,
      padding: 90,
      randomize: true,
    } as cytoscape.LayoutOptions
  }
  if (mode === 'circle') {
    return {
      name: 'circle',
      animate: false,
      padding: 60,
      fit: true,
    } as cytoscape.LayoutOptions
  }
  if (mode === 'concentric') {
    return {
      name: 'concentric',
      animate: false,
      padding: 60,
      fit: true,
    } as cytoscape.LayoutOptions
  }
  return {
    name: 'breadthfirst',
    directed: true,
    animate: false,
    padding: 100,
    spacingFactor: count > 80 ? 1.8 : 2.4,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
  } as cytoscape.LayoutOptions
}

function graphStylesheet(): cytoscape.StylesheetCSS[] {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        label: 'data(displayLabel)',
        'font-size': '12px',
        'font-weight': '700',
        width: '32px',
        height: '32px',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 10,
        color: '#1f2937',
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.98,
        'text-background-padding': 5,
        'text-border-color': '#d0d7de',
        'text-border-width': 1,
        'text-border-opacity': 0.75,
        'text-max-width': '170px',
        'text-wrap': 'ellipsis',
        'text-overflow-wrap': 'anywhere',
        'border-width': 2.5,
        'border-color': '#fff',
        'overlay-opacity': 0,
        'z-index': 3,
      },
    },
    {
      selector: 'node[type = "symbol"]',
      style: {
        shape: 'round-rectangle',
        'background-color': '#8250df',
        width: '34px',
        height: '22px',
        'z-index': 3,
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 4,
        'border-color': '#f59f00',
        'border-opacity': 1,
        'z-index': 10,
        'shadow-blur': 12,
        'shadow-color': 'rgba(245, 159, 0, 0.35)',
        'shadow-offset-y': 3,
      },
    },
    {
      selector: 'edge',
      style: {
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'control-point-step-size': 40,
        width: '1.6px',
        opacity: 0.7,
        'arrow-scale': 1,
        label: 'data(label)',
        'font-size': '9px',
        color: '#4b5563',
        'text-rotation': 'autorotate',
        'text-margin-y': -9,
        'text-background-color': '#fff',
        'text-background-opacity': 0.8,
        'text-background-padding': 2,
      },
    },
    {
      selector: 'edge[searchMatch = "true"]',
      style: {
        width: '3.5px',
        opacity: 1,
        'z-index': 999,
      },
    },
    {
      selector: 'edge:selected',
      style: {
        width: '3.5px',
        opacity: 1,
        'z-index': 999,
        'line-color': '#f59f00',
        'target-arrow-color': '#f59f00',
      },
    },
    {
      selector: '.faded',
      style: {
        opacity: 0.12,
        'text-opacity': 0.08,
      },
    },
    {
      selector: '.highlighted',
      style: {
        opacity: 1,
        'text-opacity': 1,
        'z-index': 999,
      },
    },
    {
      selector: 'node.hide-label',
      style: {
        'font-size': '0px',
      },
    },
  ] as unknown as cytoscape.StylesheetCSS[]
}

function bindGraphEvents(cy: cytoscape.Core) {
  cy.on('tap', 'node', (evt) => {
    focusNode(evt.target)
    emit('nodeTap', evt.target.data() as CyNodeData)
  })

  cy.on('mouseover', 'node', (evt) => {
    showNodeTip(evt.target, evt.originalEvent as MouseEvent)
  })

  cy.on('mousemove', 'node', (evt) => {
    moveNodeTip(evt.originalEvent as MouseEvent)
  })

  cy.on('mouseout', 'node', hideNodeTip)

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      emit('canvasTap')
    }
  })

  cy.on('zoom', () => {
    if (!cyInstance.value) return
    const zoom = cyInstance.value.zoom()
    const nodeCount = cyInstance.value.nodes().length
    if (nodeCount <= SHOW_LABELS_THRESHOLD) return
    const shouldHide = zoom < 0.6
    if (shouldHide !== labelsHidden) {
      labelsHidden = shouldHide
      if (shouldHide) {
        cyInstance.value.nodes().addClass('hide-label')
      } else {
        cyInstance.value.nodes().removeClass('hide-label')
      }
    }
  })
}

function renderGraph(data: CyData) {
  if (!containerRef.value || data.cyNodes.length === 0) return

  focusedElements = null

  if (!cyInstance.value) {
    const cy = cytoscape({
      container: containerRef.value,
      elements: [],
      style: graphStylesheet(),
      wheelSensitivity: 0.25,
      minZoom: 0.08,
      maxZoom: 5,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    })
    bindGraphEvents(cy)
    cyInstance.value = cy
  }

  const cy = cyInstance.value
  const large = isLargeGraph(data.stats.nodes)

  cy.startBatch()
  cy.elements().remove()
  cy.add([...data.cyNodes, ...data.cyEdges])

  if (large) {
    cy.nodes().addClass('hide-label')
    labelsHidden = true
  }
  cy.endBatch()

  if (large && cy.zoom() >= 0.6) {
    cy.nodes().removeClass('hide-label')
    labelsHidden = false
  }

  const layout = cy.layout(graphLayout(props.layoutMode, data.stats.nodes))
  layout.pon('layoutstop').then(() => {
    cy.fit(undefined, data.stats.nodes > 200 ? 120 : data.stats.nodes > 80 ? 60 : 40)
  })
  layout.run()
}

function focusNode(node: cytoscape.NodeSingular) {
  if (!cyInstance.value) return
  if (focusedElements) {
    focusedElements.removeClass('highlighted')
  }
  cyInstance.value.elements().addClass('faded')
  const neighborhood = node.closedNeighborhood()
  neighborhood.removeClass('faded').addClass('highlighted')
  node.removeClass('faded').addClass('highlighted')
  focusedElements = neighborhood.union(node)
}

function showNodeTip(node: cytoscape.NodeSingular, event: MouseEvent) {
  tooltipText.value = node.data('fullLabel') || node.data('label') || node.data('path') || node.data('id')
  tooltipVisible.value = true
  moveNodeTip(event)
}

function moveNodeTip(event: MouseEvent) {
  if (!tooltipRef.value || !tooltipVisible.value) return
  const x = event.clientX + 12
  const y = event.clientY + 12
  const maxX = window.innerWidth - tooltipRef.value.offsetWidth - 8
  const maxY = window.innerHeight - tooltipRef.value.offsetHeight - 8
  tooltipPos.value = {
    left: Math.max(8, Math.min(x, maxX)),
    top: Math.max(8, Math.min(y, maxY)),
  }
}

function hideNodeTip() {
  tooltipVisible.value = false
}

function fit() {
  if (cyInstance.value) {
    cyInstance.value.fit(undefined, 50)
  }
}

watch(
  () => props.cyData,
  (data) => {
    if (data && data.cyNodes.length > 0) {
      renderGraph(data)
    } else if (cyInstance.value) {
      cyInstance.value.destroy()
      cyInstance.value = null
      focusedElements = null
      labelsHidden = false
    }
  },
)

onMounted(() => {
  if (props.cyData && props.cyData.cyNodes.length > 0) {
    renderGraph(props.cyData)
  }
})

onUnmounted(() => {
  if (cyInstance.value) {
    cyInstance.value.destroy()
    cyInstance.value = null
    focusedElements = null
    labelsHidden = false
  }
})

defineExpose({ fit })
</script>

<template>
  <div id="cyWrap">
    <div class="metric-strip">
      <div class="metric">
        <b>{{ cyData?.stats.nodes ?? '--' }}</b>
        <span>节点</span>
      </div>
      <div class="metric">
        <b>{{ cyData?.stats.edges ?? '--' }}</b>
        <span>关系</span>
      </div>
    </div>
    <div ref="containerRef" id="cy"></div>
    <div v-if="!cyData || cyData.cyNodes.length === 0" class="empty-state">
      <strong>当前筛选没有可渲染节点</strong><br />
      请切换层级、放宽筛选或点击"全选"恢复目录选择。
    </div>
    <div
      ref="tooltipRef"
      class="node-tip"
      :style="{
        display: tooltipVisible ? 'block' : 'none',
        left: `${tooltipPos.left}px`,
        top: `${tooltipPos.top}px`,
      }"
    >
      {{ tooltipText }}
    </div>
  </div>
</template>

<style scoped>
#cyWrap {
  position: relative;
  display: flex;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #d0d7de;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  background: #fff;
  flex: 1;
}

#cy {
  flex: 1;
  background: #fff;
}

.metric-strip {
  position: absolute;
  left: 12px;
  top: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  z-index: 4;
  pointer-events: none;
}

.metric {
  min-width: 68px;
  padding: 5px 10px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #fff;
}

.metric b {
  display: block;
  font-size: 16px;
  line-height: 1;
  color: #172640;
  letter-spacing: -0.02em;
  font-weight: 700;
}

.metric span {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 600;
  color: #656d76;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.empty-state {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  max-width: 400px;
  padding: 20px 24px;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  font-size: 13px;
  line-height: 1.6;
  color: #656d76;
  text-align: center;
}

.empty-state strong {
  display: block;
  font-size: 15px;
  color: #172640;
  margin-bottom: 6px;
  font-weight: 600;
}

.node-tip {
  position: fixed;
  max-width: 480px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #24292f;
  color: #fff;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  pointer-events: none;
  z-index: 20;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>
