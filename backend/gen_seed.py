# Generate Java List.of( ... )
code_lines = []

# Planta Baja
code_lines.append("            // === PLANTA BAJA (53 Anaqueles Reales) ===")
for i, y in enumerate([263.1, 321.8, 381.3, 440.2, 499.5, 558.9, 618.3], 1):
    code_lines.append(f'            new Shelf("PB-KUR-{i:02d}", "Kuriyama", "Sección Kuriyama {i}", "1", "Planta Baja", 686.6, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([144.0, 203.4, 263.1, 321.8, 381.3, 440.2, 499.5, 558.9, 618.3], 1):
    code_lines.append(f'            new Shelf("PB-PEN-{i:02d}", "Pendiente", "Bahía Pendiente {i}", "1", "Planta Baja", 783.3, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([144.0, 203.4, 261.6, 321.3, 381.3, 440.2, 499.5, 558.9, 618.3], 1):
    code_lines.append(f'            new Shelf("PB-ACE-{i:02d}", "Acero", "Pasillo Acero {i}", "1", "Planta Baja", 880.4, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([145.1, 204.8, 263.0, 321.7, 381.2, 440.1], 1):
    code_lines.append(f'            new Shelf("PB-YPC-{i:02d}", "YPC", "Estantería YPC {i}", "1", "Planta Baja", 1001.2, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([141.8, 201.4, 261.1, 320.4, 380.1, 440.1], 1):
    code_lines.append(f'            new Shelf("PB-CHID-{i:02d}", "Conexiones Hidráulicas", "Conexiones Hidráulicas {i}", "1", "Planta Baja", 1195.1, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([113.9, 180.6, 239.1, 297.7, 356.3, 414.9], 1):
    code_lines.append(f'            new Shelf("PB-INOX-{i:02d}", "Parker Inox", "Parker Inoxidable {i}", "1", "Planta Baja", 1300.0, {y:.1f}, 58.0, 54.0),')

for i, x in enumerate([500.3, 559.4, 619.0], 1):
    code_lines.append(f'            new Shelf("PB-CYB-{i:02d}", "Cybermatics", "Gabinete Cybermatics {i}", "1", "Planta Baja", {x:.1f}, 721.4, 54.0, 48.0),')

for i, x in enumerate([677.9, 737.5, 796.5], 1):
    code_lines.append(f'            new Shelf("PB-UNI-{i:02d}", "Universal", "Universal {i}", "1", "Planta Baja", {x:.1f}, 721.4, 54.0, 48.0),')

code_lines.append('            new Shelf("PB-DIX-01", "Dixon", "Dixon Bahía 1", "1", "Planta Baja", 1246.5, 109.5, 88.4, 49.5),')
code_lines.append('            new Shelf("PB-DIX-02", "Dixon", "Dixon Bahía 2", "1", "Planta Baja", 1209.7, 176.3, 54.0, 45.0),')
code_lines.append('            new Shelf("PB-TUB-01", "Tuberías", "Bahía Mayor Tuberías", "1", "Planta Baja", 1050.0, 120.0, 130.0, 360.0),')
code_lines.append('            new Shelf("PB-MAN-01", "Área Mangueras PB", "Área Mangueras Planta Baja", "1", "Planta Baja", 1001.2, 500.0, 185.0, 185.0),')

# Planta Alta
code_lines.append("            // === PLANTA ALTA (60 Anaqueles Reales) ===")
lat = [('PA-FNH-01', 'FNH', 'FNH Estante 1'), ('PA-HTM-01', 'HTM', 'HTM Estante 1'),
       ('PA-ABR-01', 'Abrazaderas', 'Abrazaderas Estante 1'), ('PA-ENP-01', 'ENPA', 'ENPA Estante 1'),
       ('PA-DOC-01', 'Documentos', 'Documentos Estante 1')]
for (code, zone, name), y in zip(lat, [195.1, 254.5, 313.6, 372.9, 432.0]):
    code_lines.append(f'            new Shelf("{code}", "{zone}", "{name}", "1", "Planta Alta", 260.0, {y:.1f}, 56.0, 54.0),')

for i, y in enumerate([101.4, 160.7, 219.6, 278.7, 338.1], 1):
    code_lines.append(f'            new Shelf("PA-PVC-{i:02d}", "PVC", "PVC Anaquel {i}", "1", "Planta Alta", 447.8, {y:.1f}, 54.0, 54.0),')

code_lines.append('            new Shelf("PA-RES-01", "Reserva Acero", "Reserva Acero Norte 1", "1", "Planta Alta", 374.2, 101.4, 68.0, 49.5),')
code_lines.append('            new Shelf("PA-RES-02", "Reserva Acero", "Reserva Acero Norte 2", "1", "Planta Alta", 511.8, 101.4, 68.0, 46.5),')
code_lines.append('            new Shelf("PA-RES-03", "Reserva Acero", "Reserva Acero Central", "1", "Planta Alta", 437.3, 400.4, 74.3, 46.5),')
code_lines.append('            new Shelf("PA-RES-04", "Reserva Acero", "Reserva Acero Este", "1", "Planta Alta", 532.1, 150.0, 50.0, 180.0),')

pa_col1 = [('PA-HCO-01', 'HCO Gen', 'HCO GEN 1'),
           ('PA-PHID-01', 'Parker Hidráulico', 'Parker Hidráulico 1'),
           ('PA-PHID-02', 'Parker Hidráulico', 'Parker Hidráulico 2'),
           ('PA-PHID-03', 'Parker Hidráulico', 'Parker Hidráulico 3'),
           ('PA-SIN-01', 'Sin Asignar', 'Sin Asignar A1'),
           ('PA-SIN-02', 'Sin Asignar', 'Sin Asignar A2')]
for (code, zone, name), y in zip(pa_col1, [101.4, 160.7, 219.6, 278.7, 338.1, 397.4]):
    code_lines.append(f'            new Shelf("{code}", "{zone}", "{name}", "1", "Planta Alta", 596.1, {y:.1f}, 54.0, 54.0),')

pa_col2 = [('PA-PNEU-01', 'Parker Neumático', 'Parker Neumático 1'),
           ('PA-PNEU-02', 'Parker Neumático', 'Parker Neumático 2'),
           ('PA-PNEU-03', 'Parker Neumático', 'Parker Neumático 3'),
           ('PA-PNEU-04', 'Parker Neumático', 'Parker Neumático 4'),
           ('PA-SIN-03', 'Sin Asignar', 'Sin Asignar B1'),
           ('PA-SIN-04', 'Sin Asignar', 'Sin Asignar B2')]
for (code, zone, name), y in zip(pa_col2, [101.4, 160.7, 219.6, 278.7, 338.1, 397.4]):
    code_lines.append(f'            new Shelf("{code}", "{zone}", "{name}", "1", "Planta Alta", 850.2, {y:.1f}, 54.0, 54.0),')

pa_col3 = [('PA-FEST-01', 'Asco Festo / SMC', 'Asco Festo / SMC 1'),
           ('PA-FEST-02', 'Asco Festo / SMC', 'Asco Festo / SMC 2'),
           ('PA-FEST-03', 'Asco Festo / SMC', 'Asco Festo / SMC 3'),
           ('PA-FEST-04', 'Asco Festo / SMC', 'Asco Festo / SMC 4'),
           ('PA-VAC-01', 'Vacío', 'Vacío Anaquel 1'),
           ('PA-VAC-02', 'Vacío', 'Vacío Anaquel 2')]
for (code, zone, name), y in zip(pa_col3, [101.4, 160.7, 219.6, 278.7, 338.1, 397.4]):
    code_lines.append(f'            new Shelf("{code}", "{zone}", "{name}", "1", "Planta Alta", 946.9, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([101.4, 160.7, 219.6, 278.7, 338.1, 397.4], 1):
    code_lines.append(f'            new Shelf("PA-SEL-{i:02d}", "Sellos", "Sellos Pasillo 1-{i}", "1", "Planta Alta", 1044.0, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([101.4, 160.7, 219.6, 278.7, 338.1, 397.4], 7):
    code_lines.append(f'            new Shelf("PA-SEL-{i:02d}", "Sellos", "Sellos Pasillo 2-{i-6}", "1", "Planta Alta", 1162.3, {y:.1f}, 54.0, 54.0),')

for i, y in enumerate([104.6, 163.1, 221.3, 279.6, 338.2, 396.8], 13):
    code_lines.append(f'            new Shelf("PA-SEL-{i:02d}", "Sellos", "Sellos Muro {i-12}", "1", "Planta Alta", 1300.0, {y:.1f}, 58.0, 54.0),')

for r, cy in enumerate([540.0, 650.0]):
    for c, cx in enumerate([460.0, 580.0, 700.0, 820.0, 940.0], 1):
        idx = r * 5 + c
        code_lines.append(f'            new Shelf("PA-MAN-{idx:02d}", "Mangueras", "Carrete Manguera {idx}", "1", "Planta Alta", {cx - 35:.1f}, {cy - 35:.1f}, 70.0, 70.0),')

# remove trailing comma on last item
code_lines[-1] = code_lines[-1][:-1]

with open(r'backend\shelves_seed_code.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(code_lines))
print('Done!')
