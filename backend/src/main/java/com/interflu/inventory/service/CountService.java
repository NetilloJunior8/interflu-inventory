package com.interflu.inventory.service;

import com.interflu.inventory.dto.CountDto;
import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import org.apache.poi.ss.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class CountService {

    private final CountRecordRepository countRepo;
    private final InventorySessionRepository sessionRepo;
    private final ShelfRepository shelfRepo;
    private final ProductRepository productRepo;
    private final ShelfAssignmentRepository assignmentRepo;
    private final AuditService auditService;

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    public CountService(CountRecordRepository countRepo,
                        InventorySessionRepository sessionRepo,
                        ShelfRepository shelfRepo,
                        ProductRepository productRepo,
                        ShelfAssignmentRepository assignmentRepo,
                        AuditService auditService) {
        this.countRepo = countRepo;
        this.sessionRepo = sessionRepo;
        this.shelfRepo = shelfRepo;
        this.productRepo = productRepo;
        this.assignmentRepo = assignmentRepo;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public CountDto.CheckDuplicateResponse checkDuplicate(Long sessionId, Long shelfId, String code, User currentUser) {
        String cleanCode = code != null ? code.trim().toUpperCase() : "";
        CountDto.CheckDuplicateResponse resp = new CountDto.CheckDuplicateResponse();

        Optional<Product> prodOpt = productRepo.findByCodeIgnoreCase(cleanCode);
        if (prodOpt.isPresent()) {
            Product p = prodOpt.get();
            resp.setExistsInCatalog(true);
            resp.setProductDescription(p.getDescription());
            resp.setProductUnit(p.getUnit());
            resp.setProductStockSaE(p.getStockSaE());
        } else {
            resp.setExistsInCatalog(false);
            resp.setProductDescription("Código no encontrado en catálogo (se registrará automáticamente)");
            resp.setProductUnit("PZA");
        }

        List<CountRecord> allSessionCountsForCode = countRepo.findBySessionIdAndCapturedCodeIgnoreCase(sessionId, cleanCode);
        List<CountDto.PreviousLocation> otherLocations = new ArrayList<>();
        double totalSessionQty = 0.0;

        for (CountRecord rec : allSessionCountsForCode) {
            totalSessionQty += rec.getQuantity();
            if (rec.getShelf().getId().equals(shelfId)) {
                resp.setAlreadyInCurrentShelf(true);
                resp.setCurrentShelfQty(rec.getQuantity());
                resp.setExistingRecordIdInShelf(rec.getId());
            } else {
                resp.setAlreadyInOtherShelves(true);
                otherLocations.add(new CountDto.PreviousLocation(
                        rec.getShelf().getCode(),
                        rec.getShelf().getZone(),
                        rec.getQuantity(),
                        rec.getUser().getFullName(),
                        rec.getUpdatedAt().format(FMT)
                ));
            }
        }

        resp.setTotalSessionQty(totalSessionQty);
        resp.setPreviousLocations(otherLocations);

        if (resp.isAlreadyInCurrentShelf()) {
            resp.setWarningMessage(String.format(
                    "Código repetido en este anaquel: ya tiene %.2f %s registrados. Puedes SUMAR las nuevas piezas o REEMPLAZAR el conteo.",
                    resp.getCurrentShelfQty(), resp.getProductUnit()
            ));
        } else if (resp.isAlreadyInOtherShelves()) {
            resp.setWarningMessage(String.format(
                    "Este código ya fue capturado en otro(s) anaquel(es) (%d ubicación/es, %.2f %s en total).",
                    otherLocations.size(), totalSessionQty, resp.getProductUnit()
            ));
        }

        return resp;
    }

    @Transactional
    public CountRecord saveCount(CountDto.CountRequest req, User user) {
        if (req.getQuantity() == null || req.getQuantity() < 0) {
            throw new IllegalArgumentException("La cantidad debe ser mayor o igual a cero.");
        }
        String cleanCode = req.getProductCode() != null ? req.getProductCode().trim().toUpperCase() : "";
        if (cleanCode.isEmpty()) {
            throw new IllegalArgumentException("El código de producto es obligatorio.");
        }

        InventorySession session = sessionRepo.findById(req.getSessionId())
                .orElseThrow(() -> new IllegalArgumentException("Sesión de inventario no encontrada."));

        if (!session.isEditable()) {
            throw new IllegalStateException("Este inventario está cerrado (" + session.getStatus() + "). Debe reabrirse para modificar conteos.");
        }

        Shelf shelf = shelfRepo.findById(req.getShelfId())
                .orElseThrow(() -> new IllegalArgumentException("Anaquel no encontrado."));

        Optional<Product> prodOpt = productRepo.findByCodeIgnoreCase(cleanCode);
        Product product = prodOpt.orElseGet(() -> {
            Product p = new Product(cleanCode, cleanCode + " (Refacción Industrial)", "PZA", "GENERAL", shelf.getCode(), 0.0);
            return productRepo.save(p);
        });

        Optional<CountRecord> existingInShelfOpt = countRepo.findBySessionIdAndShelfIdAndCapturedCodeIgnoreCase(
                session.getId(), shelf.getId(), cleanCode);

        String mode = req.getMode() != null ? req.getMode().toUpperCase() : "NORMAL";

        CountRecord record;
        if (existingInShelfOpt.isPresent()) {
            record = existingInShelfOpt.get();
            if ("NORMAL".equals(mode)) {
                throw new IllegalStateException("DUPLICATE_CODE:" + record.getQuantity());
            }

            Double oldQty = record.getQuantity();
            record.setPreviousQuantity(oldQty);

            if ("ADD".equals(mode)) {
                record.setQuantity(oldQty + req.getQuantity());
                record.setValidationStatus(CountRecord.ValidationStatus.REPETIDO_SUMADO);
            } else if ("REPLACE".equals(mode)) {
                record.setQuantity(req.getQuantity());
                record.setValidationStatus(CountRecord.ValidationStatus.REPETIDO_REEMPLAZADO);
            } else {
                throw new IllegalArgumentException("Modo de duplicado no válido: " + mode);
            }

            record.setUser(user);
            record.setUpdatedAt(LocalDateTime.now());
            if (req.getSection() != null) {
                record.setSection(CountRecord.normalizeSection(req.getSection()));
            }
            if (req.getNotes() != null && !req.getNotes().isBlank()) {
                record.setNotes(req.getNotes());
            }

            record = countRepo.save(record);

            auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                    "RESOLVER_DUPLICADO_" + mode, "CountRecord", record.getId(),
                    String.valueOf(oldQty), String.valueOf(record.getQuantity()),
                    String.format("Código %s en %s (%s): %.2f -> %.2f", cleanCode, shelf.getCode(), mode, oldQty, record.getQuantity()));
        } else {
            record = new CountRecord();
            record.setSession(session);
            record.setShelf(shelf);
            record.setProduct(product);
            record.setCapturedCode(cleanCode);
            record.setQuantity(req.getQuantity());
            record.setSection(CountRecord.normalizeSection(req.getSection()));
            record.setUser(user);
            record.setNotes(req.getNotes());
            record.setCountedAt(LocalDateTime.now());
            record.setUpdatedAt(LocalDateTime.now());
            record.setValidationStatus(CountRecord.ValidationStatus.VALIDO);

            record = countRepo.save(record);

            auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                    "CAPTURA_CONTEO", "CountRecord", record.getId(),
                    null, String.valueOf(record.getQuantity()),
                    String.format("Captura %s = %.2f en anaquel %s", cleanCode, record.getQuantity(), shelf.getCode()));
        }

        // Update shelf assignment status
        assignmentRepo.findBySessionIdAndShelfId(session.getId(), shelf.getId()).ifPresent(assign -> {
            if (assign.getStatus() == ShelfAssignment.Status.PENDIENTE) {
                assign.setStatus(ShelfAssignment.Status.EN_CONTEO);
                assignmentRepo.save(assign);
            }
        });

        return record;
    }

    /**
     * Imports already counted Excel (.xlsx / .csv) directly into the session,
     * immediately registering counts and marking shelves on the croquis.
     */
    @Transactional
    public Map<String, Object> importExcelCounts(Long sessionId, Long targetShelfId, MultipartFile file, User user) throws Exception {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));

        if (!session.isEditable()) {
            throw new IllegalStateException("El inventario está cerrado. Debe reabrirse para importar conteos.");
        }

        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        List<String[]> parsedRows = new ArrayList<>();

        // Shelf resolution: either passed explicitly or matched from file name (e.g., "ACEROS 5" -> "PB-ACE-05")
        Shelf defaultShelf = null;
        if (targetShelfId != null) {
            defaultShelf = shelfRepo.findById(targetShelfId).orElse(null);
        }
        if (defaultShelf == null && file.getOriginalFilename() != null) {
            String cleanName = file.getOriginalFilename().toUpperCase();
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("ACEROS?\\s*(\\d+)|PB-ACE-(\\d+)|ACE-(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(cleanName);
            if (m.find()) {
                String numStr = m.group(1) != null ? m.group(1) : (m.group(2) != null ? m.group(2) : m.group(3));
                int num = Integer.parseInt(numStr);
                String targetCode = String.format("PB-ACE-%02d", num);
                defaultShelf = shelfRepo.findByCodeIgnoreCase(targetCode).orElse(null);
            }
        }
        if (defaultShelf == null) {
            List<Shelf> allShelves = shelfRepo.findByActiveTrueOrderByCodeAsc();
            defaultShelf = allShelves.isEmpty() ? null : allShelves.get(0);
        }

        if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
            try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
                DataFormatter formatter = new DataFormatter();

                // Select the sheet:
                // Priority 1: If defaultShelf is known, check if any sheet matches shelf code or number
                // Priority 2: Use the ACTIVE sheet (workbook.getActiveSheetIndex()), which is where user saved data in Excel!
                int selectedSheetIdx = workbook.getActiveSheetIndex();
                if (selectedSheetIdx < 0 || selectedSheetIdx >= workbook.getNumberOfSheets()) {
                    selectedSheetIdx = 0;
                }

                if (defaultShelf != null) {
                    for (int sIdx = 0; sIdx < workbook.getNumberOfSheets(); sIdx++) {
                        String sName = workbook.getSheetName(sIdx).trim().toUpperCase();
                        if (sName.equalsIgnoreCase(defaultShelf.getCode())
                                || sName.equalsIgnoreCase(defaultShelf.getCode().replace("PB-", ""))
                                || sName.equalsIgnoreCase(defaultShelf.getCode().replace("PB-ACE-", ""))) {
                            selectedSheetIdx = sIdx;
                            break;
                        }
                    }
                }

                Sheet sheet = workbook.getSheetAt(selectedSheetIdx);
                for (Row row : sheet) {
                    if (row == null) continue;
                    List<String> cells = new ArrayList<>();
                    int maxCols = Math.max(row.getLastCellNum(), 6);
                    boolean hasAnyText = false;
                    for (int c = 0; c < maxCols; c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK);
                        String val = formatter.formatCellValue(cell).trim();
                        cells.add(val);
                        if (!val.isBlank()) {
                            hasAnyText = true;
                        }
                    }
                    if (hasAnyText) {
                        parsedRows.add(cells.toArray(new String[0]));
                    }
                }
            }
        } else {
            // CSV / TXT fallback
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("\uFEFF")) {
                        line = line.substring(1);
                    }
                    if (line.trim().isEmpty()) continue;
                    String sep = line.contains("\t") ? "\t" : (line.contains(";") ? ";" : ",");
                    String[] parts = line.split(sep, -1);
                    boolean hasAnyText = false;
                    for (int p = 0; p < parts.length; p++) {
                        parts[p] = parts[p].trim();
                        if (!parts[p].isBlank()) {
                            hasAnyText = true;
                        }
                    }
                    if (hasAnyText) {
                        parsedRows.add(parts);
                    }
                }
            }
        }

        if (parsedRows.isEmpty()) {
            throw new IllegalArgumentException("El archivo está vacío o no contiene filas legibles.");
        }

        int codeCol = -1;
        int qtyCol = -1;
        int shelfCol = -1;
        int descCol = -1;
        int secCol = -1;

        int importedCount = 0;
        double totalPiecesImported = 0.0;
        Set<Long> affectedShelves = new HashSet<>();

        // If a specific target shelf was selected or inferred, reset its previous counts so physical import is exact
        if (defaultShelf != null) {
            List<CountRecord> oldShelfRecords = countRepo.findBySessionIdAndShelfId(session.getId(), defaultShelf.getId());
            if (!oldShelfRecords.isEmpty()) {
                countRepo.deleteAll(oldShelfRecords);
            }
        }

        for (int i = 0; i < parsedRows.size(); i++) {
            String[] row = parsedRows.get(i);
            if (row.length == 0) continue;

            // Check if this row is a header row
            boolean isHeader = false;
            for (int c = 0; c < row.length; c++) {
                String cu = row[c].toUpperCase().replace("\"", "").trim();
                if ((cu.contains("CVE") || cu.contains("COD") || cu.contains("ART") || cu.contains("CLAVE")) && !cu.contains("ESQ")) {
                    isHeader = true;
                }
                if (cu.contains("CANT") || cu.contains("PIEZA") || cu.contains("QTY") || cu.contains("TOTAL") || cu.contains("FISIC") || cu.contains("FÍSIC") || cu.contains("EXISTENCIA")) {
                    isHeader = true;
                }
            }

            if (isHeader) {
                // Update column mappings from this header
                for (int c = 0; c < row.length; c++) {
                    String cu = row[c].toUpperCase().replace("\"", "").trim();
                    if ((cu.contains("CVE") || cu.contains("COD") || cu.contains("ART") || cu.contains("CLAVE")) && !cu.contains("ESQ")) {
                        codeCol = c;
                    } else if (cu.contains("CANT") || cu.contains("PIEZA") || cu.contains("QTY") || cu.contains("TOTAL") || cu.contains("FISIC") || cu.contains("FÍSIC") || cu.contains("EXISTENCIA")) {
                        qtyCol = c;
                    } else if (cu.contains("ANAQUEL") || cu.contains("UBIC") || cu.contains("ZONA") || cu.contains("RACK")) {
                        shelfCol = c;
                    } else if (cu.contains("DESC") || cu.contains("NOMBRE")) {
                        descCol = c;
                    } else if (cu.contains("SECCION") || cu.contains("SECCIÓN") || cu.contains("NIVEL") || cu.equals("SEC")) {
                        secCol = c;
                    }
                }
                continue; // Skip header row!
            }

            // Fallback for headerless rows
            if (codeCol < 0 || qtyCol < 0) {
                if (row.length >= 5 && (row[0].equalsIgnoreCase("A") || row[1].equalsIgnoreCase("P"))) {
                    // Aspel SAE 5-column format: ESTATUS, TIPO, CLAVE, ESQ, EXISTENCIA
                    codeCol = 2;
                    qtyCol = 4;
                } else if (row.length >= 3) {
                    codeCol = 0;
                    qtyCol = 2;
                } else {
                    codeCol = 0;
                    qtyCol = 1;
                }
            }

            if (row.length <= codeCol) continue;
            String code = row[codeCol].replace("\"", "").trim().toUpperCase();
            if (code.isEmpty()) continue;

            // Header keyword filter
            if (code.equals("CLAVE") || code.equals("CVE") || code.equals("CVE_ART")
                    || code.equals("CODIGO") || code.equals("ARTICULO")
                    || code.equals("EXISTENCIA") || code.equals("EXISTENCIA FÍSICA") || code.equals("TOTAL")
                    || code.contains("TIPO DE ELEMENTO") || code.equals("ESTATUS")) {
                continue;
            }

            double qty = 0.0;
            if (row.length > qtyCol && row[qtyCol] != null) {
                try {
                    qty = Double.parseDouble(row[qtyCol].replace("\"", "").replace(",", "").trim());
                } catch (NumberFormatException ignored) {}
            }
            if (qty < 0) qty = 0;

            String shelfName = (shelfCol >= 0 && row.length > shelfCol) ? row[shelfCol].replace("\"", "").trim().toUpperCase() : null;
            String description = (descCol >= 0 && row.length > descCol) ? row[descCol].replace("\"", "").trim() : null;

            Shelf targetShelf = defaultShelf;
            if (shelfName != null && !shelfName.isBlank()) {
                Optional<Shelf> found = shelfRepo.findByCodeIgnoreCase(shelfName);
                if (found.isPresent()) {
                    targetShelf = found.get();
                } else {
                    Shelf newShelf = new Shelf(shelfName, "Área General", "Importado de Excel", "1", "Planta 1", 10.0, 10.0, 12.0, 8.0);
                    targetShelf = shelfRepo.save(newShelf);
                }
            } else if (targetShelfId == null && defaultShelf == null) {
                Optional<Product> prodOpt = productRepo.findByCodeIgnoreCase(code);
                if (prodOpt.isPresent() && prodOpt.get().getLocationSaE() != null && !prodOpt.get().getLocationSaE().isBlank()) {
                    Optional<Shelf> foundLoc = shelfRepo.findByCodeIgnoreCase(prodOpt.get().getLocationSaE().trim());
                    if (foundLoc.isPresent()) {
                        targetShelf = foundLoc.get();
                    }
                }
            }
            if (targetShelf == null) continue;

            // Ensure assignment exists for this session
            final Shelf finalShelf = targetShelf;
            ShelfAssignment sa = assignmentRepo.findBySessionIdAndShelfId(session.getId(), finalShelf.getId())
                    .orElseGet(() -> assignmentRepo.save(new ShelfAssignment(session, finalShelf, user)));

            // Product check/create
            Product product = productRepo.findByCodeIgnoreCase(code).orElseGet(() -> {
                String desc = (description != null && !description.isBlank()) ? description : code + " (Refacción Industrial)";
                Product p = new Product(code, desc, "PZA", "GENERAL", finalShelf.getCode(), 0.0);
                return productRepo.save(p);
            });

            // Save or accumulate count for exact physical count
            Optional<CountRecord> existingOpt = countRepo.findBySessionIdAndShelfIdAndCapturedCodeIgnoreCase(
                    session.getId(), finalShelf.getId(), code);

            String sectionVal = (secCol >= 0 && row.length > secCol) ? row[secCol].trim() : null;

            if (existingOpt.isPresent()) {
                CountRecord rec = existingOpt.get();
                rec.setPreviousQuantity(rec.getQuantity());
                rec.setQuantity(rec.getQuantity() + qty);
                if (sectionVal != null && !sectionVal.isBlank()) {
                    rec.setSection(CountRecord.normalizeSection(sectionVal));
                }
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                countRepo.save(rec);
            } else {
                CountRecord rec = new CountRecord();
                rec.setSession(session);
                rec.setShelf(finalShelf);
                rec.setProduct(product);
                rec.setCapturedCode(code);
                rec.setQuantity(qty);
                if (sectionVal != null && !sectionVal.isBlank()) {
                    rec.setSection(CountRecord.normalizeSection(sectionVal));
                }
                rec.setUser(user);
                rec.setNotes("Importado de archivo: " + file.getOriginalFilename());
                rec.setCountedAt(LocalDateTime.now());
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                countRepo.save(rec);
            }

            sa.setStatus(ShelfAssignment.Status.COMPLETADO);
            sa.setCompletedAt(LocalDateTime.now());
            assignmentRepo.save(sa);

            affectedShelves.add(finalShelf.getId());
            importedCount++;
            totalPiecesImported += qty;
        }

        List<String> affectedCodes = new ArrayList<>();
        for (Long sId : affectedShelves) {
            shelfRepo.findById(sId).ifPresent(s -> affectedCodes.add(s.getCode()));
        }

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "IMPORTAR_CONTEOS_EXCEL", "CountRecord", null,
                null, String.valueOf(importedCount),
                String.format("Importados %d registros (%.2f pzas) en %d anaqueles desde %s",
                        importedCount, totalPiecesImported, affectedShelves.size(), file.getOriginalFilename()));

        Map<String, Object> resp = new HashMap<>();
        resp.put("importedRecords", importedCount);
        resp.put("totalPieces", totalPiecesImported);
        resp.put("shelvesUpdated", affectedShelves.size());
        resp.put("affectedShelves", affectedCodes);
        return resp;
    }

    @Transactional
    public Map<String, Object> clearSessionCounts(Long sessionId, User user) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));

        List<CountRecord> records = countRepo.findBySessionIdOrderByUpdatedAtDesc(sessionId);
        int deletedCount = records.size();
        Double totalPieces = countRepo.sumQuantityBySessionId(sessionId);
        double pieces = totalPieces != null ? totalPieces : 0.0;

        countRepo.deleteAll(records);

        List<ShelfAssignment> assignments = assignmentRepo.findBySessionIdOrderByShelfCodeAsc(sessionId);
        for (ShelfAssignment sa : assignments) {
            sa.setStatus(ShelfAssignment.Status.PENDIENTE);
            sa.setCompletedAt(null);
            assignmentRepo.save(sa);
        }

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "ELIMINAR_CONTEOS_IMPORTADOS", "InventorySession", session.getId(),
                String.valueOf(deletedCount), "0",
                String.format("Eliminación total de %d partidas (%.2f pzas) en sesión %s por %s",
                        deletedCount, pieces, session.getFolio(), user.getFullName()));

        Map<String, Object> res = new HashMap<>();
        res.put("deletedCount", deletedCount);
        res.put("deletedPieces", pieces);
        res.put("message", String.format("Se eliminaron exitosamente %d partidas (%.2f piezas). Los 170 anaqueles volvieron a estado Pendiente.", deletedCount, pieces));
        return res;
    }

    @Transactional
    public List<CountRecord> batchSaveSheet(CountDto.BatchSheetRequest req, User user) {
        if (req.getSessionId() == null || req.getShelfId() == null) {
            throw new IllegalArgumentException("Se requiere folio de sesión y anaquel.");
        }

        InventorySession session = sessionRepo.findById(req.getSessionId())
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada."));

        if (!session.isEditable()) {
            throw new IllegalStateException("Este inventario está cerrado (" + session.getStatus() + "). Debe reabrirse para modificar la planilla.");
        }

        Shelf shelf = shelfRepo.findById(req.getShelfId())
                .orElseThrow(() -> new IllegalArgumentException("Anaquel no encontrado."));

        List<CountRecord> existingRecords = countRepo.findBySessionIdAndShelfIdOrderByIdAsc(session.getId(), shelf.getId());
        Map<Long, CountRecord> existingById = new HashMap<>();
        for (CountRecord r : existingRecords) {
            existingById.put(r.getId(), r);
        }

        Set<Long> keptRecordIds = new HashSet<>();
        List<CountRecord> resultList = new ArrayList<>();
        double totalQuantity = 0.0;

        if (req.getRows() != null) {
            for (CountDto.BatchRowItem item : req.getRows()) {
                if (item.getCode() == null || item.getCode().trim().isEmpty()) {
                    continue; // Skip empty rows
                }
                String cleanCode = item.getCode().trim().toUpperCase();
                double qty = item.getQuantity() != null && item.getQuantity() >= 0 ? item.getQuantity() : 0.0;
                totalQuantity += qty;

                Product prod = productRepo.findByCodeIgnoreCase(cleanCode).orElseGet(() -> {
                    Product p = new Product(cleanCode, cleanCode + " (Refacción Industrial)", "PZA", "GENERAL", shelf.getCode(), 0.0);
                    return productRepo.save(p);
                });

                CountRecord rec;
                if (item.getId() != null && existingById.containsKey(item.getId())) {
                    rec = existingById.get(item.getId());
                    rec.setProduct(prod);
                    rec.setCapturedCode(cleanCode);
                    rec.setQuantity(qty);
                    rec.setSection(CountRecord.normalizeSection(item.getSection()));
                    rec.setNotes(item.getNotes());
                    rec.setUser(user);
                    rec.setUpdatedAt(LocalDateTime.now());
                } else {
                    rec = new CountRecord();
                    rec.setSession(session);
                    rec.setShelf(shelf);
                    rec.setProduct(prod);
                    rec.setCapturedCode(cleanCode);
                    rec.setQuantity(qty);
                    rec.setSection(CountRecord.normalizeSection(item.getSection()));
                    rec.setNotes(item.getNotes());
                    rec.setUser(user);
                    rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                    rec.setCountedAt(LocalDateTime.now());
                    rec.setUpdatedAt(LocalDateTime.now());
                }
                rec = countRepo.save(rec);
                keptRecordIds.add(rec.getId());
                resultList.add(rec);
            }
        }

        // Delete records in this shelf that were removed in the sheet
        for (CountRecord existing : existingRecords) {
            if (!keptRecordIds.contains(existing.getId())) {
                countRepo.delete(existing);
            }
        }

        // Update shelf status
        assignmentRepo.findBySessionIdAndShelfId(session.getId(), shelf.getId()).ifPresent(sa -> {
            if (!resultList.isEmpty()) {
                if (sa.getStatus() == ShelfAssignment.Status.PENDIENTE) {
                    sa.setStatus(ShelfAssignment.Status.EN_CONTEO);
                    assignmentRepo.save(sa);
                }
            }
        });

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "GUARDAR_PLANILLA_EXCEL", "Shelf", shelf.getId(),
                null, String.valueOf(resultList.size()),
                String.format("Planilla guardada para anaquel %s: %d partidas, %.2f piezas totales",
                        shelf.getCode(), resultList.size(), totalQuantity));

        return resultList;
    }

    @Transactional(readOnly = true)
    public List<CountRecord> getCounts(Long sessionId, Long shelfId) {
        if (shelfId != null) {
            return countRepo.findBySessionIdAndShelfIdOrderByIdAsc(sessionId, shelfId);
        }
        return countRepo.findBySessionIdOrderByUpdatedAtDesc(sessionId);
    }

    @Transactional
    public void deleteCount(Long recordId, User user) {
        CountRecord record = countRepo.findById(recordId)
                .orElseThrow(() -> new IllegalArgumentException("Registro no encontrado."));

        if (!record.getSession().isEditable()) {
            throw new IllegalStateException("No se puede eliminar un conteo de un inventario cerrado.");
        }

        auditService.log(record.getSession().getId(), record.getSession().getFolio(),
                user.getUsername(), user.getFullName(),
                "ELIMINAR_CONTEO", "CountRecord", record.getId(),
                String.valueOf(record.getQuantity()), "0",
                String.format("Eliminado código %s (%.2f) de anaquel %s",
                        record.getCapturedCode(), record.getQuantity(), record.getShelf().getCode()));

        countRepo.delete(record);
    }

    @Transactional
    public CountRecord updateSection(Long recordId, String section, User user) {
        CountRecord record = countRepo.findById(recordId)
                .orElseThrow(() -> new IllegalArgumentException("Registro no encontrado."));

        if (!record.getSession().isEditable()) {
            throw new IllegalStateException("No se puede editar un conteo de un inventario cerrado.");
        }

        String normalized = CountRecord.normalizeSection(section);
        String oldSec = record.getSection();
        record.setSection(normalized);
        record.setUpdatedAt(LocalDateTime.now());
        record = countRepo.save(record);

        auditService.log(record.getSession().getId(), record.getSession().getFolio(),
                user.getUsername(), user.getFullName(),
                "CAMBIAR_SECCION", "CountRecord", record.getId(),
                oldSec, normalized,
                String.format("Código %s en %s: nivel asignado %s -> %s",
                        record.getCapturedCode(), record.getShelf().getCode(), oldSec, normalized));

        return record;
    }
}
