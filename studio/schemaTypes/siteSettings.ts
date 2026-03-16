export default {
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  __experimental_actions: ['update', 'publish'],
  fields: [
    { name: 'siteName', title: 'Site Name', type: 'string' },
    { name: 'tagline', title: 'Tagline', type: 'string' },
    { name: 'description', title: 'Site Description', type: 'text' },
    { 
      name: 'email', 
      title: 'General Contact Email', 
      type: 'string',
      description: 'Main contact email for inquiries'
    },
    { 
      name: 'primaryEmail', 
      title: 'Primary Email (for forms)', 
      type: 'string',
      description: 'Primary email address (typically info@...)'
    },
    { 
      name: 'submissionsEmail', 
      title: 'Submissions Email', 
      type: 'string',
      description: 'Email for manuscript submissions and publisher inquiries'
    },
    { 
      name: 'kevinEmail', 
      title: 'Kevin Direct Email', 
      type: 'string',
      description: 'Direct email for Kevin (editor/publisher contact)'
    },
    { name: 'phone', title: 'Phone', type: 'string' },
    { name: 'address', title: 'Physical Address', type: 'text' },
    { 
      name: 'logo', 
      title: 'Logo', 
      type: 'image',
      options: { hotspot: true },
    },
    { 
      name: 'logoAlt',
      title: 'Logo Alt Text',
      type: 'string',
      description: 'Accessibility text for logo (e.g., "Spirit Media Publishing logo")'
    },
    { 
      name: 'heroImage', 
      title: 'Default Hero Image', 
      type: 'image',
      options: { hotspot: true },
    },
    { 
      name: 'heroImageAlt',
      title: 'Hero Image Alt Text',
      type: 'string',
      description: 'Descriptive text for default hero image'
    },
    { 
      name: 'ogImage', 
      title: 'OG Image (for social sharing)', 
      type: 'image',
      options: { hotspot: true },
    },
    { 
      name: 'ogImageAlt',
      title: 'OG Image Alt Text',
      type: 'string',
      description: 'Alt text for OG image'
    },
    { name: 'facebook', title: 'Facebook URL', type: 'url' },
    { name: 'instagram', title: 'Instagram URL', type: 'url' },
    { name: 'youtube', title: 'YouTube URL', type: 'url' },
    { name: 'linkedin', title: 'LinkedIn URL', type: 'url' },
    { name: 'twitter', title: 'Twitter/X URL', type: 'url' },
    { name: 'twitterHandle', title: 'Twitter Handle (for meta tags, e.g., @spiritmediaus)', type: 'string' },
    { name: 'googleAnalyticsId', title: 'Google Analytics ID (GA4)', type: 'string' },
  ],
}
