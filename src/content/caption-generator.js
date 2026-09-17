import { loadContentConfig } from './prompt-generator.js';

/**
 * Theme-based caption templates for THIMMA KANNAN SHOP.
 * Each theme provides multiple natural hook and call-to-action variations
 * ensuring non-repetitive, high-quality promotional posts.
 */
const THEME_CAPTION_TEMPLATES = {
  'storefront promotion': [
    {
      hook: 'A warm welcome awaits you at {brand}.',
      body: 'Your everyday shopping destination where quality meets convenience. Step inside and experience a comfortable, hassle-free shopping environment designed for you.',
      cta: 'Visit {brand} today and make your daily shopping simple and satisfying.',
    },
    {
      hook: 'Welcome to {brand} — your neighborhood retail stop.',
      body: 'From well-organized aisles to a friendly shopping atmosphere, we take pride in serving you with care and reliability every single day.',
      cta: 'Drop by {brand} and enjoy a smooth shopping experience.',
    },
    {
      hook: 'Every great day starts with an easy shopping trip at {brand}.',
      body: 'Clean displays, great variety, and a welcoming ambiance make every visit pleasant for you and your family.',
      cta: 'We look forward to welcoming you at {brand}.',
    },
  ],

  'product showcase': [
    {
      hook: 'Quality you can trust, variety you will love at {brand}.',
      body: 'Explore our carefully curated selections across organized shelves, bringing dependable essentials and fresh choices right within your reach.',
      cta: 'Visit {brand} to discover quality products tailored for your daily needs.',
    },
    {
      hook: 'Discover great essentials at {brand}.',
      body: 'We keep our shelves stocked with care so you always find what you are looking for in a clean, organized setting.',
      cta: 'Stop by {brand} and pick up your favorites today.',
    },
    {
      hook: 'Thoughtfully selected, neatly displayed — only at {brand}.',
      body: 'Whether you are restocking your pantry or picking up household favorites, enjoy quality and variety all in one place.',
      cta: 'Experience convenient shopping at {brand}.',
    },
  ],

  'new arrivals': [
    {
      hook: 'Fresh additions are waiting for you at {brand}!',
      body: 'We regularly update our collection to bring you the latest variety and quality products for your home and lifestyle.',
      cta: 'Come check out the new arrivals at {brand} this week.',
    },
    {
      hook: 'Something new to explore at {brand}.',
      body: 'Discover our updated selections on the shelves. We are always adding quality options to make your shopping more rewarding.',
      cta: 'Visit {brand} today to explore what is new in store.',
    },
  ],

  'shopping experience': [
    {
      hook: 'Shopping made comfortable, pleasant, and easy at {brand}.',
      body: 'With clean and spacious aisles, clearly organized shelves, and friendly service, we make sure every visit is time well spent.',
      cta: 'Enjoy a delightful shopping trip at {brand}.',
    },
    {
      hook: 'Your satisfaction is at the heart of everything we do at {brand}.',
      body: 'Enjoy a relaxed shopping atmosphere where finding what you need is always smooth and effortless.',
      cta: 'Experience friendly neighborhood shopping at {brand}.',
    },
  ],

  'festival promotion': [
    {
      hook: 'Make every celebration brighter with {brand}.',
      body: 'Festivals bring warmth, joy, and togetherness. Get ready for your festive moments with a delightful shopping trip.',
      cta: 'Celebrate the season with joyful shopping at {brand}.',
    },
    {
      hook: 'Festive times call for thoughtful preparation at {brand}.',
      body: 'Step into our festive shopping atmosphere and find everything you need to celebrate with your loved ones.',
      cta: 'Visit {brand} and make your festive preparations effortless.',
    },
  ],

  'seasonal promotion': [
    {
      hook: 'Step into the new season with {brand}.',
      body: 'Fresh seasonal selections and everyday essentials are ready for you in our welcoming store environment.',
      cta: 'Stop by {brand} to refresh your daily essentials.',
    },
  ],

  'special offer': [
    {
      hook: 'Great value meets everyday quality at {brand}.',
      body: 'Explore selected collections and enjoy a shopping experience designed to give you reliability and comfort every time.',
      cta: 'Visit {brand} and discover value with a smile.',
    },
  ],

  'brand awareness': [
    {
      hook: 'Proudly serving our community: {brand}.',
      body: 'Built on trust, quality, and a commitment to customer care, we are here to provide an enjoyable shopping destination every day.',
      cta: 'Thank you for making {brand} a part of your everyday life.',
    },
    {
      hook: 'Quality, trust, and service — that is the promise of {brand}.',
      body: 'From organized shelves to a welcoming smile, we strive to make every shopping experience meaningful and convenient.',
      cta: 'Visit {brand} and feel right at home.',
    },
  ],

  'customer experience': [
    {
      hook: 'A warm smile and a helping hand at {brand}.',
      body: 'We believe good shopping is not just about products; it is about how welcomed and valued you feel each time you walk in.',
      cta: 'Experience friendly, caring service at {brand}.',
    },
  ],

  'general store promotion': [
    {
      hook: 'Your trusted neighborhood shopping stop: {brand}.',
      body: 'Everything you need for everyday convenience, neatly arranged and backed by warm, hospitable service.',
      cta: 'Visit {brand} today for a pleasant, stress-free shopping experience.',
    },
  ],
};

