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

  const JUNK_RE =
    /gasoline|gas engine|brake light|headlight|daytime running|\btires?\b|^wheels:|alloy wheels|painted aluminum|seat belt|airbag|am\/?fm|\bradio\b|power windows|power locks|automatic transmission|\bcvt\b|xtronic|dual clutch|\babs\b|antilock|\bfwd\b|\brwd\b|premium paint|paint package|wheellip|gvwr|payload|priced on the money|oil change|technician|meticulous|pride of ownership|vanity mirror|sun visor|kick plate|interior accent|cargo area lighting|tie-down|cargo area protector|cargo liner|floor liner|standard suspension|appearance package|monochromatic|illuminated vanity|premium cloth|embroidered|quick order package|equipment group \d|\blpo\b|\bpio\b|disc\)|while staying|you'?ll find|luxury meets|this ranger|religiously serviced|undercoated|satellite radio|bluetooth/i;

  const BUYER_RULES = [
    { re: /heated steering/i, score: 100, category: "heated_steer" },
    { re: /ventilat|cooled seats?/i, score: 100, category: "vent_seats" },
    { re: /heated (front |rear )?seats?|heated and ventilated/i, score: 100, category: "heated_seats" },
    { re: /sunroof|moonroof|panoramic/i, score: 95, category: "roof" },
    { re: /power liftgate|power tailgate|hands-?free liftgate/i, score: 95, category: "liftgate" },
    { re: /apple carplay|android auto/i, score: 92, category: "phone" },
    { re: /remote start/i, score: 92, category: "remote_start" },
    { re: /blind.?spot/i, score: 90, category: "blind_spot" },
    { re: /backup camera|rear(view)? camera|360|surround view|bird.?eye/i, score: 90, category: "camera" },
    { re: /leather/i, score: 90, category: "leather" },
    { re: /adaptive cruise|propilot|pilot assist/i, score: 90, category: "cruise" },
    { re: /navigation|nav system|nissanconnect/i, score: 88, category: "nav" },
    { re: /3rd row|third[ -]?row/i, score: 88, category: "third_row" },
    { re: /tow|trailer|hitch/i, score: 86, category: "tow" },
    { re: /power (front )?seats?/i, score: 85, category: "power_seats" },
    { re: /premium audio|bose|harman|jbl|infinity/i, score: 84, category: "audio" },
    { re: /keyless|push[ -]?button start|intelligent key|smart key/i, score: 84, category: "keyless" },
    { re: /dual-?zone|tri-?zone|climate control/i, score: 82, category: "climate" },
    { re: /forward collision|automatic emergency|collision (warning|braking)|rear cross/i, score: 82, category: "collision" },
    { re: /\b(awd|4wd|4x4)\b/i, score: 80, category: "drivetrain" },
    { re: /lane (departure|keep|centering)/i, score: 80, category: "lane" },
    { re: /head-?up display|\bhud\b/i, score: 80, category: "hud" },
    { re: /parking sensor|park assist/i, score: 78, category: "park" },
    { re: /captain'?s chairs/i, score: 76, category: "captains" },
    { re: /wireless (phone )?charg/i, score: 75, category: "wireless" },
    { re: /off-?road (package|pkg)|sasquatch|\bz71\b|\bfx4\b/i, score: 74, category: "offroad" },
    { re: /cold weather package|technology package|convenience package|luxury package|safety package|comfort package/i, score: 70, category: "pkg" },
  ];

  function isNarrative(s) {
    if (s.length > 70) return true;
    if (/\b(priced|purchased|serviced|technicians|condition|connected through|open-air feel)\b/i.test(s)) return true;
    if (/^[a-z]/.test(s) && s.split(" ").length > 8) return true;
    return false;
  }

  function scoreFeature(feat) {
    if (!feat || feat.length > 100) return null;
    if (HYPE_RE.test(feat) || JUNK_RE.test(feat) || isNarrative(feat)) return null;
    let best = 0;
    let category = "";
    for (const rule of BUYER_RULES) {
      if (rule.re.test(feat) && rule.score > best) {
        best = rule.score;
        category = rule.category;
      }
    }
    if (!best) return null;
    return { label: feat, score: best, category };
  }

  function preferLabel(a, b) {
    if (b.length !== a.length) return b.length > a.length ? b : a;
    const caps = (s) => (s.match(/[A-Z]/g) || []).length;
    return caps(b) > caps(a) ? b : a;
  }

  function verifiedSellingDrivetrain(pack) {
    const drive = text(pack.drivetrain);
    if (/\b(awd|4wd|4x4)\b/i.test(drive)) return drive;
    return "";
  }

  function keyEquipment(pack) {
    const candidates = [
      ...asFeatureList(pack.features),
      ...asFeatureList(pack.equipment),
      ...featuresFromBody(pack.body),
    ];
    const drive = verifiedSellingDrivetrain(pack);
    if (drive) candidates.push(drive);

    const byCategory = new Map();
    let hasCarplay = false;
    let hasAndroid = false;

    for (const raw of candidates) {
      const clean = text(raw);
      const scored = scoreFeature(clean);
      if (!scored) continue;
      if (/apple carplay/i.test(clean)) hasCarplay = true;
      if (/android auto/i.test(clean)) hasAndroid = true;
      const prev = byCategory.get(scored.category);
      if (!prev || scored.score > prev.score) {
        byCategory.set(scored.category, scored);
      } else if (scored.score === prev.score) {
        prev.label = preferLabel(prev.label, scored.label);
      }
    }

    if (hasCarplay && hasAndroid && byCategory.has("phone")) {
      byCategory.get("phone").label = "Apple CarPlay / Android Auto";
    }

    return [...byCategory.values()]
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 4)
      .map((x) => displayLabel(x.label));
  }

  function displayLabel(s) {
    if (/[A-Z]/.test(s)) return s;
    return s.replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
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
