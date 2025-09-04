
interface QueuedTask<T> {
  id: number;
  run: () => Promise<T>;
  reject: (reason?: any) => void;
}

export interface CancellableTask {
  promise: Promise<any>;
  cancel: () => boolean; // returns true if cancelled, false if not found (already running/finished)
}

export class AnalysisQueue {
  private maxConcurrent: number;
  private running = 0;
  private queue: Array<QueuedTask<any>> = [];
  private nextTaskId = 0;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  push<T>(taskFn: () => Promise<T>): CancellableTask {
    const id = this.nextTaskId++;
    
    const promise = new Promise<T>((resolve, reject) => {
      const runTask = async () => {
        // This task is now running, so it can't be cancelled from the queue.
        this.running++;
        try {
          const result = await taskFn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.next();
        }
      };
      this.queue.push({ id, run: runTask, reject });
      this.next();
    });

    const cancel = (): boolean => {
      const taskIndex = this.queue.findIndex(t => t.id === id);
      if (taskIndex > -1) {
        const [task] = this.queue.splice(taskIndex, 1);
        task.reject(new Error("Analysis was cancelled by the user."));
        return true;
      }
      return false; // Task was not in queue (already running or finished)
    };

    return { promise, cancel };
  }

  private next() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        // The `runTask` function now correctly handles incrementing/decrementing 
        // the running counter and calling `next()` again when it's done.
        nextTask.run();
      }
    }
  }

  clearPending() {
    this.queue.forEach(task => task.reject(new Error("Queue cleared.")));
    this.queue = [];
  }
}