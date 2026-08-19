import { createApp } from 'vue'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../styles.css'
import EditorApp from './EditorApp.vue'

maplibregl.addProtocol('pmtiles', new Protocol().tile)

createApp(EditorApp).mount('#app')
