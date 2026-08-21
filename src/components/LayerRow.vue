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

      <!-- The checkbox stays real — it is what keyboard and screen readers drive.
           The eye beside it is the painted half. -->
      <label class="icon eye" :class="{ on: layer.visible }" :title="`${layer.visible ? 'Hide' : 'Show'} ${layer.map.title}`">
        <input type="checkbox" :checked="layer.visible" @change="emit('toggle')" />
        <span class="sr-only">Show {{ layer.map.title }}</span>
        <!-- eye / eye-slash from Bootstrap Icons (MIT), inlined rather than
             pulled in as a dependency for three glyphs. -->
        <svg v-if="layer.visible" viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
          <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z" />
          <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
          <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7 7 0 0 0-2.79.588l.77.771A6 6 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755q-.247.248-.517.486z" />
          <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829" />
          <path d="M3.35 5.47q-.27.24-.518.487A13 13 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7 7 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12z" />
        </svg>
      </label>

      <button class="title" type="button" @click="emit('zoom')" :title="`Zoom to ${layer.map.title}`">
        <span class="name">{{ layer.map.title }}</span>
        <span class="year">{{ layer.map.year }}</span>
      </button>

      <div class="head-buttons">
        <button class="icon" type="button" @click="emit('zoom')" :title="`Zoom to ${layer.map.title}`">
          <span class="sr-only">Zoom to {{ layer.map.title }}</span>
          <!-- arrows-angle-expand, Bootstrap Icons (MIT) -->
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path
              fill-rule="evenodd"
              d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707m4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707"
            />
          </svg>
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
/* A hidden row dims part by part rather than as a whole. Opacity on .row would
   composite the eye down with everything else — and the eye is the control you
   need to find to bring the layer back, so it stays at full strength. */
.row.off .head > *:not(.eye),
.row.off .controls {
  opacity: 0.62;
  transition: opacity 0.15s;
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

/* The eye carries the on/off state now that there is no switch track to read:
   accent when shown, and full text colour rather than the dim grey the other
   icons use when hidden — it is the one control on a hidden row that has to
   stay easy to find. */
.eye {
  position: relative;
  color: var(--text);
}
.eye.on {
  color: var(--accent);
}
.eye input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.eye svg {
  display: block;
  pointer-events: none;
}
.eye input:focus-visible ~ svg {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 3px;
}

.head-buttons {
  flex: none;
  display: flex;
  gap: 2px;
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
