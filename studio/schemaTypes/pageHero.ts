export default {
  name: 'pageHero',
  title: 'Page Hero Images',
  type: 'document',
  __experimental_actions: ['update', 'publish'],
  fields: [
    {
      name: 'page',
      title: 'Page Identifier',
      type: 'string',
      description: 'Unique identifier for the page (e.g., "home", "about", "contact", "publishing")',
      validation: (Rule) => Rule.required()
    },
    {
      name: 'pageTitle',
      title: 'Page Display Name',
      type: 'string',
      description: 'For internal reference only'
    },
    {
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: { hotspot: true },
      description: 'Main hero image for the page'
    },
    {
      name: 'ogImage',
      title: 'OG/Social Image',
      type: 'image',
      options: { hotspot: true },
      description: 'Image for social media sharing (recommended 1200x630px)'
    },
    {
      name: 'altText',
      title: 'Image Alt Text',
      type: 'string',
      description: 'Descriptive text for accessibility and SEO'
    },
  ]
}
