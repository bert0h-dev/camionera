/** "Chrome en Windows" a partir del user agent; suficiente para reconocer un equipo. */
export function describeDevice(userAgent: string | null | undefined) {
  if (!userAgent) return 'Dispositivo desconocido'
  const ua = userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /node|axios|curl|supertest/i.test(ua)
              ? 'Cliente de API'
              : 'Navegador'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} en ${os}` : browser
}

export const isMobile = (userAgent: string | null | undefined) =>
  !!userAgent && /Android|iPhone|iPad|Mobile/.test(userAgent)
