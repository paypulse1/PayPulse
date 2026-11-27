/**
 * PayPulse — Google Play Store Asset Generator
 *
 * Generates brand-consistent fintech artwork for Google Play:
 *   - icon.png               512×512    App icon (gradient + PayPulse pulse mark)
 *   - feature-graphic.png    1024×500   Feature banner (split-panel layout)
 *   - phone-screenshot-N.png 1080×1920  Framed screenshots with callout text
 *
 * Brand colours:
 *   Navy   #0D2B5E  Deep background / text
 *   Blue   #2457EB  Primary brand blue
 *   Teal   #167E9E  Gradient terminus
 *   Accent #5AE1D2  Pulse dot / highlights
 *   White  #FFFFFF  On-gradient text
 *   Slate  #64758C  Secondary text
 *   Mist   #F0F4FB  Light screen background
 *
 * Run:  node android/play-listing/generate-assets.mjs
 * Requires: @resvg/resvg-js  (already in devDependencies)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { Resvg } from "@resvg/resvg-js"

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const root = path.dirname(fileURLToPath(import.meta.url))
const listingDir = path.join(root, "en-US")
const assetsDir = path.join(listingDir, "assets")
const publicDir = path.resolve(root, "../../public")

// ---------------------------------------------------------------------------
// Screenshot sources (title / tagline pairs shown on each frame)
// ---------------------------------------------------------------------------
const sources = [
  {
    file: "Screenshot_2026-11-08-15-40-49-24_568114c4339305b302ed62f7f511b0c8.jpg",
    title: "Your wallet, at a glance",
    tagline: "Track balances, collections and transfers in real time.",
  },
  {
    file: "Screenshot_2026-11-08-15-40-52-10_568114c4339305b302ed62f7f511b0c8.jpg",
    title: "Send money instantly",
    tagline: "InstaPay & PESONet transfers — fast, verified, secure.",
  },
  {
    file: "IMG_20261101_183405_701.jpg",
    title: "Choose your network",
    tagline: "See available transfer channels before you confirm.",
  },
  {
    file: "IMG_20261101_183405_888.jpg",
    title: "Review every detail",
    tagline: "Check destination, network and fee — then send with MPIN.",
  },
]

// Feature graphic uses the first screenshot as the device preview
const featureSource = sources[0]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function dataUri(filePath, mimeType) {
  const buffer = await readFile(filePath)
  return `data:${mimeType};base64,${buffer.toString("base64")}`
}

function esc(value) {
  return value.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c])
  )
}

async function renderPng(svg, outputPath) {
  const image = new Resvg(svg, { font: { loadSystemFonts: true } }).render()
  await writeFile(outputPath, image.asPng())
  console.log(`  ✓  ${path.relative(root, outputPath)}`)
}

// ---------------------------------------------------------------------------
// SVG builders
// ---------------------------------------------------------------------------

/**
 * App icon — 512×512
 * Full-bleed gradient background with the PayPulse mark centred.
 */
async function buildAppIcon(markDataUri) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
       width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0D2B5E"/>
      <stop offset=".55" stop-color="#2457EB"/>
      <stop offset="1"   stop-color="#167E9E"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="430" cy="82" r="90" fill="#5AE1D2" opacity=".12"/>
  <image x="72" y="72" width="368" height="368" href="${markDataUri}"/>
</svg>`
}

/**
 * Feature graphic — 1024×500
 * Left panel: dark navy with logo + headline copy.
 * Right panel: tilted gradient panel housing the device mockup.
 */
async function buildFeatureGraphic(markDataUri, screenDataUri) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
       width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="panelbg" x1="0" y1="0" x2="1024" y2="500" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0D2B5E"/>
      <stop offset="1" stop-color="#0E3B6E"/>
    </linearGradient>
    <linearGradient id="cardgrad" x1="650" y1="0" x2="1024" y2="500" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2457EB"/>
      <stop offset="1" stop-color="#167E9E"/>
    </linearGradient>
    <clipPath id="deviceclip">
      <rect x="716" y="38" width="220" height="424" rx="28"/>
    </clipPath>
  </defs>
  <rect width="1024" height="500" fill="url(#panelbg)"/>
  <polygon points="590,0 1024,0 1024,500 640,500" fill="url(#cardgrad)" opacity=".9"/>
  <circle cx="980" cy="30"  r="70" fill="#5AE1D2" opacity=".10"/>
  <circle cx="610" cy="480" r="50" fill="#5AE1D2" opacity=".08"/>
  <circle cx="80"  cy="420" r="100" fill="#2457EB" opacity=".06"/>
  <image x="48" y="38" width="52" height="52" href="${markDataUri}"/>
  <text x="112" y="77"
        fill="#FFFFFF" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="26" font-weight="700" letter-spacing="1">PayPulse</text>
  <text x="48" y="190"
        fill="#FFFFFF" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="46" font-weight="700">Merchant payments,</text>
  <text x="48" y="246"
        fill="#5AE1D2" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="46" font-weight="700">made clear.</text>
  <text x="48" y="312"
        fill="#B8CBEA" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="19">Collections, transfers and checkout</text>
  <text x="48" y="340"
        fill="#B8CBEA" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="19">in one secure merchant workspace.</text>
  <rect x="48" y="400" width="168" height="38" rx="19" fill="#2457EB"/>
  <text x="132" y="424"
        fill="#FFFFFF" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="16" font-weight="700" text-anchor="middle">For Merchants</text>
  <rect x="710" y="32" width="232" height="436" rx="34" fill="#000000" opacity=".25"/>
  <rect x="704" y="26" width="232" height="448" rx="34" fill="#FFFFFF"/>
  <image x="716" y="38" width="220" height="424"
         href="${screenDataUri}" clip-path="url(#deviceclip)"/>
  <rect x="790" y="34" width="60" height="10" rx="5" fill="#E0E8F5"/>
  <text x="48" y="488"
        fill="#64758C" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="14">paypulse.live</text>
</svg>`
}

