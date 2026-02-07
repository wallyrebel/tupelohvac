import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().max(160),
    keywords: z.array(z.string()).default([]),
    featured_image: z.string().optional(),
    featured_image_alt: z.string().optional(),
    pexels_url: z.string().url().optional(),
    pexels_photographer: z.string().optional(),
    pexels_photographer_url: z.string().url().optional(),
    canonical: z.string().url().optional(),
    category: z.string(),
    season_tag: z.string(),
    primary_keyword: z.string()
  })
});

const sponsors = defineCollection({
  type: "content",
  schema: z.object({
    sponsor_name: z.string(),
    featured_homepage: z.boolean().default(false),
    image: z.string(),
    blurb: z.string().optional(),
    service_area: z.string().optional(),
    link_url: z.string().url(),
    cta_label: z.string().default("Visit Partner"),
    placements: z.array(z.string()),
    start_date: z.coerce.date(),
    end_date: z.coerce.date().optional(),
    tracking_label: z.string().optional()
  })
});

const settings = defineCollection({
  type: "content",
  schema: z.object({
    footer_text: z.string(),
    service_areas: z.array(z.string()),
    header_cta_label: z.string(),
    footer_cta_label: z.string()
  })
});

export const collections = { blog, sponsors, settings };
