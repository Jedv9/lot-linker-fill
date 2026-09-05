/**
 * Lot Linker Fill — generate Marketplace title + description from pack fields.
 * Works in the extension (popup / content script) and in Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.LotLinkerListing = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const CITY = "Oconomowoc";
  const CITY_TITLE = "Oconomowoc WI";
  const HYPE_RE =
    /apr|\b0\s?%|cash ?back|down payment|limited time|act now|call (now|jed)|ask for|financ(e|ing) as|no credit|\bhype\b|price does not/i;
  const PLACEHOLDER_RE = /^(\[need\]|n\/?a|unknown|tbd|none|-)$/i;

  function text(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function isReal(v) {
    const s = text(v);
    return Boolean(s) && !PLACEHOLDER_RE.test(s);
  }

  function formatPrice(price) {
    const n = Number(String(price ?? "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return "0";
    return Math.round(n).toLocaleString("en-US");
  }

  function formatMileage(pack) {
    const cond = text(pack.condition).toUpperCase();
    if (cond === "NEW") return "NEW";
    const raw = pack.odometerMiles != null && pack.odometerMiles !== "" ? pack.odometerMiles : pack.mileage;
    const n = Number(String(raw ?? "").replace(/[^\d]/g, ""));
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString("en-US");
  }

  function vehicleType(pack) {
    const body = text(pack.bodyStyle).toLowerCase();
    const model = text(pack.model).toLowerCase();
    const hay = `${body} ${model}`;

    if (
      /pickup|truck|frontier|f-150|f-250|f-350|ranger|tacoma|tundra|colorado|canyon|sierra|silverado|titan|santa cruz|\b1500\b|\b2500\b|\b3500\b/.test(
        hay
      ) ||
      /crew cab|supercrew|quad cab|access cab|super cab|king cab|double cab|regular cab/.test(body)
    ) {
      return "truck";
    }
    if (/hatch/.test(body) || /\bsoul\b/.test(model)) return "hatchback";
    if (/van|minivan|pacifica|odyssey|sienna|carnival|town & country/.test(hay)) return "van";
    if (/coupe/.test(body)) return "coupe";
    if (/sedan/.test(body)) return "sedan";
    if (/suv|sport utility|crossover/.test(body)) return "SUV";
    if (/wagon/.test(body)) return "hatchback";
    return "SUV";
  }

  function shortBody(bodyStyle) {
    const t = text(bodyStyle).toLowerCase();
    if (/sedan/.test(t)) return "Sedan";
    if (/suv|sport utility|crossover/.test(t)) return "SUV";
    if (/hatch/.test(t)) return "Hatchback";
    if (/van/.test(t)) return "Van";
    if (/coupe/.test(t)) return "Coupe";
    if (/crew|cab|supercrew|pickup|truck/.test(t)) return "Truck";
    const cleaned = text(bodyStyle).replace(/\s+\dD$/i, "");
    return cleaned || "";
  }

  function keySpec(pack) {
    if (isReal(pack.engine)) return text(pack.engine);
    if (isReal(pack.drivetrain)) return text(pack.drivetrain);
    return shortBody(pack.bodyStyle);
  }

  function storeName(pack) {
    const rooftop = text(pack.rooftop);
    const make = text(pack.make);
    if (/hyundai/i.test(rooftop)) return "Boucher Lake Country Hyundai";
    if (/nissan/i.test(rooftop)) return "Boucher Lake Country Nissan";
    if (/hyundai/i.test(make)) return "Boucher Lake Country Hyundai";
    if (/nissan/i.test(make)) return "Boucher Lake Country Nissan";
    return "Boucher Lake Country Nissan";
  }

  function shortModel(model) {
    return text(model)
      .replace(/\s+plug-?in\s+hybrid$/i, "")
      .replace(/\s+hybrid$/i, "")
      .replace(/\s+electric$/i, "")
      .trim();
  }

  function asFeatureList(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => asFeatureList(item));
    }
    const s = String(value).trim();
    if (!s) return [];
    if (/[·•]/.test(s)) return s.split(/[·•]/).map((x) => text(x)).filter(Boolean);
    if (s.includes(",")) return s.split(",").map((x) => text(x)).filter(Boolean);
    return [text(s)].filter(Boolean);
  }

  function featuresFromBody(body) {
    const raw = String(body || "");
    if (!raw) return [];
    const out = [];
    const stand = raw.match(/Standouts:\s*([\s\S]*?)(?:\.\s*Also:|\.\s*Price does|\.\s*Call\b|$)/i);
    if (stand) out.push(...stand[1].split(/[·•]/).map((x) => text(x.replace(/\.+$/, ""))).filter(Boolean));
    const also = raw.match(/Also:\s*([\s\S]*?)(?:\.\s*Price does|\.\s*Call\b|$)/i);
    if (also) out.push(...also[1].split(",").map((x) => text(x.replace(/\.+$/, ""))).filter(Boolean));
    return out;
  }

  function verifiedFieldFeatures(pack) {
    const out = [];
    if (isReal(pack.drivetrain)) out.push(text(pack.drivetrain));
    if (isReal(pack.transmission)) out.push(text(pack.transmission));
    const fuel = text(pack.fuel);
    if (isReal(fuel) && /hybrid|diesel|electric|plugin|plug-?in/.test(fuel)) out.push(fuel);
    const body = shortBody(pack.bodyStyle);
    if (body) out.push(body);
    return out;
  }

  function keyEquipment(pack) {
    const seen = new Set();
    const out = [];
    const candidates = [
      ...asFeatureList(pack.features),
      ...asFeatureList(pack.equipment),
      ...featuresFromBody(pack.body),
    ];
    if (!candidates.length) candidates.push(...verifiedFieldFeatures(pack));

    for (const feat of candidates) {
      const clean = text(feat);
      if (!clean || clean.length > 100) continue;
      if (HYPE_RE.test(clean)) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      if (out.length === 4) break;
    }
    return out;
  }

  function buildTitle(pack) {
    const name = [pack.year, pack.make, pack.model, pack.trim].map(text).filter(Boolean).join(" ");
    const spec = keySpec(pack);
    const price = formatPrice(pack.price);
    const parts = [name];
    if (spec) parts.push(spec);
    parts.push(`$${price}`);
    parts.push(CITY_TITLE);
    return parts.join(" | ");
  }

  function buildDescription(pack) {
    const type = vehicleType(pack);
    const price = formatPrice(pack.price);
    const ymm = [pack.year, pack.make, pack.model].map(text).filter(Boolean).join(" ");
    const store = storeName(pack);
    const miles = formatMileage(pack);
    const stock = text(pack.stock);
    const features = keyEquipment(pack);
    const modelMsg = shortModel(pack.model);
    const featureLines = features.map((f) => `• ${f}`).join("\n");
    const equipmentBlock = features.length ? `Key equipment:\n${featureLines}` : "Key equipment:";

    return [
      `Wisconsin shoppers looking for a ${type} under $${price}:`,
      "",
      `${ymm} is available at ${store} in ${CITY}, Wisconsin.`,
      "",
      `Price: $${price}`,
      `Mileage: ${miles}`,
      `Stock #: ${stock}`,
      "",
      equipmentBlock,
      "",
      `Message "${modelMsg}" to confirm availability, receive the vehicle history report, and schedule a test drive.`,
      "",
      "Trade-ins welcome. Financing available for qualified buyers.",
      "",
      "Advertised price excludes applicable taxes, title, registration, dealer fees, and other charges. Equipment, pricing, and availability subject to verification. See dealer for complete details.",
    ].join("\n");
  }

  function fromPack(pack) {
    const p = pack || {};
    return {
      title: buildTitle(p),
      body: buildDescription(p),
    };
  }

  return {
    CITY,
    CITY_TITLE,
    buildTitle,
    buildDescription,
    fromPack,
    vehicleType,
    storeName,
    shortModel,
    keySpec,
    keyEquipment,
    formatPrice,
    formatMileage,
  };
});
