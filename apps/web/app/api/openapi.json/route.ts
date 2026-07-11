import { openApiDocument } from "@campus-exchange/contracts";
export function GET(){return Response.json(openApiDocument,{headers:{"cache-control":"public, max-age=3600"}})}
