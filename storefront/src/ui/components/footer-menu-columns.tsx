import Link from "next/link";
import type { MenuItem } from "@/lib/menus/get-menu-data";
import { getMenuItemHref, getMenuItemLabel } from "@/lib/menus/menu-item-utils";
import { LinkWithChannel } from "@/ui/atoms/link-with-channel";
import { NavHrefLink } from "@/ui/atoms/nav-href-link";

/** Every fallback link must resolve without optional CMS Pages or menu fixtures. */
const defaultFooterLinks = {
  support: [
    { label: "Track Your Order", href: "/order/find", global: true },
    { label: "View Cart", href: "/cart", global: false },
    { label: "Sign In", href: "/login", global: false },
    { label: "Create Account", href: "/signup", global: false },
  ],
  explore: [
    { label: "Shop All Products", href: "/products", global: false },
    { label: "Search Products", href: "/search", global: false },
    { label: "My Wishlist", href: "/wishlist", global: false },
    { label: "My Account", href: "/account", global: false },
  ],
} as const;

type FallbackLink = { label: string; href: string; global: boolean };

function FallbackLinkItem({ link }: { link: FallbackLink }) {
  const className = "text-sm text-inverse-subtle transition-colors hover:text-inverse";
  return (
    <li>
      {link.global
        ? <Link href={link.href} prefetch={false} className={className}>{link.label}</Link>
        : <LinkWithChannel href={link.href} prefetch={false} className={className}>{link.label}</LinkWithChannel>}
    </li>
  );
}

function FooterMenuChildLink({ child }: { child: MenuItem }) {
	const href = getMenuItemHref(child);
	const label = getMenuItemLabel(child);
	if (!href || !label) return null;

	if (child.category || child.collection || child.page) {
		return (
			<LinkWithChannel
				href={href}
				prefetch={false}
				className="text-sm text-inverse-subtle transition-colors hover:text-inverse"
			>
				{label}
			</LinkWithChannel>
		);
	}

	return (
		<NavHrefLink
			href={href}
			prefetch={false}
			className="text-sm text-inverse-subtle transition-colors hover:text-inverse"
		>
			{label}
		</NavHrefLink>
	);
}

export function FooterMenuColumns({ items }: { items: MenuItem[] }) {
	if (items.length === 0) {
		return (
			<>
				<div>
					<h4 className="mb-4 text-sm font-medium text-inverse">Support</h4>
					<ul className="space-y-3">
						{defaultFooterLinks.support.map((link) => <FallbackLinkItem key={link.href} link={link} />)}
					</ul>
				</div>
				<div>
					<h4 className="mb-4 text-sm font-medium text-inverse">Explore</h4>
					<ul className="space-y-3">
						{defaultFooterLinks.explore.map((link) => <FallbackLinkItem key={link.href} link={link} />)}
					</ul>
				</div>
			</>
		);
	}

	return (
		<>
			{items.map((item) => (
				<div key={item.id}>
					<h4 className="mb-4 text-sm font-medium text-inverse">{item.name}</h4>
					<ul className="space-y-3">
						{item.children?.map((child) => (
							<li key={child.id}>
								<FooterMenuChildLink child={child} />
							</li>
						))}
					</ul>
				</div>
			))}
		</>
	);
}
