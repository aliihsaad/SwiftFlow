#!/usr/bin/env python3
"""
Security Testing Script: User Registration & Auth Token Acquisition
Target: http://host.docker.internal:3000
Auth mechanism: Supabase (direct JS SDK on client; Supabase REST on server)
Uses only Python stdlib (no requests dependency).
"""

import json
import re
import time
import uuid
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from http.cookiejar import CookieJar

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL        = "http://host.docker.internal:3000"
SUPABASE_URL    = "https://txomrdymcawauezlprvn.supabase.co"
SUPABASE_ANON   = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMTA0MjgsImV4cCI6MjA4MzY4NjQyOH0"
    ".dwBcXZ_TZG97GCCvPPtfKETbxnm4jNFSF1K1FwFut0E"
)
TIMEOUT         = 10
MAX_RETRIES     = 1
TEST_EMAIL      = f"sectest_{uuid.uuid4().hex[:8]}@example.com"
TEST_PASSWORD   = "SecTest@2026!X"   # meets policy: 10+ chars, upper, lower, digit, symbol

divider = "=" * 70

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(title, status=None, body=None, cookies=None, resp_headers=None):
    print(f"\n{divider}")
    print(f"  {title}")
    print(divider)
    if status is not None:
        print(f"  HTTP Status : {status}")
    if cookies:
        print(f"  Cookies     : {json.dumps(cookies, indent=4)}")
    if resp_headers:
        interesting = {k: v for k, v in resp_headers.items()
                       if k.lower() in ('set-cookie','content-type','location','x-supabase-api-version')}
        if interesting:
            print(f"  Headers     : {json.dumps(interesting, indent=4)}")
    if body is not None:
        if isinstance(body, (dict, list)):
            print(f"  Body        :\n{json.dumps(body, indent=4)}")
        else:
            snippet = str(body)[:2000]
            print(f"  Body (raw)  : {snippet}")


def _do_request(method, url, payload=None, headers=None):
    """Perform an HTTP request using urllib; returns (status, body_str, cookies_dict, headers_dict)."""
    headers = headers or {}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            status = resp.status
            hdrs = dict(resp.headers)
            # Parse cookies from Set-Cookie headers
            raw_cookies = resp.headers.get_all("Set-Cookie") or []
            cookies = {}
            for c in raw_cookies:
                part = c.split(";")[0].strip()
                if "=" in part:
                    k, v = part.split("=", 1)
                    cookies[k.strip()] = v.strip()
            return status, body, cookies, hdrs
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        hdrs = dict(e.headers)
        raw_cookies = e.headers.get_all("Set-Cookie") or []
        cookies = {}
        for c in raw_cookies:
            part = c.split(";")[0].strip()
            if "=" in part:
                k, v = part.split("=", 1)
                cookies[k.strip()] = v.strip()
        return e.code, body, cookies, hdrs
    except Exception as exc:
        return None, str(exc), {}, {}


def http_get(url, headers=None):
    for attempt in range(MAX_RETRIES + 1):
        status, body, cookies, hdrs = _do_request("GET", url, headers=headers)
        if status is not None:
            return status, body, cookies, hdrs
        if attempt < MAX_RETRIES:
            print(f"  [retry] GET {url}")
            time.sleep(1)
    return None, body, {}, {}


def http_post(url, payload=None, headers=None):
    for attempt in range(MAX_RETRIES + 1):
        status, body, cookies, hdrs = _do_request("POST", url, payload=payload, headers=headers)
        if status is not None:
            return status, body, cookies, hdrs
        if attempt < MAX_RETRIES:
            print(f"  [retry] POST {url}")
            time.sleep(1)
    return None, body, {}, {}


def try_json(body):
    try:
        return json.loads(body)
    except Exception:
        return body[:500] if isinstance(body, str) else body


# ── Results accumulator ───────────────────────────────────────────────────────
results = {
    "timestamp":       datetime.utcnow().isoformat() + "Z",
    "test_email":      TEST_EMAIL,
    "access_token":    None,
    "refresh_token":   None,
    "user_id":         None,
    "workspace_id":    None,
    "session_cookies": {},
    "supabase_session": None,
}

