"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type RealtimeTrendPoint = {
	bucket: string;
	activeSessions: number;
	events: number;
	purchases: number;
};

type MetricKey = "activeSessions" | "events" | "purchases";

const SERIES: Array<{ key: MetricKey; label: string; className: string }> = [
	{ key: "activeSessions", label: "Active sessions", className: "text-foreground" },
	{ key: "events", label: "Events", className: "text-blue-600 dark:text-blue-400" },
	{ key: "purchases", label: "Purchases", className: "text-emerald-600 dark:text-emerald-400" },
];

const WIDTH = 1000;
const HEIGHT = 300;
const PAD_X = 38;
const PAD_TOP = 18;
const PAD_BOTTOM = 38;
const PLOT_WIDTH = WIDTH - PAD_X * 2;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;

export function RealtimeTrendChart({ points }: { points: RealtimeTrendPoint[] }) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
	const [pointer, setPointer] = useState({ x: 0, y: 0, width: 0, height: 0 });
	const [visible, setVisible] = useState<Record<MetricKey, boolean>>({
		activeSessions: true,
		events: true,
		purchases: true,
	});

	const maxValue = useMemo(() => {
		let max = 1;
		for (const point of points) {
			for (const series of SERIES) {
				if (visible[series.key]) max = Math.max(max, point[series.key]);
			}
		}
		return max;
	}, [points, visible]);

	const activeIndex = pinnedIndex ?? hoverIndex;
	const selected = activeIndex === null ? null : points[activeIndex];

	function xAt(index: number): number {
		if (points.length <= 1) return WIDTH / 2;
		return PAD_X + (index / (points.length - 1)) * PLOT_WIDTH;
	}

	function yAt(value: number): number {
		return PAD_TOP + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT;
	}

	function pathFor(key: MetricKey): string {
		return points
			.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${yAt(point[key]).toFixed(2)}`)
			.join(" ");
	}

	function updatePointer(event: ReactPointerEvent<HTMLDivElement>): number | null {
		if (!wrapRef.current || points.length === 0) return null;
		const rect = wrapRef.current.getBoundingClientRect();
		const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
		const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
		setPointer({ x, y, width: rect.width, height: rect.height });
		if (points.length === 1) return 0;
		const plotLeft = (PAD_X / WIDTH) * rect.width;
		const plotWidth = (PLOT_WIDTH / WIDTH) * rect.width;
		const ratio = Math.max(0, Math.min(1, (x - plotLeft) / plotWidth));
		return Math.round(ratio * (points.length - 1));
	}

	function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (pinnedIndex !== null) return;
		setHoverIndex(updatePointer(event));
	}

	function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		const index = updatePointer(event);
		if (index === null) return;
		setPinnedIndex((current) => (current === index ? null : index));
		setHoverIndex(index);
	}

	function toggleMetric(key: MetricKey) {
		setVisible((current) => {
			const active = Object.values(current).filter(Boolean).length;
			if (current[key] && active === 1) return current;
			return { ...current, [key]: !current[key] };
		});
	}

	return (
		<div>
			<div className="flex flex-wrap gap-2">
				{SERIES.map((series) => (
					<button
						key={series.key}
						type="button"
						onClick={() => toggleMetric(series.key)}
						aria-pressed={visible[series.key]}
						className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
							visible[series.key]
								? "border-foreground/20 bg-secondary text-foreground"
								: "border-border bg-background text-muted-foreground opacity-60"
						}`}
					>
						{series.label}
					</button>
				))}
			</div>

			<div
				ref={wrapRef}
				className="relative mt-4 touch-pan-y select-none overflow-visible rounded-lg border border-border/70 bg-background"
				onPointerMove={pointerMove}
				onPointerLeave={() => {
					if (pinnedIndex === null) setHoverIndex(null);
				}}
				onPointerDown={pointerDown}
				role="img"
				aria-label="Realtime analytics trend. Move or tap to inspect a minute."
			>
				<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" aria-hidden="true">
					{[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
						const value = Math.round(maxValue * ratio);
						const y = PAD_TOP + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
						return (
							<g key={ratio}>
								<line x1={PAD_X} y1={y} x2={WIDTH - PAD_X} y2={y} className="stroke-border" />
								<text x={PAD_X - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
									{value.toLocaleString()}
								</text>
							</g>
						);
					})}
					{SERIES.map((series) =>
						visible[series.key] ? (
							<path
								key={series.key}
								d={pathFor(series.key)}
								fill="none"
								stroke="currentColor"
								strokeWidth={series.key === "activeSessions" ? 3 : 2}
								strokeLinecap="round"
								strokeLinejoin="round"
								className={series.className}
							/>
						) : null,
					)}
					{activeIndex !== null && selected ? (
						<>
							<line
								x1={xAt(activeIndex)}
								y1={PAD_TOP}
								x2={xAt(activeIndex)}
								y2={PAD_TOP + PLOT_HEIGHT}
								className="stroke-muted-foreground/50"
								strokeDasharray="4 4"
							/>
							{SERIES.map((series) =>
								visible[series.key] ? (
									<circle
										key={series.key}
										cx={xAt(activeIndex)}
										cy={yAt(selected[series.key])}
										r={series.key === "activeSessions" ? 5 : 4}
										fill="currentColor"
										className={series.className}
									/>
								) : null,
							)}
						</>
					) : null}
					{xLabels(points).map(({ index, label }) => (
						<text key={index} x={xAt(index)} y={HEIGHT - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">
							{label}
						</text>
					))}
				</svg>

				{selected ? (
					<div
						className="pointer-events-none absolute z-10 min-w-48 -translate-x-1/2 rounded-xl border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg"
						style={{
							left: tooltipLeft(pointer.x, pointer.width),
							top: tooltipTop(pointer.y, pointer.height),
						}}
					>
						<div className="mb-2 flex items-center justify-between gap-4">
							<strong>{formatMinute(selected.bucket)}</strong>
							<span className="text-[10px] text-muted-foreground">
								{pinnedIndex !== null ? "Pinned" : "Click to pin"}
							</span>
						</div>
						<div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 tabular-nums">
							<Row label="Active sessions" value={selected.activeSessions} />
							<Row label="Events" value={selected.events} />
							<Row label="Purchases" value={selected.purchases} />
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

function Row({ label, value }: { label: string; value: number }) {
	return (
		<>
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{value.toLocaleString()}</span>
		</>
	);
}

function tooltipLeft(x: number, width: number): string {
	if (width <= 0) return "50%";
	return `${Math.max(110, Math.min(width - 110, x))}px`;
}

function tooltipTop(y: number, height: number): string {
	if (height <= 0) return "12px";
	const preferred = y > 145 ? y - 120 : y + 18;
	return `${Math.max(12, Math.min(height - 120, preferred))}px`;
}

function formatMinute(value: string): string {
	const date = new Date(`${value}:00.000Z`);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat("en", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: "UTC",
			}).format(date);
}

function xLabels(points: RealtimeTrendPoint[]): Array<{ index: number; label: string }> {
	if (points.length === 0) return [];
	const step = Math.max(1, Math.ceil((points.length - 1) / 6));
	const indices = new Set<number>([0, points.length - 1]);
	for (let index = 0; index < points.length; index += step) indices.add(index);
	return [...indices].sort((a, b) => a - b).map((index) => ({
		index,
		label: (points[index]?.bucket ?? "").slice(11, 16),
	}));
}
