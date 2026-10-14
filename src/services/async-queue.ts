export function createSerialQueue() {
  let tail = Promise.resolve()

  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job)
    tail = result.then(() => undefined, () => undefined)
    return result
  }
}
