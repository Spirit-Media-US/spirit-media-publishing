import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'mediaVideo',
  title: 'Media Video',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'youtubeId',
      title: 'YouTube ID',
      type: 'string',
      description: 'Just the video ID, e.g., e7od2t3u2wI',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'thumbnailQuality',
      title: 'Thumbnail Quality',
      type: 'string',
      options: {
        list: [
          { title: 'Max Resolution', value: 'maxresdefault' },
          { title: 'Standard Definition', value: 'sddefault' },
        ],
      },
      initialValue: 'maxresdefault',
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
      subtitle: 'youtubeId',
    },
  },
})
