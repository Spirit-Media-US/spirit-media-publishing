import { createClient } from '@sanity/client'
import fs from 'fs'
import path from 'path'
import { createReadStream } from 'fs'

const client = createClient({
  projectId: 'pmowd8uo',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_TOKEN,
})

const PUBLIC_DIR = '/Users/kevinwhite/Sites/spirit-media-publishing/public'

// Skip non-image files and files that should stay in the repo
const SKIP = new Set([
  'robots.txt',
  'googlef4c0e3e8c84868b9.html',
  'SM 2-23-26.mp3', // audio stays in R2
  'favicon-final.svg', // favicons stay in repo
])

const IMAGE_EXTENSIONS = new Set(['.jpg','.jpeg','.png','.webp','.gif','.PNG','.JPG','.JPEG'])

function getAllImages(dir) {
  let results = []
  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      results = results.concat(getAllImages(fullPath))
    } else {
      const ext = path.extname(item.name).toLowerCase()
      if (IMAGE_EXTENSIONS.has(path.extname(item.name)) || IMAGE_EXTENSIONS.has(ext)) {
        if (!SKIP.has(item.name)) {
          results.push(fullPath)
        }
      }
    }
  }
  return results
}

async function run() {
  const images = getAllImages(PUBLIC_DIR)
  console.log(`Found ${images.length} images to upload to Sanity...\n`)

  const uploaded = []
  let success = 0
  let failed = 0

  for (let i = 0; i < images.length; i++) {
    const filePath = images[i]
    const filename = path.basename(filePath)
    const relativePath = filePath.replace(PUBLIC_DIR + '/', '')
    console.log(`[${i + 1}/${images.length}] ${relativePath}`)

    try {
      const stream = createReadStream(filePath)
      const asset = await client.assets.upload('image', stream, { filename })
      uploaded.push({ localPath: relativePath, assetId: asset._id, url: asset.url })
      console.log(`  ✓ ${asset.url}`)
      success++
    } catch (err) {
      console.error(`  ✗ Failed — ${err.message}`)
      failed++
    }
  }

  // Save a mapping of local path → Sanity URL for reference when wiring pages
  const mapping = uploaded.map(u => `${u.localPath} → ${u.url}`).join('\n')
  fs.writeFileSync('/Users/kevinwhite/Sites/spirit-media-publishing/sanity-image-map.txt', mapping)

  console.log(`\nComplete. ${success} uploaded, ${failed} failed.`)
  console.log(`Image map saved to sanity-image-map.txt`)
}

run()