supabase_headers = {
    "apikey":          SUPABASE_ANON,
    "Authorization":   f"Bearer {SUPABASE_ANON}",
    "Content-Type":    "application/json",
}

print(f"\n{'#'*70}")
print("  AUTH REGISTRATION & SESSION CAPTURE – Security Test")
print(f"  Started : {results['timestamp']}")
print(f"  Email   : {TEST_EMAIL}")
print(f"{'#'*70}")


# ── 1. App reachability ───────────────────────────────────────────────────────
print(f"\n[1] GET {BASE_URL}  (app reachability)")
status, body, cookies, hdrs = http_get(BASE_URL)
log("GET / – App root", status, body[:500] if isinstance(body, str) else body, cookies, hdrs)


# ── 2. Login page HTML ────────────────────────────────────────────────────────
print(f"\n[2] GET {BASE_URL}/login  (login page HTML)")
status, body, cookies, hdrs = http_get(BASE_URL + "/login")
sb_hints = re.findall(r'(supabase|SUPABASE_URL|anon.*key)[^\'"]{0,80}', body or "", re.I)
log("GET /login – Login page",
    status,
    {"html_length": len(body or ""), "supabase_hints": sb_hints[:5]},
    cookies, hdrs)


# ── 3. App /api/auth/signup probe ─────────────────────────────────────────────
print(f"\n[3] POST {BASE_URL}/api/auth/signup  (app signup probe)")
status, body, cookies, hdrs = http_post(
    BASE_URL + "/api/auth/signup",
    payload={"email": TEST_EMAIL, "password": TEST_PASSWORD},
)
log("POST /api/auth/signup – App signup probe", status, try_json(body), cookies, hdrs)


# ── 4. Workspaces API (unauthenticated) ───────────────────────────────────────
print(f"\n[4] GET {BASE_URL}/api/workspaces  (unauthenticated)")
status, body, cookies, hdrs = http_get(BASE_URL + "/api/workspaces")
log("GET /api/workspaces – Unauthenticated", status, try_json(body), cookies, hdrs)

print(f"\n[4b] GET {BASE_URL}/api/workspace/settings  (unauthenticated)")
status, body, cookies, hdrs = http_get(BASE_URL + "/api/workspace/settings")
log("GET /api/workspace/settings – Unauthenticated", status, try_json(body), cookies, hdrs)


