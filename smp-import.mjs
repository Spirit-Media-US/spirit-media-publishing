import { createClient } from '@sanity/client'
import { readFileSync } from 'fs'

const client = createClient({
  projectId: 'pmowd8uo',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_TOKEN,
})

const BOOKS = JSON.parse(readFileSync('./books-data.json', 'utf8'))

async function run() {
  // First delete any existing book documents to avoid duplicates
  console.log('Deleting existing books...')
  const existing = await client.fetch('*[_type == "book"]._id')
  for (const id of existing) {
    await client.delete(id)
  }
  console.log(`Deleted ${existing.length} existing books.`)

  console.log(`\nImporting ${BOOKS.length} books to Sanity...`)
  let success = 0
  let failed = 0

  for (let i = 0; i < BOOKS.length; i++) {
    const book = BOOKS[i]
    console.log(`[${i + 1}/${BOOKS.length}] ${book.display_title}`)
    try {
      await client.create({
        _type: 'book',
        title: book.title,
        displayTitle: book.display_title,
        author: book.author,
        coverImageUrl: book.img,
        amazon: book.amazon,
        formats: book.formats || {},
        publishDate: book.date,
        featured: false,
      })
      console.log(`  ✓ Done`)
      success++
    } catch (err) {
      console.error(`  ✗ Failed — ${err.message}`)
      failed++
    }
  }
  console.log(`\nComplete. ${success} imported, ${failed} failed.`)
}

run()
