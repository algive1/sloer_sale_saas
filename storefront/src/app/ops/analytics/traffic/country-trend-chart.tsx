"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type CountryPoint = {
	bucket: string;
	countryCode: string;
	sessions: number;
};

const WIDTH = 1000;
const HEIGHT = 300;
const PAD_X = 38;
const PAD_TOP = 18;
const PAD_BOTTOM = 38;
const PLOT_WIDTH = WIDTH - PAD_X * 2;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;

const SERIES_CLASSES = [
	"text-blue-600 dark:text-blue-400",
	"text-emerald-600 dark:text-emerald-400",
	"text-amber-600 dark:text-amber-400",
	"text-violet-600 dark:text-violet-400",
	"text-rose-600 dark:text-rose-400",
] as const;

export function CountryTrendChart({
	buckets,
	rows,
	countries,
	bucket,
}: {
	buckets: string[];
	rows: CountryPoint[];
	countries: string[];
	bucket: "hour" | "day";
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
	const [pointerX, setPointerX] = useState(0);
	const [pointerY, setPointerY] = useState(0);
	const [enabled, setEnabled] = useState<Record<string, boolean>>(
		Object.fromEntries(countries.map((country) => [country, true])),
	);

	const values = useMemo(() => {
		const byKey = new Map(rows.map((row) => [`${row.bucket}:${row.countryCode}`, row.sessions]));
		return buckets.map((time) => ({
			bucket: time,
			byCountry: Object.fromEntries(countries.map((country) => [country, byKey.get(`${time}:${country}`) ?? 0])),
		}));
	}, [buckets, countries, rows]);

	const maxValue = useMemo(() => {
		let max = 1;
		for (const point of values) {
			for (const country of countries) {
				if (enabled[country]) max = Math.max(max, point.byCountry[country] ?? 0);
			}
		}
		return max;
	}, [countries, enabled, values]);

	const activeIndex = pinnedIndex ?? hoverIndex;
	const selected = activeIndex === null ? null : values[activeIndex];

	function xAt(index: number): number {
		if (values.length <= 1) return WIDTH / 2;
		return PAD_X + (index / (values.length - 1)) * PLOT_WIDTH;
	}

	function yAt(value: number): number {
		return PAD_TOP + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT;
	}

	function pathFor(country: string): string {
		return values
			.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${yAt(point.byCountry[country] ?? 0).toFixed(2)}`)
			.join(" ");
	}

	function nearestIndex(clientX: number): number | null {
		if (values.length === 0 || !wrapRef.current) return null;
		const rect = wrapRef.current.getBoundingClientRect();
		const localX = Math.max(0, Math.min(rect.width, clientX - rect.left));
		setPointerX(localX);
		if (values.length === 1) return 0;
		const plotLeft = (PAD_X / WIDTH) * rect.width;
		const plotWidth = (PLOT_WIDTH / WIDTH) * rect.width;
		const ratio = Math.max(0, Math.min(1, (localX - plotLeft) / plotWidth));
		return Math.round(ratio * (values.length - 1));
	}

	function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (pinnedIndex !== null) return;
		if (wrapRef.current) setPointerY(event.clientY - wrapRef.current.getBoundingClientRect().top);
		setHoverIndex(nearestIndex(event.clientX));
	}

	function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (wrapRef.current) setPointerY(event.clientY - wrapRef.current.getBoundingClientRect().top);
		const index = nearestIndex(event.clientX);
		if (index === null) return;
		setPinnedIndex((current) => (current === index ? null : index));
		setHoverIndex(index);
	}

	function toggleCountry(country: string) {
		setEnabled((current) => {
			const active = countries.filter((item) => current[item]).length;
			if (current[country] && active === 1) return current;
			return { ...current, [country]: !current[country] };
		});
	}

	if (countries.length === 0) {
		return <div className="mt-5 grid h-56 place-items-center rounded-lg border border-border/70 text-sm text-muted-foreground">No country data yet.</div>;
	}

	return (
		<div className="mt-5">
			<div className="flex flex-wrap gap-2">
				{countries.map((country, index) => (
					<button
						key={country}
						type="button"
						onClick={() => toggleCountry(country)}
						aria-pressed={enabled[country]}
						className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
							enabled[country] ? "border-foreground/20 bg-secondary text-foreground" : "border-border bg-background text-muted-foreground opacity-60"
						}`}
					>
						<span className={SERIES_CLASSES[index % SERIES_CLASSES.length]}>●</span> {country}
					</button>
				))}
			</div>

			<div
				ref={wrapRef}
				className="relative mt-4 touch-pan-y select-none overflow-hidden rounded-lg border border-border/70 bg-background"
				onPointerMove={pointerMove}
				onPointerLeave={() => {
					if (pinnedIndex === null) setHoverIndex(null);
				}}
				onPointerDown={pointerDown}
				role="img"
				aria-label="Interactive country traffic comparison. Move or tap to inspect a time bucket."
			>
				<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full" aria-hidden="true">
					{[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
						const value = Math.round(maxValue * ratio);
						const y = PAD_TOP + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
						return (
							<g key={ratio}>
								<line x1={PAD_X} y1={y} x2={WIDTH - PAD_X} y2={y} className="stroke-border" />
								<text x={PAD_X - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{value.toLocaleString()}</text>
							</g>
						);
					})}

					{countries.map((country, index) =>
						enabled[country] ? (
							<path
								key={country}
								d={pathFor(country)}
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className={SERIES_CLASSES[index % SERIES_CLASSES.length]}
							/>
						) : null,
					)}

					{activeIndex !== null && selected ? (
						<>
							<line x1={xAt(activeIndex)} y1={PAD_TOP} x2={xAt(activeIndex)} y2={PAD_TOP + PLOT_HEIGHT} className="stroke-muted-foreground/50" strokeDasharray="4 4" />
							{countries.map((country, index) =>
								enabled[country] ? (
									<circle
										key={country}
										cx={xAt(activeIndex)}
										cy={yAt(selected.byCountry[country] ?? 0)}
										r="4"
										fill="currentColor"
										className={SERIES_CLASSES[index % SERIES_CLASSES.length]}
									/>
								) : null,
							)}
						</>
					) : null}

					{xLabels(values.map((item) => item.bucket), bucket).map(({ index, label }) => (
						<text key={index} x={xAt(index)} y={HEIGHT - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">{label}</text>
					))}
				</svg>

				{selected ? (
					<div
						className="pointer-events-none absolute z-10 min-w-44 -translate-x-1/2 rounded-xl border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg"
						style={{
							left: tooltipLeft(pointerX, wrapRef.current?.clientWidth ?? 0),
							top: tooltipTop(pointerY, wrapRef.current?.clientHeight ?? 0),
						}}
					>
						<div className="mb-2 flex items-center justify-between gap-4">
							<strong>{formatBucket(selected.bucket, bucket)}</strong>
							<span className="text-[10px] text-muted-foreground">{pinnedIndex !== null ? "Pinned" : "Click to pin"}</span>
						</div>
						<div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 tabular-nums">
							{countries.map((country, index) =>
								enabled[country] ? (
									<div key={country} className="contents">
										<span><span className={SERIES_CLASSES[index % SERIES_CLASSES.length]}>●</span> {country}</span>
										<span className="text-right font-medium">{(selected.byCountry[country] ?? 0).toLocaleString()}</span>
									</div>
								) : null,
							)}
						</div>
					</div>
				) : null}
			</div>
			<p className="mt-2 text-xs text-muted-foreground">Click a country chip to show or hide it. Move across the chart or tap to inspect a period.</p>
		</div>
	);
}

function tooltipLeft(pointerX: number, width: number): string {
	if (width <= 0) return "50%";
	return `${Math.max(105, Math.min(width - 105, pointerX))}px`;
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
			return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(date);
		}
	}
	const date = new Date(`${value}T00:00:00.000Z`);
	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function xLabels(values: string[], bucket: "hour" | "day"): Array<{ index: number; label: string }> {
	if (values.length === 0) return [];
	const step = Math.max(1, Math.ceil((values.length - 1) / 6));
	const indices = new Set<number>([0, values.length - 1]);
	for (let index = 0; index < values.length; index += step) indices.add(index);
	return [...indices].sort((a, b) => a - b).map((index) => ({
		index,
		label: bucket === "hour" ? (values[index] ?? "").slice(11, 16) : (values[index] ?? "").slice(5),
	}));
}
