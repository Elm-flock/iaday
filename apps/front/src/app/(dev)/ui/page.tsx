import { notFound } from 'next/navigation';
import { Showcase } from './showcase';

/** Catálogo visual del sistema de diseño. Solo existe en desarrollo. */
export default function UiShowcasePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Showcase />;
}
