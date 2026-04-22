"""Deploy static site to GitHub: branch main, folder /docs, legacy Pages (no Actions)."""
import base64
import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

REPO = "ksilent1337-lgtm/subtrack-secure"
BRANCH = "main"
HERE = Path(__file__).resolve().parent.parent
SRC = HERE / "pages-dist"
FILES = ["index.html", "styles.css", "app.js", "firebase-config.js"]


def run_gh(*args, input_data=None):
    cmd = ["gh", "api", *args]
    p = subprocess.run(
        cmd,
        input=input_data,
        text=True,
        capture_output=True,
    )
    if p.returncode != 0:
        print(p.stderr, file=sys.stderr)
        raise SystemExit(p.returncode)
    return p.stdout


def _enc_path(relpath: str) -> str:
    return urllib.parse.quote(relpath, safe="")


def get_file_sha(relpath: str):
    enc = _enc_path(relpath)
    r = subprocess.run(
        [
            "gh",
            "api",
            "-H",
            "Accept: application/vnd.github+json",
            f"repos/{REPO}/contents/{enc}",
            "-f",
            f"ref={BRANCH}",
        ],
        text=True,
        capture_output=True,
    )
    if r.returncode != 0:
        return None
    data = json.loads(r.stdout)
    return data.get("sha")


def put_file(relpath: str, data: bytes):
    b64 = base64.b64encode(data).decode("ascii")
    body = {
        "message": f"Pages: update {relpath}",
        "content": b64,
        "branch": BRANCH,
    }
    sha = get_file_sha(relpath)
    if sha:
        body["sha"] = sha
    enc = _enc_path(relpath)
    run_gh(
        "-X",
        "PUT",
        f"repos/{REPO}/contents/{enc}",
        "-H",
        "Accept: application/vnd.github+json",
        "--input",
        "-",
        input_data=json.dumps(body),
    )
    print("OK", relpath, len(data), "bytes")


def set_pages_legacy_docs():
    body = {
        "build_type": "legacy",
        "source": {"branch": BRANCH, "path": "/docs"},
    }
    run_gh(
        "-X",
        "PUT",
        f"repos/{REPO}/pages",
        "-H",
        "Accept: application/vnd.github+json",
        "--input",
        "-",
        input_data=json.dumps(body),
    )
    print("OK Pages: legacy, main, /docs")


def main():
    for name in FILES:
        p = SRC / name
        if not p.is_file():
            print("Missing", p, file=sys.stderr)
            return 1
        put_file(f"docs/{name}", p.read_bytes())
    set_pages_legacy_docs()
    print("Done. Site (after 1-2 min): https://ksilent1337-lgtm.github.io/subtrack-secure/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
