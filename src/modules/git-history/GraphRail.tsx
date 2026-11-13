import { memo, type ReactElement } from 'react';
import type { GraphEdge, GraphRow } from './lib/graph';

const LANE_WIDTH = 20;
const RAIL_PADDING_X = 18;
export const MAX_VISIBLE_LANES = 6;

const STROKE_WIDTH = 2;

function laneX(lane: number): number {
  return RAIL_PADDING_X + lane * LANE_WIDTH;
}

export function railWidth(maxLane: number): number {
  const visible = Math.min(maxLane, MAX_VISIBLE_LANES);
  return RAIL_PADDING_X * 2 + Math.max(0, visible - 1) * LANE_WIDTH;
}

type Props = {
  row: GraphRow;
  rowHeight: number;
  maxLaneCount: number;
  /** The checked-out commit: a filled, larger node. */
  head?: boolean;
};

function renderTopEdge(edge: GraphEdge, midY: number): ReactElement | null {
  if (edge.kind === 'straight') {
    const x = laneX(edge.lane);
    return <line key={`t-s-${edge.lane}`} x1={x} y1={0} x2={x} y2={midY} stroke={edge.color} />;
  }
  if (edge.kind === 'merge') {
    const xFrom = laneX(edge.fromLane);
    const xTo = laneX(edge.toLane);
    const c1y = midY * 0.55;
    return (
      <path
        key={`t-m-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} 0 C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${midY}`}
        fill="none"
        stroke={edge.color}
      />
    );
  }
  return null;
}

function renderBottomEdge(edge: GraphEdge, midY: number, bottomY: number): ReactElement | null {
  if (edge.kind === 'straight') {
    const x = laneX(edge.lane);
    return <line key={`b-s-${edge.lane}`} x1={x} y1={midY} x2={x} y2={bottomY} stroke={edge.color} />;
  }
  if (edge.kind === 'branch') {
    const xFrom = laneX(edge.fromLane);
    const xTo = laneX(edge.toLane);
    const c1y = midY + (bottomY - midY) * 0.45;
    return (
      <path
        key={`b-b-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} ${midY} C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${bottomY}`}
        fill="none"
        stroke={edge.color}
      />
    );
  }
  return null;
}

/** One row's slice of the commit graph: the lanes passing through and the commit's node. */
export const GraphRail = memo(function GraphRail({ row, rowHeight, maxLaneCount, head }: Props) {
  const width = railWidth(maxLaneCount);
  const midY = Math.round(rowHeight / 2);
  const nodeX = laneX(row.lane);

  const visible = Math.min(maxLaneCount, MAX_VISIBLE_LANES);
  const overflow = row.laneCount > visible;

  return (
    <svg
      width={width}
      height={rowHeight}
      viewBox={`0 0 ${width} ${rowHeight}`}
      aria-hidden
      className="shrink-0 overflow-visible"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
    >
      {row.topEdges.map((e) => renderTopEdge(e, midY))}
      {row.bottomEdges.map((e) => renderBottomEdge(e, midY, rowHeight))}
      <circle
        cx={nodeX}
        cy={midY}
        r={head ? 5 : 4}
        fill={head ? row.nodeColor : 'var(--background)'}
        stroke={row.nodeColor}
      />
      {overflow ? (
        <text
          x={width - 4}
          y={midY + 3}
          textAnchor="end"
          stroke="none"
          className="fill-muted-foreground"
          style={{ fontSize: 9 }}
        >
          +{row.laneCount - visible}
        </text>
      ) : null}
    </svg>
  );
});
