package com.interflu.inventory.service;

import com.interflu.inventory.dto.CountDto;
import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddressList;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
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
            String desc = (req.getDescription() != null && !req.getDescription().trim().isEmpty())
                    ? req.getDescription().trim()
                    : parseIndustrialDescription(cleanCode);
            Product p = new Product(cleanCode, desc, "PZA", "GENERAL", shelf.getCode(), 0.0);
            return productRepo.save(p);
        });

        if (req.getDescription() != null && !req.getDescription().trim().isEmpty()) {
            String cleanDesc = req.getDescription().trim();
            if (!cleanDesc.equalsIgnoreCase(product.getDescription())) {
                product.setDescription(cleanDesc);
                product.setUpdatedAt(LocalDateTime.now());
                product = productRepo.save(product);
            }
        }

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
     * automatically mapping Nivel (A-F) to physical shelf sections and supporting
     * SMART_MERGE (update existing + append new) or REPLACE_ALL modes.
     */
    private static class ImportedItem {
        String code;
        double quantity;
        String section;
        String shelfName;
        String description;
        String locationCode;
        Shelf resolvedShelf;
    }

    private boolean isHeaderCode(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("CLAVE") || cu.equals("CVE") || cu.equals("CVE_ART") || cu.equals("CODIGO")
                || cu.equals("CÓDIGO") || cu.equals("ARTICULO") || cu.equals("ARTÍCULO") || cu.equals("COD")
                || cu.startsWith("CLAVE ") || cu.startsWith("CODIGO ") || cu.startsWith("CÓDIGO ")
                || cu.equals("CVE PROD") || cu.equals("CLAVE PROD") || cu.equals("NUMERO DE PARTE") || cu.equals("NO. PARTE")
                || cu.equals("MATERIAL") || cu.equals("PRODUCTO") || cu.equals("SKU");
    }

    private boolean isHeaderQty(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("EXISTENCIAS") || cu.equals("EXISTENCIA") || cu.equals("CANTIDAD") || cu.equals("CANT")
                || cu.equals("PIEZAS") || cu.equals("PIEZA") || cu.equals("PZAS") || cu.equals("PZA")
                || cu.equals("QTY") || cu.equals("TOTAL")
                || cu.equals("EXISTENCIA FÍSICA") || cu.equals("EXISTENCIA FISICA") || cu.equals("FÍSICO") || cu.equals("FISICO")
                || cu.equals("STOCK") || cu.startsWith("EXISTENCIA") || cu.startsWith("CANTIDAD ") || cu.startsWith("PIEZAS ");
    }

    private boolean isHeaderSection(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("NIVEL") || cu.equals("SECCION") || cu.equals("SECCIÓN") || cu.equals("SEC")
                || cu.equals("REPISA") || cu.startsWith("NIVEL ") || cu.startsWith("SECCION ");
    }

    private boolean isHeaderShelf(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("ANAQUEL") || cu.equals("ESTANTE") || cu.equals("ZONA") || cu.equals("RACK")
                || cu.startsWith("ANAQUEL ") || cu.startsWith("ESTANTE ");
    }

    private boolean isHeaderLocation(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("UBICACION") || cu.equals("UBICACIÓN") || cu.equals("UBIC")
                || cu.equals("POSICION") || cu.equals("POSICIÓN") || cu.equals("POS")
                || cu.startsWith("UBICACION ") || cu.startsWith("UBICACIÓN ") || cu.startsWith("POSICION ");
    }

    private boolean isHeaderDesc(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("DESCRIPCION") || cu.equals("DESCRIPCIÓN") || cu.equals("DESC") || cu.equals("NOMBRE")
                || cu.equals("DESCR") || cu.startsWith("DESCRIPCION") || cu.startsWith("DESCRIPCIÓN")
                || cu.equals("DETALLE") || cu.equals("CONCEPTO");
    }

    private void parseSheetRowsIntoItems(List<String[]> rows, Shelf sheetShelf, List<ImportedItem> result) {
        if (rows == null || rows.isEmpty()) return;

        int codeCol = -1;
        int qtyCol = -1;
        int secCol = -1;
        int shelfCol = -1;
        int descCol = -1;
        int locCol = -1;
        int headerRowIdx = -1;

        // 1. Detect header row in first 10 rows
        for (int r = 0; r < Math.min(rows.size(), 10); r++) {
            String[] row = rows.get(r);
            boolean hasCode = false;
            boolean hasQty = false;
            boolean hasOther = false;

            for (int c = 0; c < row.length; c++) {
                String val = row[c].trim().toUpperCase().replace("\"", "");
                if (isHeaderCode(val)) hasCode = true;
                if (isHeaderQty(val)) hasQty = true;
                if (isHeaderSection(val) || isHeaderShelf(val) || isHeaderDesc(val) || isHeaderLocation(val)) hasOther = true;
            }

            if ((hasCode && hasQty) || (hasCode && hasOther) || (hasQty && hasOther)) {
                headerRowIdx = r;
                for (int c = 0; c < row.length; c++) {
                    String val = row[c].trim().toUpperCase().replace("\"", "");
                    if (isHeaderSection(val) && secCol < 0) secCol = c;
                    else if (isHeaderCode(val) && codeCol < 0) codeCol = c;
                    else if (isHeaderQty(val) && qtyCol < 0) qtyCol = c;
                    else if (isHeaderShelf(val) && shelfCol < 0) shelfCol = c;
                    else if (isHeaderDesc(val) && descCol < 0) descCol = c;
                    else if (isHeaderLocation(val) && locCol < 0) locCol = c;
                }
                break;
            }
        }

        // 2. Fallback heuristic if no explicit header found
        if (codeCol < 0) {
            String[] firstRow = rows.get(0);
            if (firstRow.length >= 5 && (firstRow[0].equalsIgnoreCase("A") || firstRow[1].equalsIgnoreCase("P"))) {
                // Aspel SAE 5-column format: ESTATUS, TIPO, CLAVE, ESQ, EXISTENCIA [, NIVEL]
                codeCol = 2;
                qtyCol = 4;
                if (firstRow.length >= 6 && firstRow[5].trim().matches("(?i)^[A-J]$")) secCol = 5;
            } else if (firstRow.length >= 3 && firstRow[0].trim().matches("(?i)^[A-J]$")) {
                secCol = 0;
                codeCol = 1;
                qtyCol = 2;
                if (firstRow.length >= 4) shelfCol = 3;
            } else if (firstRow.length >= 7 && (firstRow[4].equalsIgnoreCase("A") || firstRow[4].equalsIgnoreCase("B") || firstRow[4].equalsIgnoreCase("C"))) {
                // Format: CLAVE, PLANTA, PASILLO, ESTANTE, NIVEL, POSICION, UBICACION
                codeCol = 0;
                shelfCol = 3;
                secCol = 4;
                locCol = 6;
                qtyCol = -1;
            } else if (firstRow.length >= 3) {
                codeCol = 0;
                qtyCol = 2;
            } else {
                codeCol = 0;
                qtyCol = 1;
            }
        }

        // 3. Process data rows starting after headerRowIdx
        int startRow = (headerRowIdx >= 0) ? headerRowIdx + 1 : 0;
        for (int r = startRow; r < rows.size(); r++) {
            String[] row = rows.get(r);
            if (row.length <= codeCol) continue;

            String code = row[codeCol].trim().toUpperCase().replace("\"", "");
            if (code.isEmpty() || isHeaderCode(code) || code.equals("ESTATUS") || code.equals("TIPO") || code.equals("TOTAL")) {
                continue;
            }

            double qty = 0.0;
            if (qtyCol >= 0 && row.length > qtyCol && row[qtyCol] != null) {
                try {
                    qty = Double.parseDouble(row[qtyCol].replace("\"", "").replace(",", "").trim());
                } catch (NumberFormatException ignored) {}
            }
            if (qty < 0) qty = 0;

            String rawSec = (secCol >= 0 && row.length > secCol) ? row[secCol].trim().replace("\"", "") : null;
            String normalizedSec = CountRecord.normalizeSection(rawSec);

            String shelfName = (shelfCol >= 0 && row.length > shelfCol) ? row[shelfCol].trim().replace("\"", "").toUpperCase() : null;
            String desc = (descCol >= 0 && row.length > descCol) ? row[descCol].trim().replace("\"", "") : null;
            String locCode = (locCol >= 0 && row.length > locCol) ? row[locCol].trim().replace("\"", "") : null;

            ImportedItem item = new ImportedItem();
            item.code = code;
            item.quantity = qty;
            item.section = normalizedSec;
            item.shelfName = shelfName;
            item.description = desc;
            item.locationCode = locCode;
            item.resolvedShelf = sheetShelf;

            result.add(item);
        }
    }

    /**
     * Imports already counted Excel (.xlsx / .csv) directly into the session,
     * automatically mapping Nivel (A-G) to physical shelf sections and supporting
     * SMART_MERGE (update existing + append new), REPLACE_ALL, and WEEKLY_UPDATE modes.
     */
    @Transactional
    public Map<String, Object> importExcelCounts(Long sessionId, Long targetShelfId, String importMode, MultipartFile file, User user) throws Exception {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));

        if (!session.isEditable()) {
            throw new IllegalStateException("El inventario está cerrado. Debe reabrirse para importar conteos.");
        }

        String modeUpper = importMode != null ? importMode.trim().toUpperCase() : "SMART_MERGE";
        String mode = "SMART_MERGE";
        if (modeUpper.contains("REPLACE")) {
            mode = "REPLACE_ALL";
        } else if (modeUpper.contains("WEEKLY") || modeUpper.contains("PIEZA") || modeUpper.contains("LEVANTAMIENTO") || modeUpper.contains("UPDATE_QTY")) {
            mode = "WEEKLY_UPDATE";
        }

        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";

        // Shelf resolution: either passed explicitly or matched from file name (e.g., "ACEROS 5" -> "PB-ACE-05")
        Shelf defaultShelf = null;
        if (targetShelfId != null && targetShelfId > 0) {
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

        List<ImportedItem> itemsToProcess = new ArrayList<>();

        if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
            try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
                DataFormatter formatter = new DataFormatter();
                List<Sheet> sheetsToRead = new ArrayList<>();

                if (targetShelfId != null && targetShelfId > 0 && defaultShelf != null) {
                    int matchedIdx = -1;
                    for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
                        String sName = workbook.getSheetName(s).trim().toUpperCase();
                        if (sName.equalsIgnoreCase(defaultShelf.getCode())
                                || sName.equalsIgnoreCase(defaultShelf.getCode().replace("PB-", ""))
                                || sName.equalsIgnoreCase(defaultShelf.getCode().replace("PB-ACE-", ""))) {
                            matchedIdx = s;
                            break;
                        }
                    }
                    sheetsToRead.add(matchedIdx >= 0 ? workbook.getSheetAt(matchedIdx) : workbook.getSheetAt(0));
                } else {
                    for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
                        sheetsToRead.add(workbook.getSheetAt(s));
                    }
                }

                for (Sheet sheet : sheetsToRead) {
                    Shelf sheetShelf = defaultShelf;
                    String sName = sheet.getSheetName().trim().toUpperCase();
                    java.util.regex.Matcher sm = java.util.regex.Pattern.compile("(?:ACEROS?|PB-ACE-|ACE-)?\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
                    if (sm.matches() || sm.find()) {
                        try {
                            int num = Integer.parseInt(sm.group(1));
                            if (num >= 1 && num <= 19) {
                                String targetCode = String.format("PB-ACE-%02d", num);
                                Optional<Shelf> foundS = shelfRepo.findByCodeIgnoreCase(targetCode);
                                if (foundS.isPresent()) {
                                    sheetShelf = foundS.get();
                                }
                            }
                        } catch (Exception ignored) {}
                    }

                    List<String[]> sheetRows = new ArrayList<>();
                    for (Row row : sheet) {
                        if (row == null) continue;
                        List<String> cells = new ArrayList<>();
                        int maxCols = Math.max(row.getLastCellNum(), 7);
                        boolean hasText = false;
                        for (int c = 0; c < maxCols; c++) {
                            Cell cell = row.getCell(c, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK);
                            String val = formatter.formatCellValue(cell).trim();
                            cells.add(val);
                            if (!val.isBlank()) hasText = true;
                        }
                        if (hasText) sheetRows.add(cells.toArray(new String[0]));
                    }

                    parseSheetRowsIntoItems(sheetRows, sheetShelf, itemsToProcess);
                }
            }
        } else {
            // CSV / TXT fallback
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
                List<String[]> csvRows = new ArrayList<>();
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("\uFEFF")) {
                        line = line.substring(1);
                    }
                    if (line.trim().isEmpty()) continue;
                    String sep = line.contains("\t") ? "\t" : (line.contains(";") ? ";" : ",");
                    String[] parts = line.split(sep, -1);
                    boolean hasText = false;
                    for (int p = 0; p < parts.length; p++) {
                        parts[p] = parts[p].trim();
                        if (!parts[p].isBlank()) hasText = true;
                    }
                    if (hasText) csvRows.add(parts);
                }
                parseSheetRowsIntoItems(csvRows, defaultShelf, itemsToProcess);
            }
        }

        if (itemsToProcess.isEmpty()) {
            throw new IllegalArgumentException("El archivo está vacío o no contiene partidas legibles.");
        }

        int importedCount = 0;
        int addedRecords = 0;
        int updatedRecords = 0;
        int withSectionCount = 0;
        double totalPiecesImported = 0.0;
        Set<Long> affectedShelves = new LinkedHashSet<>();
        Set<Long> clearedShelves = new HashSet<>();
        Set<String> seenInThisFile = new HashSet<>();

        for (ImportedItem item : itemsToProcess) {
            String code = item.code;
            double qty = item.quantity;
            String normalizedSec = item.section;
            Shelf targetShelf = item.resolvedShelf;

            if (item.shelfName != null && !item.shelfName.isBlank()) {
                String sn = item.shelfName;
                if (sn.matches("^\\d+$")) {
                    int num = Integer.parseInt(sn);
                    if (num >= 1 && num <= 19) {
                        sn = String.format("PB-ACE-%02d", num);
                    }
                }
                Optional<Shelf> found = shelfRepo.findByCodeIgnoreCase(sn);
                if (found.isPresent()) {
                    targetShelf = found.get();
                } else if (defaultShelf == null) {
                    Shelf newShelf = new Shelf(sn, "Área General", "Importado de Excel", "1", "Planta Baja", 10.0, 10.0, 12.0, 8.0);
                    targetShelf = shelfRepo.save(newShelf);
                }
            } else if (targetShelf == null) {
                targetShelf = defaultShelf;
            }
            if (targetShelf == null) continue;

            final Shelf finalShelf = targetShelf;

            // In REPLACE_ALL mode, wipe previous counts on each affected shelf once before inserting fresh rows
            if ("REPLACE_ALL".equals(mode) && clearedShelves.add(finalShelf.getId())) {
                List<CountRecord> oldShelfRecords = countRepo.findBySessionIdAndShelfId(session.getId(), finalShelf.getId());
                if (!oldShelfRecords.isEmpty()) {
                    countRepo.deleteAll(oldShelfRecords);
                    countRepo.flush();
                }
            }

            // Ensure assignment exists for this session
            ShelfAssignment sa = assignmentRepo.findBySessionIdAndShelfId(session.getId(), finalShelf.getId())
                    .orElseGet(() -> assignmentRepo.save(new ShelfAssignment(session, finalShelf, user)));

            // Product check/create
            Product product = productRepo.findByCodeIgnoreCase(code).orElseGet(() -> {
                String desc = (item.description != null && !item.description.isBlank()) ? item.description : code + " (Refacción Industrial)";
                Product p = new Product(code, desc, "PZA", "GENERAL", finalShelf.getCode(), 0.0);
                return productRepo.save(p);
            });

            // 1. WEEKLY_UPDATE MODE: Detect matching codes across the entire session and update ONLY pieces, preserving shelf, level A-G, and location notes
            if ("WEEKLY_UPDATE".equals(mode)) {
                List<CountRecord> sessionRecords = countRepo.findBySessionIdAndCapturedCodeIgnoreCase(session.getId(), code);
                if (!sessionRecords.isEmpty()) {
                    for (CountRecord rec : sessionRecords) {
                        if (rec.getVersion() == null) {
                            rec.setVersion(0L);
                        }
                        rec.setPreviousQuantity(rec.getQuantity());
                        rec.setQuantity(qty);
                        if ((rec.getSection() == null || rec.getSection().isBlank()) && normalizedSec != null) {
                            rec.setSection(normalizedSec);
                            withSectionCount++;
                        }
                        // PRESERVE rec.getShelf() and rec.getNotes() (location code PB3-*) untouched!
                        rec.setUpdatedAt(LocalDateTime.now());
                        rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                        countRepo.save(rec);
                        updatedRecords++;
                        affectedShelves.add(rec.getShelf().getId());

                        ShelfAssignment saRec = assignmentRepo.findBySessionIdAndShelfId(session.getId(), rec.getShelf().getId())
                                .orElseGet(() -> assignmentRepo.save(new ShelfAssignment(session, rec.getShelf(), user)));
                        saRec.setStatus(ShelfAssignment.Status.COMPLETADO);
                        saRec.setCompletedAt(LocalDateTime.now());
                        assignmentRepo.save(saRec);
                    }
                    importedCount++;
                    totalPiecesImported += qty;
                    continue;
                }
            }

            // SMART_MERGE or new records:
            String fileKey = finalShelf.getId() + "::" + code;
            boolean alreadySeenInThisFile = !seenInThisFile.add(fileKey);

            Optional<CountRecord> existingOpt = countRepo.findBySessionIdAndShelfIdAndCapturedCodeIgnoreCase(
                    session.getId(), finalShelf.getId(), code);

            if (!existingOpt.isPresent() && (targetShelfId == null || targetShelfId <= 0)) {
                List<CountRecord> matchesInSession = countRepo.findBySessionIdAndCapturedCodeIgnoreCase(session.getId(), code);
                if (!matchesInSession.isEmpty()) {
                    existingOpt = Optional.of(matchesInSession.get(0));
                }
            }

            if (existingOpt.isPresent()) {
                CountRecord rec = existingOpt.get();
                if (rec.getVersion() == null) {
                    rec.setVersion(0L);
                }
                if (alreadySeenInThisFile) {
                    rec.setQuantity(rec.getQuantity() + qty);
                    if (normalizedSec != null && (rec.getSection() == null || rec.getSection().isBlank())) {
                        rec.setSection(normalizedSec);
                    }
                } else {
                    rec.setPreviousQuantity(rec.getQuantity());
                    rec.setQuantity(qty);
                    if (normalizedSec != null) {
                        rec.setSection(normalizedSec);
                    }
                }
                if (item.locationCode != null && !item.locationCode.isBlank() && (rec.getNotes() == null || rec.getNotes().isBlank() || !rec.getNotes().startsWith("PB3-"))) {
                    rec.setNotes(item.locationCode);
                }
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                countRepo.save(rec);
                updatedRecords++;
                if (rec.getSection() != null && !rec.getSection().isBlank()) {
                    withSectionCount++;
                }
            } else {
                CountRecord rec = new CountRecord();
                rec.setSession(session);
                rec.setShelf(finalShelf);
                rec.setProduct(product);
                rec.setCapturedCode(code);
                rec.setQuantity(qty);
                if (normalizedSec != null) {
                    rec.setSection(normalizedSec);
                    withSectionCount++;
                }
                rec.setUser(user);
                String noteVal = (item.locationCode != null && !item.locationCode.isBlank()) ? item.locationCode : ("Importado de archivo: " + file.getOriginalFilename());
                rec.setNotes(noteVal);
                rec.setCountedAt(LocalDateTime.now());
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                countRepo.save(rec);
                addedRecords++;
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
                mode, String.valueOf(importedCount),
                String.format("Importación (%s): %d partidas (%d nuevas, %d actualizadas, %d con nivel A-G, %.2f pzas) en %d anaqueles desde %s",
                        mode, importedCount, addedRecords, updatedRecords, withSectionCount, totalPiecesImported, affectedShelves.size(), file.getOriginalFilename()));

        Map<String, Object> resp = new HashMap<>();
        resp.put("importedRecords", importedCount);
        resp.put("addedRecords", addedRecords);
        resp.put("updatedRecords", updatedRecords);
        resp.put("withSectionCount", withSectionCount);
        resp.put("totalPieces", totalPiecesImported);
        resp.put("shelvesUpdated", affectedShelves.size());
        resp.put("affectedShelves", affectedCodes);
        resp.put("importMode", mode);
        return resp;
    }

    /**
     * Generates a clean, corporate Excel template (.xlsx) with the official Nivel (A-G) column
     * and dropdown validation so operators can import directly into visual shelf levels.
     */
    public byte[] generateImportTemplateXlsx() throws Exception {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Conteo_Por_Nivel");

            // Header style (Interflu Navy)
            CellStyle headerStyle = wb.createCellStyle();
            Font headerFont = wb.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            headerFont.setFontHeightInPoints((short) 11);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);
            headerStyle.setVerticalAlignment(VerticalAlignment.CENTER);

            // Level badge style
            CellStyle levelStyle = wb.createCellStyle();
            Font levelFont = wb.createFont();
            levelFont.setBold(true);
            levelStyle.setFont(levelFont);
            levelStyle.setAlignment(HorizontalAlignment.CENTER);
            levelStyle.setFillForegroundColor(IndexedColors.LIGHT_GREEN.getIndex());
            levelStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // Header row
            Row header = sheet.createRow(0);
            header.setHeightInPoints(24);
            String[] cols = {"CLAVE", "EXISTENCIAS", "DESCRIPCIÓN", "NIVEL", "ANAQUEL"};
            int[] widths = {26 * 256, 18 * 256, 36 * 256, 14 * 256, 18 * 256};
            for (int c = 0; c < cols.length; c++) {
                Cell cell = header.createCell(c);
                cell.setCellValue(cols[c]);
                cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(c, widths[c]);
            }

            // Example rows to guide operators
            Object[][] samples = {
                {"EJEMPLO-REF-01", 15.0, "Refacción Industrial Ejemplo 1", "A", "PB-ACE-01"},
                {"EJEMPLO-REF-02", 8.0, "Refacción Industrial Ejemplo 2", "B", "PB-ACE-01"},
                {"EJEMPLO-REF-03", 24.0, "Refacción Industrial Ejemplo 3", "J", "PB-YPC-13"}
            };
            for (int r = 0; r < samples.length; r++) {
                Row row = sheet.createRow(r + 1);
                row.createCell(0).setCellValue((String) samples[r][0]);
                row.createCell(1).setCellValue(((Double) samples[r][1]));
                row.createCell(2).setCellValue((String) samples[r][2]);
                Cell c3 = row.createCell(3);
                c3.setCellValue((String) samples[r][3]);
                c3.setCellStyle(levelStyle);
                row.createCell(4).setCellValue((String) samples[r][4]);
            }

            // Excel Dropdown Validation for NIVEL column (A-J) on rows 2..500
            DataValidationHelper dvHelper = sheet.getDataValidationHelper();
            DataValidationConstraint dvConstraint = dvHelper.createExplicitListConstraint(new String[]{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"});
            CellRangeAddressList addressList = new CellRangeAddressList(1, 500, 3, 3);
            DataValidation validation = dvHelper.createValidation(dvConstraint, addressList);
            validation.setShowErrorBox(true);
            validation.createErrorBox("Nivel no válido", "Solo se permiten letras de nivel A a J.");
            sheet.addValidationData(validation);

            // Instructions Sheet
            Sheet info = wb.createSheet("Instrucciones");
            info.setColumnWidth(0, 95 * 256);
            String[] tips = {
                "PLANTILLA OFICIAL INTERFLU INVENTORY - COMPATIBLE CON ASPEL SAE",
                "",
                "1. Columna CLAVE: Clave o código del producto/refacción (idéntico al SAE).",
                "2. Columna EXISTENCIAS: Cantidad o número de piezas (idéntico al SAE).",
                "3. Columna DESCRIPCIÓN: Nombre del producto o descripción (idéntico al SAE).",
                "4. Columna NIVEL (Opcional): Letra de nivel de la A a la J (los anaqueles 13, 14 y 15 cuentan con niveles H, I, J).",
                "5. Columna ANAQUEL (Opcional): Código de anaquel (ej. PB-ACE-01, PB-YPC-10). Si seleccionas el anaquel en pantalla, se llena automáticamente.",
                "6. Al importar archivos exportados directamente desde SAE, la app extrae automáticamente Clave, Existencias y Descripción e ignora las columnas sobrantes.",
            };
            for (int i = 0; i < tips.length; i++) {
                Row r = info.createRow(i);
                r.createCell(0).setCellValue(tips[i]);
            }

            wb.write(out);
            return out.toByteArray();
        }
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
                    String desc = (item.getDescription() != null && !item.getDescription().trim().isEmpty())
                            ? item.getDescription().trim()
                            : parseIndustrialDescription(cleanCode);
                    Product p = new Product(cleanCode, desc, "PZA", "GENERAL", shelf.getCode(), 0.0);
                    return productRepo.save(p);
                });

                if (item.getDescription() != null && !item.getDescription().trim().isEmpty()) {
                    String cleanDesc = item.getDescription().trim();
                    if (!cleanDesc.equalsIgnoreCase(prod.getDescription())) {
                        prod.setDescription(cleanDesc);
                        prod.setUpdatedAt(LocalDateTime.now());
                        prod = productRepo.save(prod);
                    }
                }

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

    @Transactional
    public CountRecord updateLocation(Long recordId, Long newShelfId, String section, String locationCode, Double quantity, User user) {
        CountRecord rec = countRepo.findById(recordId)
                .orElseThrow(() -> new IllegalArgumentException("Registro no encontrado."));

        if (!rec.getSession().isEditable()) {
            throw new IllegalStateException("No se puede editar un conteo de un inventario cerrado.");
        }

        if (rec.getVersion() == null) {
            rec.setVersion(0L);
        }

        if (newShelfId != null && !newShelfId.equals(rec.getShelf().getId())) {
            Shelf newShelf = shelfRepo.findById(newShelfId)
                    .orElseThrow(() -> new IllegalArgumentException("Anaquel no encontrado."));
            rec.setShelf(newShelf);

            Optional<ShelfAssignment> optSa = assignmentRepo.findBySessionIdAndShelfId(rec.getSession().getId(), newShelf.getId());
            ShelfAssignment sa = optSa.orElse(null);
            if (sa == null) {
                sa = assignmentRepo.save(new ShelfAssignment(rec.getSession(), newShelf, user));
            }
            sa.setStatus(ShelfAssignment.Status.COMPLETADO);
            sa.setCompletedAt(LocalDateTime.now());
            assignmentRepo.save(sa);
        }

        if (section != null) {
            rec.setSection(CountRecord.normalizeSection(section));
        }

        if (locationCode != null && !locationCode.isBlank()) {
            rec.setNotes(locationCode.trim());
        }

        if (quantity != null && quantity >= 0) {
            rec.setPreviousQuantity(rec.getQuantity());
            rec.setQuantity(quantity);
        }

        rec.setUpdatedAt(LocalDateTime.now());
        rec = countRepo.save(rec);

        auditService.log(rec.getSession().getId(), rec.getSession().getFolio(),
                user.getUsername(), user.getFullName(),
                "ACTUALIZAR_UBICACION_MATERIAL", "CountRecord", rec.getId(),
                null, rec.getNotes(),
                String.format("Ubicación actualizada para %s: Anaquel %s, Nivel %s, Código %s",
                        rec.getCapturedCode(), rec.getShelf().getCode(), rec.getSection(), rec.getNotes()));

        return rec;
    }

    @Transactional
    public List<CountRecord> batchUpdateLocations(List<Map<String, Object>> items, User user) {
        List<CountRecord> results = new ArrayList<>();
        if (items == null) return results;
        for (Map<String, Object> map : items) {
            if (!map.containsKey("id") || map.get("id") == null) continue;
            Long id = ((Number) map.get("id")).longValue();
            Long shelfId = map.containsKey("shelfId") && map.get("shelfId") != null ? ((Number) map.get("shelfId")).longValue() : null;
            String section = map.containsKey("section") && map.get("section") != null ? String.valueOf(map.get("section")) : null;
            String locationCode = map.containsKey("locationCode") && map.get("locationCode") != null ? String.valueOf(map.get("locationCode")) : null;
            Double quantity = map.containsKey("quantity") && map.get("quantity") != null ? ((Number) map.get("quantity")).doubleValue() : null;

            results.add(updateLocation(id, shelfId, section, locationCode, quantity, user));
        }
        return results;
    }

    public static String parseIndustrialDescription(String code) {
        if (code == null || code.trim().isEmpty()) {
            return "Refacción Industrial";
        }
        String c = code.trim().toUpperCase();
        if (c.equals("CG401/2")) return "Codo Galvanizado Cédula 40 de 1/2\"";
        if (c.equals("CG403/4")) return "Codo Galvanizado Cédula 40 de 3/4\"";
        if (c.equals("CG403/8")) return "Codo Galvanizado Cédula 40 de 3/8\"";
        if (c.equals("CG401/4")) return "Codo Galvanizado Cédula 40 de 1/4\"";

        if (c.matches("^C90I40.*")) return "Codo 90° Inoxidable Cédula 40 de " + c.substring(6) + "\"";
        if (c.matches("^C90N80.*")) return "Codo 90° Negro Cédula 80 de " + c.substring(6) + "\"";
        if (c.matches("^C90N40.*")) return "Codo 90° Negro Cédula 40 de " + c.substring(6) + "\"";
        if (c.matches("^C45G40.*")) return "Codo 45° Galvanizado Cédula 40 de " + c.substring(6) + "\"";
        if (c.matches("^C45I40.*")) return "Codo 45° Inoxidable Cédula 40 de " + c.substring(6) + "\"";
        if (c.matches("^CG40.*")) return "Codo Galvanizado Cédula 40 de " + c.substring(4) + "\"";
        if (c.matches("^CI40.*")) return "Codo Inoxidable Cédula 40 de " + c.substring(4) + "\"";
        if (c.matches("^CN40.*")) return "Codo Negro Cédula 40 de " + c.substring(4) + "\"";

        if (c.matches("^NG40.*XRC$")) return "Niple Galvanizado Cédula 40 de " + c.substring(4, c.length() - 3) + "\" Rosca Corrida";
        if (c.matches("^NG40.*X.*")) {
            String[] parts = c.substring(4).split("X");
            return "Niple Galvanizado Cédula 40 de " + parts[0] + "\" x " + parts[1] + "\"";
        }
        if (c.matches("^NN80.*XRC$")) return "Niple Negro Cédula 80 de " + c.substring(4, c.length() - 3) + "\" Rosca Corrida";
        if (c.matches("^NN80.*X.*")) {
            String[] parts = c.substring(4).split("X");
            return "Niple Negro Cédula 80 de " + parts[0] + "\" x " + parts[1] + "\"";
        }
        if (c.matches("^NI40.*XRC$")) return "Niple Inoxidable Cédula 40 de " + c.substring(4, c.length() - 3) + "\" Rosca Corrida";
        if (c.matches("^NI40.*X.*")) {
            String[] parts = c.substring(4).split("X");
            return "Niple Inoxidable Cédula 40 de " + parts[0] + "\" x " + parts[1] + "\"";
        }
        if (c.matches("^NBI.*")) return "Niple Botella Inoxidable " + c.substring(3) + "\"";

        if (c.matches("^RBG.*X.*")) {
            String[] parts = c.substring(3).split("X");
            return "Reducción Bushing Galvanizada " + parts[0] + "\" x " + parts[1] + "\"";
        }
        if (c.matches("^RBN40.*X.*")) {
            String[] parts = c.substring(5).split("X");
            return "Reducción Bushing Negra Cédula 40 de " + parts[0] + "\" x " + parts[1] + "\"";
        }
        if (c.matches("^RBN80.*X.*")) {
            String[] parts = c.substring(5).split("X");
            return "Reducción Bushing Negra Cédula 80 de " + parts[0] + "\" x " + parts[1] + "\"";
        }
        if (c.matches("^RCI.*X.*")) {
            String[] parts = c.substring(3).split("X");
            return "Reducción Campana Inoxidable " + parts[0] + "\" x " + parts[1] + "\"";
        }

        if (c.matches("^TMG.*")) return "Tapón Macho Galvanizado " + c.substring(3) + "\"";
        if (c.matches("^TMA40.*")) return "Tapón Macho Acero Cédula 40 de " + c.substring(5) + "\"";
        if (c.matches("^TUAN.*")) return "Tuerca Unión Acero Negro " + c.substring(4) + "\"";
        if (c.matches("^TUINOX.*")) return "Tuerca Unión Inoxidable " + c.substring(6) + "\"";

        if (c.matches("^VBIM.*")) return "Válvula de Bola Inoxidable Macho " + c.substring(4) + "\"";
        if (c.matches("^VAI.*")) return "Válvula de Aguja Inoxidable " + c.substring(3) + "\"";
        if (c.matches("^VW444T.*")) return "Válvula Tipo Mariposa / Wafer 444T " + c.substring(6) + "\"";

        return "Conexión Industrial " + c;
    }
}
