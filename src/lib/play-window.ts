// Which of the Red Zone's plays are loaded: a window of them, grown a page at a time at either end.

/** How many plays a page (and the window around a graph cursor's play) holds. */
export const PLAY_PAGE = 30;

export interface PlayWindow {
  /** The first play loaded, and one past the last. */
  start: number;
  end: number;
}

/** PLAY_PAGE plays around play `index` of `total`, it in the middle — shifted in from either end of the plays. */
export function windowAround(index: number, total: number, size = PLAY_PAGE): PlayWindow {
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), total - size));
  return { start, end: Math.min(total, start + size) };
}

/** Whether play `index` is among those a window loads. */
export function inWindow({ start, end }: PlayWindow, index: number): boolean {
  return index >= start && index < end;
}
