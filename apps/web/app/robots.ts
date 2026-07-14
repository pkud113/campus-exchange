import type { MetadataRoute } from "next";

export default function robots():MetadataRoute.Robots{return{rules:[{userAgent:"*",allow:["/","/safety"],disallow:["/api/","/home","/marketplace","/events","/messages","/notifications","/settings","/admin","/my/","/sell","/u/"]}],sitemap:`${process.env.APP_ORIGIN??"https://campus-exchange.net"}/sitemap.xml`}}
