interface QueueEntry {
  tail: Promise<void>;
  users: number;
}

const queues = new Map<string, QueueEntry>();

export async function withTicketMutex<T>(
  ticketId: string,
  operation: () => Promise<T>,
): Promise<T> {
  let queue = queues.get(ticketId);
  if (!queue) {
    queue = { tail: Promise.resolve(), users: 0 };
    queues.set(ticketId, queue);
  }

  const previous = queue.tail;
  let release!: () => void;
  queue.tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  queue.users += 1;

  await previous;
  try {
    return await operation();
  } finally {
    queue.users -= 1;
    release();
    if (queue.users === 0) queues.delete(ticketId);
  }
}
