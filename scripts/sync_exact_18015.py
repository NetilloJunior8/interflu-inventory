import openpyxl, sqlite3, datetime

f_new = r'C:\Users\ernes\.gemini\antigravity\brain\414f7d82-ca1a-40ce-87e7-48761bb7115d\.user_uploaded\media_1795589154481_4e79d3d5.xlsx'
wb = openpyxl.load_workbook(f_new, data_only=True)

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

c.execute('SELECT id, folio FROM inventory_sessions WHERE id = 1')
session = c.fetchone()
print('Session:', session)

# Check user
c.execute('SELECT id FROM users LIMIT 1')
user_id = c.fetchone()[0]

# Check shelves
c.execute('SELECT code, id FROM shelves')
shelf_map = dict(c.fetchall())

sheet_to_shelf = {
    '1': 'PB-ACE-01', '2': 'PB-ACE-02', '3': 'PB-ACE-03', '4': 'PB-ACE-04',
    '5': 'PB-ACE-05', '6': 'PB-ACE-06', '7': 'PB-ACE-07', '8': 'PB-ACE-08',
    '9': 'PB-ACE-09', '10': 'PB-ACE-10', '11': 'PB-ACE-11', '15': 'PB-ACE-15',
    '16': 'PB-ACE-16', '17': 'PB-ACE-17', '18': 'PB-ACE-18', '19': 'PB-ACE-19'
}

# Delete all count records in session 1 for PB-ACE-01..19 to ensure clean exact sync of all 697 rows
ace_shelf_ids = [shelf_map[sc] for sc in sheet_to_shelf.values() if sc in shelf_map]
placeholders = ','.join('?' * len(ace_shelf_ids))
c.execute(f'DELETE FROM count_records WHERE session_id = 1 AND shelf_id IN ({placeholders})', ace_shelf_ids)
print(f'Deleted old records for {len(ace_shelf_ids)} shelves.')

# Get or create products
c.execute('SELECT code, id FROM products')
product_map = {row[0].upper(): row[1] for row in c.fetchall()}

inserted = 0
total_pieces = 0

now_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]

for sname, scode in sheet_to_shelf.items():
    sh = wb[sname]
    s_id = shelf_map[scode]
    
    h_row = 1
    for r in range(1, 4):
        v = str(sh.cell(r, 1).value or '').upper()
        if 'CLAVE' in v:
            h_row = r
            break
    
    qty_col = 8
    sec_col = 5
    loc_col = 7
    for c_idx in range(1, 9):
        val = str(sh.cell(h_row, c_idx).value or '').upper()
        if 'EXIST' in val: qty_col = c_idx
        elif 'NIVEL' in val: sec_col = c_idx
        elif 'UBIC' in val: loc_col = c_idx

    for r in range(h_row + 1, sh.max_row + 1):
        code_val = sh.cell(r, 1).value
        if not code_val or not str(code_val).strip() or str(code_val).strip().upper() in ['CLAVE', 'TOTAL', 'ESTATUS']:
            continue
        code = str(code_val).strip().upper()
        sec = sh.cell(r, sec_col).value
        sec = str(sec).strip().upper() if sec else None
        loc = sh.cell(r, loc_col).value
        loc = str(loc).strip() if loc else None
        qv = sh.cell(r, qty_col).value
        try:
            qty = float(qv) if qv is not None else 0.0
        except:
            qty = 0.0
        
        # product
        p_id = product_map.get(code)
        if not p_id:
            c.execute('INSERT INTO products (code, description, unit, family, last_known_shelf, stock_sae) VALUES (?, ?, ?, ?, ?, ?)',
                      (code, code, 'PZA', 'ACERO', scode, 0.0))
            p_id = c.lastrowid
            product_map[code] = p_id
        
        c.execute('''
            INSERT INTO count_records (captured_code, counted_at, notes, previous_quantity, quantity, updated_at, validation_status, version, product_id, session_id, shelf_id, user_id, section_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (code, now_str, loc, 0.0, qty, now_str, 'VALIDO', 0, p_id, 1, s_id, user_id, sec))
        inserted += 1
        total_pieces += qty

    # Update shelf assignment to COMPLETADO
    c.execute('SELECT id FROM shelf_assignments WHERE session_id = 1 AND shelf_id = ?', (s_id,))
    sa_row = c.fetchone()
    if sa_row:
        c.execute('UPDATE shelf_assignments SET status = ?, completed_at = ? WHERE id = ?',
                  ('COMPLETADO', now_str, sa_row[0]))
    else:
        c.execute('INSERT INTO shelf_assignments (completed_at, notes, priority, status, assigned_user_id, session_id, shelf_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  (now_str, None, 'MEDIA', 'COMPLETADO', user_id, 1, s_id))

conn.commit()

# Verify
c.execute('SELECT count(*), sum(quantity) FROM count_records WHERE session_id = 1')
res_total = c.fetchall()
print('Database count_records in session 1:', res_total)

c.execute('SELECT s.code, count(r.id), sum(r.quantity) FROM count_records r JOIN shelves s ON r.shelf_id = s.id WHERE r.session_id = 1 GROUP BY s.code ORDER BY s.code')
print('Counts per shelf in DB:')
for row in c.fetchall():
    print(row)

c.execute("SELECT count(*) FROM shelf_assignments WHERE session_id = 1 AND status = 'COMPLETADO'")
print('Completed shelf assignments:', c.fetchone()[0])

conn.close()