# ── 5. Supabase signup ────────────────────────────────────────────────────────
print(f"\n[5] POST {SUPABASE_URL}/auth/v1/signup  (Supabase signup)")
status, body, cookies, hdrs = http_post(
    SUPABASE_URL + "/auth/v1/signup",
    payload={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    headers=supabase_headers,
)
data = try_json(body)
log("POST /auth/v1/signup – Supabase", status, data, cookies, hdrs)

if status in (200, 201) and isinstance(data, dict):
    results["user_id"]      = data.get("id") or (data.get("user") or {}).get("id")
    results["access_token"] = data.get("access_token")
    results["refresh_token"]= data.get("refresh_token")
    if data.get("access_token"):
        results["supabase_session"] = {
            "access_token":  data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "token_type":    data.get("token_type"),
            "expires_in":    data.get("expires_in"),
            "user":          data.get("user"),
        }
        print("\n  [SUCCESS] Supabase signup returned session tokens!")
    user_obj = data.get("user") or data
    if not results["user_id"]:
        results["user_id"] = user_obj.get("id")


# ── 6. If no session yet, try sign-in ─────────────────────────────────────────
if not results["access_token"]:
    print(f"\n[6] POST {SUPABASE_URL}/auth/v1/token?grant_type=password  (sign-in)")
    status, body, cookies, hdrs = http_post(
        SUPABASE_URL + "/auth/v1/token?grant_type=password",
        payload={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers=supabase_headers,
    )
    data = try_json(body)
    log("POST /auth/v1/token – Supabase sign-in", status, data, cookies, hdrs)

    if status == 200 and isinstance(data, dict) and data.get("access_token"):
        results["access_token"]  = data["access_token"]
        results["refresh_token"] = data.get("refresh_token")
        results["user_id"]       = (data.get("user") or {}).get("id")
        results["supabase_session"] = {
            "access_token":  data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "token_type":    data.get("token_type"),
            "expires_in":    data.get("expires_in"),
            "user":          data.get("user"),
        }
        print("\n  [SUCCESS] Got session via sign-in!")
else:
    print("\n[6] Skipped – already have access_token from signup")


# ── 7. Authenticated calls ────────────────────────────────────────────────────
if results["access_token"]:
    token = results["access_token"]
    auth_hdrs = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }
    sb_auth_hdrs = {**supabase_headers, "Authorization": f"Bearer {token}"}

    # 7a. Supabase REST workspaces
    print(f"\n[7a] GET {SUPABASE_URL}/rest/v1/workspaces  (Supabase REST, authenticated)")
    status, body, cookies, hdrs = http_get(
        SUPABASE_URL + "/rest/v1/workspaces?select=*",
        headers=sb_auth_hdrs,
    )
    data = try_json(body)
    log("GET /rest/v1/workspaces – Supabase REST (auth)", status, data, cookies, hdrs)
    if isinstance(data, list) and data:
        results["workspace_id"] = data[0].get("id")

    # 7b. App /api/workspaces (authenticated via Bearer)
    print(f"\n[7b] GET {BASE_URL}/api/workspaces  (app, authenticated)")
    status, body, cookies, hdrs = http_get(BASE_URL + "/api/workspaces", headers=auth_hdrs)
    data = try_json(body)
    log("GET /api/workspaces – App (auth)", status, data, cookies, hdrs)
    if isinstance(data, list) and data and not results["workspace_id"]:
        results["workspace_id"] = data[0].get("id")

    # 7c. Workspace settings (if we have a workspace ID)
    if results["workspace_id"]:
        wid = results["workspace_id"]
        print(f"\n[7c] GET {BASE_URL}/api/workspace/settings?workspaceId={wid}  (app, authenticated)")
        status, body, cookies, hdrs = http_get(
            f"{BASE_URL}/api/workspace/settings?workspaceId={wid}",
            headers=auth_hdrs,
        )
        data = try_json(body)
        log("GET /api/workspace/settings – App (auth)", status, data, cookies, hdrs)

    # 7d. Posts API
    print(f"\n[7d] GET {BASE_URL}/api/posts  (app, authenticated)")
    status, body, cookies, hdrs = http_get(BASE_URL + "/api/posts", headers=auth_hdrs)
    data = try_json(body)
    log("GET /api/posts – App (auth)", status, data, cookies, hdrs)

    # 7e. Supabase user object via /auth/v1/user
    print(f"\n[7e] GET {SUPABASE_URL}/auth/v1/user  (Supabase, authenticated)")
    status, body, cookies, hdrs = http_get(
        SUPABASE_URL + "/auth/v1/user",
        headers=sb_auth_hdrs,
    )
    data = try_json(body)
    log("GET /auth/v1/user – Supabase (auth)", status, data, cookies, hdrs)
    if isinstance(data, dict) and data.get("id") and not results["user_id"]:
        results["user_id"] = data["id"]

else:
    print("\n[7] SKIPPED – no access token available")


# ── 8. Summary ────────────────────────────────────────────────────────────────
print(f"\n{'#'*70}")
print("  FINAL RESULTS SUMMARY")
print(f"{'#'*70}")
summary = {
    "timestamp":        results["timestamp"],
    "test_email":       results["test_email"],
    "user_id":          results["user_id"],
    "workspace_id":     results["workspace_id"],
    "session_obtained": bool(results["access_token"]),
    "access_token":     (results["access_token"][:40] + "…") if results["access_token"] else None,
    "refresh_token":    (results["refresh_token"][:20] + "…") if results["refresh_token"] else None,
    "supabase_session": {
        k: ((v[:40] + "…") if isinstance(v, str) and len(v) > 40 else v)
        for k, v in (results["supabase_session"] or {}).items()
        if k != "user"
    } if results["supabase_session"] else None,
}
print(json.dumps(summary, indent=2))
print(f"\n{'#'*70}\n")
