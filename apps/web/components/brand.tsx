import Link from "next/link";
export function Brand({ compact=false }:{compact?:boolean}) { return <Link className="brand" href={compact?"/exchange":"/"} aria-label="Campus Exchange home"><span className="brand-mark" aria-hidden="true"><i/><i/></span>{!compact&&<span>Campus Exchange</span>}</Link>; }
