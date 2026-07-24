"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { InstitutionCombobox, type InstitutionOption } from "@/components/institution-combobox";

export function InstitutionFilter({
  value,
  label = "Institution"
}: {
  value: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<InstitutionOption | null>(null);

  function choose(next: "my" | "all" | InstitutionOption) {
    const params = new URLSearchParams(searchParams);
    params.delete("cursor");
    params.set("institution", typeof next === "string" ? next : next.id);
    if (typeof next !== "string") setSelected(next);
    router.push(`${pathname}?${params}`);
  }

  return <div className="institution-filter">
    <div className="request-tabs" aria-label={`${label} scope`}>
      <button type="button" className={value === "my" ? "active" : ""} onClick={() => choose("my")}>My institution</button>
      <button type="button" className={value === "all" ? "active" : ""} onClick={() => choose("all")}>All institutions</button>
    </div>
    <InstitutionCombobox
      label={label}
      selected={selected}
      onSelect={(institution) => {
        setSelected(institution);
        if (institution) choose(institution);
      }}
      placeholder={value.startsWith("ipeds:") && !selected ? "Selected institution — search to change" : "Filter by institution"}
    />
  </div>;
}
