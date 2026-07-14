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
    "/auth/register/start": { post:{summary:"Send a one-time registration or account-setup code",security:[],responses:{"200":{description:"Code requested"}}} },
    "/auth/login": { post:{summary:"Sign in with email or username and password",security:[],responses:{"200":{description:"Authenticated"}}} },
    "/auth/onboarding": { post:{summary:"Set immutable username and permanent password",responses:{"200":{description:"Onboarding complete"}}} },
    "/auth/reverify": { post:{summary:"Renew annual student verification after an email OTP",responses:{"200":{description:"Verification renewed or onboarding required"}}} },
    "/auth/password-reset/start": { post:{summary:"Send a generic password recovery response",security:[],responses:{"200":{description:"Recovery requested"}}} },
    "/auth/password-reset/verify": { post:{summary:"Verify a six-digit recovery code",security:[],responses:{"200":{description:"Recovery verified"}}} },
    "/auth/password-reset/complete": { post:{summary:"Set a new password after recovery",responses:{"200":{description:"Password updated"}}} },
    "/auth/logout": { post:{summary:"End the local session and clear private caches",responses:{"200":{description:"Signed out"}}} },
    "/profile": { get:{summary:"Get current profile",responses:{"200":{description:"Profile"}}},patch:{summary:"Update current profile",responses:{"200":{description:"Updated profile"}}} },
    "/listings": { get:{summary:"Search campus listings",parameters:[{in:"query",name:"cursor",schema:{type:"string"}},{in:"query",name:"q",schema:{type:"string"}}],responses:{"200":{description:"Cursor page"}}},post:{summary:"Publish a listing",responses:{"201":{description:"Created"}}} },
    "/listings/{id}": { get:{summary:"Get listing",responses:{"200":{description:"Listing"}}},patch:{summary:"Edit or transition an owned listing",responses:{"200":{description:"Updated"}}},delete:{summary:"Soft-delete an owned listing",responses:{"200":{description:"Deleted"}}} },
    "/events": { get:{summary:"List upcoming events",responses:{"200":{description:"Events"}}},post:{summary:"Create event",responses:{"201":{description:"Created"}}} },
    "/events/{id}": { get:{summary:"Get event",responses:{"200":{description:"Event"}}},patch:{summary:"Edit an owned event",responses:{"200":{description:"Updated"}}},delete:{summary:"Soft-delete an owned event",responses:{"200":{description:"Deleted"}}} },
    "/profiles": { get:{summary:"Search verified members of the current campus",responses:{"200":{description:"Profiles"}}},patch:{summary:"Update the current member profile",responses:{"200":{description:"Profile updated"}}} },
    "/profiles/{username}": { get:{summary:"Get a same-campus public profile",responses:{"200":{description:"Profile"}}} },
    "/me/listings": { get:{summary:"List the current member's listings",responses:{"200":{description:"Listings"}}} },
    "/me/events": { get:{summary:"List the current member's events",responses:{"200":{description:"Events"}}} },
    "/conversation-requests": { get:{summary:"List pending direct-conversation requests",responses:{"200":{description:"Requests"}}},post:{summary:"Request a direct conversation",responses:{"201":{description:"Request created"}}} },
    "/conversation-requests/{id}": { patch:{summary:"Accept or decline a request",responses:{"200":{description:"Updated"}}},delete:{summary:"Cancel an outgoing request",responses:{"200":{description:"Cancelled"}}} },
    "/conversations": { get:{summary:"List conversations",responses:{"200":{description:"Conversations"}}},post:{summary:"Start or recover a listing conversation",responses:{"201":{description:"Conversation"}}} },
    "/conversations/{id}/messages": { get:{summary:"Recover persisted messages",responses:{"200":{description:"Messages"}}},post:{summary:"Send a message",responses:{"201":{description:"Message"}}} },
    "/conversations/{id}/read": { post:{summary:"Update participant last-read time",responses:{"200":{description:"Read state updated"}}} },
    "/reports": { post:{summary:"Report content or behavior",responses:{"201":{description:"Report"}}} },
    "/notifications": { get:{summary:"List notifications",responses:{"200":{description:"Notifications"}}},patch:{summary:"Mark notifications read",responses:{"200":{description:"Updated"}}} },
    "/uploads": { post:{summary:"Create a short-lived private media upload grant",responses:{"201":{description:"Upload grant"}}} },
    "/uploads/{id}": { put:{summary:"Upload and transform the validated image body",responses:{"200":{description:"Media ready"}}} },
    "/admin/content/{type}/{id}": { patch:{summary:"MFA-protected edit or hide",responses:{"200":{description:"Content updated"}}},delete:{summary:"MFA-protected soft deletion",responses:{"200":{description:"Content deleted"}}} },
    "/admin/profiles/{id}": { patch:{summary:"MFA-protected suspension or restoration",responses:{"200":{description:"Profile updated"}}} }
  }
} as const;
