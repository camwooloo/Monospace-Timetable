/**
 * `setImmediate` / `clearImmediate` for the browser bundle.
 *
 * ⚠️ `readable-stream` and the zip stack call these and browsers do not have
 * them. The obvious `setTimeout(fn, 0)` is WRONG in a way that only shows up
 * on a big workbook: browsers clamp nested timeouts to ~4 ms, so a 42-sheet
 * export that yields once per chunk spends seconds in the clamp. A
 * `MessageChannel` post is the standard trick and is not clamped.
 *
 * ⭐ AND IT IS NOT `queueMicrotask`. `setImmediate` is a MACROtask by
 * contract: code that uses it is deliberately yielding to the event loop so
 * the page can paint. Collapsing it to a microtask would let a long export
 * freeze the window, which on a desktop tool a school runs on a slow laptop is
 * the difference between a progress bar and a "not responding" dialog.
 */

type Task = { fn: (...args: unknown[]) => void; args: unknown[] };

const queue = new Map<number, Task>();
let nextId = 1;

const channel =
  typeof MessageChannel === "function" ? new MessageChannel() : null;

if (channel) {
  channel.port1.onmessage = (event: MessageEvent) => {
    const id = event.data as number;
    const task = queue.get(id);
    if (!task) return;
    queue.delete(id);
    task.fn(...task.args);
  };
}

export function setImmediate(
  fn: (...args: unknown[]) => void,
  ...args: unknown[]
): number {
  const id = nextId++;
  queue.set(id, { fn, args });
  if (channel) channel.port2.postMessage(id);
  /* ⚠️ THE FALLBACK IS FOR ENVIRONMENTS WITH NO `MessageChannel` — a worker in
     an old engine, a test harness. It takes the clamp, which is slow but
     correct; being fast and absent is not an option. */
  else setTimeout(() => {
    const task = queue.get(id);
    if (!task) return;
    queue.delete(id);
    task.fn(...task.args);
  }, 0);
  return id;
}

export function clearImmediate(id: number): void {
  queue.delete(id);
}

export default setImmediate;
