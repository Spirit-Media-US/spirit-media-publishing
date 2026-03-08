import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'portfolioVideo',
  title: 'Portfolio Video',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'youtubeEmbedUrl',
      title: 'YouTube Embed URL',
      type: 'url',
      description: 'Full embed URL, e.g., https://www.youtube.com/embed/mKj2akahoQs',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'displayOrder',
      title: 'Display Order',
      type: 'number',
      description: 'Lower numbers appear first',
    }),
  ],
  preview: {
    select: {
      title: 'title',
    },
  },
})
