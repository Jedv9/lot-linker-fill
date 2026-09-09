/**
 * Lot Linker Fill — Facebook Marketplace create-vehicle navigation.
 * Fill may only open /marketplace/create/vehicle. Never facebook.com home.
 * Works in the extension (popup / background / content) and in Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerFbNav = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const CREATE_VEHICLE_PATH = "/marketplace/create/vehicle";
  const CREATE_VEHICLE_URL = "https://www.facebook.com/marketplace/create/vehicle";
  const FACEBOOK_HOST_RE = /(^|\.)(facebook\.com|fb\.com|facebookwkhpilnemxj7asaniu7vnjjbiltxjqhye3mhbshg7kx5tfyd\.onion)$/i;

  function parseUrl(raw) {
    try {
      return new URL(String(raw || ""), "https://www.facebook.com");
    } catch {
      return null;
    }
  }

  function facebookHost(hostname) {
    return FACEBOOK_HOST_RE.test(String(hostname || ""));
  }

  function isFacebookUrl(raw) {
    const u = parseUrl(raw);
    return Boolean(u && facebookHost(u.hostname));
  }

  function normalizedPath(raw) {
    const u = parseUrl(raw);
    if (!u) return "";
    return String(u.pathname || "/").replace(/\/+$/, "") || "/";
  }

  function isFacebookHomeUrl(raw) {
    if (!isFacebookUrl(raw)) return false;
    const path = normalizedPath(raw);
    if (path === "/" || path === "") return true;
    if (/^\/home\.php$/i.test(path)) return true;
    if (/^\/index\.php$/i.test(path)) return true;
    if (/^\/watch$/i.test(path)) return true;
    if (/^\/reel(s)?$/i.test(path)) return true;
    if (/^\/stories$/i.test(path)) return true;
    if (/^\/notifications\/?$/i.test(path)) return true;
    return false;
  }

  function isMarketplaceBrowseUrl(raw) {
    if (!isFacebookUrl(raw)) return false;
    const path = normalizedPath(raw);
    if (/^\/marketplace$/i.test(path)) return true;
    if (/^\/marketplace\/category(\/|$)/i.test(path)) return true;
    if (/^\/marketplace\/search/i.test(path)) return true;
    if (/^\/marketplace\/you\b/i.test(path)) return true;
    return false;
  }

  function isCreateVehicleListingUrl(raw) {
    if (!isFacebookUrl(raw)) return false;
    const path = normalizedPath(raw);
    if (/\/marketplace\/create\/vehicle(\/|$)/i.test(`${path}/`)) return true;
    const u = parseUrl(raw);
    const q = String(u.search || "");
    if (/\/marketplace\/create$/i.test(path) && /(?:[?&](?:category|type|listing_type)=vehicle\b)/i.test(q)) {
      return true;
    }
    return false;
  }

  function createVehicleListingUrl() {
    return CREATE_VEHICLE_URL;
  }

  function isForbiddenNavigationUrl(raw) {
    if (!raw) return true;
    if (isFacebookHomeUrl(raw)) return true;
    if (isMarketplaceBrowseUrl(raw)) return true;
    const path = normalizedPath(raw);
    if (path === "/" || path === "") return true;
    return false;
  }

  function isSafeFillDestination(raw) {
    return isCreateVehicleListingUrl(raw) && !isFacebookHomeUrl(raw) && !isForbiddenNavigationUrl(raw);
  }

  function needsCreateVehicleNavigation(raw) {
    return !isCreateVehicleListingUrl(raw);
  }

  function navigationTarget(raw) {
    if (isCreateVehicleListingUrl(raw)) {
      return { action: "stay", url: String(raw || CREATE_VEHICLE_URL) };
    }
    return { action: "navigate", url: CREATE_VEHICLE_URL };
  }

  function assertSafeDestination(raw) {
    if (!isSafeFillDestination(raw)) {
      throw new Error("Refusing to navigate away from Marketplace create vehicle listing");
    }
    return raw;
  }

  function hrefLooksLikeHome(href, base) {
    const raw = String(href || "").trim();
    if (!raw || raw === "#" || /^javascript:/i.test(raw)) return false;
    if (raw === "/" || raw === "https://www.facebook.com/" || raw === "https://facebook.com/") return true;
    try {
      const u = new URL(raw, base || "https://www.facebook.com");
      return isFacebookHomeUrl(u.href) || u.pathname === "/" || u.pathname === "";
    } catch {
      return raw === "/";
    }
  }

  return {
    CREATE_VEHICLE_PATH,
    CREATE_VEHICLE_URL,
    parseUrl,
    isFacebookUrl,
    isFacebookHomeUrl,
    isMarketplaceBrowseUrl,
    isCreateVehicleListingUrl,
    createVehicleListingUrl,
    isForbiddenNavigationUrl,
    isSafeFillDestination,
    needsCreateVehicleNavigation,
    navigationTarget,
    assertSafeDestination,
    hrefLooksLikeHome,
  };
});
