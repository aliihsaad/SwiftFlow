#!/usr/bin/env python3
"""
Security test script for AUTHZ-VULN-02:
Tests authorization controls on /api/cron/scheduler endpoint.
Authorized security testing against test environment.
"""

import requests
import json

BASE_URL = "http://host.docker.internal:3000"
ENDPOINT = "/api/cron/scheduler"
URL = BASE_URL + ENDPOINT

def print_separator(title):
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)

def log_response(resp):
    print(f"  Status Code  : {resp.status_code}")
    print(f"  Response Body: {resp.text[:500]!r}")
    print(f"  Headers      : {dict(resp.headers)}")

def run_test(label, method, url, headers=None, cookies=None, json_body=None):
    print_separator(label)
    print(f"  Method  : {method}")
    print(f"  URL     : {url}")
    print(f"  Headers : {headers}")
    print(f"  Cookies : {cookies}")
    print(f"  Body    : {json_body}")
    print()
    try:
        if method == "GET":
            resp = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        elif method == "POST":
            resp = requests.post(url, headers=headers, cookies=cookies, json=json_body, timeout=10)
        else:
            print(f"  [ERROR] Unknown method: {method}")
            return
        log_response(resp)
    except Exception as e:
        print(f"  [EXCEPTION] {e}")

# ── Test 1: GET with no authentication and no special headers ─────────────────
run_test(
    label="TEST 1 – GET /api/cron/scheduler (no auth, no special headers)",
    method="GET",
    url=URL,
    headers=None,
    cookies=None,
)

# ── Test 2: GET with x-vercel-cron: 1 (no auth cookies) ──────────────────────
run_test(
    label="TEST 2 – GET /api/cron/scheduler with x-vercel-cron: 1 (no auth cookies)",
    method="GET",
    url=URL,
    headers={"x-vercel-cron": "1"},
    cookies=None,
)

# ── Test 3: POST with x-vercel-cron: 1 (no auth cookies) ─────────────────────
run_test(
    label="TEST 3 – POST /api/cron/scheduler with x-vercel-cron: 1 (no auth cookies)",
    method="POST",
    url=URL,
    headers={"x-vercel-cron": "1"},
    cookies=None,
)

# ── Test 4a: POST with x-vercel-cron: 1 + Authorization: Bearer test ─────────
run_test(
    label="TEST 4a – POST /api/cron/scheduler with x-vercel-cron: 1 + Authorization: Bearer test",
    method="POST",
    url=URL,
    headers={"x-vercel-cron": "1", "Authorization": "Bearer test"},
    cookies=None,
)

# ── Test 4b: POST with x-vercel-cron: 1 + Authorization: Bearer invalid ──────
run_test(
    label="TEST 4b – POST /api/cron/scheduler with x-vercel-cron: 1 + Authorization: Bearer invalid",
    method="POST",
    url=URL,
    headers={"x-vercel-cron": "1", "Authorization": "Bearer invalid"},
    cookies=None,
)

# ── Test 4c: POST with x-vercel-cron: 1 + Authorization: (empty) ─────────────
run_test(
    label="TEST 4c – POST /api/cron/scheduler with x-vercel-cron: 1 + Authorization: (empty string)",
    method="POST",
    url=URL,
    headers={"x-vercel-cron": "1", "Authorization": ""},
    cookies=None,
)

# ── Test 4d: POST with x-vercel-cron: 1 + Authorization: Basic dXNlcjpwYXNz ──
run_test(
    label="TEST 4d – POST /api/cron/scheduler with x-vercel-cron: 1 + Authorization: Basic dXNlcjpwYXNz",
    method="POST",
    url=URL,
    headers={"x-vercel-cron": "1", "Authorization": "Basic dXNlcjpwYXNz"},
    cookies=None,
)

# ── Test 5: GET with x-vercel-cron: 1 + Authorization: Bearer test ────────────
run_test(
    label="TEST 5 – GET /api/cron/scheduler with x-vercel-cron: 1 + Authorization: Bearer test",
    method="GET",
    url=URL,
    headers={"x-vercel-cron": "1", "Authorization": "Bearer test"},
    cookies=None,
)

print("\n" + "=" * 70)
print("  All tests complete.")
print("=" * 70 + "\n")
