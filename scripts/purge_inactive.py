import sqlite3

def purge():
    conn = sqlite3.connect('backend/interflu_inventory.db')
    c = conn.cursor()

    to_delete = ('PB-INOX-02', 'PB-INOX-03', 'PB-INOX-04', 'PB-INOX-05', 'PB-INOX-06', 'PB-CHID-A06', 'PB-CHID-B06')

    # Delete shelf_assignments
    c.execute(f"DELETE FROM shelf_assignments WHERE shelf_id IN (SELECT id FROM shelves WHERE code IN {to_delete})")
    print(f"Deleted {c.rowcount} shelf_assignments for {to_delete}")

    # Delete shelves
    c.execute(f"DELETE FROM shelves WHERE code IN {to_delete}")
    print(f"Deleted {c.rowcount} shelves for {to_delete}")

    # Also delete any other active = 0 shelves just in case
    c.execute("DELETE FROM shelf_assignments WHERE shelf_id IN (SELECT id FROM shelves WHERE active = 0)")
    print(f"Deleted {c.rowcount} shelf_assignments for active=0")
    c.execute("DELETE FROM shelves WHERE active = 0")
    print(f"Deleted {c.rowcount} shelves for active=0")

    conn.commit()

    print("\n--- Remaining PB-INOX shelves ---")
    c.execute("SELECT id, code, zone, posx, posy, active FROM shelves WHERE code LIKE 'PB-INOX%'")
    for r in c.fetchall():
        print(r)

    print("\n--- Remaining East Wall PB-CHID-W shelves (Should be EXACTLY 5) ---")
    c.execute("SELECT id, code, zone, posx, posy, active FROM shelves WHERE code LIKE 'PB-CHID-W%' ORDER BY code")
    rows = c.fetchall()
    print(f"Count: {len(rows)}")
    for r in rows:
        print(r)

    conn.close()

if __name__ == '__main__':
    purge()
