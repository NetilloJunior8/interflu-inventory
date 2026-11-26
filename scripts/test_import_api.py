import requests

BASE_URL = "http://localhost:8080"

# 1. Login
login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "sistemas", "password": "admin8888"})
print("Login status:", login_resp.status_code)
token = login_resp.json().get("token")
headers = {"Authorization": f"Bearer {token}"}

# 2. Clear session 1 counts to simulate empty session
clear_resp = requests.delete(f"{BASE_URL}/api/counts/session/1", headers=headers)
print("Clear session status:", clear_resp.status_code, clear_resp.text)

# 3. Check shelves before import
shelves_before = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
acero_before = [s for s in shelves_before if "ACE" in s["shelfCode"]]
print("Acero shelves before import with pieces > 0:", [s["shelfCode"] for s in acero_before if (s.get("totalPieces") or 0) > 0])

# 4. Import media_1795589154481_4e79d3d5.xlsx with targetShelfId = 16 (PB-ACE-01) as in frontend!
excel_path = r"C:\Users\ernes\.gemini\antigravity\brain\414f7d82-ca1a-40ce-87e7-48761bb7115d\.user_uploaded\media_1795589154481_4e79d3d5.xlsx"
with open(excel_path, "rb") as f:
    files = {"file": ("aceros-re conteo.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"sessionId": 1, "shelfId": 16, "mode": "SMART_MERGE", "filterObsolete": "true"}
    import_resp = requests.post(f"{BASE_URL}/api/counts/import-excel", headers=headers, files=files, data=data)

print("Import status:", import_resp.status_code)
print("Import result:", import_resp.text)

# 5. Check shelves after import
shelves_after = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
acero_after = [s for s in shelves_after if "ACE" in s["shelfCode"]]
print("Acero shelves after import:")
for s in sorted(acero_after, key=lambda x: x["shelfCode"]):
    print(f"  {s['shelfCode']}: status={s['status']}, pieces={s.get('totalPieces')}, records={s.get('recordCount')}")

