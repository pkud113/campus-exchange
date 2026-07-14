import type { MetadataRoute } from "next";

export default function sitemap():MetadataRoute.Sitemap{const origin=process.env.APP_ORIGIN??"https://campus-exchange.net";return[{url:origin,changeFrequency:"weekly",priority:1},{url:`${origin}/safety`,changeFrequency:"monthly",priority:.7}]}
