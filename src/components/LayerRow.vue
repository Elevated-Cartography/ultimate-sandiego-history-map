<script setup lang="ts">
import { computed } from 'vue'
import { archiveErrors, zoom } from '../store'
import type { Layer } from '../types'

const props = defineProps<{
  layer: Layer
  index: number
  total: number
  dragging: boolean
  dropTarget: boolean
}>()

const emit = defineEmits<{
  toggle: []
  opacity: [value: number]
  move: [to: number]
  info: []
  zoom: []
  grab: [grabbed: boolean]
}>()

const opacityPercent = computed(() => Math.round(props.layer.opacity * 100))
const position = computed(() => `${props.index + 1} of ${props.total}`)

/** Switched on but drawing nothing, because the archive has no tiles this far out. */
const tooFarOut = computed(() => props.layer.visible && zoom.value < props.layer.map.minzoom)

/** Set when the archive itself could not be read — nothing this layer does will help. */
const unavailable = computed(() => archiveErrors[props.layer.map.id])
</script>

<template>
  <div class="row" :class="{ off: !layer.visible, dragging, 'drop-target': dropTarget }">
    <div class="head">
      <span
        class="grip"
        aria-hidden="true"
        title="Drag to reorder"
        @pointerdown="emit('grab', true)"
        @pointerup="emit('grab', false)"
        @pointercancel="emit('grab', false)"
      >
        <svg viewBox="0 0 10 16" width="10" height="16">
          <circle cx="2" cy="2" r="1.4" /><circle cx="8" cy="2" r="1.4" />
          <circle cx="2" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" />
          <circle cx="2" cy="14" r="1.4" /><circle cx="8" cy="14" r="1.4" />
        </svg>
      </span>

      <label class="switch">
        <input type="checkbox" :checked="layer.visible" @change="emit('toggle')" />
        <span class="track" aria-hidden="true"><span class="thumb" /></span>
        <span class="sr-only">Show {{ layer.map.title }}</span>
      </label>

      <button class="title" type="button" @click="emit('zoom')" :title="`Zoom to ${layer.map.title}`">
        <span class="name">{{ layer.map.title }}</span>
        <span class="year">{{ layer.map.year }}</span>
      </button>

      <button class="icon" type="button" @click="emit('info')" :title="`About ${layer.map.title}`">
        <span class="sr-only">Details for {{ layer.map.title }}</span>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="10" cy="5.9" r="1.15" fill="currentColor" />
          <path d="M10 9v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="controls">
      <input
        class="slider"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="opacityPercent"
        :aria-label="`Opacity of ${layer.map.title}`"
        @input="emit('opacity', Number(($event.target as HTMLInputElement).value) / 100)"
      />
      <span class="percent">{{ opacityPercent }}%</span>

      <div class="stack-buttons">
        <button
          class="icon small"
          type="button"
          :disabled="index === 0"
          :title="`Move ${layer.map.title} up`"
          @click="emit('move', index - 1)"
        >
          <span class="sr-only">Move up</span>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M2 7.5 6 3.5l4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          class="icon small"
          type="button"
          :disabled="index === total - 1"
          :title="`Move ${layer.map.title} down`"
          @click="emit('move', index + 1)"
        >
          <span class="sr-only">Move down</span>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M2 4.5 6 8.5l4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>

    <p v-if="unavailable" class="load-error">This map could not be loaded — {{ unavailable }}</p>

    <p v-else-if="tooFarOut" class="zoom-hint">
      Not drawn at this zoom.
      <button class="text-button" type="button" @click="emit('zoom')">Zoom to it</button>
    </p>

    <span class="sr-only">Layer {{ position }} in the stack</span>
  </div>
</template>

<style scoped>
.row {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  padding: 10px 10px 8px;
  display: grid;
  gap: 8px;
  transition: opacity 0.15s, border-color 0.15s, background 0.15s;
}
.row.off {
  opacity: 0.62;
}
.row.dragging {
  opacity: 0.35;
}
.row.drop-target {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.grip {
  cursor: grab;
  color: var(--text-dim);
  flex: none;
  padding: 2px;
  touch-action: none;
}
.grip:active {
  cursor: grabbing;
}
.grip svg {
  fill: currentColor;
  display: block;
}

.title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  background: none;
  border: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.title:hover .name {
  text-decoration: underline;
}
.name {
  font-size: 13px;
  font-weight: 550;
  line-height: 1.25;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.year {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 2px;
}

.slider {
  flex: 1;
  min-width: 0;
}
.percent {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
  width: 34px;
  text-align: right;
}

.stack-buttons {
  display: flex;
  gap: 2px;
}

.zoom-hint {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding-left: 2px;
  font-size: 11px;
  color: var(--text-dim);
}

.load-error {
  padding-left: 2px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--danger);
}
</style>
