/**
 * Fecha/hora en zona horaria de Paraguay (America/Asuncion).
 * Paraguay: UTC-4 (invierno) / UTC-3 (verano).
 * Formato para SQLite: YYYY-MM-DD HH:mm:ss
 */
export function getParaguayDateTime() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
}
