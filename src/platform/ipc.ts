import { commands } from "../bindings";

export { commands };
export type * from "../bindings";

/** Unwraps a fallible command result (tauri-specta `typedError` shape). */
export async function call<T>(
  result: Promise<{ status: "ok"; data: T } | { status: "error"; error: unknown }>,
): Promise<T> {
  const r = await result;
  if (r.status === "error") throw r.error;
  return r.data;
}
