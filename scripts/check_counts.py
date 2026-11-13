import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

c.execute("""
    SELECT cr.id, s.code 
    FROM count_records cr 
    JOIN shelves s ON cr.shelf_id = s.id 
    WHERE s.code IN ('PB-INOX-02', 'PB-INOX-03', 'PB-INOX-04', 'PB-INOX-05', 'PB-INOX-06', 'PB-CHID-A06', 'PB-CHID-B06')
""")
print("Count records:", c.fetchall())
conn.close()
