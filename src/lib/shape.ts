/**
 * Readers for data lut does not type itself, such as a native answer or a stored file: each returns
 * the value with its type, or throws a `ShapeError` naming the field.
 */

type Dict = Record<string, unknown>;

/** Reads one field: its value, or a `ShapeError` naming `path`. */
export type Reader<T> = (value: unknown, path: string) => T;

/** Thrown when data does not have the shape its model describes. */
export class ShapeError extends Error {
  /** The field that did not match, e.g. `spaces[2].name`. */
  readonly path: string;

  constructor(subject: string, path: string) {
    super(`Unexpected ${subject} at ${path}`);
    this.name = 'ShapeError';
    this.path = path;
  }
}

/** The readers for one kind of data; their errors name it, e.g. "terminal profile data". */
export function shapeReaders(subject: string) {
  const fail = (path: string): never => {
    throw new ShapeError(subject, path);
  };

  const dict: Reader<Dict> = (value, path) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Dict)
      : fail(path);

  const text: Reader<string> = (value, path) => (typeof value === 'string' ? value : fail(path));

  const flag: Reader<boolean> = (value, path) => (typeof value === 'boolean' ? value : fail(path));

  const count: Reader<number> = (value, path) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fail(path);

  const optional = <T>(value: unknown, path: string, read: Reader<T>): T | undefined =>
    value === undefined ? undefined : read(value, path);

  const oneOf =
    <T extends string>(choices: readonly T[]): Reader<T> =>
    (value, path) =>
      choices.includes(value as T) ? (value as T) : fail(path);

  const list =
    <T>(read: Reader<T>): Reader<T[]> =>
    (value, path) =>
      Array.isArray(value)
        ? value.map((item, index) => read(item, `${path}[${index}]`))
        : fail(path);

  return { fail, dict, text, flag, count, optional, oneOf, list };
}
