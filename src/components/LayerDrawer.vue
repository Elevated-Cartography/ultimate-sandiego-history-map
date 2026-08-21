<script setup lang="ts">
import { computed, ref } from 'vue'
import LayerRow from './LayerRow.vue'
import {
  BASE_STYLES,
  aboutOpen,
  baseStyleId,
  drawerOpen,
  infoMapId,
  layers,
  moveLayer,
  setOpacity,
  status,
  toggle,
} from '../store'
import { annotationsVisible, hasAnyAnnotations } from '../annotations'
import type { HistoricalMap } from '../types'

const emit = defineEmits<{ zoom: [map: HistoricalMap] }>()

/** Index whose grip is held down — only that row is draggable, so sliders still work. */
const grabbedIndex = ref<number | null>(null)
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

const visibleCount = computed(() => layers.value.filter((l) => l.visible).length)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number, event: DragEvent) {
  if (dragIndex.value === null) return
  event.preventDefault()
  overIndex.value = index
}

function onDrop(index: number) {
  if (dragIndex.value !== null) moveLayer(dragIndex.value, index)
  endDrag()
}

function endDrag() {
  dragIndex.value = null
  overIndex.value = null
  grabbedIndex.value = null
}

function hideAll() {
  for (const layer of layers.value) layer.visible = false
}
</script>

<template>
  <aside class="drawer" :class="{ open: drawerOpen }" aria-label="Historical map layers">
    <header class="drawer-head">
      <div class="titles">
        <h1>San Diego History Map</h1>
        <p>{{ visibleCount }} of {{ layers.length }} historical layers shown</p>
      </div>
      <button class="icon" type="button" title="About this project" @click="aboutOpen = true">
        <span class="sr-only">About this project</span>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="10" cy="5.9" r="1.15" fill="currentColor" />
          <path d="M10 9v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>

      <button class="icon close" type="button" title="Close panel" @click="drawerOpen = false">
        <span class="sr-only">Close panel</span>
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <div class="settings">
      <label class="field">
        <span>Base map</span>
        <select v-model="baseStyleId">
          <option v-for="style in BASE_STYLES" :key="style.id" :value="style.id">{{ style.label }}</option>
        </select>
      </label>

      <label v-if="hasAnyAnnotations" class="field">
        <span>Annotations</span>
        <input type="checkbox" v-model="annotationsVisible" />
      </label>
    </div>

    <div class="list-head">
      <span class="hint">Topmost layer first — drag <span aria-hidden="true">⠿</span> or use the arrows to restack.</span>
      <button class="text-button" type="button" :disabled="visibleCount === 0" @click="hideAll">Hide all</button>
    </div>

    <p v-if="status.loading" class="notice">Loading manifest…</p>
    <p v-else-if="status.error" class="notice error">Could not load maps/manifest.json — {{ status.error }}</p>

    <ul v-else class="list" @dragend="endDrag">
      <li
        v-for="(layer, i) in layers"
        :key="layer.map.id"
        :draggable="grabbedIndex === i"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @drop.prevent="onDrop(i)"
      >
        <LayerRow
          :layer="layer"
          :index="i"
          :total="layers.length"
          :dragging="dragIndex === i"
          :drop-target="overIndex === i && dragIndex !== i"
          @toggle="toggle(layer.map.id)"
          @opacity="setOpacity(layer.map.id, $event)"
          @move="moveLayer(i, $event)"
          @info="infoMapId = layer.map.id"
          @zoom="emit('zoom', layer.map)"
          @grab="grabbedIndex = $event ? i : null"
        />
      </li>
    </ul>

    <footer class="drawer-foot">
      Historical scans from the
      <a href="https://www.davidrumsey.com/" target="_blank" rel="noopener">David Rumsey Map Collection</a>
      and other archives. Base map by
      <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>.
      <!-- Repeated from the header icon: the footer is where people look for who
           made a thing and how to complain about it. -->
      <button class="text-button" type="button" @click="aboutOpen = true">About &amp; feedback</button>
    </footer>
  </aside>
</template>

<style scoped>
.drawer {
  position: absolute;
  z-index: 5;
  top: 0;
  left: 0;
  bottom: 0;
  width: 340px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  box-shadow: var(--shadow);
  transform: translateX(-100%);
  transition: transform 0.22s ease;
}
.drawer.open {
  transform: none;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--line);
}
.titles {
  flex: 1;
  min-width: 0;
}
h1 {
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.titles p {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-dim);
}

.settings {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
}
.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}
.field select {
  flex: 1;
  max-width: 170px;
}
.list-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px 8px;
}
.hint {
  font-size: 11px;
  color: var(--text-dim);
  line-height: 1.35;
}

.list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  padding: 0 14px 14px;
  display: grid;
  gap: 8px;
  align-content: start;
}

.notice {
  padding: 16px 14px;
  font-size: 12px;
  color: var(--text-dim);
}
.notice.error {
  color: var(--danger);
}

.drawer-foot {
  border-top: 1px solid var(--line);
  padding: 10px 14px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--text-dim);
}
/* Its own line: trailing a sentence of attribution, it reads as another credit. */
.drawer-foot .text-button {
  display: block;
  margin-top: 5px;
}

@media (max-width: 820px) {
  .drawer {
    width: min(88vw, 340px);
  }
}
</style>
