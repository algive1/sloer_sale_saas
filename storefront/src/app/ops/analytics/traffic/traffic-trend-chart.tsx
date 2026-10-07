"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type TrafficTrendPoint = {
	bucket: string;
	total: number;
	paid: number;
	organic: number;
	direct: number;
	referral: number;
	other: number;
};

type SeriesKey = "total" | "paid" | "organic" | "direct" | "referral";

const SERIES: Array<{ key: SeriesKey; label: string; className: string; dash?: string }> = [
	{ key: "total", label: "Total", className: "text-foreground" },
	{ key: "paid", label: "Paid", className: "text-blue-600 dark:text-blue-400" },
	{ key: "organic", label: "Organic", className: "text-emerald-600 dark:text-emerald-400" },
	{ key: "direct", label: "Direct", className: "text-amber-600 dark:text-amber-400", dash: "7 5" },
	{ key: "referral", label: "Referral", className: "text-violet-600 dark:text-violet-400", dash: "3 5" },
];

const WIDTH = 1000;
const HEIGHT = 320;
const PAD_X = 38;
const PAD_TOP = 18;
const PAD_BOTTOM = 38;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;
const PLOT_WIDTH = WIDTH - PAD_X * 2;

export function TrafficTrendChart({
	points,
	bucket,
}: {
	points: TrafficTrendPoint[];
	bucket: "hour" | "day";
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
	const [pointer, setPointer] = useState({ x: 0, y: 0, width: 0, height: 0 });
	const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
		total: true,
		paid: true,
		organic: true,
		direct: true,
		referral: true,
	});

	const activeIndex = pinnedIndex ?? hoverIndex;
	const maxValue = useMemo(() => {
		let max = 1;
		for (const point of points) {
			for (const series of SERIES) {
				if (visible[series.key]) max = Math.max(max, point[series.key]);
			}
		}
		return max;
	}, [points, visible]);

	const ticks = useMemo(() => {
		return [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio));
	}, [maxValue]);

	function xAt(index: number): number {
		if (points.length <= 1) return WIDTH / 2;
		return PAD_X + (index / (points.length - 1)) * PLOT_WIDTH;
	}

	function yAt(value: number): number {
		return PAD_TOP + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT;
	}

	function pathFor(key: SeriesKey): string {
		return points
			.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${yAt(point[key]).toFixed(2)}`)
			.join(" ");
	}

	function nearestIndex(clientX: number): number | null {
		if (points.length === 0 || !wrapRef.current) return null;
		const rect = wrapRef.current.getBoundingClientRect();
		const localX = Math.max(0, Math.min(rect.width, clientX - rect.left));
		setPointer((current) => ({ ...current, x: localX, width: rect.width, height: rect.height }));
		if (points.length === 1) return 0;
		const plotLeft = (PAD_X / WIDTH) * rect.width;
		const plotWidth = (PLOT_WIDTH / WIDTH) * rect.width;
		const ratio = Math.max(0, Math.min(1, (localX - plotLeft) / plotWidth));
		return Math.round(ratio * (points.length - 1));
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (pinnedIndex !== null) return;
		if (wrapRef.current) {
			const rect = wrapRef.current.getBoundingClientRect();
			setPointer((current) => ({
				...current,
				y: event.clientY - rect.top,
				width: rect.width,
				height: rect.height,
			}));
		}
		setHoverIndex(nearestIndex(event.clientX));
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (wrapRef.current) setPointerY(event.clientY - wrapRef.current.getBoundingClientRect().top);
		const index = nearestIndex(event.clientX);
		if (index === null) return;
		setPinnedIndex((current) => (current === index ? null : index));
		setHoverIndex(index);
	}

	function toggleSeries(key: SeriesKey) {
		setVisible((current) => {
			const enabledCount = Object.values(current).filter(Boolean).length;
			if (current[key] && enabledCount === 1) return current;
			return { ...current, [key]: !current[key] };
		});
	}

	const selected = activeIndex === null ? null : points[activeIndex];

	return (
		<div className="mt-5">
			<div className="flex flex-wrap gap-2">
				{SERIES.map((series) => (
					<button
						key={series.key}
						type="button"
						onClick={() => toggleSeries(series.key)}
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
				onPointerMove={handlePointerMove}
				onPointerLeave={() => {
					if (pinnedIndex === null) setHoverIndex(null);
				}}
				onPointerDown={handlePointerDown}
				role="img"
				aria-label="Interactive traffic trend. Move the pointer over the chart or tap a point to inspect the corresponding period."
			>
				{points.length === 0 ? (
					<div className="grid h-72 place-items-center text-sm text-muted-foreground">No traffic yet.</div>
				) : (
					<>
						<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" aria-hidden="true">
							{ticks.map((tick, index) => {
								const y = PAD_TOP + PLOT_HEIGHT - (index / (ticks.length - 1)) * PLOT_HEIGHT;
								return (
									<g key={`${tick}:${index}`}>
										<line x1={PAD_X} y1={y} x2={WIDTH - PAD_X} y2={y} className="stroke-border" strokeWidth="1" />
										<text x={PAD_X - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
											{tick.toLocaleString()}
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
										strokeWidth={series.key === "total" ? 3 : 2}
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeDasharray={series.dash}
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
												r={series.key === "total" ? 5 : 4}
												fill="currentColor"
												className={series.className}
											/>
										) : null,
									)}
								</>
							) : null}

							{xLabels(points, bucket).map(({ index, label }) => (
								<text
									key={index}
									x={xAt(index)}
									y={HEIGHT - 12}
									textAnchor="middle"
									className="fill-muted-foreground text-[11px]"
								>
									{label}
								</text>
							))}
						</svg>

						{selected ? (
							<div
								className="pointer-events-none absolute z-10 min-w-44 -translate-x-1/2 rounded-xl border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg"
								style={{
									left: tooltipLeft(pointer.x, pointer.width),
									top: tooltipTop(pointer.y, pointer.height),
								}}
							>
								<div className="mb-2 flex items-center justify-between gap-4">
									<strong>{formatBucket(selected.bucket, bucket)}</strong>
									<span className="text-[10px] text-muted-foreground">{pinnedIndex !== null ? "Pinned" : "Click to pin"}</span>
								</div>
								<div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 tabular-nums">
									<TooltipRow label="Total" value={selected.total} />
									<TooltipRow label="Paid" value={selected.paid} />
									<TooltipRow label="Organic" value={selected.organic} />
									<TooltipRow label="Direct" value={selected.direct} />
									<TooltipRow label="Referral" value={selected.referral} />
									{selected.other > 0 ? <TooltipRow label="Other" value={selected.other} /> : null}
								</div>
							</div>
						) : null}
					</>
				)}
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				Move across the chart to inspect a time bucket. Click or tap to keep the data bubble pinned.
			</p>
		</div>
	);
}

function TooltipRow({ label, value }: { label: string; value: number }) {
	return (
		<>
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{value.toLocaleString()}</span>
		</>
	);
}

function tooltipLeft(pointerX: number, width: number): string {
	if (width <= 0) return "50%";
	const clamped = Math.max(105, Math.min(width - 105, pointerX));
	return `${clamped}px`;
}

function tooltipTop(pointerY: number, height: number): string {
	if (height <= 0) return "12px";
	const preferred = pointerY > 145 ? pointerY - 125 : pointerY + 18;
	return `${Math.max(12, Math.min(height - 130, preferred))}px`;
}

function formatBucket(value: string, bucket: "hour" | "day"): string {
	if (bucket === "hour") {
		const date = new Date(`${value}:00.000Z`);
		if (!Number.isNaN(date.getTime())) {
			return new Intl.DateTimeFormat("en", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
				timeZone: "UTC",
			}).format(date);
		}
	}
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat("en", {
				month: "short",
				day: "numeric",
				year: "numeric",
				timeZone: "UTC",
			}).format(date);
}

function xLabels(points: TrafficTrendPoint[], bucket: "hour" | "day"): Array<{ index: number; label: string }> {
	if (points.length === 0) return [];
	const target = 7;
	const step = Math.max(1, Math.ceil((points.length - 1) / (target - 1)));
	const indices = new Set<number>([0, points.length - 1]);
	for (let index = 0; index < points.length; index += step) indices.add(index);
	return [...indices]
		.sort((a, b) => a - b)
		.map((index) => ({
			index,
			label: shortBucket(points[index]?.bucket ?? "", bucket),
		}));
}

function shortBucket(value: string, bucket: "hour" | "day"): string {
	if (bucket === "hour") return value.slice(11, 16);
	return value.slice(5);
}
