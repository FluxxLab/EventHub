'use client';

import { useQuery } from '@tanstack/react-query';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { useMemo } from 'react';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

import { ChartTooltip, TipRow, usePointerTip } from '@/components/ui/chart-tooltip';
import { Card, Skeleton } from '@/components/ui/card';
import type { DashboardView } from '@/lib/dashboard/types';
import { count } from '@/lib/format';
import { ISO_NUMERIC } from '@/lib/iso-numeric';

const WIDTH = 800;
const HEIGHT = 400;

type Countries = FeatureCollection<Geometry, { name: string }>;

/** The world shapes load once per tab, only when the map is on screen. */
function useWorld() {
  return useQuery({
    queryKey: ['world-atlas-110m'],
    queryFn: async (): Promise<Countries> => {
      const topology = (await import('world-atlas/countries-110m.json')).default as unknown as Topology<{
        countries: GeometryCollection<{ name: string }>;
      }>;
      return feature(topology, topology.objects.countries) as Countries;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Ticket sales by billing country: shaded map plus the ranked list beside it. */
export function GeoCard({ geography }: { geography: DashboardView['geography'] }) {
  const world = useWorld();
  const { tip, handlers, clear } = usePointerTip<{ name: string; tickets: number | null }>();
  const total = geography.reduce((sum, row) => sum + row.tickets, 0);
  const max = Math.max(1, ...geography.map((row) => row.tickets));

  const shapes = useMemo(() => {
    if (!world.data) return [];
    const byNumeric = new Map(geography.flatMap((row) => (ISO_NUMERIC[row.country] ? [[ISO_NUMERIC[row.country]!, row] as const] : [])));
    const projection = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], world.data);
    const path = geoPath(projection);
    return world.data.features
      .filter((shape) => shape.properties.name !== 'Antarctica')
      .map((shape) => {
        const row = byNumeric.get(String(shape.id));
        return { id: String(shape.id), d: path(shape) ?? '', name: shape.properties.name, row };
      });
  }, [world.data, geography]);

  return (
    <Card title="Tickets by country" action={<span className="text-xs text-ink/40">{count(total)} tickets</span>}>
      <div className="flex flex-col gap-4">
        <div data-tip-host className="relative" onPointerLeave={clear}>
          {world.isPending ? (
            <Skeleton className="aspect-[2/1] w-full" />
          ) : world.isError ? (
            <p className="flex aspect-[2/1] items-center justify-center text-sm text-muted">The map could not load.</p>
          ) : (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="World map shaded by tickets sold per country">
              {shapes.map((shape) => (
                <path
                  key={shape.id + shape.name}
                  d={shape.d}
                  fill={shape.row ? 'var(--primary)' : 'var(--border)'}
                  fillOpacity={shape.row ? 0.25 + 0.75 * (shape.row.tickets / max) : 1}
                  stroke="var(--surface)"
                  strokeWidth={0.6}
                  className="hover:opacity-80"
                  {...handlers({ name: shape.row?.name ?? shape.name, tickets: shape.row?.tickets ?? null })}
                />
              ))}
            </svg>
          )}
          {tip && (
            <ChartTooltip x={tip.x} y={tip.y}>
              <span className="block text-[#fdfdfd]/70">{tip.item.name}</span>
              <TipRow colour={tip.item.tickets ? 'var(--primary)' : undefined} value={tip.item.tickets ? count(tip.item.tickets) : 'No'} label="tickets" />
            </ChartTooltip>
          )}
        </div>
        {geography.length === 0 ? (
          <p className="self-center text-sm text-muted">No paid orders yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {geography.slice(0, 4).map((row) => (
              <li key={row.country}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span className="tabular-nums text-muted">{count(row.tickets)}</span>
                </div>
                <span className="mt-1 block h-0.5 overflow-hidden rounded-full bg-ink/5">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(row.tickets / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
