import sqlite3

db_path = 'backend/interflu_inventory.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

print("Purging test data...")

# 1. Delete all count records
c.execute("DELETE FROM count_records")
print(f"Deleted count_records: {c.rowcount}")

# 2. Delete all sae_export_logs
c.execute("DELETE FROM sae_export_logs")
print(f"Deleted sae_export_logs: {c.rowcount}")

# 3. Delete all support_tickets
c.execute("DELETE FROM support_tickets")
print(f"Deleted support_tickets: {c.rowcount}")

# 4. Delete all audit_logs
c.execute("DELETE FROM audit_logs")
print(f"Deleted audit_logs: {c.rowcount}")

# 5. Delete test user 'operador_prueba' if present
c.execute("DELETE FROM users WHERE username = 'operador_prueba'")
print(f"Deleted test users: {c.rowcount}")

# 6. Delete test sessions (id > 1) and their assignments
c.execute("DELETE FROM shelf_assignments WHERE session_id > 1")
print(f"Deleted shelf_assignments for test sessions: {c.rowcount}")

c.execute("DELETE FROM inventory_sessions WHERE id > 1")
print(f"Deleted test sessions: {c.rowcount}")

# 7. Reset session 1 (INV-2026-001) to completely clean state
c.execute("""
    UPDATE inventory_sessions 
    SET status = 'EN_CONTEO', 
        closed_at = NULL, 
        close_notes = NULL, 
        reopened_at = NULL, 
        reopen_reason = NULL,
        notes = 'Inventario general físico inicial. Todos los anaqueles listos para conteo.'
    WHERE id = 1
""")

# 8. Reset all shelf assignments in session 1 to PENDIENTE, unassigned, 0 counts
c.execute("""
    UPDATE shelf_assignments 
    SET status = 'PENDIENTE', 
        user_id = NULL, 
        completed_at = NULL 
    WHERE session_id = 1
""")
print(f"Reset assignments for session 1: {c.rowcount}")

# 9. Clean up any invalid shelves
c.execute("""
    DELETE FROM shelves 
    WHERE code IN ('PB-INOX-02', 'PB-INOX-03', 'PB-INOX-04', 'PB-INOX-05', 'PB-INOX-06', 
                   'PB-CHID-A06', 'PB-CHID-B06', 'PB-TUB-01', 'PB-MAN-01') 
       OR plant NOT IN ('Planta Baja', 'Planta Alta')
       OR active = 0
""")
print(f"Cleaned non-physical shelves: {c.rowcount}")

# 10. Check shelf counts
c.execute("SELECT plant, COUNT(*) FROM shelves WHERE active = 1 GROUP BY plant")
for r in c.fetchall():
    print(f"Shelves count in {r[0]}: {r[1]}")

c.execute("SELECT COUNT(*) FROM shelves WHERE active = 1")
total_shelves = c.fetchone()[0]
print(f"Total active shelves: {total_shelves}")

conn.commit()
conn.close()
print("Database purge complete!")
