import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const companies = await getCollection('companies');

  const index = companies.map((e) => ({
    slug:     e.data.slug,
    name:     e.data.name,
    branchen: e.data.branchen,
    ort:      e.data.adresse.ort,
    plz:      e.data.adresse.plz,
    land:     e.data.adresse.land,
    rating:   e.data.ratingCached?.rating ?? 0,
  }));

  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json' },
  });
};
