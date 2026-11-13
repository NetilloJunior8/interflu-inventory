import sqlite3

def purge_planta1():
    conn = sqlite3.connect('backend/interflu_inventory.db')
    c = conn.cursor()

    # Find the dummy shelves
    c.execute("SELECT id, code, plant FROM shelves WHERE plant = 'Planta 1' OR plant = '1'")
    dummy_shelves = c.fetchall()
    dummy_ids = [r[0] for r in dummy_shelves]
    print(f"Found {len(dummy_shelves)} dummy shelves: {[r[1] for r in dummy_shelves]}")

    if dummy_ids:
        # Delete from shelf_assignments
        c.execute(f"DELETE FROM shelf_assignments WHERE shelf_id IN ({','.join(map(str, dummy_ids))})")
        print(f"Deleted {c.rowcount} shelf_assignments")

        # Delete from shelves
        c.execute(f"DELETE FROM shelves WHERE id IN ({','.join(map(str, dummy_ids))})")
        print(f"Deleted {c.rowcount} shelves")

    # In session 7 (pilot session), reset any ghost COMPLETADO on shelves that have 0 counted pieces
    # (keeps only real counts)
    c.execute("""
        UPDATE shelf_assignments 
        SET status = 'PENDIENTE' 
        WHERE status = 'COMPLETADO' 
        AND id NOT IN (
            SELECT DISTINCT sa.id 
            FROM shelf_assignments sa 
            JOIN count_records cr ON cr.shelf_id = sa.shelf_id AND cr.session_id = sa.session_id
        )
    """)
    print(f"Reset {c.rowcount} empty phantom COMPLETADO assignments to PENDIENTE")

    conn.commit()

    print("\n--- Remaining Shelves Count by Plant ---")
    c.execute("SELECT plant, COUNT(*) FROM shelves WHERE active = 1 GROUP BY plant")
    for r in c.fetchall():
        print(r)

    print("\n--- Completed Shelf Assignments across all sessions ---")
    c.execute("""
        SELECT sa.session_id, s.plant, s.code, sa.status 
        FROM shelf_assignments sa 
        JOIN shelves s ON sa.shelf_id = s.id 
        WHERE sa.status = 'COMPLETADO'
    """)
    for r in c.fetchall():
        print(r)

    conn.close()

if __name__ == '__main__':
    purge_planta1()
