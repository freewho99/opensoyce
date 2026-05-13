/**
 * GitHub owner / repo name validator.
 *
 * GitHub usernames are alphanumeric + hyphen, max 39 chars, can't start with hyphen.
 * Repo names are alphanumeric + . _ - , max 100 chars. Special repos like `.github`
 * begin with a dot but `.` and `..` are reserved path segments and must be rejected.
 *
 * This validator is intentionally permissive enough to accept any real-world name
 * GitHub serves, and strict enough to block path-injection (`../`, `?`, `&`, `/`).
 *
 * @param {unknown} s
 * @returns {boolean}
 */
export function isValidGithubName(s) {
  return typeof s === 'string'
    && s.length > 0
    && s.length <= 100
    && /^[A-Za-z0-9._-]+$/.test(s)
    && !s.includes('..')
    && s !== '.'
    && s !== '..';
}
