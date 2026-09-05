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
    /gasoline|gas engine|brake light|headlight|daytime running|\btires?\b|^wheels:|alloy wheels|painted aluminum|seat belt|airbag|am\/?fm|\bradio\b|power windows|power locks|automatic transmission|\bcvt\b|xtronic|dual clutch|\babs\b|antilock|\bfwd\b|\brwd\b|torsen|limited-?slip|fox shocks|axle ratio|premium paint|paint package|wheellip|gvwr|payload|priced on the money|oil change|technician|meticulous|pride of ownership|vanity mirror|sun visor|kick plate|interior accent|cargo area lighting|tie-down|cargo area protector|cargo liner|floor liner|standard suspension|appearance package|monochromatic|illuminated vanity|premium cloth|embroidered|quick order package|equipment group \d|\blpo\b|\bpio\b|disc\)|while staying|you'?ll find|luxury meets|this ranger|religiously serviced|undercoated|satellite radio|bluetooth/i;

  const CAMERA_RANK = [
    { re: /360|surround view|surround-view|bird.?eye/i, rank: 1 },
    { re: /backup camera|rear ?view camera|rearview camera/i, rank: 2 },
    { re: /blind.?spot/i, rank: 3 },
    { re: /parking sensor|parking sensors|park assist/i, rank: 4 },
  ];

  function displayLabel(s) {
    if (/[A-Z]/.test(s)) return s;
    return s.replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
  }

  function preferLabel(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (b.length !== a.length) return b.length > a.length ? b : a;
    const caps = (s) => (s.match(/[A-Z]/g) || []).length;
    return caps(b) > caps(a) ? b : a;
  }

  function verifiedSellingDrivetrain(pack) {
    const drive = text(pack.drivetrain);
    if (/\b4wd\b|\b4x4\b/i.test(drive)) return drive;
    if (/\bawd\b/i.test(drive)) return drive;
    return "";
  }

  function collectCandidates(pack) {
    const out = [
      ...asFeatureList(pack.features),
      ...asFeatureList(pack.equipment),
      ...featuresFromBody(pack.body),
    ];
    const drive = verifiedSellingDrivetrain(pack);
    if (drive) out.push(drive);
    return out.map(text).filter((s) => s && s.length <= 100 && !HYPE_RE.test(s) && !JUNK_RE.test(s));
  }

  function pickFirst(cands, tester, prefer) {
    const hits = cands.filter(tester);
    if (!hits.length) return "";
    if (prefer) {
      const preferred = hits.find(prefer);
      if (preferred) return displayLabel(preferred);
    }
    return displayLabel(hits.reduce(preferLabel));
  }

  function pickCamera(cands) {
    let best = null;
    let bestRank = 99;
    for (const feat of cands) {
      for (const rule of CAMERA_RANK) {
        if (rule.re.test(feat) && rule.rank < bestRank) {
          best = feat;
          bestRank = rule.rank;
        }
      }
    }
    return best ? displayLabel(best) : "";
  }

  function pickPhone(cands) {
    const carplay = cands.find((s) => /apple carplay/i.test(s));
    const android = cands.find((s) => /android auto/i.test(s));
    if (carplay && android) return "Apple CarPlay / Android Auto";
    if (carplay) return displayLabel(carplay);
    if (android) return displayLabel(android);
    return "";
  }

  function pickDrive(cands, pack) {
    const fromPack = verifiedSellingDrivetrain(pack);
    if (fromPack) return fromPack;
    const hit = cands.find((s) => /\b(awd|4wd|4x4)\b/i.test(s) && !/\bfwd\b/i.test(s));
    return hit ? displayLabel(hit) : "";
  }

  function keyEquipment(pack) {
    const cands = collectCandidates(pack || {});
    const slots = [
      pickFirst(
        cands,
        (s) => /heated (front |rear )?seats?|heated and ventilated|ventilated and heated/i.test(s),
        (s) => /ventilat/i.test(s) || /heated front/i.test(s)
      ),
      pickPhone(cands),
      pickCamera(cands),
      pickFirst(cands, (s) => /power (front )?seats?/i.test(s)),
      pickDrive(cands, pack || {}),
    ].filter(Boolean);

    const used = new Set(slots.map((s) => s.toLowerCase()));
    const fillers = [
      pickFirst(cands, (s) => /leather/i.test(s)),
      pickFirst(cands, (s) => /premium audio|\bbose\b|\bsony\b/i.test(s)),
      pickFirst(cands, (s) => /moonroof|sunroof|panoramic/i.test(s)),
      pickFirst(
        cands,
        (s) => /adaptive cruise|propilot|lane keep|lane keeping|lane centering/i.test(s),
        (s) => /adaptive cruise|propilot/i.test(s)
      ),
      pickFirst(cands, (s) => /remote start/i.test(s)),
      pickFirst(cands, (s) => /power liftgate|hands-?free liftgate|power tailgate/i.test(s)),
    ];
    for (const fill of fillers) {
      if (slots.length >= 5) break;
      if (!fill) continue;
      if (used.has(fill.toLowerCase())) continue;
      used.add(fill.toLowerCase());
      slots.push(fill);
    }
    return slots.slice(0, 5);
  }

  function needsResearch(pack) {
    return keyEquipment(pack).length < 5 && Boolean(pack && (pack.vdpUrl || pack.vin));
  }

  const RESEARCH_PHRASES = [
    /heated and ventilated (front )?seats?/gi,
    /ventilated and heated (front )?seats?/gi,
    /heated front seats?/gi,
    /heated seats?/gi,
    /apple carplay/gi,
    /android auto/gi,
    /360(?:°| degree)? camera/gi,
    /surround view(?: camera)?/gi,
    /backup camera/gi,
    /rear ?view camera/gi,
    /blind[- ]spot(?: monitor| warning)?/gi,
    /parking sensors?(?: \/ assist)?/gi,
    /park assist/gi,
    /power (?:front )?seats?/gi,
    /\bAWD\b/g,
    /\b4WD\b/g,
    /\b4x4\b/g,
    /leatherette seats?/gi,
    /leather seats?/gi,
    /premium audio(?: system)?/gi,
    /\bBose\b(?: premium audio)?/gi,
    /\bSony\b(?: audio| sound)?/gi,
    /moonroof(?: \/ panoramic roof)?/gi,
    /sunroof/gi,
    /panoramic (?:sunroof|moonroof|roof)/gi,
    /adaptive cruise(?: control)?/gi,
    /lane keep(?:ing)?(?: assist)?/gi,
    /remote start/gi,
    /hands-?free (?:power )?liftgate/gi,
    /power liftgate/gi,
  ];

  function decodeEntities(s) {
    return String(s)
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  }

  function extractFeaturesFromHtml(html) {
    const raw = decodeEntities(String(html || ""));
    if (/attention required|cloudflare|you have been blocked/i.test(raw) && raw.length < 20000) {
      return [];
    }
    const found = [];
    const seen = new Set();
    const add = (s) => {
      const clean = text(s);
      if (!clean || clean.length > 80) return;
      if (HYPE_RE.test(clean) || JUNK_RE.test(clean)) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      found.push(clean);
    };

    const jsonRe = /"(features|options|equipment|standard_equipment|optional_equipment)"\s*:\s*\[(.*?)\]/gis;
    let jm;
    while ((jm = jsonRe.exec(raw))) {
      const part = jm[2];
      for (const m of part.matchAll(/"([^"]{3,80})"/g)) add(m[1]);
    }

    const listRe = /<(?:li|span|div|p)[^>]*>\s*([^<]{3,80})\s*<\/(?:li|span|div|p)>/gi;
    let lm;
    while ((lm = listRe.exec(raw))) add(lm[1]);

    const stripped = raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    for (const re of RESEARCH_PHRASES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(stripped))) add(m[0]);
    }
    return found;
  }

  function driveFromNhtsa(payload) {
    const row = payload?.Results?.[0] || payload || {};
    const drive = text(row.DriveType || row.driveType || "");
    if (/\bawd\b|all-?wheel/i.test(drive)) return "AWD";
    if (/\b4wd\b|\b4x4\b|4-?wheel/i.test(drive)) return "4WD";
    return "";
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), ms);
      Promise.resolve(promise)
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch(() => {
          clearTimeout(t);
          resolve(null);
        });
    });
  }

  async function researchPack(pack, { timeoutMs = 10000, fetchFn } = {}) {
    const p = pack || {};
    if (keyEquipment(p).length >= 5) return p;
    const doFetch = fetchFn || (typeof fetch === "function" ? fetch : null);
    if (!doFetch) return p;

    const work = (async () => {
      const extra = [];
      if (p.vdpUrl) {
        try {
          const res = await doFetch(p.vdpUrl, { credentials: "omit" });
          if (res && res.ok) extra.push(...extractFeaturesFromHtml(await res.text()));
        } catch {
          /* fall through */
        }
      }
      if (p.vin) {
        try {
          const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(p.vin)}?format=json`;
          const res = await doFetch(url);
          if (res && res.ok) {
            const drive = driveFromNhtsa(await res.json());
            if (drive) extra.push(drive);
          }
        } catch {
          /* fall through */
        }
      }
      return extra;
    })();

    const extra = (await withTimeout(work, timeoutMs)) || [];
    if (!extra.length) return p;
    const features = [...asFeatureList(p.features), ...extra];
    return { ...p, features };
  }

  async function fromPackAsync(pack, opts) {
    const researched = await researchPack(pack, opts);
    return fromPack(researched);
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
    fromPackAsync,
    researchPack,
    needsResearch,
    extractFeaturesFromHtml,
    driveFromNhtsa,
    vehicleType,
    storeName,
    shortModel,
    keySpec,
    keyEquipment,
    formatPrice,
    formatMileage,
  };
});
