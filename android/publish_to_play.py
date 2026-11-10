import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote

from google.auth.transport.requests import AuthorizedSession
from google.oauth2.service_account import Credentials


PACKAGE_NAME = os.environ.get("ANDROID_APPLICATION_ID", "ph.drpays.merchant")
SUPPORTED_PACKAGE_NAMES = {
    "ph.drpays.merchant",
    "ph.drpays.merchant.public",
}
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
    if track_response.status_code == 404 and track == "alpha":
        raise RuntimeError(
            "The alpha closed-testing track is unavailable for this app. "
            "Create a closed-testing track in Google Play Console, then retry."
        )
    track_response.raise_for_status()

    commit_response = session.post(
        f"{edit_url}/{quote(edit_id, safe='')}:commit",
        json={},
        timeout=60,
    )
    if not commit_response.ok:
        raise RuntimeError(
            "Google Play release commit failed with HTTP "
            f"{commit_response.status_code}: {commit_response.text[:2000]}"
        )


def load_store_listings() -> list[tuple[dict, Path, Path, list[Path]]]:
    listing_root = Path(__file__).parent / "play-listing"
    english_assets = listing_root / "en-US" / "assets"
    listing_dirs = sorted(
        path for path in listing_root.iterdir() if (path / "listing.json").is_file()
    )
    if PACKAGE_NAME != "ph.drpays.merchant.public":
        listing_dirs = [path for path in listing_dirs if path.name == "en-US"]
    if not listing_dirs or listing_dirs[0].name != "en-US":
        raise ValueError("Google Play store listings must include en-US")

    listings = []
    for listing_dir in listing_dirs:
        listing = json.loads((listing_dir / "listing.json").read_text())
        for field, maximum in (
            ("title", 30),
            ("shortDescription", 80),
            ("fullDescription", 4000),
        ):
            value = listing.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > maximum:
                raise ValueError(
                    f"Store listing {listing_dir.name} {field} must be 1-{maximum} characters"
                )

        if listing.get("language") != listing_dir.name:
            raise ValueError(
                f"Store listing language must match directory {listing_dir.name}"
            )
        assets_dir = listing_dir / "assets"
        if not assets_dir.is_dir():
            assets_dir = english_assets
        app_icon = assets_dir / "icon.png"
        feature_graphic = assets_dir / "feature-graphic.png"
        screenshots = sorted(assets_dir.glob("phone-screenshot-*.png"))
        if not app_icon.is_file():
            raise FileNotFoundError(f"Missing Play app icon: {app_icon}")
        if not feature_graphic.is_file():
            raise FileNotFoundError(f"Missing Play feature graphic: {feature_graphic}")
        if not 2 <= len(screenshots) <= 8:
            raise ValueError("Google Play requires 2-8 phone screenshots")
        listings.append((listing, app_icon, feature_graphic, screenshots))
    return listings


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
    localized_listings: list[tuple[dict, Path, Path, list[Path]]],
) -> None:
    listings_url = f"{edit_url}/{quote(edit_id, safe='')}/listings"
    listings_response = session.get(listings_url, timeout=60)
    listings_response.raise_for_status()
    available_locales = {
        item.get("language")
        for item in listings_response.json().get("listings", [])
    }

    for listing, app_icon, feature_graphic, screenshots in localized_listings:
        locale = listing["language"]
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
            ("icon", [app_icon]),
            ("featureGraphic", [feature_graphic]),
            ("phoneScreenshots", screenshots),
        ):
            images_url = image_root.format(image_type=image_type)
            if locale in available_locales:
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
        params={"changesInReviewBehavior": "ERROR_IF_IN_REVIEW"},
        timeout=60,
    )
    if not commit_response.ok:
        raise RuntimeError(
            "Google Play listing commit failed with HTTP "
            f"{commit_response.status_code}: {commit_response.text[:2000]}"
        )


