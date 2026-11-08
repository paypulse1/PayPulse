import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote

from google.auth.transport.requests import AuthorizedSession
from google.oauth2.service_account import Credentials


PACKAGE_NAME = "ph.drpays.merchant"
TRACK = "internal"
API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3"
UPLOAD_ROOT = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3"


def parse_version(tag: str, prefix: str) -> tuple[str, str]:
    match = re.fullmatch(rf"{re.escape(prefix)}(\d+)\.(\d+)\.(\d+)", tag)
    if not match:
        raise ValueError(f"Release tag must use {prefix}MAJOR.MINOR.PATCH")

    major, minor, patch = (int(part) for part in match.groups())
    return f"{major}.{minor}.{patch}", str(major * 1_000_000 + minor * 1_000 + patch)


def publish_track_release(
    session: AuthorizedSession,
    edit_url: str,
    edit_id: str,
    track: str,
    version_name: str,
    version_code: str,
) -> None:
    track_url = f"{edit_url}/{quote(edit_id, safe='')}/tracks/{track}"
    track_response = session.put(
        track_url,
        json={
            "track": track,
            "releases": [
                {
                    "name": version_name,
                    "versionCodes": [version_code],
                    "status": "completed",
                }
            ],
        },
        timeout=60,
    )
    track_response.raise_for_status()

    commit_response = session.post(
        f"{edit_url}/{quote(edit_id, safe='')}:commit",
        json={},
        timeout=60,
    )
    if not commit_response.ok:
        raise RuntimeError(
            "Google Play listing commit failed with HTTP "
            f"{commit_response.status_code}: {commit_response.text[:2000]}"
        )


def load_store_listing() -> tuple[dict, Path, list[Path]]:
    listing_dir = Path(__file__).parent / "play-listing" / "en-US"
    listing_path = listing_dir / "listing.json"
    listing = json.loads(listing_path.read_text())
    for field, maximum in (
        ("title", 30),
        ("shortDescription", 80),
        ("fullDescription", 4000),
    ):
        value = listing.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > maximum:
            raise ValueError(f"Store listing {field} must be 1-{maximum} characters")

    locale = listing.get("language")
    if not isinstance(locale, str) or not locale:
        raise ValueError("Store listing language is required")
    feature_graphic = listing_dir / "assets" / "feature-graphic.png"
    screenshots = sorted((listing_dir / "assets").glob("phone-screenshot-*.png"))
    if not feature_graphic.is_file():
        raise FileNotFoundError(f"Missing Play feature graphic: {feature_graphic}")
    if not 2 <= len(screenshots) <= 8:
        raise ValueError("Google Play requires 2-8 phone screenshots")
    return listing, feature_graphic, screenshots


def upload_listing_image(
    session: AuthorizedSession,
    edit_id: str,
    locale: str,
    image_type: str,
    image_path: Path,
) -> None:
    image_url = (
        f"{UPLOAD_ROOT}/applications/{quote(PACKAGE_NAME, safe='')}/edits/"
        f"{quote(edit_id, safe='')}/listings/{quote(locale, safe='')}/{image_type}"
    )
    with image_path.open("rb") as image:
        response = session.post(
            image_url,
            params={"uploadType": "media"},
            data=image,
            headers={"Content-Type": "image/png"},
            timeout=120,
        )
    response.raise_for_status()


def publish_store_listing(
    session: AuthorizedSession,
    edit_url: str,
    edit_id: str,
    listing: dict,
    feature_graphic: Path,
    screenshots: list[Path],
) -> None:
    locale = listing["language"]
    listings_url = f"{edit_url}/{quote(edit_id, safe='')}/listings"
    listings_response = session.get(listings_url, timeout=60)
    listings_response.raise_for_status()
    available_locales = {
        item.get("language")
        for item in listings_response.json().get("listings", [])
    }
    if locale not in available_locales:
        raise RuntimeError(
            f"Google Play has no existing {locale} listing; refusing to publish"
        )

    listing_url = (
        f"{edit_url}/{quote(edit_id, safe='')}/listings/{quote(locale, safe='')}"
    )
    response = session.put(
        listing_url,
        json={
            "language": locale,
            "title": listing["title"],
            "shortDescription": listing["shortDescription"],
            "fullDescription": listing["fullDescription"],
        },
        timeout=60,
    )
    response.raise_for_status()

    image_root = f"{listing_url}/{{image_type}}"
    for image_type, image_paths in (
        ("featureGraphic", [feature_graphic]),
        ("phoneScreenshots", screenshots),
    ):
        images_url = image_root.format(image_type=image_type)
        images_response = session.get(images_url, timeout=60)
        images_response.raise_for_status()
        if images_response.json().get("images"):
            delete_response = session.delete(images_url, timeout=60)
            delete_response.raise_for_status()
        for image_path in image_paths:
            upload_listing_image(
                session, edit_id, locale, image_type, image_path
            )

    commit_response = session.post(
        f"{edit_url}/{quote(edit_id, safe='')}:commit",
        json={},
        timeout=60,
    )
    commit_response.raise_for_status()


