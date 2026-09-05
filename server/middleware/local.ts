export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return
  const host = getHeader(event, 'host') || ''
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host))
    throw createError({ statusCode: 403, message: '仅允许本机访问' })
  const origin = getHeader(event, 'origin')
  if (origin && origin !== `http://${host}` && origin !== `https://${host}`)
    throw createError({ statusCode: 403, message: '不允许跨站请求' })
  if (getHeader(event, 'sec-fetch-site') === 'cross-site')
    throw createError({ statusCode: 403, message: '不允许跨站请求' })
  if (Number(getHeader(event, 'content-length') || 0) > 11 * 1024 * 1024)
    throw createError({ statusCode: 413, message: '请求不得超过 11 MB' })
  setHeader(event, 'Cache-Control', 'no-store')
})
