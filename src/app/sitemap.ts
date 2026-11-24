import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/** The site's pages, for search engines: the ones worth finding without leagues of your own. */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number) => ({ url: `${SITE_URL}${path}`, changeFrequency: "weekly" as const, priority });
  return [page("/", 1), page("/values", 0.8), page("/support", 0.4), page("/privacy", 0.3)];
}
