"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!value.startsWith("ipeds:")) {
      setSelected(null);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/v1/institutions?id=${encodeURIComponent(value)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Unable to load the selected institution.");
        setSelected(body.data?.item ?? null);
      })
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setSelected(null);
      });
    return () => controller.abort();
  }, [value]);

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
      placeholder={value.startsWith("ipeds:") && !selected ? "Loading selected institution…" : "Filter by institution"}
    />
  </div>;
}
