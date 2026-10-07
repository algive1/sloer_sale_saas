export type WishlistRecord = {
	productId: string;
	variantId?: string;
	name: string;
	href: string;
	image?: string;
	price: number;
	currency: string;
	channel: string;
};
