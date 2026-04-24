export function alertOnError(operation: string) {
  return (err: unknown) =>
    alert(
      `Could not ${operation}: ${err instanceof Error ? err.message : err}`,
    );
}
