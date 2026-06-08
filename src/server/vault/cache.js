// OpenSoyce Trust Vault — private cache + content headers middleware.
//
// PR-V2-A. Per PR-V1-A §6.2 + PR-V1-B §2.4.
//
// Every /api/vault/* response carries:
//   Cache-Control: private, no-store, no-cache, must-revalidate
//   Pragma:        no-cache
//   Vary:          Cookie
//
// The Vault is never publicly cached. Period.

export function setPrivateCacheHeaders(_req, res, next) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie');
  next();
}
