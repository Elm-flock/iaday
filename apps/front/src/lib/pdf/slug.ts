/** `Plataforma Núcleo` -> `plataforma-nucleo`. Para nombres de archivo ASCII seguros. */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'reporte'
  );
}

export function teamReportFilename(teamName: string, cycleName: string): string {
  return `reporte-${slugify(teamName)}-${slugify(cycleName)}.pdf`;
}
