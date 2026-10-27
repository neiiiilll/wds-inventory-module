const VALID = new Set(["dashboard", "procurement", "inventory", "movements", "references"])

export const matchesLiveInvalidation = (key: string, value: string) =>
  key === value || key.startsWith(`${value}:`)

export const validLiveInvalidations = (keys: string[]) =>
  new Set(keys.filter((key) => VALID.has(key)))
