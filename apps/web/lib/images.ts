export const listingImageTypes=["image/webp","image/png","image/jpeg"] as const;
export type ListingImageType=(typeof listingImageTypes)[number];

export function detectedImageType(bytes:ArrayBuffer):ListingImageType|null{const value=new Uint8Array(bytes);if(value.length>=3&&value[0]===0xff&&value[1]===0xd8&&value[2]===0xff)return"image/jpeg";if(value.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>value[index]===byte))return"image/png";if(value.length>=12&&String.fromCharCode(...value.slice(0,4))==="RIFF"&&String.fromCharCode(...value.slice(8,12))==="WEBP")return"image/webp";return null}
