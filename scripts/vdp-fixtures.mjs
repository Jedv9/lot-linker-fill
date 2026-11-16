import { readFileSync } from "node:fs";

export const GROUND_TRUTH = JSON.parse(
  readFileSync(new URL("./fixtures/vdp-ground-truth.json", import.meta.url), "utf8")
);

export const SITE = "https://www.lexusofbrookfield.com";

export function usd(n) {
  return Number(n).toLocaleString("en-US");
}

function dpriceRows(car) {
  return [
    { typeClass: "askingPrice", label: "Price", value: `$${usd(car.asking)}` },
    { typeClass: "documentFee", label: "Service Fee", value: "$479" },
    { typeClass: "deliveryFee", label: "ECT Filing Fee", value: "$38" },
    {
      typeClass: "internetPrice",
      label: "Total Sale Price",
      value: `$${usd(car.total)}`,
      isFinalPrice: true,
    },
  ];
}

export function renderVdpHtml(car, variant = "rendered-split") {
  const asking = usd(car.asking);
  const total = usd(car.total);
  const title = `${car.condition === "CPO" ? "Certified Pre-Owned " : ""}${car.year} ${car.make} ${car.model} ${car.trim || ""}`.trim();
  const rows = JSON.stringify(dpriceRows(car));

  if (variant === "akamai") {
    return `<html><head><title>Access Denied</title></head><body><h1>Access Denied</h1><p>You don't have permission to access this page.</p><p>Reference #18.abc123.1</p><hr>AkamaiGHost</body></html>`;
  }
  if (variant === "empty") return "<html><body></body></html>";
  if (variant === "asking-only") {
    return `<html><head><title>${title}</title></head><body>
      <h1>${title}</h1>
      <dl><dt>Price</dt><dd>$${asking}</dd></dl>
      <span class="price-summary__starting-price-value">$${asking}</span>
    </body></html>`;
  }
  if (variant === "unrendered-dprice") {
    return `<html><head><title>${title}</title></head><body>
      <div id="ws-vehicle-pricing"></div>
      <script>window.DDC={"InvData":{"pricing":{"dprice":${rows}}}};</script>
    </body></html>`;
  }
  if (variant === "unrendered-bare") {
    return `<html><head><title>${title}</title></head><body>
      <div id="app"></div>
      <script>window.DDC = { InvData: { pricing: { dprice: [{ label: "Price", value: "$${asking}" }, { label: "Total Sale Price", value: "$${total}" }] } } };</script>
    </body></html>`;
  }
  if (variant === "json-ld") {
    return `<html><head><title>${title}</title></head><body>
      <p>Total Sale Price is shown after fees.</p>
      <script type="application/ld+json">{"@type":"Car","sku":"${car.stock}","offers":{"price":"${car.total}","priceCurrency":"USD"}}</script>
    </body></html>`;
  }
  if (variant === "data-attr") {
    return `<html><head><title>${title}</title></head><body>
      <div data-total-sale-price="${car.total}" data-asking-price="${car.asking}">${title}</div>
    </body></html>`;
  }
  if (variant === "contiguous") {
    return `<html><head><title>${title}</title></head><body>
      <dl>
        <dt>Price</dt><dd>$${asking}</dd>
        <dt>Total Sale Price</dt><dd>$${total}</dd>
      </dl>
    </body></html>`;
  }
  if (variant === "nbsp") {
    return `<html><head><title>${title}</title></head><body>
      <dl>
        <dt>Price</dt><dd>$${asking}</dd>
        <dt>Total&nbsp;Sale&nbsp;Price</dt>
        <dd>$&nbsp;${total}</dd>
      </dl>
    </body></html>`;
  }
  if (variant === "discount") {
    return `<html><head><title>${title}</title></head><body>
      <p><s>$${usd(car.asking + 1500)}</s></p>
      <dl>
        <dt>Price</dt><dd>$${asking}</dd>
        <dt>Total Sale Price</dt>
        <dd>
$
${total}
        </dd>
      </dl>
    </body></html>`;
  }
  if (variant === "widget-only") {
    return `<html><head><title>${title}</title></head><body>
      <div class="price-summary">
        <span class="price-summary__starting-price-value">$${asking}</span>
        <div class="price-summary__final-price">
          <span class="price-summary__currency-symbol">$</span>
          <span class="price-summary__final-price-value">${total}</span>
          <span class="price-summary__final-price-label">Total Sale Price</span>
        </div>
      </div>
    </body></html>`;
  }
  if (variant === "inner-text-only") {
    return `<html><head><title>${title}</title></head><body>
<pre>Price
$${asking}
Service Fee
$479
ECT Filing Fee
$38
Total Sale Price
$
${total}</pre>
    </body></html>`;
  }
  if (variant === "table") {
    return `<html><head><title>${title}</title></head><body>
      <table>
        <tr><th>Price</th><td>$${asking}</td></tr>
        <tr><th>Total Sale Price</th><td>$
${total}</td></tr>
      </table>
    </body></html>`;
  }
  if (variant === "no-fees-labeled") {
    return `<html><head><title>${title}</title></head><body>
      <dl>
        <dt>Price</dt><dd>$${asking}</dd>
        <dt>Total Sale Price</dt>
        <dd>
          <span>$</span>
          <span>${total}</span>
        </dd>
      </dl>
    </body></html>`;
  }

  return `<html><head><title>${title}</title></head><body>
    <h1>${title}</h1>
    <p>${Number(car.mileage).toLocaleString("en-US")} miles · Stock ${car.stock}</p>
    <div class="price-summary">
      <span class="price-summary__starting-price-value">$${asking}</span>
      <span class="price-summary__starting-price-label">Price</span>
      <div class="price-summary__final-price">
        <span class="price-summary__currency-symbol">$</span>
        <span class="price-summary__final-price-value">${total}</span>
        <span class="price-summary__final-price-label">Total Sale Price</span>
      </div>
    </div>
    <dl class="pricing">
      <div><dt>Price</dt><dd>$${asking}</dd></div>
      <div><dt>Service Fee</dt><dd>$479</dd></div>
      <div><dt>ECT Filing Fee</dt><dd>$38</dd></div>
      <div><dt>Total Sale Price</dt><dd>
$
${total}
      </dd></div>
    </dl>
    <script>window.DDC={"InvData":{"pricing":{"dprice":${rows}}}};</script>
    <script type="application/ld+json">{"@type":"Car","sku":"${car.stock}","offers":{"price":"${car.total}"}}</script>
  </body></html>`;
}

