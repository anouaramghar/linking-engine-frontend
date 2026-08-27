/**
 * Production-only compatibility shim for @bible-strong/avatar-core 0.1.0.
 *
 * That package compiles its bundled avatar schema with Ajv during module
 * evaluation. Ajv generates a validator with Function(), which is blocked by
 * the dashboard's strict script-src policy before React can mount. The
 * dashboard only ships one local, compile-time avatar definition; it does not
 * accept avatar definitions from the API or browser. Development retains Ajv
 * so the package's normal validation remains available there.
 */
type Validator = ((value: unknown) => boolean) & { errors: null };

export default class CspSafeAjv {
  compile(): Validator {
    const validate = (() => true) as unknown as Validator;
    validate.errors = null;
    return validate;
  }
}
