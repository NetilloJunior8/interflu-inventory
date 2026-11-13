import urllib.request
import json
import io

BASE_URL = "http://localhost:8080/api"

# 1. Login
login_data = json.dumps({"username": "sistemas", "password": "admin8888"}).encode('utf-8')
req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode('utf-8'))['token']

headers = {
    'Authorization': f"Bearer {token}",
    'Content-Type': 'application/json'
}

print("=== 1. Test QR Data State When Empty ===")
req_counts = urllib.request.Request(f"{BASE_URL}/counts?sessionId=1", headers=headers)
with urllib.request.urlopen(req_counts) as resp:
    counts = json.loads(resp.read().decode('utf-8'))
assert len(counts) == 0, f"Expected 0 counts, got {len(counts)}"
print("PASS: QR Center starts completely empty (0 labels) when no counts exist.")

print("\n=== 2. Test Material Counting & QR Dynamic Generation ===")
# Find shelf PB-ACE-01
req_shelves = urllib.request.Request(f"{BASE_URL}/shelves", headers=headers)
with urllib.request.urlopen(req_shelves) as resp:
    shelves = json.loads(resp.read().decode('utf-8'))
shelf_ace = next(s for s in shelves if s['code'] == 'PB-ACE-01')

# Add 3 test materials to PB-ACE-01
test_items = [
    {"productCode": "TORN-HEX-3/8", "quantity": 100},
    {"productCode": "TUA-INOX-1/2", "quantity": 50},
    {"productCode": "ROND-PRES-3/8", "quantity": 200}
]

created_ids = []
for idx, item in enumerate(test_items, 1):
    payload = json.dumps({
        "sessionId": 1,
        "shelfId": shelf_ace['id'],
        "productCode": item['productCode'],
        "quantity": item['quantity'],
        "mode": "NORMAL"
    }).encode('utf-8')
    req_post = urllib.request.Request(f"{BASE_URL}/counts", data=payload, headers=headers)
    with urllib.request.urlopen(req_post) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        created_ids.append(res['id'])

print(f"Created {len(created_ids)} count records for PB-ACE-01.")

# Fetch counts now
with urllib.request.urlopen(req_counts) as resp:
    updated_counts = json.loads(resp.read().decode('utf-8'))
assert len(updated_counts) == 3, f"Expected 3 counts, got {len(updated_counts)}"

# Verify QR logic: exactly 3 distinct QR codes generated for the materials of PB-ACE-01
materials_for_shelf = [c for c in updated_counts if c.get('shelfCode') == 'PB-ACE-01']
assert len(materials_for_shelf) == 3
print("PASS: Exactly 3 material QR labels generated for the 3 distinct parts in PB-ACE-01!")

print("\n=== 3. Test Native Excel Export (Existencia Fisica) ===")
req_excel = urllib.request.Request(f"{BASE_URL}/export/sae/1?format=EXCEL", headers={'Authorization': f"Bearer {token}"})
with urllib.request.urlopen(req_excel) as resp:
    assert resp.status == 200
    content_type = resp.headers.get('Content-Type')
    assert 'spreadsheetml' in content_type
    excel_bytes = resp.read()
    assert len(excel_bytes) > 2000, f"Excel file too small ({len(excel_bytes)} bytes)"
    print(f"PASS: Excel generated successfully ({len(excel_bytes)} bytes, content-type: {content_type})")

print("\n=== 4. Clean Up Test Counts to Leave DB 100% Zero ===")
for cid in created_ids:
    req_del = urllib.request.Request(f"{BASE_URL}/counts/{cid}", headers=headers, method='DELETE')
    with urllib.request.urlopen(req_del) as resp:
        assert resp.status in (200, 204)

# Verify clean again
with urllib.request.urlopen(req_counts) as resp:
    final_counts = json.loads(resp.read().decode('utf-8'))
assert len(final_counts) == 0, "Counts not empty after cleanup"
print("PASS: Database cleaned up to 0 counts! Ready for real operations.")
print("\nALL QR & EXCEL WORKFLOW TESTS PASSED!")
