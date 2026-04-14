import { defineField, defineType } from 'sanity';

export default defineType({
	name: 'marketingStep',
	title: 'Marketing Step',
	type: 'document',
	fields: [
		defineField({
			name: 'stepNumber',
			title: 'Step Number',
			type: 'string',
			validation: (Rule) => Rule.required(),
		}),
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
			description: 'Short description shown below the title (plain text, no links)',
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
			subtitle: 'stepNumber',
		},
		prepare({ title, subtitle }: { title: string; subtitle: string }) {
			return {
				title,
				subtitle: `Step ${subtitle}`,
			};
		},
	},
});
