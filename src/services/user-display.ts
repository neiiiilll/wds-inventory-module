export function dashboardGreeting(displayName: string): string {
  const normalizedName = displayName.trim()
  const firstName = normalizedName.includes("@")
    ? normalizedName.split("@")[0]
    : normalizedName.split(/\s+/)[0]

  return `Good morning, ${firstName}`
}

export function userInitials(displayName: string): string {
  const normalizedName = displayName.trim()
  const name = normalizedName.includes("@")
    ? normalizedName.split("@")[0]
    : normalizedName
  const parts = name.split(/\s+/).filter(Boolean)

  if (parts.length > 1) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }

  return name.slice(0, 2).toUpperCase()
}
