import { io } from "next/cache";
import { getCopyrightText } from "@/config/brand";

/** Resolve the year once on the server, outside the prerendered shell. */
export async function CopyrightText({ holder }: { holder?: string }) {
	await io();
	const year = new Date().getFullYear();
	return <>{holder ? `© ${year} ${holder}. All rights reserved.` : getCopyrightText(year)}</>;
}
