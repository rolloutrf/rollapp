// Keep writes in order while collapsing drafts that have not been sent yet.
// Every queued caller receives the draft that was actually persisted.
export function createLatestSaveQueue(save) {
  let running = null;
  let pending = null;

  const run = async (job) => {
    running = job;
    try {
      const result = await save(job.value);
      for (const waiter of job.waiters) waiter.resolve({ value: job.value, result });
    } catch (error) {
      for (const waiter of job.waiters) waiter.reject(error);
    } finally {
      running = null;
      if (pending) {
        const next = pending;
        pending = null;
        void run(next);
      }
    }
  };

  return (value) => new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    if (pending) {
      pending.value = value;
      pending.waiters.push(waiter);
    } else if (running && Object.is(running.value, value)) {
      running.waiters.push(waiter);
    } else if (running) {
      pending = { value, waiters: [waiter] };
    } else {
      void run({ value, waiters: [waiter] });
    }
  });
}
