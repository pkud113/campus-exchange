import { MessagesClient } from "./messages-client";
import { redirect } from "next/navigation";
export const metadata={title:"Messages"};
export default async function Messages({searchParams}:{searchParams:Promise<{view?:string}>}){
  const params=await searchParams;
  if(params.view==="incoming"||params.view==="sent") redirect(`/messages/requests?view=${params.view}`);
  return <MessagesClient/>
}
