// pad to a multiple of 4
export function mypad(x: number): number {
  return x % 4 ? x + (4 - (x % 4)) : x;
}
