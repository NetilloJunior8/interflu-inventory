import urllib.request
import json
import io
import openpyxl

BASE_URL = "http://localhost:8080/api"

def get_auth_token():
    login_data = json.dumps({"username": "sistemas", "password": "admin8888"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        return data.get('token')

def test_excel_and_stats():
    token = get_auth_token()
    assert token, "Token acquisition failed"
    headers = {
        'Authorization': f"Bearer {token}",
        'Content-Type': 'application/json'
    }

    print("=== 1. Checking Session Statistics Breakdown ===")
    req_sess = urllib.request.Request(f"{BASE_URL}/sessions", headers=headers)
    with urllib.request.urlopen(req_sess) as resp:
        sessions = json.loads(resp.read().decode('utf-8'))
    
    assert len(sessions) == 1, f"Expected 1 session, found {len(sessions)}"
    s = sessions[0]
    print(f"Session: {s.get('folio')} - {s.get('title')}")
    print(f"Total Shelves: {s.get('totalShelves')} | Completed: {s.get('completedShelves')}")
    print(f"PB Total: {s.get('pbTotal')} | PB Completed: {s.get('pbCompleted')} | PB Percent: {s.get('pbPercent')}%")
    print(f"PA Total: {s.get('paTotal')} | PA Completed: {s.get('paCompleted')} | PA Percent: {s.get('paPercent')}%")

    assert s.get('totalShelves') == 171, f"Expected 171 total shelves, got {s.get('totalShelves')}"
    assert s.get('pbTotal') == 87, f"Expected 87 PB shelves, got {s.get('pbTotal')}"
    assert s.get('paTotal') == 84, f"Expected 84 PA shelves, got {s.get('paTotal')}"
    assert s.get('completedShelves') == 0, f"Expected 0 completed, got {s.get('completedShelves')}"
    print("PASS: Statistics breakdown verified successfully!")

    print("\n=== 2. Testing Excel (.xlsx) Existencia Física Export ===")
    sess_id = s.get('id')
    export_url = f"{BASE_URL}/export/sae/{sess_id}?format=EXCEL&layout=EXISTENCIA_FISICA"
    req_exp = urllib.request.Request(export_url, headers=headers)
    with urllib.request.urlopen(req_exp) as resp:
        assert resp.status == 200, f"HTTP status: {resp.status}"
        ctype = resp.headers.get('Content-Type')
        print(f"Content-Type: {ctype}")
        assert "spreadsheetml" in ctype or "sheet" in ctype
        cdisp = resp.headers.get('Content-Disposition')
        print(f"Content-Disposition: {cdisp}")
        assert "EXISTENCIA_FISICA" in cdisp and ".xlsx" in cdisp
        excel_bytes = resp.read()

    print(f"Received Excel file size: {len(excel_bytes)} bytes")
    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes))
    print(f"Sheet names: {wb.sheetnames}")
    assert "Existencia Física" in wb.sheetnames
    assert "Detalle por Anaquel" in wb.sheetnames

    ws1 = wb["Existencia Física"]
    headers1 = [ws1.cell(row=1, column=c).value for c in range(1, 6)]
    print(f"Sheet 1 Headers: {headers1}")
    expected_headers1 = ['ESTATUS', 'TIPO DE ELEMENTO', 'CLAVE', 'CLAVE ESQ', 'EXISTENCIA FÍSICA']
    assert headers1 == expected_headers1, f"Expected {expected_headers1}, got {headers1}"

    # Check cell colors
    c_status = ws1.cell(row=1, column=1)
    c_clave = ws1.cell(row=1, column=3)
    c_existencia = ws1.cell(row=1, column=5)
    print(f"Col 1 (ESTATUS) fill: {c_status.fill.fill_type}, color: {c_status.fill.fgColor.rgb}")
    print(f"Col 3 (CLAVE) fill: {c_clave.fill.fill_type}, color: {c_clave.fill.fgColor.rgb}")
    print(f"Col 5 (EXISTENCIA FÍSICA) fill: {c_existencia.fill.fill_type}, color: {c_existencia.fill.fgColor.rgb}")

    assert c_clave.fill.fill_type == "solid"
    assert c_existencia.fill.fill_type == "solid"
    print("PASS: Excel (.xlsx) generated with colored headers and exact 'Existencia Física' format!")

    ws2 = wb["Detalle por Anaquel"]
    headers2 = [ws2.cell(row=1, column=c).value for c in range(1, 9)]
    print(f"Sheet 2 Headers: {headers2}")
    assert "CLAVE ARTÍCULO" in headers2 and "ANAQUEL" in headers2
    print("PASS: Detailed shelf audit sheet verified successfully!")

    print("\nALL AUTOMATED TESTS PASSED WITH 100% SUCCESS!")

if __name__ == '__main__':
    test_excel_and_stats()
