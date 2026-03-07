import { createClient } from '@sanity/client'
import https from 'https'
import http from 'http'

const client = createClient({
  projectId: 'pmowd8uo',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_TOKEN,
})

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] }))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function filenameFromUrl(url) {
  return decodeURIComponent(url.split('/').pop().split('?')[0])
}

async function run() {
  // Fetch all book documents
  const books = await client.fetch(`*[_type == "book" && defined(coverImageUrl)]{ _id, displayTitle, coverImageUrl }`)
  console.log(`Found ${books.length} books with R2 cover URLs. Migrating to Sanity...`)

  let success = 0
  let failed = 0

  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    console.log(`[${i + 1}/${books.length}] ${book.displayTitle}`)
    try {
      const { buffer, contentType } = await fetchBuffer(book.coverImageUrl)
      const filename = filenameFromUrl(book.coverImageUrl)
      const asset = await client.assets.upload('image', buffer, {
        filename,
        contentType: contentType || 'image/jpeg',
      })
      // Update book: add coverImage field, keep coverImageUrl as backup
      await client.patch(book._id).set({
        coverImage: {
          _type: 'image',
          asset: { _type: 'reference', _ref: asset._id },
        }
      }).commit()
      console.log(`  ✓ Done`)
      success++
    } catch (err) {
      console.error(`  ✗ Failed — ${err.message}`)
      failed++
    }
  }
  console.log(`\nComplete. ${success} migrated, ${failed} failed.`)
}

run()
