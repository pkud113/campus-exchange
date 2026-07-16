import { describe, expect, it } from "vitest";
import { campusSelectorSchema, conversationRequestInputSchema, eventInputSchema, listingInputSchema } from "./index";

const id="11111111-1111-4111-8111-111111111111";
const listing={title:"Desk lamp",description:"A useful lamp in good condition",category:"furniture",condition:"good",priceCents:1500,currency:"USD",idempotencyKey:id};
describe("multi-campus contracts",()=>{
  it("defaults new content to campus-only",()=>{
    expect(listingInputSchema.parse({...listing,exchangeMethods:["campus_pickup"]}).visibility).toBe("campus_only");
    expect(eventInputSchema.parse({title:"Study group",description:"A useful study group",location:"Library",startsAt:"2030-01-01T10:00:00.000Z",endsAt:"2030-01-01T11:00:00.000Z",idempotencyKey:id}).visibility).toBe("campus_only");
  });
  it("requires unique supported exchange methods",()=>{
    expect(listingInputSchema.safeParse({...listing,exchangeMethods:[]}).success).toBe(false);
    expect(listingInputSchema.safeParse({...listing,exchangeMethods:["shipping","shipping"]}).success).toBe(false);
    expect(listingInputSchema.safeParse({...listing,visibility:"network",exchangeMethods:["shipping"]}).success).toBe(true);
  });
  it("validates campus selectors without exposing IDs",()=>{
    expect(campusSelectorSchema.safeParse("my").success).toBe(true);expect(campusSelectorSchema.safeParse("all").success).toBe(true);expect(campusSelectorSchema.safeParse("campus-alpha").success).toBe(true);expect(campusSelectorSchema.safeParse(id).success).toBe(false);
  });
  it("requires a trimmed opening and idempotency key for every request context",()=>{
    expect(conversationRequestInputSchema.safeParse({profileId:id,openingMessage:"Hello there",idempotencyKey:id}).success).toBe(true);
    expect(conversationRequestInputSchema.safeParse({profileId:id,openingMessage:"   ",idempotencyKey:id}).success).toBe(false);
    expect(conversationRequestInputSchema.safeParse({profileId:id,openingMessage:"Hello about this listing",idempotencyKey:id,context:{type:"listing",id}}).success).toBe(true);
  });
});
