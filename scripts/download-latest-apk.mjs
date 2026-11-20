import { createHash } from "node:crypto"
import { createWriteStream, createReadStream } from "node:fs"
import { mkdir, open, rename, rm, stat } from "node:fs/promises"
import { dirname } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

const repository =
  process.env.DRPAY_GITHUB_RELEASE_REPOSITORY?.trim() ||
  "paypulse1/PayPulse"
const destination = process.argv[2] || "public/drpay.apk"
const temporaryPath = `${destination}.download`
const token = process.env.DRPAY_GITHUB_RELEASE_TOKEN

async function hasValidApk(path) {
  try {
    const file = await open(path, "r")
    const signature = Buffer.alloc(4)
    try {
      await file.read(signature, 0, signature.length, 0)
    } finally {
      await file.close()
    }
    if (signature.toString("hex") !== "504b0304") return false
    const fileStats = await stat(path)
    return fileStats.size > 1_000_000
  } catch {
    return false
  }
}

if (!token) {
  if (await hasValidApk(destination)) {
    console.warn(
      "DRPAY_GITHUB_RELEASE_TOKEN is not set; retaining the checked-in APK.",
    )
    process.exit(0)
  }
  throw new Error(
    "Set DRPAY_GITHUB_RELEASE_TOKEN or provide a valid public/drpay.apk.",
  )
}

const apiHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
}

async function request(url, headers) {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`GitHub APK request failed (${response.status}).`)
  }
  return response
}

await mkdir(dirname(destination), { recursive: true })

try {
  const releaseResponse = await request(
    `https://api.github.com/repos/${repository}/releases?per_page=100`,
    apiHeaders,
  )
  const releases = await releaseResponse.json()
  const release = releases.find(
    ({ tag_name: tag, draft, prerelease, assets }) =>
      !draft &&
      !prerelease &&
      /^android-v\d+\.\d+\.\d+$/.test(tag || "") &&
      assets?.some(({ name }) => name === "drpay.apk"),
  )
  const asset = release?.assets?.find(({ name }) => name === "drpay.apk")
  if (!asset?.url || !Number.isSafeInteger(asset.size)) {
    if (await hasValidApk(destination)) {
      console.warn(
        "No published private APK release was found; retaining the checked-in APK.",
      )
      process.exit(0)
    }
    throw new Error(
      "No private APK release was found and public/drpay.apk is invalid.",
    )
  }

  const downloadResponse = await request(asset.url, {
    ...apiHeaders,
    Accept: "application/octet-stream",
  })
  if (!downloadResponse.body) {
    throw new Error("GitHub returned an empty APK download.")
  }

  await pipeline(
    Readable.fromWeb(downloadResponse.body),
    createWriteStream(temporaryPath, { flags: "w" }),
  )

  const downloadedFile = await stat(temporaryPath)
  if (downloadedFile.size !== asset.size) {
    throw new Error(
      `Downloaded APK size mismatch (${downloadedFile.size}/${asset.size}).`,
    )
  }

  const digest = createHash("sha256")
  for await (const chunk of createReadStream(temporaryPath))
    digest.update(chunk)
  const digestText = `sha256:${digest.digest("hex")}`
  if (asset.digest && digestText !== asset.digest) {
    throw new Error(
      "Downloaded APK checksum does not match the GitHub release.",
    )
  }

  const file = await open(temporaryPath, "r")
  const signature = Buffer.alloc(4)
  try {
    await file.read(signature, 0, signature.length, 0)
  } finally {
    await file.close()
  }
  if (signature.toString("hex") !== "504b0304") {
    throw new Error(
      "The downloaded APK is not a valid ZIP-based Android package.",
    )
  }

  await rename(temporaryPath, destination)
  console.log(
    `Downloaded ${release.tag_name} APK (${downloadedFile.size} bytes).`,
  )
} catch (error) {
  await rm(temporaryPath, { force: true })
  if (await hasValidApk(destination)) {
    console.warn(
      `Could not refresh the private APK (${error.message}); retaining the checked-in APK.`,
    )
    process.exit(0)
  }
  throw error
}
