/** An error whose message is safe to show to the user. */
export class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
