import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { media } from 'sanity-plugin-media'
import { schemaTypes } from './studio/schemaTypes'

export default defineConfig({
  name: 'spirit-media-publishing',
  title: 'Spirit Media Publishing',
  projectId: 'pmowd8uo',
  dataset: 'production',
  plugins: [structureTool(), visionTool(), media()],
  schema: {
    types: schemaTypes,
  },
})
