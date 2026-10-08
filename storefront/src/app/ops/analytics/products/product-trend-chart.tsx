"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type ProductTrendRow = {
	bucket: string;
	itemKey: string;
	views: number;
	carts: number;
	purchases: number;
};

type ProductLegend = {
	itemKey: string;
	label: string;
};

type MetricKey = "views" | "carts" | "purchases";

const METRICS: Array<{ key: MetricKey; label: string }> = [
	{ key: "views", label: "Views" },
	{ key: "carts", label: "Add to cart" },
	{ key: "purchases", label: "Purchases" },
];

const SERIES_CLASSES = [
	"text-blue-600 dark:text-blue-400",
	"text-emerald-600 dark:text-emerald-400",
	"text-amber-600 dark:text-amber-400",
	"text-violet-600 dark:text-violet-400",
	"text-rose-600 dark:text-rose-400",
] as const;

const WIDTH = 1000;
const HEIGHT = 320;
const PAD_X = 38;
const PAD_TOP = 18;
const PAD_BOTTOM = 38;
const PLOT_WIDTH = WIDTH - PAD_X * 2;
const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;

export function ProductTrendChart({
	rows,
	products,
	bucket,
}: {
	rows: ProductTrendRow[];
	products: ProductLegend[];
	bucket: "hour" | "day";
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [metric, setMetric] = useState<MetricKey>("views");
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
	const [pointer, setPointer] = useState({ x: 0, y: 0, width: 0, height: 0 });
	const [enabled, setEnabled] = useState<Record<string, boolean>>(
		Object.fromEntries(products.map((product) => [product.itemKey, true])),
	);

	const buckets = useMemo(
		() => [...new Set(rows.map((row) => row.bucket))].sort(),
		[rows],
	);
	const values = useMemo(() => {
		const byKey = new Map(rows.map((row) => [`${row.bucket}:${row.itemKey}`, row]));
		return buckets.map((time) => ({
			bucket: time,
			byProduct: Object.fromEntries(
				products.map((product) => [
					product.itemKey,
					byKey.get(`${time}:${product.itemKey}`) ?? {
						bucket: time,
						itemKey: product.itemKey,
						views: 0,
						carts: 0,
						purchases: 0,
					},
				]),
			),
		}));
	}, [buckets, products, rows]);

	const maxValue = useMemo(() => {
		let max = 1;
		for (const point of values) {
			for (const product of products) {
				if (!enabled[product.itemKey]) continue;
				const row = point.byProduct[product.itemKey] as ProductTrendRow | undefined;
				max = Math.max(max, row?.[metric] ?? 0);
			}
		}
		return max;
	}, [enabled, metric, products, values]);

	const activeIndex = pinnedIndex ?? hoverIndex;
	const selected = activeIndex === null ? null : values[activeIndex];

	function xAt(index: number): number {
		if (values.length <= 1) return WIDTH / 2;
		return PAD_X + (index / (values.length - 1)) * PLOT_WIDTH;
	}

	function yAt(value: number): number {
		return PAD_TOP + PLOT_HEIGHT - (value / maxValue) * PLOT_HEIGHT;
	}

	function pathFor(itemKey: string): string {
		return values
			.map((point, index) => {
				const row = point.byProduct[itemKey] as ProductTrendRow | undefined;
				return `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(2)} ${yAt(row?.[metric] ?? 0).toFixed(2)}`;
			})
			.join(" ");
	}

	function updatePointer(event: ReactPointerEvent<HTMLDivElement>): number | null {
		if (!wrapRef.current || values.length === 0) return null;
		const rect = wrapRef.current.getBoundingClientRect();
		const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
		const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
		setPointer({ x, y, width: rect.width, height: rect.height });
		if (values.length === 1) return 0;
		const plotLeft = (PAD_X / WIDTH) * rect.width;
		const plotWidth = (PLOT_WIDTH / WIDTH) * rect.width;
		const ratio = Math.max(0, Math.min(1, (x - plotLeft) / plotWidth));
		return Math.round(ratio * (values.length - 1));
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

	function toggleProduct(itemKey: string) {
		setEnabled((current) => {
			const active = products.filter((product) => current[product.itemKey]).length;
			if (current[itemKey] && active === 1) return current;
			return { ...current, [itemKey]: !current[itemKey] };
		});
	}

	if (products.length === 0) {
		return (
			<div className="mt-5 grid h-56 place-items-center rounded-lg border border-border/70 text-sm text-muted-foreground">
				No product trend data yet.
			</div>
		);
	}

	return (
		<div className="mt-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap gap-2">
					{METRICS.map((option) => (
						<button
							key={option.key}
							type="button"
							onClick={() => {
								setMetric(option.key);
								setPinnedIndex(null);
							}}
							aria-pressed={metric === option.key}
							className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
								metric === option.key
									? "border-foreground bg-foreground text-background"
									: "border-border bg-background text-muted-foreground"
							}`}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>

			<div className="mt-3 flex flex-wrap gap-2">
				{products.map((product, index) => (
					<button
						key={product.itemKey}
						type="button"
						onClick={() => toggleProduct(product.itemKey)}
						aria-pressed={enabled[product.itemKey]}
						className={`max-w-56 truncate rounded-full border px-3 py-1.5 text-xs font-medium transition ${
							enabled[product.itemKey]
								? "border-foreground/20 bg-secondary text-foreground"
								: "border-border bg-background text-muted-foreground opacity-60"
						}`}
						title={product.label}
					>
						<span className={SERIES_CLASSES[index % SERIES_CLASSES.length]}>●</span> {product.label}
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
				aria-label="Interactive product trend. Move or tap to inspect a time bucket."
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

					{products.map((product, index) =>
						enabled[product.itemKey] ? (
							<path
								key={product.itemKey}
								d={pathFor(product.itemKey)}
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
							<line
								x1={xAt(activeIndex)}
								y1={PAD_TOP}
								x2={xAt(activeIndex)}
								y2={PAD_TOP + PLOT_HEIGHT}
								className="stroke-muted-foreground/50"
								strokeDasharray="4 4"
							/>
							{products.map((product, index) => {
								if (!enabled[product.itemKey]) return null;
								const row = selected.byProduct[product.itemKey] as ProductTrendRow | undefined;
								return (
									<circle
										key={product.itemKey}
										cx={xAt(activeIndex)}
										cy={yAt(row?.[metric] ?? 0)}
										r="4"
										fill="currentColor"
										className={SERIES_CLASSES[index % SERIES_CLASSES.length]}
									/>
								);
							})}
						</>
					) : null}

					{xLabels(buckets, bucket).map(({ index, label }) => (
						<text key={index} x={xAt(index)} y={HEIGHT - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">
							{label}
						</text>
					))}
				</svg>

				{selected ? (
					<div
						className="pointer-events-none absolute z-10 min-w-52 -translate-x-1/2 rounded-xl border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg"
						style={{
							left: tooltipLeft(pointer.x, pointer.width),
							top: tooltipTop(pointer.y, pointer.height),
						}}
					>
						<div className="mb-2 flex items-center justify-between gap-4">
							<strong>{formatBucket(selected.bucket, bucket)}</strong>
							<span className="text-[10px] text-muted-foreground">
								{pinnedIndex !== null ? "Pinned" : "Click to pin"}
							</span>
						</div>
						<div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 tabular-nums">
							{products.map((product, index) => {
								if (!enabled[product.itemKey]) return null;
								const row = selected.byProduct[product.itemKey] as ProductTrendRow | undefined;
								return (
									<div key={product.itemKey} className="contents">
										<span className="max-w-40 truncate" title={product.label}>
											<span className={SERIES_CLASSES[index % SERIES_CLASSES.length]}>●</span> {product.label}
										</span>
										<span className="text-right font-medium">{(row?.[metric] ?? 0).toLocaleString()}</span>
									</div>
								);
							})}
						</div>
					</div>
				) : null}
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				Choose a metric, hide or show products, then move across the chart. Click or tap to pin the data bubble.
			</p>
		</div>
	);
}

function tooltipLeft(pointerX: number, width: number): string {
	if (width <= 0) return "50%";
	return `${Math.max(120, Math.min(width - 120, pointerX))}px`;
}

function tooltipTop(pointerY: number, height: number): string {
	if (height <= 0) return "12px";
	const preferred = pointerY > 150 ? pointerY - 130 : pointerY + 18;
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
