import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE } from "../consts";

export async function GET(context: { site: URL }) {
  const posts = (await getCollection("blog")).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  return rss({
    title: "TupeloHVAC.com Blog",
    description: "HVAC troubleshooting, maintenance, and service tips for Tupelo, MS.",
    site: context.site ?? new URL(SITE.url),
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/blog/${post.slug}/`
    }))
  });
}
