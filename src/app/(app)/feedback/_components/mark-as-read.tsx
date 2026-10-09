'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { markFeedbackReadAction } from '../actions';

/**
 * Hoja sin UI: el receptor abre un feedback sin leer y se marca como leído con una Server Action
 * (efecto en el cliente, nunca durante el render). El back es idempotente, así que el doble efecto de
 * StrictMode en desarrollo no rompe nada. Al terminar se refresca el router para que desaparezca "Sin leer".
 */
export function MarkAsRead({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void markFeedbackReadAction(id).then((result) => {
      if (active && result.status === 'success') router.refresh();
    });
    return () => {
      active = false;
    };
  }, [id, router]);
  return null;
}
