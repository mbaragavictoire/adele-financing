export function assertPreviewBuild(env) {
  if ((env.VITE_API_URL || '').trim()) {
    throw new Error('Pages builds must use the same-origin API only.')
  }
}
