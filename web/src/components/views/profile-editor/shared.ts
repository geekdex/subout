/** Move an item inside an array without mutating the source (used by all reorderable lists). */
export function moveArrayItem<T>(arr: T[], fromIdx: number, toIdx: number): T[] {
  if (toIdx < 0 || toIdx >= arr.length || fromIdx === toIdx) return arr;
  const next = [...arr];
  const [removed] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, removed);
  return next;
}
