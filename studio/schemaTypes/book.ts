export default {
  name: 'book',
  title: 'Books',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: 'displayTitle',
      title: 'Display Title',
      type: 'string',
    },
    {
      name: 'author',
      title: 'Author',
      type: 'string',
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: 'coverImage',
      title: 'Cover Image',
      type: 'image',
      options: { hotspot: true },
      description: 'Hosted in Sanity — auto-optimized and served via CDN',
    },
    {
      name: 'coverImageUrl',
      title: 'Cover Image URL (R2 legacy)',
      type: 'url',
      description: 'Legacy R2 URL — kept as backup',
    },
    {
      name: 'amazon',
      title: 'Amazon URL',
      type: 'url',
    },
    {
      name: 'formats',
      title: 'Formats',
      type: 'object',
      fields: [
        { name: 'paperback', title: 'Paperback URL', type: 'url' },
        { name: 'hardback', title: 'Hardback URL', type: 'url' },
        { name: 'ebook', title: 'eBook URL', type: 'url' },
        { name: 'audio', title: 'Audiobook URL', type: 'url' },
      ],
    },
    {
      name: 'publishDate',
      title: 'Publish Date',
      type: 'date',
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text',
    },
    {
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      initialValue: false,
    },
    {
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Faith & Devotional', value: 'faith' },
          { title: 'Leadership', value: 'leadership' },
          { title: "Children's", value: 'childrens' },
          { title: 'Healing', value: 'healing' },
          { title: 'Prayer', value: 'prayer' },
          { title: 'Ministry', value: 'ministry' },
          { title: 'Other', value: 'other' },
        ],
      },
    },
  ],
  preview: {
    select: { title: 'displayTitle', subtitle: 'author' },
  },
}
