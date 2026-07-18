import type { MetadataRoute } from "next";

export default function robots():MetadataRoute.Robots{return{rules:[{userAgent:"*",allow:["/","/safety"],disallow:["/api/","/home","/marketplace","/events","/messages","/people","/discussions","/notifications","/settings","/admin","/my/","/sell","/u/"]}],sitemap:`${process.env.APP_ORIGIN??"https://campus-exchange.net"}/sitemap.xml`}}
