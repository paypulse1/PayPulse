import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { Resvg } from "@resvg/resvg-js"

const root = path.dirname(fileURLToPath(import.meta.url))
const listingDir = path.join(root, "en-US")
const assetsDir = path.join(listingDir, "assets")
const publicDir = path.resolve(root, "../../public")

const sources = [
  {
    file: "IMG_20261101_183405_701.jpg",
    title: "Choose a bank or wallet",
    description: "See available transfer networks for each destination.",
  },
  {
    file: "IMG_20261101_183405_888.jpg",
    title: "Review transfer details",
    description: "Check the destination, network and fee before sending.",
  },
]

async function dataUri(filePath, mimeType) {
  const buffer = await readFile(filePath)
  return `data:${mimeType};base64,${buffer.toString("base64")}`
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }
    return entities[character]
  })
}

async function renderPng(svg, outputPath) {
  const image = new Resvg(svg).render()
  await writeFile(outputPath, image.asPng())
}

async function phoneScreenshot(image, logo, title, description) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs><clipPath id="screen" clipPathUnits="userSpaceOnUse"><rect x="200" y="465" width="680" height="1360" rx="34"/></clipPath></defs>
<rect width="1080" height="1920" fill="#f4f7fb"/><rect width="1080" height="14" fill="#0877df"/>
<image x="88" y="64" width="52" height="52" href="${logo}"/>
<text x="154" y="103" fill="#0758b8" font-family="DejaVu Sans" font-size="31" font-weight="700">DRPAY</text>
<text x="88" y="220" fill="#10233f" font-family="DejaVu Serif" font-size="60" font-weight="700">${escapeXml(title)}</text>
<text x="88" y="280" fill="#52657e" font-family="DejaVu Sans" font-size="27">${escapeXml(description)}</text>
<rect x="178" y="443" width="724" height="1404" rx="44" fill="#ffffff"/>
<image x="200" y="364" width="680" height="1476" href="${image}" clip-path="url(#screen)"/>
<text x="88" y="1880" fill="#64758c" font-family="DejaVu Sans" font-size="22">Merchant payments, made clear.</text>
</svg>`
}

async function featureGraphic(logo, image) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
<defs><clipPath id="device" clipPathUnits="userSpaceOnUse"><rect x="704" y="35" width="236" height="430" rx="30"/></clipPath></defs>
<rect width="1024" height="500" fill="#f4f7fb"/><path d="M620 0h404v500H620z" fill="#0758b8"/>
<image x="56" y="46" width="48" height="48" href="${logo}"/>
<text x="116" y="81" fill="#0758b8" font-family="DejaVu Sans" font-size="27" font-weight="700">DRPAY</text>
<text x="56" y="194" fill="#10233f" font-family="DejaVu Serif" font-size="47" font-weight="700">Merchant payments,</text>
<text x="56" y="249" fill="#10233f" font-family="DejaVu Serif" font-size="47" font-weight="700">within reach.</text>
<text x="56" y="318" fill="#52657e" font-family="DejaVu Sans" font-size="21">Payment activity, customer checkout and transfers</text>
<text x="56" y="350" fill="#52657e" font-family="DejaVu Sans" font-size="21">in one merchant workspace.</text>
<rect x="692" y="24" width="260" height="452" rx="38" fill="#ffffff"/>
<image x="704" y="0" width="236" height="512" href="${image}" clip-path="url(#device)"/>
</svg>`
}

async function appIcon(logo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#f4f7fb"/>
<image x="56" y="70" width="400" height="371" href="${logo}"/>
</svg>`
}

await mkdir(assetsDir, { recursive: true })
const logo = await dataUri(path.join(publicDir, "paypulse-mark.png"), "image/png")
await renderPng(await appIcon(logo), path.join(assetsDir, "icon.png"))
for (const [index, source] of sources.entries()) {
  const image = await dataUri(path.join(publicDir, source.file), "image/jpeg")
  await renderPng(
    await phoneScreenshot(image, logo, source.title, source.description),
    path.join(assetsDir, `phone-screenshot-${index + 1}.png`),
  )
}
const featureImage = await dataUri(path.join(publicDir, sources[0].file), "image/jpeg")
await renderPng(
  await featureGraphic(logo, featureImage),
  path.join(assetsDir, "feature-graphic.png"),
)

console.log(`Generated Google Play artwork in ${assetsDir}`)