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

        if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
            try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
                Sheet sheet = workbook.getSheetAt(0);
                DataFormatter formatter = new DataFormatter();
                for (Row row : sheet) {
                    List<String> cells = new ArrayList<>();
                    for (int c = 0; c < Math.max(row.getLastCellNum(), 4); c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK);
                        cells.add(formatter.formatCellValue(cell).trim());
                    }
                    if (!cells.isEmpty() && !cells.get(0).isEmpty()) {
                        parsedRows.add(cells.toArray(new String[0]));
                    }
                }
            }
        } else {
            // CSV / TXT fallback
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    String sep = line.contains("\t") ? "\t" : (line.contains(";") ? ";" : ",");
                    String[] parts = line.split(sep, -1);
                    parsedRows.add(parts);
                }
            }
        }

        if (parsedRows.isEmpty()) {
            throw new IllegalArgumentException("El archivo está vacío o no contiene filas legibles.");
        }

        // Identify header columns
        String[] header = parsedRows.get(0);
        int codeCol = 0;
        int qtyCol = 1;
        int shelfCol = -1;
        int descCol = -1;

        boolean hasHeader = false;
        for (int i = 0; i < header.length; i++) {
            String colName = header[i].trim().toUpperCase().replace("\"", "");
            // Match CLAVE but not CLAVE ESQ (which is an auxiliary SAE column)
            if ((colName.contains("CVE") || colName.contains("COD") || colName.contains("ART") || colName.contains("CLAVE")) && !colName.contains("ESQ")) {
                codeCol = i;
                hasHeader = true;
            } else if (colName.contains("CANT") || colName.contains("PIEZA") || colName.contains("QTY") || colName.contains("TOTAL") || colName.contains("FISIC") || colName.contains("FÍSIC") || colName.contains("EXISTENCIA")) {
                qtyCol = i;
                hasHeader = true;
            } else if (colName.contains("ANAQUEL") || colName.contains("UBIC") || colName.contains("ZONA") || colName.contains("RACK")) {
                shelfCol = i;
                hasHeader = true;
            } else if (colName.contains("DESC") || colName.contains("NOMBRE")) {
                descCol = i;
                hasHeader = true;
            }
        }

        int startRow = hasHeader ? 1 : 0;
        int importedCount = 0;
        double totalPiecesImported = 0.0;
        Set<Long> affectedShelves = new HashSet<>();

        // Default shelf: either passed specifically or first available active shelf
        Shelf defaultShelf = null;
        if (targetShelfId != null) {
            defaultShelf = shelfRepo.findById(targetShelfId).orElse(null);
        }
        if (defaultShelf == null) {
            List<Shelf> allShelves = shelfRepo.findByActiveTrueOrderByCodeAsc();
            defaultShelf = allShelves.isEmpty() ? null : allShelves.get(0);
        }

        for (int i = startRow; i < parsedRows.size(); i++) {
            String[] row = parsedRows.get(i);
            if (row.length <= codeCol) continue;
            String code = row[codeCol].replace("\"", "").trim().toUpperCase();
            if (code.isEmpty()) continue;

            double qty = 0.0;
            if (row.length > qtyCol) {
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
                    // Create shelf dynamically if not exists
                    Shelf newShelf = new Shelf(shelfName, "Área General", "Importado de Excel", "1", "Planta 1", 10.0, 10.0, 12.0, 8.0);
                    targetShelf = shelfRepo.save(newShelf);
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

            // Save or accumulate count
            Optional<CountRecord> existingOpt = countRepo.findBySessionIdAndShelfIdAndCapturedCodeIgnoreCase(
                    session.getId(), finalShelf.getId(), code);

            if (existingOpt.isPresent()) {
                CountRecord rec = existingOpt.get();
                rec.setPreviousQuantity(rec.getQuantity());
                rec.setQuantity(rec.getQuantity() + qty);
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.REPETIDO_SUMADO);
                countRepo.save(rec);
            } else {
                CountRecord rec = new CountRecord();
                rec.setSession(session);
                rec.setShelf(finalShelf);
                rec.setProduct(product);
                rec.setCapturedCode(code);
                rec.setQuantity(qty);
                rec.setUser(user);
                rec.setNotes("Importado de archivo Excel: " + file.getOriginalFilename());
                rec.setCountedAt(LocalDateTime.now());
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                countRepo.save(rec);
            }

            // Since this Excel contains already counted and verified items, mark shelf as COMPLETADO (Verde en croquis)
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
}
