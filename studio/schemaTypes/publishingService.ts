import { defineField, defineType } from 'sanity';

export default defineType({
	name: 'publishingService',
	title: 'Publishing Service',
	type: 'document',
	fields: [
		defineField({
			name: 'title',
			title: 'Title',
			type: 'string',
			validation: (Rule) => Rule.required(),
		}),
		defineField({
			name: 'description',
			title: 'Description',
			type: 'text',
			validation: (Rule) => Rule.required(),
		}),
		defineField({
			name: 'image',
			title: 'Image',
			type: 'image',
			options: {
				hotspot: true,
			},
			fields: [
				{
					name: 'alt',
					type: 'string',
					title: 'Alternative text',
				},
			],
		}),
		defineField({
			name: 'order',
			title: 'Order',
			type: 'number',
			description: 'Lower numbers appear first',
			validation: (Rule) => Rule.required(),
		}),
	],
	orderings: [
		{
			title: 'Display Order',
			name: 'orderAsc',
			by: [{ field: 'order', direction: 'asc' }],
		},
	],
	preview: {
		select: {
			title: 'title',
			subtitle: 'order',
		},
		prepare({ title, subtitle }: { title: string; subtitle: number }) {
			return {
				title,
				subtitle: `Order: ${subtitle}`,
			};
		},
	},
});
