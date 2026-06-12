// Epic Games Store — current & upcoming free games.
// Uses the same public promotions endpoint the Epic launcher/website consume.

const ENDPOINT =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions';

function imageOf(el, types = ['OfferImageWide', 'DieselStoreFrontWide', 'Thumbnail']) {
  const imgs = el.keyImages ?? [];
  for (const t of types) {
    const found = imgs.find((i) => i.type === t);
    if (found) return found.url;
  }
  return imgs[0]?.url ?? null;
}

function slugUrl(el) {
  // Epic's metadata shape changes often: productSlug is frequently null now and
  // urlSlug can be a meaningless hex hash. The reliable slug lives in the page
  // mappings (offerMappings / catalogNs.mappings), so those win.
  const mapping =
    el.offerMappings?.find((m) => m.pageType === 'productHome')?.pageSlug ??
    el.catalogNs?.mappings?.find((m) => m.pageType === 'productHome')?.pageSlug ??
    el.offerMappings?.[0]?.pageSlug ??
    el.catalogNs?.mappings?.[0]?.pageSlug;

  let slug = (mapping || el.productSlug || el.urlSlug || '').replace(/\/home$/, '').trim();
  // Discard junk slugs Epic sometimes returns ("[]", 32-char hex ids).
  if (!slug || slug === '[]' || /^[0-9a-f]{16,}$/i.test(slug)) {
    return 'https://store.epicgames.com/it/free-games';
  }
  return `https://store.epicgames.com/it/p/${slug}`;
}

function shape(el, window) {
  return {
    id: el.id,
    title: el.title,
    description: el.description,
    image: imageOf(el),
    url: slugUrl(el),
    start: window?.startDate ?? null,
    end: window?.endDate ?? null,
  };
}

export const epicService = {
  async fetchPromotions(locale = 'it-IT', country = 'IT') {
    const res = await fetch(`${ENDPOINT}?locale=${locale}&country=${country}&allowCountries=${country}`);
    if (!res.ok) throw new Error(`Epic error ${res.status}`);
    const data = await res.json();
    const elements = data?.data?.Catalog?.searchStore?.elements ?? [];

    const now = Date.now();
    const free = [];
    const upcoming = [];

    for (const el of elements) {
      const current = el.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
      const next = el.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers?.[0];
      const isFreeNow =
        current &&
        (el.price?.totalPrice?.discountPrice === 0 ||
          current.discountSetting?.discountPercentage === 0) &&
        new Date(current.startDate).getTime() <= now &&
        now <= new Date(current.endDate).getTime();

      if (isFreeNow) free.push(shape(el, current));
      else if (next) upcoming.push(shape(el, next));
    }
    return { free, upcoming };
  },
};
