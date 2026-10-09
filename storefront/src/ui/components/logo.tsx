import { LinkWithChannel } from "@/ui/atoms/link-with-channel";
import { Logo as SharedLogo } from "./shared/logo";
import { brandSiteForChannel } from "@/config/brand-sites";

/**
 * Site logo with link to homepage.
 * Always renders as a link - no client-side pathname detection needed.
 */
export const Logo = ({ channel }: { channel?: string }) => {
	const site = channel ? brandSiteForChannel(channel) : null;
	return (
		<LinkWithChannel href="/" className="flex shrink-0 items-center" aria-label="Homepage">
			<SharedLogo className="h-7 w-auto" src={site?.logo} fallbackText={site?.name} ariaLabel={site?.name} />
		</LinkWithChannel>
	);
};
