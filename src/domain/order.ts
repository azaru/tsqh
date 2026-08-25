export function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
