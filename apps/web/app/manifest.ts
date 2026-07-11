import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { name:"Campus Exchange",short_name:"Exchange",description:"Verified student marketplace and campus events.",start_url:"/exchange",display:"standalone",background_color:"#f6f3ec",theme_color:"#f6f3ec" }; }