export function vdpUrl(car, used = false) {
  if (used) {
    const make = car.make || "Lexus";
    return `${SITE}/used/${make}/${car.year}-${make}-${car.model}-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.htm`;
  }
  return `${SITE}${car.path}`;
}

export function packFromCar(car, extra = {}) {
  return {
    stock: car.stock,
    year: String(car.year),
    make: car.make,
    model: car.model,
    trim: car.trim || "",
    mileage: String(car.mileage || 0),
    condition: car.condition || "USED",
    certified: car.condition === "CPO",
    rooftop: "Lexus of Brookfield",
    vdpUrl: vdpUrl(car),
    zip: "53045",
    bodyStyle: extra.bodyStyle || (["GX", "NX", "RX"].includes(car.model) ? "SUV" : "Sedan"),
    exterior: extra.exterior || "White",
    interior: extra.interior || "Black",
    fuel: extra.fuel || "Gasoline",
    drivetrain: extra.drivetrain || "AWD",
    photoUrls: extra.photoUrls || [
      `https://pictures.dealer.com/l/lexusofbrookfieldwi/0001/${car.stock}-1.jpg`,
      `https://pictures.dealer.com/l/lexusofbrookfieldwi/0001/${car.stock}-2.jpg`,
    ],
    priceMissing: true,
    price: "",
    totalSalePrice: "",
    ...extra,
  };
}

export function extraInventoryCars(n = 40) {
  const makes = ["Lexus", "Toyota", "Honda", "Ford", "BMW", "Audi", "Jeep", "Chevrolet"];
  const models = ["ES", "RX", "Camry", "Civic", "F-150", "X5", "Q5", "Wrangler", "Tahoe"];
  const out = [];
  for (let i = 0; i < n; i++) {
    const asking = 18000 + i * 317;
    const total = asking + 517;
    const make = makes[i % makes.length];
    const model = models[i % models.length];
    const certified = i % 3 === 0;
    const year = String(2018 + (i % 8));
    const stock = `T${String(i).padStart(4, "0")}`;
    out.push({
      stock,
      year,
      make,
      model,
      trim: i % 2 ? "Premium" : "",
      mileage: String(4000 + i * 811),
      asking,
      total,
      path: certified
        ? `/certified/${make.toUpperCase()}/${year}-${make.toUpperCase()}-${model}-${"a".repeat(32)}.htm`
        : `/used/${make}/${year}-${make}-${model}-${"b".repeat(32)}.htm`,
      condition: certified ? "CPO" : "USED",
    });
  }
  return out;
}

export function listingVehicle(car) {
  return {
    inventoryButtons: [{ inventoryType: "used" }],
    vin: `JT${car.stock.replace(/[^A-Z0-9]/gi, "").padEnd(15, "0").slice(0, 15)}`,
    stockNumber: car.stock,
    year: Number(car.year),
    make: car.make.toUpperCase(),
    model: car.model,
    trim: car.trim || "",
    type: "used",
    certified: car.condition === "CPO",
    condition: car.condition === "CPO" ? "Certified Pre-Owned" : "Used",
    link: car.path,
    pricing: { dprice: [{ typeClass: "askingPrice", value: `$${usd(car.asking)}` }] },
    images: [
      {
        uri: `https://pictures.dealer.com/l/lexusofbrookfieldwi/0001/${car.stock}.jpg`,
        provider: "ACTUAL_PHOTO",
      },
    ],
  };
}

export function renderListingPage(vehicles, { totalCount, start = 0, pageSize = 24 } = {}) {
  const slice = vehicles.slice(start, start + pageSize);
  const payload = {
    pageInfo: { totalCount: totalCount || vehicles.length, pageSize, pageStart: start },
    inventory: slice.map(listingVehicle),
  };
  const next = start + pageSize < (totalCount || vehicles.length)
    ? `<link rel="next" href="${SITE}/used-inventory/index.htm?start=${start + pageSize}">`
    : "";
  return `<!DOCTYPE html>
<html>
<head><title>Used inventory</title>${next}
<script type="application/ld+json">{"@type":"CollectionPage","description":"Browse our inventory of ${totalCount || vehicles.length}   vehicles for sale."}</script>
</head>
<body>
<p>Browse our inventory of ${totalCount || vehicles.length} vehicles</p>
<script>window.DDC={"WIS":{"pageInfo":{"totalCount":${totalCount || vehicles.length},"pageSize":${pageSize},"pageStart":${start}}}};</script>
<script>const PAGE = ${JSON.stringify(payload)};</script>
</body>
</html>`;
}

export const VARIANTS = [
  "rendered-split",
  "widget-only",
  "contiguous",
  "unrendered-dprice",
  "unrendered-bare",
  "json-ld",
  "data-attr",
  "nbsp",
  "discount",
  "inner-text-only",
  "table",
  "no-fees-labeled",
];
