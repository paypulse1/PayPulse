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
    commit_response.raise_for_status()


def main() -> None:
    promoting_existing_release = len(sys.argv) == 3 and sys.argv[1] == "--promote-existing"
    if not promoting_existing_release and len(sys.argv) != 2:
        raise SystemExit(
            "Usage: publish_to_play.py <signed-app-bundle.aab>\n"
            "   or: publish_to_play.py --promote-existing android-prod-vMAJOR.MINOR.PATCH"
        )

    service_account_json = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise RuntimeError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured")

    if promoting_existing_release:
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

    if promoting_existing_release:
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
