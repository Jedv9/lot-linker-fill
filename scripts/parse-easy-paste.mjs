import fs from "fs";
const src = process.argv[2];
const dest = process.argv[3] || "packs.json";
if (!src) { console.error("Usage: node scripts/parse-easy-paste.mjs ALL-EASY-PASTE.md [packs.json]"); process.exit(1); }
const text = fs.readFileSync(src, "utf8");
const blocks = text.split(/\n### STOCK\s+/).slice(1);
const packs = [];
for (const b of blocks) {
  const stock = b.split("\n", 1)[0].trim();
  const grab = (label) => {
    const m = b.match(new RegExp("\\*\\*" + label + " \\(paste\\):\\*\\*\\s*```\\s*([\\s\\S]*?)\\s*```"));
    return m ? m[1].trim() : "";
  };
  const filters = (b.match(/\*\*Filters:\*\*\s*(.+)/) || [,""])[1];
  const parts = filters.split("|").map((s) => s.trim());
  const p = (i, d = "") => (parts[i] != null ? parts[i] : d);
  let zip = (p(15, "53066") || "53066").replace(/^zip\s*/i, "").trim() || "53066";
  const priceRaw = grab("PRICE");
  packs.push({
    stock, year: p(0), make: p(1), model: p(2), trim: p(3), bodyStyle: p(4),
    mileage: p(5), vin: p(6), condition: p(7), exterior: p(8), interior: p(9),
    transmission: p(10), fuel: p(11), drivetrain: p(12), titleStatus: p(13),
    zip, price: priceRaw.replace(/[^\d.]/g, ""), title: grab("TITLE"), body: grab("BODY"),
    rooftop: grab("BODY").includes("Hyundai") ? "Lake Country Hyundai" : "Lake Country Nissan",
  });
}
fs.writeFileSync(dest, JSON.stringify({ generated: new Date().toISOString().slice(0,10), source: src, count: packs.length, packs }, null, 2));
console.log(`Wrote ${packs.length} packs → ${dest}`);
