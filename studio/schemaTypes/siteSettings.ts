export default {
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  __experimental_actions: ['update', 'publish'],
  fields: [
    { name: 'siteName', title: 'Site Name', type: 'string' },
    { name: 'tagline', title: 'Tagline', type: 'string' },
    { name: 'description', title: 'Site Description', type: 'text' },
    { name: 'email', title: 'Contact Email', type: 'string' },
    { name: 'phone', title: 'Phone', type: 'string' },
    { name: 'facebook', title: 'Facebook URL', type: 'url' },
    { name: 'instagram', title: 'Instagram URL', type: 'url' },
    { name: 'youtube', title: 'YouTube URL', type: 'url' },
  ],
}
