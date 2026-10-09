import { Download } from 'lucide-react';
import { DisabledAction } from '../../_components/disabled-action';
import { buttonStyles } from '@/components/ui/button';

/**
 * Descarga el reporte PDF del equipo para el ciclo elegido. Secundario: la vista ya tiene su acción
 * principal. Es un `<a>` común (no `next/link`): apunta a un Route Handler que devuelve un archivo,
 * no a una página, y no debe prefetchearse.
 */
export function DownloadReportButton({
  teamId,
  cycleId,
}: {
  teamId: string;
  cycleId: string | undefined;
}) {
  if (!cycleId) {
    return (
      <DisabledAction
        id="download-report"
        label="Descargar reporte PDF"
        reason="Elegí un ciclo para descargar el reporte."
        icon={<Download size={16} strokeWidth={1.75} aria-hidden />}
      />
    );
  }
  return (
    <a
      href={`/api/reports/teams/${teamId}/pdf?cycleId=${encodeURIComponent(cycleId)}`}
      download
      className={buttonStyles({ variant: 'secondary' })}
    >
      <Download size={16} strokeWidth={1.75} aria-hidden />
      Descargar reporte PDF
    </a>
  );
}
