/**
 * Version 1 of the persisted homepage composition.
 * Puck owns ordering and editing, while Saleor continues to own all commerce data.
 */
export type ThemeBlock = {
  type: "Hero" | "Collection" | "Editorial" | "Story" | "Product" | "Faq";
  props: { id: string; [key: string]: string | number };
};
export type ThemeData = {
  content: ThemeBlock[];
  root: { props: Record<string, never> };
};
export const THEME_SCHEMA_VERSION = 1;
export const FASHION_TEMPLATE: ThemeData = {
  root: { props: {} },
  content: [
    {
      type: "Hero",
      props: {
        id: "fashion-hero",
        eyebrow: "A NEW PERSPECTIVE",
        heading: "The art of effortless style.",
        subheading: "Timeless silhouettes. Thoughtful details. Made to move with you.",
        ctaLabel: "Explore the collection",
        ctaHref: "/products",
        imageUrl: "",
        collectionSlug: "featured-products",
      },
    },
    {
      type: "Collection",
      props: {
        id: "fashion-collection",
        eyebrow: "CURATED FOR YOU",
        heading: "New season essentials",
        intro: "Discover the pieces you will return to again and again.",
        collectionSlug: "featured-products",
        limit: 8,
      },
    },
    {
      type: "Editorial",
      props: {
        id: "fashion-editorial",
        eyebrow: "THE EDIT",
        heading: "Better pieces. Fewer decisions.",
        body: "Everyday comfort, considered proportions and enduring design.",
        imageUrl: "",
        imagePosition: "right",
        ctaLabel: "Shop all styles",
        ctaHref: "/products",
      },
    },
    {
      type: "Story",
      props: {
        id: "fashion-story",
        eyebrow: "OUR PHILOSOPHY",
        heading: "Designed to be worn, not just seen.",
        body: "Good style is personal. Start with what feels like you.",
        tone: "inverse",
        align: "center",
      },
    },
  ],
};

export const BLANK_TEMPLATE: ThemeData = { root: { props: {} }, content: [] };

export function freshTemplate(template: "fashion" | "blank"): ThemeData {
  return structuredClone(template === "fashion" ? FASHION_TEMPLATE : BLANK_TEMPLATE);
}

/** Curated starter layouts; all are editable with the existing Puck block list. */
export const JEWELRY_TEMPLATE: ThemeData = {
 root:{props:{}},
 content:[
  {type:"Hero",props:{id:"jewelry-hero",eyebrow:"MADE TO TREASURE",heading:"Small details. Lasting meaning.",
   subheading:"Considered pieces for everyday moments and special occasions.",imageUrl:"",
   collectionSlug:"featured-products",ctaLabel:"Explore jewelry",ctaHref:"/products"}},
  {type:"Product",props:{id:"jewelry-spotlight",heading:"A closer look",productSlug:""}},
  {type:"Collection",props:{id:"jewelry-picks",eyebrow:"THE COLLECTION",heading:"Find something beautiful",
   intro:"Thoughtfully selected pieces.",collectionSlug:"featured-products",limit:4}},
  {type:"Story",props:{id:"jewelry-story",eyebrow:"OUR PHILOSOPHY",
   heading:"Care in every detail",body:"Explore our approach to materials, craft and everyday wear.",
   tone:"muted",align:"center"}},
  {type:"Faq",props:{id:"jewelry-faq",heading:"Common questions",
   question1:"Where can I find sizing details?",answer1:"See each product page for available sizes and specifications.",
   question2:"How do I care for my jewelry?",answer2:"Please refer to the care instructions on the product page.",
   question3:"Where can I find shipping information?",answer3:"Please review our shipping policy before placing an order."}},
 ]
};
export const MINIMAL_TEMPLATE:ThemeData = {
 root:{props:{}},
 content:[
  {type:"Hero",props:{id:"minimal-hero",eyebrow:"THE EDIT",heading:"Discover what feels like you.",
   subheading:"Carefully selected essentials, all in one place.",imageUrl:"",
   collectionSlug:"featured-products",ctaLabel:"Shop the collection",ctaHref:"/products"}},
  {type:"Collection",props:{id:"minimal-products",eyebrow:"DISCOVER",heading:"Our favourites",intro:"",
   collectionSlug:"featured-products",limit:8}},
  {type:"Editorial",props:{id:"minimal-editorial",eyebrow:"OUR STORY",
    heading:"Thoughtful choices for everyday life.",body:"Get to know the details behind our collection.",
    imageUrl:"",imagePosition:"right",ctaLabel:"Browse products",ctaHref:"/products"}},
 ]
};
export function freshStarterTemplate(name:"fashion"|"jewelry"|"minimal"|"blank"|"product"):ThemeData {
 switch(name){
  case "jewelry":return structuredClone(JEWELRY_TEMPLATE);
  case "minimal":return structuredClone(MINIMAL_TEMPLATE);
  case "product":return structuredClone(PRODUCT_TEMPLATE_SEED);
  default:return freshTemplate(name);
 }
}
/** Resolved by the editor for product type; copied here to avoid a runtime circular import. */
const PRODUCT_TEMPLATE_SEED:ThemeData={root:{props:{}},content:[
  {type:"Story",props:{id:"product-story",eyebrow:"THE DETAILS",heading:"Designed with care.",
    body:"Explore the details and materials that make this piece special.",tone:"default",align:"center"}},
  {type:"Collection",props:{id:"product-picks",eyebrow:"DISCOVER MORE",heading:"You may also like",
    intro:"Explore the collection.",collectionSlug:"featured-products",limit:4}},
  {type:"Faq",props:{id:"product-faq",heading:"Product questions",
    question1:"Where can I find product specifications?",answer1:"Please see the product description and variant options above.",
    question2:"Is this item available?",answer2:"Current availability is shown in the product purchase area.",
    question3:"Where can I see delivery options?",answer3:"Please review our shipping policy for details."}},
]};
