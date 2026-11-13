import sqlite3

def run_migration():
    conn = sqlite3.connect('backend/interflu_inventory.db')
    c = conn.cursor()

    # 1. Update PB-ACE-01 to 10
    c.execute("UPDATE shelves SET posx = 810.0, posy = 104.0, width = 95.4, height = 34.0, description = 'Acero 1 - Fondo Pasillo' WHERE code = 'PB-ACE-01'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 144.0, width = 25.0, height = 54.0, description = 'Pasillo Acero 2' WHERE code = 'PB-ACE-02'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 203.4, width = 25.0, height = 54.0, description = 'Pasillo Acero 3' WHERE code = 'PB-ACE-03'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 263.1, width = 25.0, height = 54.0, description = 'Pasillo Acero 4' WHERE code = 'PB-ACE-04'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 321.8, width = 25.0, height = 54.0, description = 'Pasillo Acero 5' WHERE code = 'PB-ACE-05'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 381.3, width = 25.0, height = 54.0, description = 'Pasillo Acero 6' WHERE code = 'PB-ACE-06'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 440.2, width = 25.0, height = 54.0, description = 'Pasillo Acero 7' WHERE code = 'PB-ACE-07'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 499.5, width = 25.0, height = 54.0, description = 'Pasillo Acero 8' WHERE code = 'PB-ACE-08'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 558.9, width = 25.0, height = 54.0, description = 'Pasillo Acero 9' WHERE code = 'PB-ACE-09'")
    c.execute("UPDATE shelves SET posx = 810.0, posy = 618.3, width = 25.0, height = 54.0, description = 'Pasillo Acero 10' WHERE code = 'PB-ACE-10'")

    # 2. Update PB-ACE-11 to 18
    c.execute("UPDATE shelves SET posx = 880.4, posy = 618.3, width = 25.0, height = 54.0, description = 'Pasillo Acero 11' WHERE code = 'PB-ACE-11'")
    c.execute("UPDATE shelves SET posx = 880.4, posy = 558.9, width = 25.0, height = 54.0, description = 'Pasillo Acero 12' WHERE code = 'PB-ACE-12'")
    c.execute("UPDATE shelves SET posx = 880.4, posy = 499.5, width = 25.0, height = 54.0, description = 'Pasillo Acero 13' WHERE code = 'PB-ACE-13'")
    c.execute("UPDATE shelves SET posx = 880.4, posy = 440.2, width = 25.0, height = 54.0, description = 'Pasillo Acero 14' WHERE code = 'PB-ACE-14'")
    c.execute("UPDATE shelves SET posx = 880.4, posy = 381.3, width = 25.0, height = 54.0, description = 'Pasillo Acero 15' WHERE code = 'PB-ACE-15'")
    c.execute("UPDATE shelves SET posx = 880.4, posy = 321.3, width = 25.0, height = 54.0, description = 'Pasillo Acero 16' WHERE code = 'PB-ACE-16'")
    c.execute("UPDATE shelves SET posx = 880.4, posy = 261.6, width = 25.0, height = 54.0, description = 'Pasillo Acero 17' WHERE code = 'PB-ACE-17'")
    c.execute("UPDATE shelves SET posx = 880.4, posy = 203.4, width = 25.0, height = 54.0, description = 'Pasillo Acero 18' WHERE code = 'PB-ACE-18'")

    # 3. Insert or update PB-ACE-19
    c.execute("SELECT id FROM shelves WHERE code = 'PB-ACE-19'")
    row = c.fetchone()
    if not row:
        c.execute("""
            INSERT INTO shelves (code, zone, description, warehouse_code, plant, posx, posy, width, height, active)
            VALUES ('PB-ACE-19', 'Acero', 'Pasillo Acero 19', '1', 'Planta Baja', 880.4, 144.0, 25.0, 54.0, 1)
        """)
        shelf_id = c.lastrowid
        print('Inserted PB-ACE-19 with id:', shelf_id)
        c.execute("SELECT id FROM inventory_sessions")
        sessions = c.fetchall()
        for s in sessions:
            c.execute("INSERT INTO shelf_assignments (session_id, shelf_id, status) VALUES (?, ?, 'PENDIENTE')", (s[0], shelf_id))
    else:
        c.execute("UPDATE shelves SET posx = 880.4, posy = 144.0, width = 25.0, height = 54.0, description = 'Pasillo Acero 19' WHERE code = 'PB-ACE-19'")
        print('Updated PB-ACE-19')

    # 4. Slanted East Wall Shelves: PB-INOX-01..06
    inox_coords = [
        ('PB-INOX-01', 1317.0, 110.0),
        ('PB-INOX-02', 1309.0, 170.0),
        ('PB-INOX-03', 1301.0, 230.0),
        ('PB-INOX-04', 1292.0, 290.0),
        ('PB-INOX-05', 1284.0, 350.0),
        ('PB-INOX-06', 1276.0, 410.0),
    ]
    for code, x, y in inox_coords:
        c.execute("UPDATE shelves SET posx = ?, posy = ?, width = 54.0, height = 50.0 WHERE code = ?", (x, y, code))

    # 5. Slanted East Wall Shelves: PA-SEL-W-01..06
    sel_coords = [
        ('PA-SEL-W-01', 1317.0, 107.0),
        ('PA-SEL-W-02', 1309.0, 166.5),
        ('PA-SEL-W-03', 1301.0, 226.0),
        ('PA-SEL-W-04', 1292.0, 285.5),
        ('PA-SEL-W-05', 1284.0, 345.0),
        ('PA-SEL-W-06', 1276.0, 404.5),
    ]
    for code, x, y in sel_coords:
        c.execute("UPDATE shelves SET posx = ?, posy = ?, width = 54.0, height = 52.0 WHERE code = ?", (x, y, code))

    # 6. PB-DIX-01 inside warehouse
    c.execute("UPDATE shelves SET posx = 1195.1, posy = 105.0, width = 52.0, height = 48.0 WHERE code = 'PB-DIX-01'")

    conn.commit()
    conn.close()
    print('DB migration complete!')

if __name__ == '__main__':
    run_migration()
