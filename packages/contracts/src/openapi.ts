export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "Campus Exchange API", version: "1.0.0", description: "Versioned API for verified campus marketplace and events clients." },
  servers: [{ url: "/api/v1" }],
  security: [{ cookieAuth: [] }],
  components: {
    securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "sb-access-token" } },
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code","message","requestId"], properties: { code:{type:"string"},message:{type:"string"},requestId:{type:"string",format:"uuid"},details:{} } } } },
      CursorPage: { type:"object",properties:{nextCursor:{type:["string","null"]}} },
      ListingInput: { type:"object",required:["title","description","category","condition","priceCents","currency","idempotencyKey"],properties:{title:{type:"string",minLength:3,maxLength:100},description:{type:"string",minLength:10,maxLength:5000},category:{enum:["books","electronics","furniture","clothing","housing","transport","other"]},condition:{enum:["new","like_new","good","fair","poor"]},priceCents:{type:"integer",minimum:0},currency:{type:"string",minLength:3,maxLength:3},idempotencyKey:{type:"string",format:"uuid"}} },
      MessageInput: { type:"object",required:["body","idempotencyKey"],properties:{body:{type:"string",minLength:1,maxLength:4000},idempotencyKey:{type:"string",format:"uuid"}} }
    }
  },
  paths: {
    "/session": { get:{summary:"Get the current session",responses:{"200":{description:"Session state"}}} },
    "/profile": { get:{summary:"Get current profile",responses:{"200":{description:"Profile"}}},patch:{summary:"Update current profile",responses:{"200":{description:"Updated profile"}}} },
    "/listings": { get:{summary:"Search campus listings",parameters:[{in:"query",name:"cursor",schema:{type:"string"}},{in:"query",name:"q",schema:{type:"string"}}],responses:{"200":{description:"Cursor page"}}},post:{summary:"Publish a listing",responses:{"201":{description:"Created"}}} },
    "/listings/{id}": { get:{summary:"Get listing",responses:{"200":{description:"Listing"}}},patch:{summary:"Transition listing state",responses:{"200":{description:"Updated"}}} },
    "/events": { get:{summary:"List upcoming events",responses:{"200":{description:"Events"}}},post:{summary:"Create event",responses:{"201":{description:"Created"}}} },
    "/conversations": { get:{summary:"List conversations",responses:{"200":{description:"Conversations"}}},post:{summary:"Start or recover a listing conversation",responses:{"201":{description:"Conversation"}}} },
    "/conversations/{id}/messages": { get:{summary:"Recover persisted messages",responses:{"200":{description:"Messages"}}},post:{summary:"Send a message",responses:{"201":{description:"Message"}}} },
    "/reports": { post:{summary:"Report content or behavior",responses:{"201":{description:"Report"}}} },
    "/notifications": { get:{summary:"List notifications",responses:{"200":{description:"Notifications"}}},patch:{summary:"Mark notifications read",responses:{"200":{description:"Updated"}}} },
    "/uploads": { post:{summary:"Create a short-lived private media upload grant",responses:{"201":{description:"Upload grant"}}} }
  }
} as const;
