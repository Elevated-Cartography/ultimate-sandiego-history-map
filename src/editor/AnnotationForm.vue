<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { uploadImage } from './api'
import { renderMarkdown } from '../markdown'
import { siteUrl } from '../paths'
import type { AnnotationProperties } from '../types'

const props = defineProps<{ mapId: string; record: AnnotationProperties }>()
const emit = defineEmits<{ change: []; delete: [] }>()

const tab = ref<'write' | 'preview'>('write')
const uploading = ref(0)
const uploadError = ref('')
const uploadNote = ref('')
const dropping = ref(false)
const fileInput = ref<HTMLInputElement>()

const preview = computed(() => renderMarkdown(props.record.body))

const kb = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const touch = () => emit('change')

async function addFiles(files: Iterable<File | null>) {
  const images = [...files].filter((f): f is File => Boolean(f?.type.startsWith('image/')))
  if (!images.length) return

  uploadError.value = ''
  uploadNote.value = ''
  uploading.value += images.length
  try {
    // Sequential: the endpoint is content-addressed, and ordering the gallery by
    // the order you pasted is more useful than a few milliseconds of parallelism.
    let before = 0
    let after = 0
    for (const file of images) {
      const upload = await uploadImage(props.mapId, file)
      before += upload.originalBytes
      after += upload.bytes
      if (!props.record.images.some((image) => image.src === upload.src)) {
        props.record.images.push({ src: upload.src })
      }
    }
    uploadNote.value = `${images.length} image${images.length === 1 ? '' : 's'} · ${kb(before)} → ${kb(after)} AVIF`
    touch()
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    uploading.value = Math.max(0, uploading.value - images.length)
  }
}

/**
 * Window-level so a screenshot lands in the gallery no matter which field has
 * focus — that is the whole point of pasting. Text pastes fall through untouched.
 */
function onPaste(event: ClipboardEvent) {
  const files = [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
  if (!files.length) return
  event.preventDefault()
  void addFiles(files)
}

function onDrop(event: DragEvent) {
  dropping.value = false
  void addFiles(event.dataTransfer?.files ?? [])
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  void addFiles(input.files ?? [])
  // Reset, so picking the same file twice still fires a change event.
  input.value = ''
}

function moveImage(from: number, by: number) {
  const to = from + by
  const images = props.record.images
  if (to < 0 || to >= images.length) return
  images.splice(to, 0, ...images.splice(from, 1))
  touch()
}

function removeImage(index: number) {
  props.record.images.splice(index, 1)
  touch()
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <div
    class="form"
    @dragover.prevent="dropping = true"
    @dragleave="dropping = false"
    @drop.prevent="onDrop"
  >
    <label class="field">
      <span>Title</span>
      <input v-model="record.title" type="text" placeholder="Old Town" @input="touch" />
    </label>

    <div class="field body-field">
      <div class="field-head">
        <span>Description</span>
        <div class="tabs" role="tablist">
          <button
            v-for="name in (['write', 'preview'] as const)"
            :key="name"
            class="tab"
            :class="{ active: tab === name }"
            type="button"
            role="tab"
            :aria-selected="tab === name"
            @click="tab = name"
          >
            {{ name === 'write' ? 'Write' : 'Preview' }}
          </button>
        </div>
      </div>

      <textarea
        v-show="tab === 'write'"
        v-model="record.body"
        spellcheck="true"
        placeholder="Markdown — **bold**, [links](https://example.com), lists, images…"
        @input="touch"
      />
      <div v-show="tab === 'preview'" class="preview">
        <!-- eslint-disable-next-line vue/no-v-html -- sanitised in renderMarkdown() -->
        <div v-if="record.body" class="prose" v-html="preview" />
        <p v-else class="muted">Nothing to preview yet.</p>
      </div>
    </div>

    <div class="field">
      <div class="field-head">
        <span>Images</span>
        <button class="text-button" type="button" @click="fileInput?.click()">Add images…</button>
      </div>
      <p class="muted hint">Paste from the clipboard, drop files here, or browse.</p>
      <input ref="fileInput" class="sr-only" type="file" accept="image/*" multiple @change="onPick" />

      <p v-if="uploading" class="muted">Uploading {{ uploading }} image{{ uploading === 1 ? '' : 's' }}…</p>
      <p v-else-if="uploadNote" class="muted">{{ uploadNote }}</p>
      <p v-if="uploadError" class="error">{{ uploadError }}</p>

      <ul v-if="record.images.length" class="images">
        <li v-for="(image, i) in record.images" :key="image.src">
          <img :src="siteUrl(image.src)" :alt="image.caption ?? ''" />
          <div class="image-meta">
            <input
              v-model="image.caption"
              type="text"
              placeholder="Caption (optional)"
              @input="touch"
            />
            <div class="image-actions">
              <button
                class="icon small"
                type="button"
                title="Move up"
                :disabled="i === 0"
                @click="moveImage(i, -1)"
              >
                <span class="sr-only">Move up</span>
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                  <path d="M2 8l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              </button>
              <button
                class="icon small"
                type="button"
                title="Move down"
                :disabled="i === record.images.length - 1"
                @click="moveImage(i, 1)"
              >
                <span class="sr-only">Move down</span>
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                  <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              </button>
              <button class="icon small danger" type="button" title="Remove image" @click="removeImage(i)">
                <span class="sr-only">Remove image</span>
                <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <button class="button danger-button" type="button" @click="emit('delete')">Delete this area</button>

    <div v-if="dropping" class="drop-veil">Drop images to add them</div>
  </div>
</template>

<style scoped>
.form {
  position: relative;
  display: grid;
  gap: 14px;
  align-content: start;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-dim);
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.hint {
  font-weight: 400;
}

input[type='text'],
textarea {
  font: inherit;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 7px 9px;
  width: 100%;
}
textarea {
  min-height: 220px;
  line-height: 1.55;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 7px;
}
.tab {
  font-size: 11px;
  font-weight: 550;
  color: var(--text-dim);
  background: none;
  border: 0;
  border-radius: 5px;
  padding: 3px 9px;
  cursor: pointer;
}
.tab.active {
  color: var(--text);
  background: var(--surface);
}

.preview {
  min-height: 220px;
  padding: 10px 11px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 7px;
}

.images {
  list-style: none;
  display: grid;
  gap: 8px;
}
.images li {
  display: flex;
  gap: 9px;
  padding: 7px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.images img {
  flex: none;
  width: 68px;
  height: 52px;
  object-fit: cover;
  border-radius: 5px;
  background: var(--surface);
}
.image-meta {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 5px;
  align-content: center;
}
.image-actions {
  display: flex;
  gap: 2px;
}
.icon.danger:hover:not(:disabled) {
  color: var(--danger);
}

.muted {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-dim);
  line-height: 1.45;
}
.error {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--danger);
}

.danger-button {
  justify-content: center;
  color: var(--danger);
}
.danger-button:hover {
  border-color: var(--danger);
}

.drop-veil {
  position: absolute;
  inset: -6px;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 2px dashed var(--accent);
  border-radius: 10px;
  pointer-events: none;
}
</style>
