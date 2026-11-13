import sqlite3

def run_migration():
    conn = sqlite3.connect('backend/interflu_inventory.db')
    c = conn.cursor()

    print("--- Current Shelves before migration ---")
    c.execute("SELECT code, zone, posx, posy, width, height, active FROM shelves WHERE code LIKE 'PB-CHID%' OR code LIKE 'PB-DIX%' OR code LIKE 'PB-INOX%' ORDER BY code")
    for r in c.fetchall():
        print(r)

    # 1. Update Dixon in Vertical Column (Level 1)
    # Left bay: PB-DIX-01, Right bay: PB-DIX-02
    c.execute("UPDATE shelves SET posx = 1195.1, posy = 141.8, width = 25.0, height = 54.0, zone = 'Dixon', description = 'Dixon Bahía 1', active = 1 WHERE code = 'PB-DIX-01'")
    c.execute("UPDATE shelves SET posx = 1222.0, posy = 141.8, width = 25.0, height = 54.0, zone = 'Dixon', description = 'Dixon Bahía 2', active = 1 WHERE code = 'PB-DIX-02'")

    # 2. Update Conexiones Hidráulicas in Vertical Column (Levels 2 to 6)
    chid_vertical = [
        ('PB-CHID-A01', 1195.1, 201.4, 25.0, 54.0, 'Conexiones Hidráulicas A1'),
        ('PB-CHID-B01', 1222.0, 201.4, 25.0, 54.0, 'Conexiones Hidráulicas B1'),
        ('PB-CHID-A02', 1195.1, 261.1, 25.0, 54.0, 'Conexiones Hidráulicas A2'),
        ('PB-CHID-B02', 1222.0, 261.1, 25.0, 54.0, 'Conexiones Hidráulicas B2'),
        ('PB-CHID-A03', 1195.1, 320.4, 25.0, 54.0, 'Conexiones Hidráulicas A3'),
        ('PB-CHID-B03', 1222.0, 320.4, 25.0, 54.0, 'Conexiones Hidráulicas B3'),
        ('PB-CHID-A04', 1195.1, 380.1, 25.0, 54.0, 'Conexiones Hidráulicas A4'),
        ('PB-CHID-B04', 1222.0, 380.1, 25.0, 54.0, 'Conexiones Hidráulicas B4'),
        ('PB-CHID-A05', 1195.1, 440.1, 25.0, 54.0, 'Conexiones Hidráulicas A5'),
        ('PB-CHID-B05', 1222.0, 440.1, 25.0, 54.0, 'Conexiones Hidráulicas B5'),
    ]
    for code, x, y, w, h, desc in chid_vertical:
        c.execute("""
            UPDATE shelves 
            SET posx = ?, posy = ?, width = ?, height = ?, zone = 'Conexiones Hidráulicas', description = ?, active = 1 
            WHERE code = ?
        """, (x, y, w, h, desc, code))

    # Deactivate PB-CHID-A06 and PB-CHID-B06 if present (column has 6 levels: 1 Dixon + 5 CHID)
    c.execute("UPDATE shelves SET active = 0 WHERE code IN ('PB-CHID-A06', 'PB-CHID-B06')")

    # 3. Parker Inox - Horizontal Rack at North Wall
    # PB-INOX-01 is against the top wall next to Tuberías and before Basura
    c.execute("""
        UPDATE shelves 
        SET posx = 1258.0, posy = 96.0, width = 68.0, height = 42.0, zone = 'Parker Inox', description = 'Parker Inox - Muro Norte', active = 1 
        WHERE code = 'PB-INOX-01'
    """)

    # Deactivate PB-INOX-02..06 because Slanted East Wall is Conexiones Hidráulicas!
    c.execute("UPDATE shelves SET active = 0 WHERE code IN ('PB-INOX-02', 'PB-INOX-03', 'PB-INOX-04', 'PB-INOX-05', 'PB-INOX-06')")

    # 4. Insert or Update Conexiones Hidráulicas Muro Este (PB-CHID-W01 to PB-CHID-W05)
    chid_wall = [
        ('PB-CHID-W01', 1308.0, 175.0, 54.0, 60.0, 'Conex. Hidráulicas Muro Este 1'),
        ('PB-CHID-W02', 1299.0, 242.0, 54.0, 60.0, 'Conex. Hidráulicas Muro Este 2'),
        ('PB-CHID-W03', 1290.0, 309.0, 54.0, 60.0, 'Conex. Hidráulicas Muro Este 3'),
        ('PB-CHID-W04', 1281.0, 376.0, 54.0, 60.0, 'Conex. Hidráulicas Muro Este 4'),
        ('PB-CHID-W05', 1272.0, 443.0, 54.0, 60.0, 'Conex. Hidráulicas Muro Este 5'),
    ]

    c.execute("SELECT id FROM inventory_sessions")
    session_ids = [row[0] for row in c.fetchall()]

    for code, x, y, w, h, desc in chid_wall:
        c.execute("SELECT id FROM shelves WHERE code = ?", (code,))
        row = c.fetchone()
        if not row:
            c.execute("""
                INSERT INTO shelves (code, zone, description, warehouse_code, plant, posx, posy, width, height, active)
                VALUES (?, 'Conexiones Hidráulicas', ?, '1', 'Planta Baja', ?, ?, ?, ?, 1)
            """, (code, desc, x, y, w, h))
            shelf_id = c.lastrowid
            print(f"Inserted new shelf {code} with id {shelf_id}")
            for sid in session_ids:
                c.execute("INSERT OR IGNORE INTO shelf_assignments (session_id, shelf_id, status) VALUES (?, ?, 'PENDIENTE')", (sid, shelf_id))
        else:
            c.execute("""
                UPDATE shelves 
                SET posx = ?, posy = ?, width = ?, height = ?, zone = 'Conexiones Hidráulicas', description = ?, active = 1 
                WHERE code = ?
            """, (x, y, w, h, desc, code))
            shelf_id = row[0]
            for sid in session_ids:
                c.execute("INSERT OR IGNORE INTO shelf_assignments (session_id, shelf_id, status) VALUES (?, ?, 'PENDIENTE')", (sid, shelf_id))
            print(f"Updated shelf {code}")

    conn.commit()

    print("\n--- Shelves after migration ---")
    c.execute("SELECT code, zone, posx, posy, width, height, active FROM shelves WHERE code LIKE 'PB-CHID%' OR code LIKE 'PB-DIX%' OR code LIKE 'PB-INOX%' ORDER BY code")
    for r in c.fetchall():
        print(r)

    conn.close()

if __name__ == '__main__':
    run_migration()
