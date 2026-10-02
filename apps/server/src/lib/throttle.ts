/**
 * Leading + trailing throttle. Used for high-frequency broadcasts (answer counts, player
 * counts) so 100 answers in one second become ~7 host updates rather than 100.
 */
export function throttle(fn: () => void, intervalMs: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    last = Date.now();
    timer = null;
    fn();
  };

  const throttled = () => {
    if (timer) return;
    const wait = intervalMs - (Date.now() - last);
    if (wait <= 0) run();
    else timer = setTimeout(run, wait);
  };

  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer);
      run();
    }
  };
  return throttled;
}
