import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EventForm } from "./event-form";
export const metadata={title:"Create event"};
export default function NewEvent(){return <main className="dashboard narrow"><Link className="back-link" href="/events"><ArrowLeft/>Events</Link><div className="form-header"><span className="overline">NEW EVENT</span><h1>Put something on the calendar.</h1><p>Make it clear what students can expect and where to show up.</p></div><EventForm/></main>}
