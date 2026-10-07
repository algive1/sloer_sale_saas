import "../globals.css";
import type { ReactNode } from "react";
import { getRootHtmlFontProps } from "@/lib/fonts";

export default function OpsLayout({ children }: { children: ReactNode }) {
	return (
		<html {...getRootHtmlFontProps("en")}>
			<body className="min-h-dvh bg-background font-sans text-foreground">{children}</body>
		</html>
	);
}
