import {
  Circle,
  Defs,
  LinearGradient,
  Page,
  Path,
  Rect,
  Stop,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import type { ComponentType, ReactNode } from 'react';
import { PDF_FONT_FAMILY } from './fonts';
import type { Band } from './report-types';
import type { BadgeProps, ObjectiveBlockProps } from './team-report-spec';

/** Colores de marca (Flock UI, claro). El PDF no usa clases Tailwind: son valores literales. */
const C = {
  night: '#1c002c',
  purple: '#7f07c5',
  ink: '#1c002c',
  muted: '#5e4e6b',
  subtle: '#766687',
  border: '#e3daec',
  subtleBg: '#f1ecf7',
  lilac: '#e9deff',
  success: '#16794a',
  successBg: '#e3f5ec',
  warning: '#9a5b00',
  warningBg: '#fff1d6',
  danger: '#c4123f',
  dangerBg: '#fde4ea',
} as const;

const TONE: Record<Band | 'NEUTRAL', { color: string; bg: string }> = {
  GREEN: { color: C.success, bg: C.successBg },
  YELLOW: { color: C.warning, bg: C.warningBg },
  RED: { color: C.danger, bg: C.dangerBg },
  NEUTRAL: { color: C.muted, bg: C.subtleBg },
};

type ElementProps<T> = { element: { props: T }; children?: ReactNode };

/**
 * Ícono + palabra, nunca solo color. Las formas se dibujan con SVG: Public Sans no trae los glifos
 * U+25CF / U+25B2 (caería a Helvetica o a un carácter roto).
 * En ruta = círculo, Requiere atención = triángulo, En riesgo = cuadrado, neutro = círculo vacío.
 */
function StatusIcon({ band }: { band: Band | null }) {
  const color = TONE[band ?? 'NEUTRAL'].color;
  return (
    <Svg width={9} height={9} viewBox="0 0 10 10">
      {band === 'GREEN' ? <Circle cx={5} cy={5} r={4.5} fill={color} /> : null}
      {band === 'YELLOW' ? <Path d="M5 0.5 L9.5 9 L0.5 9 Z" fill={color} /> : null}
      {band === 'RED' ? <Rect x={0.5} y={0.5} width={9} height={9} fill={color} /> : null}
      {band === null ? (
        <Circle cx={5} cy={5} r={4} fill="none" stroke={color} strokeWidth={1.2} />
      ) : null}
    </Svg>
  );
}

function Badge({ band, label }: BadgeProps) {
  const tone = TONE[band ?? 'NEUTRAL'];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: tone.bg,
        borderRadius: 3,
        paddingVertical: 2,
        paddingHorizontal: 5,
      }}
    >
      <StatusIcon band={band} />
      <Text style={{ fontSize: 8, color: tone.color, fontWeight: 700 }}>{label}</Text>
    </View>
  );
}

/** Reemplaza al Page estándar (que fija Helvetica y no tiene pie fijo). Pie: "Página X de Y". */
function ReportPage({ element, children }: ElementProps<{ footerLeft?: string }>) {
  return (
    <Page
      size="A4"
      style={{
        paddingTop: 36,
        paddingBottom: 48,
        paddingHorizontal: 36,
        fontFamily: PDF_FONT_FAMILY,
        fontSize: 10,
        color: C.ink,
        backgroundColor: '#ffffff',
      }}
    >
      {children}
      <View
        fixed
        style={{
          position: 'absolute',
          bottom: 20,
          left: 36,
          right: 36,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontSize: 8, color: C.subtle }}>{element.props.footerLeft ?? ''}</Text>
        <Text
          style={{ fontSize: 8, color: C.subtle }}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </View>
    </Page>
  );
}

/** Cabecera con el degradé "Noche" (superficie de marca): LinearGradient SVG. */
function BrandHeader({ element }: ElementProps<{ title: string; subtitle: string; meta: string }>) {
  const p = element.props;
  return (
    <View style={{ height: 78, marginBottom: 14, borderRadius: 8, overflow: 'hidden' }}>
      <Svg width={523} height={78} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="noche" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={C.purple} />
            <Stop offset="1" stopColor={C.night} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={523} height={78} fill="url(#noche)" />
      </Svg>
      <View style={{ padding: 14 }}>
        <Text style={{ fontSize: 8, color: C.lilac, letterSpacing: 1 }}>REPORTE DE EQUIPO</Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: 300,
            color: '#ffffff',
            letterSpacing: 0.9,
            marginTop: 2,
          }}
        >
          {p.title}
        </Text>
        <Text style={{ fontSize: 9, color: C.lilac, marginTop: 4 }}>
          {p.subtitle} · {p.meta}
        </Text>
      </View>
    </View>
  );
}

function OriginMix({ element }: ElementProps<{ summary: string; warning: string | null }>) {
  const p = element.props;
  return (
    <View
      wrap={false}
      style={{
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 6,
        padding: 10,
        marginBottom: 12,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: 700 }}>Mezcla de origen</Text>
      <Text style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{p.summary}</Text>
      {p.warning ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <StatusIcon band="YELLOW" />
          <Text style={{ fontSize: 9, color: C.warning, flex: 1 }}>{p.warning}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Un objetivo con sus KRs, sin cortarse entre páginas (`wrap={false}`). */
function ObjectiveBlock({ element }: ElementProps<ObjectiveBlockProps>) {
  const o = element.props;
  return (
    <View
      wrap={false}
      style={{ borderWidth: 1, borderColor: C.border, borderRadius: 6, marginBottom: 8 }}
    >
      <View
        style={{
          backgroundColor: C.subtleBg,
          padding: 8,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
        }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: 700 }}>{o.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Badge {...o.badge} />
          <Text style={{ fontSize: 8, color: C.muted, flex: 1 }}>{o.meta}</Text>
        </View>
      </View>
      {o.keyResults.map((kr, index) => (
        <View
          key={index}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            padding: 6,
            borderTopWidth: index ? 1 : 0,
            borderTopColor: C.border,
          }}
        >
          <View style={{ flex: 5 }}>
            <Text style={{ fontSize: 9 }}>{kr.title}</Text>
            <Text style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>{kr.detail}</Text>
          </View>
          <View style={{ flex: 2, alignItems: 'flex-end' }}>
            <Badge {...kr.badge} />
            {kr.badge.band !== null ? (
              <Text style={{ fontSize: 7.5, color: C.subtle, marginTop: 2 }}>{kr.footnote}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** `minPresenceAhead` evita títulos huérfanos al pie de una página. */
function SectionTitle({ element }: ElementProps<{ text: string; level: 'h2' | 'h3' }>) {
  const p = element.props;
  const major = p.level === 'h2';
  return (
    <Text
      minPresenceAhead={200}
      style={{
        fontSize: major ? 14 : 11.5,
        fontWeight: major ? 300 : 700,
        letterSpacing: major ? 0.9 : 0,
        marginTop: 10,
        marginBottom: 6,
        color: major ? C.night : C.purple,
      }}
    >
      {p.text}
    </Text>
  );
}

/**
 * Registro de json-render: mapa plano `tipo -> componente`, mezclado SOBRE los estándar (Page
 * reemplaza al estándar). Se usa el mapa sin tipar de `defineRegistry`: este pide implementar TODO
 * el catálogo estándar y no aporta nada acá (el spec lo construye el server, no un LLM).
 */
export const pdfRegistry = {
  Page: ReportPage,
  BrandHeader,
  OriginMix,
  ObjectiveBlock,
  SectionTitle,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- los props de cada tipo los fija el spec builder
} as Record<string, ComponentType<any>>;