/**
 * Selects a variation index deterministically based on seed or random.
 * @param {number} totalOptions
 * @param {string} [seed]
 * @returns {number}
 */
function pickVariationIndex(totalOptions, seed) {
  if (!seed) {
    return Math.floor(Math.random() * totalOptions);
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % totalOptions;
}

/**
 * Generates an Instagram-ready promotional caption for THIMMA KANNAN SHOP.
 * @param {Object} params
 * @param {string} [params.brand] Brand name
 * @param {string} [params.theme='general store promotion'] Content theme
 * @param {string} [params.contentContext] Additional image / prompt context
 * @param {Object} [params.config] Full content configuration
 * @param {string} [params.seed] Optional seed for reproducible variation testing
 * @returns {string} Plain text caption ready for Meta Instagram API
 */
export function generateCaption(params = {}) {
  const contentConfig = params.config || loadContentConfig();
  const brand = params.brand || contentConfig.brand?.name || 'THIMMA KANNAN SHOP';
  const theme = (params.theme || 'general store promotion').toLowerCase();

  const templates = THEME_CAPTION_TEMPLATES[theme] || THEME_CAPTION_TEMPLATES['general store promotion'];
  const templateIndex = pickVariationIndex(templates.length, params.seed || params.contentContext);
  const selected = templates[templateIndex];

  // Substitute brand name
  const hook = selected.hook.replace(/\{brand\}/g, brand);
  const body = selected.body.replace(/\{brand\}/g, brand);
  const cta = selected.cta.replace(/\{brand\}/g, brand);

  // Retrieve hashtags for the theme
  const allHashtags = contentConfig.hashtags || {};
  const themeTags = allHashtags[theme] || allHashtags.default || [
    '#ThimmaKannanShop',
    '#Shopping',
    '#Retail',
    '#LocalBusiness',
  ];

  // Select 3-5 tags
  const selectedTags = Array.from(new Set(themeTags)).slice(0, 5).join(' ');

  // Assemble caption
  const captionParts = [
    hook,
    '',
    body,
    '',
    cta,
    '',
    selectedTags,
  ];

  let fullCaption = captionParts.join('\n').trim();

  // Enforce Instagram character limit constraints
  const maxLimit = contentConfig.caption?.maxCharacters || 2200;
  if (fullCaption.length > maxLimit) {
    fullCaption = fullCaption.slice(0, maxLimit - 20) + '... ' + selectedTags;
  }

  return fullCaption;
}
