import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const reviewSchema = z.object({
  author_name: z.string(),
  author_photo: z.string().nullable().optional(),
  rating: z.number().min(0).max(5),
  text: z.string(),
  time: z.number(),
  relative_time_description: z.string().optional(),
});

const companies = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/companies' }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    branchen: z.array(z.string()),
    adresse: z.object({
      strasse: z.string(),
      plz: z.string(),
      ort: z.string(),
      kanton: z.string().optional(),
      land: z.enum(['CH', 'LI']),
    }),
    kontakt: z.object({
      telefon: z.string().optional(),
      email: z.string().email().optional(),
      webseite: z.string().url().optional(),
    }),
    description: z.string().optional(),
    leistungen: z.array(z.string()).optional(),
    googlePlaceId: z.string().optional(),
    google_fetched: z.boolean().optional(),
    openingHours: z.array(z.string()).optional(),
    ratingCached: z.object({
      rating: z.number().min(0).max(5),
      user_ratings_total: z.number().int().nonnegative(),
      reviews: z.array(reviewSchema),
      last_updated: z.string(),
    }).optional(),
  }),
});

export const collections = { companies };