/**
 * Phone screenshot frame — 1080×1920
 * Top: gradient header with logo, title, tagline.
 * Centre: device mockup with rounded screen clip.
 * Bottom: subtle domain label strip.
 */
async function buildScreenshot(screenDataUri, markDataUri, title, tagline) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
       width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="topbar" x1="0" y1="0" x2="1080" y2="300" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0D2B5E"/>
      <stop offset="1" stop-color="#2457EB"/>
    </linearGradient>
    <linearGradient id="bottombg" x1="0" y1="1600" x2="1080" y2="1920" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F0F4FB"/>
      <stop offset="1" stop-color="#E4EBF8"/>
    </linearGradient>
    <clipPath id="screen">
      <rect x="190" y="470" width="700" height="1240" rx="36"/>
    </clipPath>
  </defs>
  <rect width="1080" height="1920" fill="#F0F4FB"/>
  <rect width="1080" height="380" fill="url(#topbar)"/>
  <circle cx="980" cy="60" r="130" fill="#5AE1D2" opacity=".10"/>
  <circle cx="1060" cy="380" r="80" fill="#167E9E" opacity=".15"/>
  <image x="80" y="62" width="68" height="68" href="${markDataUri}"/>
  <text x="162" y="109"
        fill="#FFFFFF" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="38" font-weight="700" letter-spacing="1">PayPulse</text>
  <rect x="162" y="118" width="140" height="4" rx="2" fill="#5AE1D2"/>
  <text x="80" y="210"
        fill="#FFFFFF" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="66" font-weight="700">${esc(title)}</text>
  <text x="80" y="286"
        fill="#B8CBEA" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="34">${esc(tagline)}</text>
  <rect x="80" y="318" width="60" height="6" rx="3" fill="#5AE1D2"/>
  <rect x="174" y="454" width="732" height="1272" rx="52" fill="#1A2E50"/>
  <image x="190" y="470" width="700" height="1240"
         href="${screenDataUri}" clip-path="url(#screen)"/>
  <rect x="460" y="466" width="160" height="22" rx="11" fill="#0D2B5E"/>
  <rect x="0" y="1800" width="1080" height="120" fill="url(#bottombg)"/>
  <text x="540" y="1876"
        fill="#64758C" font-family="'DejaVu Sans',Arial,sans-serif"
        font-size="28" text-anchor="middle">paypulse.live  ·  For registered merchants</text>
  <circle cx="1020" cy="1860" r="18" fill="#5AE1D2" opacity=".5"/>
  <circle cx="1020" cy="1860" r="10" fill="#5AE1D2"/>
</svg>`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
await mkdir(assetsDir, { recursive: true })

console.log("\n🎨  PayPulse — Generating Google Play assets…\n")

const markUri = await dataUri(path.join(publicDir, "paypulse-mark.png"), "image/png")

// App icon
await renderPng(
  await buildAppIcon(markUri),
  path.join(assetsDir, "icon.png"),
)

// Phone screenshots (up to 4)
for (const [index, source] of sources.entries()) {
  const screenUri = await dataUri(path.join(publicDir, source.file), "image/jpeg")
  await renderPng(
    await buildScreenshot(screenUri, markUri, source.title, source.tagline),
    path.join(assetsDir, `phone-screenshot-${index + 1}.png`),
  )
}

// Feature graphic
const featureScreenUri = await dataUri(
  path.join(publicDir, featureSource.file),
  "image/jpeg",
)
await renderPng(
  await buildFeatureGraphic(markUri, featureScreenUri),
  path.join(assetsDir, "feature-graphic.png"),
)

console.log(`\n✅  All assets written to:\n    ${assetsDir}\n`)