def main() -> None:
    checking_production = len(sys.argv) == 2 and sys.argv[1] == "--check-production"
    promoting_existing_release = len(sys.argv) == 3 and sys.argv[1] == "--promote-existing"
    updating_listing = len(sys.argv) == 2 and sys.argv[1] == "--update-listing"
    if (
        not checking_production
        and not promoting_existing_release
        and not updating_listing
        and len(sys.argv) != 2
    ):
        raise SystemExit(
            "Usage: publish_to_play.py <signed-app-bundle.aab>\n"
            "   or: publish_to_play.py --promote-existing android-prod-vMAJOR.MINOR.PATCH\n"
            "   or: publish_to_play.py --check-production\n"
            "   or: publish_to_play.py --update-listing"
        )

    if updating_listing:
        listing, feature_graphic, screenshots = load_store_listing()

    service_account_json = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise RuntimeError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured")

    if checking_production or updating_listing:
        version_name = ""
    elif promoting_existing_release:
        version_name, version_code = parse_version(sys.argv[2], "android-prod-v")
    else:
        version_name = os.environ.get("ANDROID_VERSION_NAME", "")
        if version_name.startswith("android-v"):
            version_name = version_name.removeprefix("android-v")
        if not version_name:
            raise RuntimeError("ANDROID_VERSION_NAME must contain the release version")

    credentials = Credentials.from_service_account_info(
        json.loads(service_account_json),
        scopes=["https://www.googleapis.com/auth/androidpublisher"],
    )
    session = AuthorizedSession(credentials)
    package = quote(PACKAGE_NAME, safe="")
    edit_url = f"{API_ROOT}/applications/{package}/edits"
    edit_response = session.post(edit_url, json={}, timeout=60)
    edit_response.raise_for_status()
    edit_id = edit_response.json()["id"]

    if checking_production:
        track_states = {}
        for track in ("production", "internal"):
            track_url = f"{edit_url}/{quote(edit_id, safe='')}/tracks/{track}"
            track_response = session.get(track_url, timeout=60)
            track_response.raise_for_status()
            track_data = track_response.json()
            track_states[track] = {
                "releases": [
                    {
                        "name": release.get("name"),
                        "status": release.get("status"),
                        "versionCodes": release.get("versionCodes", []),
                        "userFraction": release.get("userFraction"),
                        "countryTargeting": release.get("countryTargeting"),
                    }
                    for release in track_data.get("releases", [])
                ]
            }

        availability_url = (
            f"{edit_url}/{quote(edit_id, safe='')}/countryAvailability/production"
        )
        availability_response = session.get(availability_url, timeout=60)
        availability_response.raise_for_status()
        availability = availability_response.json()
        production_availability = {
            "syncWithProduction": availability.get("syncWithProduction"),
            "restOfWorld": availability.get("restOfWorld"),
            "countries": sorted(
                country.get("countryCode", "")
                for country in availability.get("countries", [])
                if country.get("countryCode")
            ),
        }

        listings_url = f"{edit_url}/{quote(edit_id, safe='')}/listings"
        listings_response = session.get(listings_url, timeout=60)
        listings_response.raise_for_status()
        listings = listings_response.json().get("listings", [])
        print(f"Track releases: {json.dumps(track_states, sort_keys=True)}")
        print(
            "Production availability: "
            + json.dumps(production_availability, sort_keys=True)
        )
        print(
            "Store listings: "
            + json.dumps(
                [
                    {"language": listing.get("language"), "title": listing.get("title")}
                    for listing in listings
                ],
                sort_keys=True,
            )
        )
        return
    elif updating_listing:
        publish_store_listing(
            session, edit_url, edit_id, listing, feature_graphic, screenshots
        )
        print(f"Updated the {listing['language']} Google Play store listing.")
        return
    elif promoting_existing_release:
        track = "production"
    else:
        bundle_path = Path(sys.argv[1])
        upload_url = (
            f"{UPLOAD_ROOT}/applications/{package}/edits/{quote(edit_id, safe='')}/bundles"
        )
        with bundle_path.open("rb") as bundle:
            upload_response = session.post(
                upload_url,
                params={"uploadType": "media"},
                data=bundle,
                headers={"Content-Type": "application/octet-stream"},
                timeout=600,
            )
        upload_response.raise_for_status()
        version_code = str(upload_response.json()["versionCode"])
        track = TRACK

    publish_track_release(
        session, edit_url, edit_id, track, version_name, version_code
    )
    print(
        f"Published {PACKAGE_NAME} version {version_name} "
        f"(version code {version_code}) to the {track} track."
    )


if __name__ == "__main__":
    main()
