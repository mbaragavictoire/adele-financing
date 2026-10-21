// req.adeleProxy is assigned only after authenticated ingress middleware succeeds.
export function clientIp(req) {
  return String(req.adeleProxy?.clientIp || req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 64)
}
