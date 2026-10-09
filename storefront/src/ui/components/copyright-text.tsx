"use client";

import { getCopyrightText } from "@/config/brand";

/** Client component for copyright text (needs current year) */
export function CopyrightText({ holder }: { holder?: string }) {
	return <>{holder ? `© ${new Date().getFullYear()} ${holder}. All rights reserved.` : getCopyrightText()}</>;
}
