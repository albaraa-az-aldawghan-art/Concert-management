export function isPurchaseRawItem(item: { kind?: unknown }): boolean {
  return (item.kind ?? "raw") === "raw";
}

export function purchaseSupplierNames(values: unknown[]): string[] {
  const names = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "ar"));
}
