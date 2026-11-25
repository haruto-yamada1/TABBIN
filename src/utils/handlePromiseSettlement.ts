// Only failure of the input promise is handled by `onRejected`. Errors from
// either callback reject the returned promise so callers can observe them.
export const handlePromiseSettlement = async <Value, Result>(
  promise: Promise<Value>,
  onFulfilled: (value: Value) => Result | PromiseLike<Result>,
  onRejected: (reason: unknown) => Result | PromiseLike<Result>,
): Promise<Result> => {
  let value: Value
  try {
    value = await promise
  } catch (error) {
    return onRejected(error)
  }
  return onFulfilled(value)
}
