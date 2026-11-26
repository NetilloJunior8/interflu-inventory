import openpyxl
import re

# Simulate Java resolveSheetHeaderShelf and resolveExplicitShelf
def test_excel_resolution():
    excel_path = r"C:\Users\ernes\.gemini\antigravity\brain\414f7d82-ca1a-40ce-87e7-48761bb7115d\.user_uploaded\media_1795589154481_4e79d3d5.xlsx"
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    
    print("Workbook sheets:", wb.sheetnames)
    
    # Simulate shelfCache with canonical shelves PB-ACE-01..19
    shelfCache = {f"PB-ACE-{i:02d}": f"PB-ACE-{i:02d}" for i in range(1, 20)}
    
    # What if shelfCache also has phantom PB3-01?
    shelfCache["PB3-01"] = "PB3-01"
    
    # Check each sheet and its rows
    for sName in wb.sheetnames:
        if sName == 'Hoja1': 
            continue
        ws = wb[sName]
        rows = list(ws.iter_rows(values_only=True))
        if not rows: continue
        
        # Check sheet resolution
        # Java regex: ^(?:(?:ANAQUEL|ESTANTE)\s*)?(\d{1,2})$
        mNum = re.match(r"^(?:(?:ANAQUEL|ESTANTE)\s*)?(\d{1,2})$", sName.strip(), re.IGNORECASE)
        sheet_shelf = None
        if mNum:
            num = int(mNum.group(1))
            sheet_shelf = shelfCache.get(f"PB-ACE-{num:02d}")
        
        print(f"\n--- Sheet '{sName}': resolved to {sheet_shelf} ---")
        
        # Check first 3 rows
        header = None
        for r_idx, r in enumerate(rows[:5]):
            if any(isinstance(c, str) and 'CLAVE' in c.upper() for c in r if c):
                header = [str(c).strip().upper() if c else '' for c in r]
                print(f"  Header found at row {r_idx}: {header}")
                break
        
        if header:
            code_col = next(i for i, c in enumerate(header) if 'CLAVE' in c)
            shelf_col = next((i for i, c in enumerate(header) if 'ESTANTE' in c or 'ANAQUEL' in c), None)
            loc_col = next((i for i, c in enumerate(header) if 'UBICAC' in c), None)
            qty_col = next((i for i, c in enumerate(header) if 'EXIST' in c or 'FÍSICA' in c or 'FISICA' in c), None)
            print(f"  Cols: code={code_col}, shelf={shelf_col}, loc={loc_col}, qty={qty_col}")
            
            for row in rows[1:4]:
                if not row or not row[code_col]: continue
                code = str(row[code_col]).strip()
                s_val = str(row[shelf_col]).strip() if shelf_col is not None and len(row) > shelf_col and row[shelf_col] is not None else None
                l_val = str(row[loc_col]).strip() if loc_col is not None and len(row) > loc_col and row[loc_col] is not None else None
                print(f"    Item: code={code}, shelf_col_val={s_val}, loc_col_val={l_val}")

test_excel_resolution()