def main() -> None:
    if PACKAGE_NAME not in SUPPORTED_PACKAGE_NAMES:
        raise RuntimeError(f"Unsupported Android application ID: {PACKAGE_NAME}")

    checking_production = len(sys.argv) == 2 and sys.argv[1] == "--check-production"
    promoting_existing_release = len(sys.argv) == 3 and sys.argv[1] == "--promote-existing"
    updating_listing = len(sys.argv) == 2 and sys.argv[1] == "--update-listing"
    publishing_closed_test = len(sys.argv) == 2 and sys.argv[1] == "--publish-closed-test"
    if (
        not checking_production
        and not promoting_existing_release
        and not updating_listing
        and not publishing_closed_test
        and len(sys.argv) != 2
    ):
        raise SystemExit(
            "Usage: publish_to_play.py <signed-app-bundle.aab>\n"
            "   or: publish_to_play.py --promote-existing android-prod-vMAJOR.MINOR.PATCH\n"
            "   or: publish_to_play.py --check-production\n"
            "   or: publish_to_play.py --update-listing\n"
            "   or: publish_to_play.py --publish-closed-test"
        )

    if updating_listing:
        localized_listings = load_store_listings()

    service_account_json = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise RuntimeError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured")

    if checking_production or updating_listing or publishing_closed_test:
        version_name = ""
    elif promoting_existing_release:
        version_prefix = (
            "android-public-prod-v"
            if PACKAGE_NAME == "ph.drpays.merchant.public"
            else "android-prod-v"
        )
        version_name, version_code = parse_version(sys.argv[2], version_prefix)
    else:
        version_name = os.environ.get("ANDROID_VERSION_NAME", "")
        for prefix in ("android-public-v", "android-v"):
            if version_name.startswith(prefix):
                version_name = version_name.removeprefix(prefix)
                break
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
        tracks_url = f"{edit_url}/{quote(edit_id, safe='')}/tracks"
        tracks_response = session.get(tracks_url, timeout=60)
        tracks_response.raise_for_status()
        available_tracks = [
            {
                "track": track.get("track"),
                "releases": [
                    {
                        "name": release.get("name"),
                        "status": release.get("status"),
                        "versionCodes": release.get("versionCodes", []),
                    }
                    for release in track.get("releases", [])
                ],
            }
            for track in tracks_response.json().get("tracks", [])
        ]
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
        listings_url = f"{edit_url}/{quote(edit_id, safe='')}/listings"
        listings_response = session.get(listings_url, timeout=60)
        listings_response.raise_for_status()
        listings = listings_response.json().get("listings", [])
        listing_states = []
        for listing in listings:
            locale = listing["language"]
            locale_url = f"{listings_url}/{quote(locale, safe='')}"
            image_counts = {}
            for image_type in ("icon", "featureGraphic", "phoneScreenshots"):
                image_url = f"{locale_url}/{image_type}"
                image_response = session.get(image_url, timeout=60)
                image_response.raise_for_status()
                image_counts[image_type] = len(
                    image_response.json().get("images", [])
                )
            listing_states.append(
                {
                    "language": locale,
                    "title": listing.get("title"),
                    "shortDescriptionCharacters": len(
                        listing.get("shortDescription", "")
                    ),
                    "fullDescriptionCharacters": len(
                        listing.get("fullDescription", "")
                    ),
                    "imageCounts": image_counts,
                }
            )

        details_url = f"{edit_url}/{quote(edit_id, safe='')}/details"
        details_response = session.get(details_url, timeout=60)
        details_response.raise_for_status()
        details = details_response.json()

        availability_response = session.get(availability_url, timeout=60)
        availability_response.raise_for_status()
        if availability_response.text.strip():
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
        else:
            production_availability = {
                "status": "unavailable",
                "httpStatus": availability_response.status_code,
                "reason": "Google Play returned an empty response",
            }
        print(f"Track releases: {json.dumps(track_states, sort_keys=True)}")
        print(f"Available tracks: {json.dumps(available_tracks, sort_keys=True)}")
        print(
            "Production availability: "
            + json.dumps(production_availability, sort_keys=True)
        )
        print(
            "App details: "
            + json.dumps(
                {
                    key: details.get(key)
                    for key in (
                        "defaultLanguage",
                        "contactEmail",
                        "contactPhone",
                        "contactWebsite",
                    )
                },
                sort_keys=True,
            )
        )
        print(
            "Store listings: " + json.dumps(listing_states, sort_keys=True)
        )
        return
    elif publishing_closed_test:
        if PACKAGE_NAME != "ph.drpays.merchant.public":
            raise RuntimeError("Closed-test setup is only enabled for the public app")

        internal_track_url = (
            f"{edit_url}/{quote(edit_id, safe='')}/tracks/internal"
        )
        internal_response = session.get(internal_track_url, timeout=60)
        internal_response.raise_for_status()
        completed_releases = [
            release
            for release in internal_response.json().get("releases", [])
            if release.get("status") == "completed"
            and release.get("versionCodes")
        ]
        if not completed_releases:
            raise RuntimeError("The public app has no completed internal release")
        release = max(
            completed_releases,
            key=lambda item: max(int(code) for code in item["versionCodes"]),
        )
        version_code = max(release["versionCodes"], key=int)
        version_name = release.get("name") or version_code
        closed_track = "alpha"
        closed_track_url = (
            f"{edit_url}/{quote(edit_id, safe='')}/tracks/"
            f"{quote(closed_track, safe='')}"
        )
        existing_track_response = session.get(closed_track_url, timeout=60)
        if existing_track_response.status_code == 200:
            existing_releases = existing_track_response.json().get("releases", [])
            if any(
                version_code in existing.get("versionCodes", [])
                for existing in existing_releases
            ):
                print(
                    f"Public app version {version_name} is already on "
                    f"the {closed_track} track."
                )
                return
            if existing_releases:
                raise RuntimeError(
                    f"The {closed_track} track already contains a different release; "
                    "refusing to replace it."
                )
        elif existing_track_response.status_code != 404:
            existing_track_response.raise_for_status()

        publish_track_release(
            session,
            edit_url,
            edit_id,
            closed_track,
            version_name,
            version_code,
        )
        print(
            f"Published public app version {version_name} ({version_code}) "
            "to the alpha closed-testing track."
        )
        return
    elif updating_listing:
        publish_store_listing(
            session, edit_url, edit_id, localized_listings
        )
        print(
            "Updated Google Play store listings for "
            + ", ".join(
                listing["language"] for listing, _, _, _ in localized_listings
            )
            + "."
        )
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
