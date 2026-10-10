/** Safe public error: a stable code, never a filesystem path or source excerpt. */
export class InputError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "InputError";
    this.code = code;
  }
}
