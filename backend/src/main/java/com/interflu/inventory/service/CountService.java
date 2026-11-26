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
    private final AceroMasterCatalogService aceroCatalog;

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    public CountService(CountRecordRepository countRepo,
                        InventorySessionRepository sessionRepo,
                        ShelfRepository shelfRepo,
                        ProductRepository productRepo,
                        ShelfAssignmentRepository assignmentRepo,
                        AuditService auditService,
                        AceroMasterCatalogService aceroCatalog) {
        this.countRepo = countRepo;
        this.sessionRepo = sessionRepo;
        this.shelfRepo = shelfRepo;
        this.productRepo = productRepo;
        this.assignmentRepo = assignmentRepo;
        this.auditService = auditService;
        this.aceroCatalog = aceroCatalog;
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
    private static class ImportedItem {
        String code;
        Double quantity;
        boolean hasExplicitQuantity;
        String section;
        String shelfName;
        String description;
        String locationCode;
        String aisle;
        String plant;
        String position;
        Shelf resolvedShelf;
        boolean sheetFromExplicitRack;
        boolean hasExplicitShelfInfo;
    }

    public static boolean isObsoleteOrEliminated(String code, String desc) {
        if (desc != null && !desc.isBlank()) {
            String du = desc.trim().toUpperCase();
            if (du.equals("ELIMINAR") || du.startsWith("ELIMINAR")
                    || du.equals("E")
                    || du.equals("OBSOLETO") || du.startsWith("OBSOLETO")
                    || du.contains("DESCONTINUADO")
                    || du.contains("NO USAR")
                    || du.contains("CANCELADO")
                    || du.contains("FUERA DE LINEA") || du.contains("FUERA DE LÍNEA")) {
                return true;
            }
        }
        if (code != null && !code.isBlank()) {
            String cu = code.trim().toUpperCase();
            if (cu.startsWith("ELIM-") || cu.startsWith("OBS-") || cu.endsWith("-ELIM")) {
                return true;
            }
        }
        return false;
    }

    public static String cleanNumericString(String str) {
        if (str == null) return "0";
        String s = str.trim().replaceAll("[\"'$]", "");
        if (s.isEmpty()) return "0";
        s = s.replaceAll("(?i)(pzas|pza|pz|piezas|pieza|unidades|unidad|u|kg|m|mts|paq|cja)", "").trim();
        if (s.isEmpty()) return "0";
        if (s.contains(",") && !s.contains(".")) {
            s = s.replace(",", ".");
        } else if (s.contains(",") && s.contains(".")) {
            s = s.replace(",", "");
        }
        s = s.replaceAll("[ ]", "");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^-?\\d+(?:\\.\\d+)?").matcher(s);
        if (m.find()) {
            return m.group();
        }
        return s;
    }

    private boolean isHeaderCode(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        if (cu.contains("ESQ") || cu.contains("IMPUESTO") || cu.contains("SAT") || cu.contains("UNIDAD")
                || cu.contains("COSTO") || cu.contains("PRECIO") || cu.contains("FECHA") || cu.contains("LINEA") || cu.contains("LÍNEA")
                || cu.contains("PASILLO") || cu.contains("ESTANTE") || cu.contains("NIVEL") || cu.contains("POSICION") || cu.contains("UBICACION")) {
            return false;
        }
        return cu.equals("CLAVE") || cu.equals("CVE") || cu.equals("CVE_ART") || cu.equals("CODIGO")
                || cu.equals("CÓDIGO") || cu.equals("ARTICULO") || cu.equals("ARTÍCULO") || cu.equals("COD")
                || cu.startsWith("CLAVE ") || cu.startsWith("CODIGO ") || cu.startsWith("CÓDIGO ")
                || cu.equals("CVE PROD") || cu.equals("CLAVE PROD") || cu.equals("NUMERO DE PARTE") || cu.equals("NO. PARTE")
                || cu.equals("MATERIAL") || cu.equals("PRODUCTO") || cu.equals("SKU");
    }

    private boolean isHeaderQty(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        if (cu.contains("ESQ") || cu.contains("SAT") || cu.contains("UNIDAD") || cu.contains("COSTO") || cu.contains("PRECIO")
                || cu.contains("FECHA") || cu.contains("LINEA") || cu.contains("LÍNEA")
                || cu.contains("PASILLO") || cu.contains("ESTANTE") || cu.contains("NIVEL") || cu.contains("POSICION") || cu.contains("POSICIÓN")
                || cu.contains("UBICACION") || cu.contains("UBICACIÓN") || cu.contains("PLANTA") || cu.contains("PISO")) {
            return false;
        }
        return cu.equals("EXISTENCIAS") || cu.equals("EXISTENCIA") || cu.equals("EXIST") || cu.equals("EXIST.")
                || cu.equals("CANTIDAD") || cu.equals("CANT") || cu.equals("CANT.")
                || cu.equals("PIEZAS") || cu.equals("PIEZA") || cu.equals("PZAS") || cu.equals("PZA")
                || cu.equals("QTY") || cu.equals("TOTAL") || cu.equals("DISPONIBLE") || cu.equals("SALDO")
                || cu.equals("EXISTENCIA FÍSICA") || cu.equals("EXISTENCIA FISICA") || cu.equals("FÍSICO") || cu.equals("FISICO")
                || cu.equals("STOCK") || cu.contains("EXISTENCIA") || cu.contains("CANTIDAD") || cu.contains("PIEZAS") || cu.contains("STOCK")
                || cu.contains("FISIC") || cu.contains("FÍSIC");
    }

    private boolean isHeaderSection(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        if (cu.contains("ESQ") || cu.contains("FECHA") || cu.contains("COSTO") || cu.contains("PRECIO")) return false;
        return cu.equals("NIVEL") || cu.equals("SECCION") || cu.equals("SECCIÓN") || cu.equals("SEC")
                || cu.equals("REPISA") || cu.contains("NIVEL") || cu.contains("SECCION") || cu.contains("SECCIÓN");
    }

    private boolean isHeaderShelf(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        if (cu.contains("ESQ") || cu.contains("FECHA") || cu.contains("COSTO") || cu.contains("PRECIO") || cu.contains("SAT") || cu.contains("DESCRIP")) {
            return false;
        }
        return cu.equals("ANAQUEL") || cu.equals("ESTANTE") || cu.equals("ZONA") || cu.equals("RACK") || cu.equals("SHELF")
                || cu.contains("ANAQUEL") || cu.contains("ESTANTE") || cu.contains("RACK") || cu.contains("SHELF");
    }

    private boolean isHeaderLocationCode(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        if (cu.contains("ESQ") || cu.contains("FECHA") || cu.contains("COSTO") || cu.contains("PRECIO") || cu.contains("SAT")) {
            return false;
        }
        return cu.equals("UBICACION") || cu.equals("UBICACIÓN") || cu.equals("UBIC")
                || cu.equals("CODIGO DE UBICACION") || cu.equals("CODIGO UBICACION") || cu.equals("LOC")
                || cu.contains("UBICAC") || cu.contains("LOCATION");
    }

    private boolean isHeaderPosition(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("POSICION") || cu.equals("POSICIÓN") || cu.equals("POS")
                || cu.startsWith("POSICION ") || cu.startsWith("POSICIÓN ");
    }

    private boolean isHeaderAisle(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("PASILLO") || cu.equals("AISLE") || cu.equals("PAS") || cu.contains("PASILLO") || cu.contains("AISLE");
    }

    private boolean isHeaderPlant(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("PLANTA") || cu.equals("PISO") || cu.contains("PLANTA") || cu.contains("PISO");
    }

    private boolean isHeaderDesc(String cu) {
        if (cu == null) return false;
        cu = cu.trim().toUpperCase();
        return cu.equals("DESCRIPCION") || cu.equals("DESCRIPCIÓN") || cu.equals("DESC") || cu.equals("NOMBRE")
                || cu.equals("DESCR") || cu.startsWith("DESCRIPCION") || cu.startsWith("DESCRIPCIÓN")
                || cu.equals("DETALLE") || cu.equals("CONCEPTO");
    }

    private void parseSheetRowsIntoItems(List<String[]> rows, Shelf sheetShelf, boolean sheetFromExplicitRack, List<ImportedItem> result) {
        if (rows == null || rows.isEmpty()) return;

        int codeCol = -1;
        int qtyCol = -1;
        int secCol = -1;
        int shelfCol = -1;
        int descCol = -1;
        int locCol = -1;
        int posCol = -1;
        int aisleCol = -1;
        int plantCol = -1;
        int headerRowIdx = -1;

        // 1. Detect header row in first 25 rows
        for (int r = 0; r < Math.min(rows.size(), 25); r++) {
            String[] row = rows.get(r);
            boolean hasCode = false;
            boolean hasQty = false;
            boolean hasOther = false;

            for (int c = 0; c < row.length; c++) {
                String val = row[c].trim().toUpperCase().replace("\"", "");
                if (isHeaderCode(val)) hasCode = true;
                if (isHeaderQty(val)) hasQty = true;
                if (isHeaderSection(val) || isHeaderShelf(val) || isHeaderDesc(val) || isHeaderLocationCode(val)
                        || isHeaderPosition(val) || isHeaderAisle(val) || isHeaderPlant(val)) hasOther = true;
            }

            if ((hasCode && hasQty) || (hasCode && hasOther) || (hasQty && hasOther)) {
                headerRowIdx = r;
                for (int c = 0; c < row.length; c++) {
                    String val = row[c].trim().toUpperCase().replace("\"", "");
                    if (isHeaderCode(val) && codeCol < 0) codeCol = c;
                    else if (isHeaderQty(val) && qtyCol < 0) qtyCol = c;
                    else if (isHeaderSection(val) && secCol < 0) secCol = c;
                    else if (isHeaderShelf(val) && shelfCol < 0) shelfCol = c;
                    else if (isHeaderDesc(val) && descCol < 0) descCol = c;
                    else if (isHeaderLocationCode(val) && locCol < 0) locCol = c;
                    else if (isHeaderPosition(val) && posCol < 0) posCol = c;
                    else if (isHeaderAisle(val) && aisleCol < 0) aisleCol = c;
                    else if (isHeaderPlant(val) && plantCol < 0) plantCol = c;
                }
                break;
            }
        }

        // 1.1 If header was found but qtyCol was not detected (e.g. sheets 3-19 where column 7 had no title in header)
        if (headerRowIdx >= 0 && qtyCol < 0 && codeCol >= 0 && rows.size() > headerRowIdx + 1) {
            int candidateQtyCol = -1;
            int maxCols = 0;
            for (int r = headerRowIdx + 1; r < Math.min(rows.size(), headerRowIdx + 10); r++) {
                maxCols = Math.max(maxCols, rows.get(r).length);
            }
            for (int c = 0; c < maxCols; c++) {
                if (c == codeCol || c == secCol || c == shelfCol || c == descCol || c == locCol
                        || c == posCol || c == aisleCol || c == plantCol) {
                    continue;
                }
                int numCount = 0;
                int checkedRows = 0;
                for (int r = headerRowIdx + 1; r < Math.min(rows.size(), headerRowIdx + 15); r++) {
                    String[] dr = rows.get(r);
                    if (dr.length <= c) continue;
                    String val = dr[c].trim();
                    if (val.isEmpty()) continue;
                    checkedRows++;
                    if (val.matches("^-?\\d+(\\.\\d+)?$")) {
                        numCount++;
                    }
                }
                if (checkedRows > 0 && numCount >= (int) Math.ceil(checkedRows * 0.7)) {
                    candidateQtyCol = c;
                    break;
                }
            }
            if (candidateQtyCol >= 0) {
                qtyCol = candidateQtyCol;
            }
        }

        // 2. Fallback heuristic ONLY if no explicit header found at all (headerless file)
        if (codeCol < 0) {
            String[] firstRow = rows.get(0);
            if (firstRow.length >= 5 && (firstRow[0].equalsIgnoreCase("A") || firstRow[1].equalsIgnoreCase("P"))) {
                // Aspel SAE 5-column format: ESTATUS, TIPO, CLAVE, ESQ, EXISTENCIA [, NIVEL]
                codeCol = 2;
                qtyCol = 4;
                if (firstRow.length >= 6 && firstRow[5].trim().matches("(?i)^[SA-J]$")) secCol = 5;
            } else if (firstRow.length >= 3 && firstRow[0].trim().matches("(?i)^[SA-J]$")) {
                secCol = 0;
                codeCol = 1;
                qtyCol = 2;
                if (firstRow.length >= 4) shelfCol = 3;
            } else if (firstRow.length >= 7 && (firstRow[4].equalsIgnoreCase("A") || firstRow[4].equalsIgnoreCase("B") || firstRow[4].equalsIgnoreCase("C") || firstRow[4].equalsIgnoreCase("S"))) {
                // Format: CLAVE, PLANTA, PASILLO, ESTANTE, NIVEL, POSICION, UBICACION [, EXISTENCIAS]
                codeCol = 0;
                plantCol = 1;
                aisleCol = 2;
                shelfCol = 3;
                secCol = 4;
                posCol = 5;
                locCol = 6;
                qtyCol = (firstRow.length >= 8 && firstRow[7].trim().matches("^-?\\d+(\\.\\d+)?$")) ? 7 : -1;
            } else if (firstRow.length >= 3) {
                codeCol = 0;
                qtyCol = 2;
            } else {
                codeCol = 0;
                qtyCol = 1;
            }
        }

        // If locCol was not found but posCol looks like a location code (e.g. PB3-1A-1)
        if (locCol < 0 && posCol >= 0 && rows.size() > Math.max(0, headerRowIdx + 1)) {
            String sampleVal = rows.get(Math.max(0, headerRowIdx + 1))[posCol].trim();
            if (sampleVal.matches("(?i)^P[BA]\\d+-\\w+.*")) {
                locCol = posCol;
                posCol = -1;
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

            boolean hasExplicitQty = (qtyCol >= 0 && row.length > qtyCol && row[qtyCol] != null && !row[qtyCol].isBlank());
            double qty = 0.0;
            if (hasExplicitQty) {
                String cleanNum = cleanNumericString(row[qtyCol]);
                try {
                    qty = Double.parseDouble(cleanNum);
                } catch (NumberFormatException ignored) {}
            }
            if (qty < 0) qty = 0;

            String rawSec = (secCol >= 0 && row.length > secCol) ? row[secCol].trim().replace("\"", "") : null;
            String normalizedSec = CountRecord.normalizeSection(rawSec);

            String shelfName = (shelfCol >= 0 && row.length > shelfCol) ? row[shelfCol].trim().replace("\"", "").toUpperCase() : null;
            String desc = (descCol >= 0 && row.length > descCol) ? row[descCol].trim().replace("\"", "") : null;
            String locCode = (locCol >= 0 && row.length > locCol) ? row[locCol].trim().replace("\"", "") : null;
            String aisle = (aisleCol >= 0 && row.length > aisleCol) ? row[aisleCol].trim().replace("\"", "") : null;
            String plant = (plantCol >= 0 && row.length > plantCol) ? row[plantCol].trim().replace("\"", "") : null;
            String pos = (posCol >= 0 && row.length > posCol) ? row[posCol].trim().replace("\"", "") : null;

            if (locCode != null && (locCode.isBlank() || locCode.contains("&") || locCode.startsWith("="))) {
                locCode = null;
            }

            if (locCode != null && !locCode.isBlank()) {
                java.util.regex.Matcher lm = java.util.regex.Pattern.compile("(?i)^(P[BA])(\\d+)-(\\d+)([SA-J])-(\\d+)").matcher(locCode);
                if (lm.find()) {
                    if (plant == null || plant.isBlank()) plant = lm.group(1).toUpperCase();
                    if (aisle == null || aisle.isBlank()) aisle = lm.group(2);
                    if (shelfName == null || shelfName.isBlank()) shelfName = lm.group(3);
                    if (rawSec == null || rawSec.isBlank()) {
                        rawSec = lm.group(4);
                        normalizedSec = CountRecord.normalizeSection(rawSec);
                    }
                    if (pos == null || pos.isBlank()) pos = lm.group(5);
                }
            }

            if (locCode == null && plant != null && !plant.isBlank() && aisle != null && !aisle.isBlank()
                    && shelfName != null && !shelfName.isBlank() && normalizedSec != null) {
                locCode = plant + aisle + "-" + shelfName + normalizedSec + "-" + (pos != null && !pos.isBlank() ? pos : "1");
            }

            boolean hasRowShelfInfo = (shelfName != null && !shelfName.isBlank())
                    || (locCode != null && !locCode.isBlank())
                    || (aisle != null && !aisle.isBlank());

            ImportedItem item = new ImportedItem();
            item.code = code;
            item.quantity = qty;
            item.hasExplicitQuantity = hasExplicitQty;
            item.section = normalizedSec;
            item.shelfName = shelfName;
            item.description = desc;
            item.locationCode = locCode;
            item.aisle = aisle;
            item.plant = plant;
            item.position = pos;
            item.resolvedShelf = sheetShelf;
            item.sheetFromExplicitRack = sheetFromExplicitRack;
            item.hasExplicitShelfInfo = sheetFromExplicitRack || hasRowShelfInfo;

            result.add(item);
        }
    }

    private static class SheetHeaderResolution {
        Shelf shelf;
        boolean explicitRackSheet;
        SheetHeaderResolution(Shelf shelf, boolean explicitRackSheet) {
            this.shelf = shelf;
            this.explicitRackSheet = explicitRackSheet;
        }
    }

    public Shelf getOrCreateShelf(String canonicalCode, String zone, String desc, String plant, Double posX, Double posY, Double width, Double height, InventorySession session, Map<String, Shelf> shelfCache) {
        String cleanCode = canonicalCode.trim().toUpperCase();
        Shelf cached = shelfCache.get(cleanCode);
        if (cached != null) return cached;

        Optional<Shelf> existing = shelfRepo.findByCodeIgnoreCase(cleanCode);
        if (existing.isPresent()) {
            shelfCache.put(cleanCode, existing.get());
            return existing.get();
        }

        // Check legacy aliases in db (e.g. for PB3-02: PB-ACE-02, PB-ACE-2, PB-3-02, ACE-02, PB3-2)
        if (cleanCode.startsWith("PB3-")) {
            try {
                int num = Integer.parseInt(cleanCode.replace("PB3-", ""));
                for (String cand : List.of(
                        String.format("PB-ACE-%02d", num),
                        String.format("PB-ACE-%d", num),
                        String.format("PB-3-%02d", num),
                        String.format("PB3-%d", num),
                        String.format("PB-3-%d", num),
                        String.format("ACE-%02d", num),
                        String.format("ACE-%d", num))) {
                    Optional<Shelf> leg = shelfRepo.findByCodeIgnoreCase(cand);
                    if (leg.isPresent()) {
                        Shelf ls = leg.get();
                        ls.setCode(cleanCode);
                        ls.setZone("Acero");
                        ls = shelfRepo.save(ls);
                        shelfCache.put(cleanCode, ls);
                        shelfCache.put(cand, ls);
                        return ls;
                    }
                }
            } catch (Exception ignored) {}
        }

        // Backward compatibility: If looking up PB-ACE-XX, redirect to PB3-XX if present
        if (cleanCode.startsWith("PB-ACE-")) {
            try {
                int num = Integer.parseInt(cleanCode.replace("PB-ACE-", ""));
                String pb3 = String.format("PB3-%02d", num);
                Optional<Shelf> pb3Shelf = shelfRepo.findByCodeIgnoreCase(pb3);
                if (pb3Shelf.isPresent()) {
                    shelfCache.put(cleanCode, pb3Shelf.get());
                    shelfCache.put(pb3, pb3Shelf.get());
                    return pb3Shelf.get();
                }
            } catch (Exception ignored) {}
        }

        // If not found in DB at all, auto-create it with official specs
        Shelf s = new Shelf(cleanCode, zone != null ? zone : "GENERAL", desc != null ? desc : cleanCode, "1", plant != null ? plant : "Planta Baja", posX != null ? posX : 810.0, posY != null ? posY : 200.0, width != null ? width : 25.0, height != null ? height : 54.0);
        s.setActive(true);
        s = shelfRepo.save(s);
        shelfCache.put(cleanCode, s);

        if (session != null) {
            Optional<ShelfAssignment> saOpt = assignmentRepo.findBySessionIdAndShelfId(session.getId(), s.getId());
            if (saOpt.isEmpty()) {
                ShelfAssignment sa = new ShelfAssignment(session, s, null);
                sa.setStatus(ShelfAssignment.Status.PENDIENTE);
                assignmentRepo.save(sa);
            }
        }
        return s;
    }

    public Shelf getOrCreateAceroShelf(int num, InventorySession session, Map<String, Shelf> shelfCache) {
        String canonicalCode = String.format("PB3-%02d", num);
        Shelf s = shelfCache.get(canonicalCode);
        if (s != null) return s;
        // Blueprint coordinates for Acero 1..19
        double posX = (num >= 11) ? 880.4 : 810.0;
        double posY = (num == 1) ? 104.0 : (144.0 + (num - 2) * 59.5);
        double w = (num == 1) ? 95.4 : 25.0;
        double h = (num == 1) ? 34.0 : 54.0;
        String desc = (num == 1) ? "Acero 1 - Fondo Pasillo" : ("Pasillo Acero " + num);
        s = getOrCreateShelf(canonicalCode, "Acero", desc, "Planta Baja", posX, posY, w, h, session, shelfCache);
        shelfCache.put(canonicalCode, s);
        shelfCache.put(String.format("PB-ACE-%02d", num), s);
        shelfCache.put(String.format("PB-ACE-%d", num), s);
        shelfCache.put(String.format("PB3-%d", num), s);
        shelfCache.put(String.valueOf(num), s);
        return s;
    }

    public Shelf getOrCreateKuriyamaShelf(String side, int num, InventorySession session, Map<String, Shelf> shelfCache) {
        String sUpper = (side != null && side.equalsIgnoreCase("B")) ? "B" : "A";
        String canonicalCode = String.format("PB-KUR-%s%02d", sUpper, num);
        double posX = sUpper.equals("A") ? 686.6 : 714.5;
        double posY = 263.1 + ((num - 1) * 58.8);
        return getOrCreateShelf(canonicalCode, "Kuriyama", "Kuriyama Pasillo " + sUpper + " M" + num, "Planta Baja", posX, posY, 25.0, 54.0, session, shelfCache);
    }

    public Shelf getOrCreateChidShelf(String side, int num, InventorySession session, Map<String, Shelf> shelfCache) {
        String sUpper = (side != null && !side.isBlank()) ? side.toUpperCase() : "A";
        String canonicalCode = String.format("PB-CHID-%s%02d", sUpper, num);
        return getOrCreateShelf(canonicalCode, "Conexiones Hidraulicas", "Conexiones " + sUpper + num, "Planta Baja", 450.0, 200.0 + (num * 40.0), 25.0, 54.0, session, shelfCache);
    }

    public Shelf getOrCreateYpcShelf(int num, InventorySession session, Map<String, Shelf> shelfCache) {
        String canonicalCode = String.format("PB-YPC-%02d", num);
        return getOrCreateShelf(canonicalCode, "YPC", "Estantería YPC " + num, "Planta Baja", 907.0, 144.0 + ((num - 1) * 50.0), 25.0, 54.0, session, shelfCache);
    }

    public Shelf getOrCreatePvcShelf(int num, InventorySession session, Map<String, Shelf> shelfCache) {
        String canonicalCode = String.format("PA-PVC-%02d", num);
        return getOrCreateShelf(canonicalCode, "Planta Alta PVC", "PVC Pasillo " + num, "Planta Alta", 300.0, 150.0 + ((num - 1) * 45.0), 25.0, 54.0, session, shelfCache);
    }

    private SheetHeaderResolution resolveSheetHeaderShelf(String rawSheetName, Shelf userSelectedDefaultShelf, InventorySession session, Map<String, Shelf> shelfCache) {
        if (rawSheetName == null || rawSheetName.isBlank()) {
            return new SheetHeaderResolution(userSelectedDefaultShelf, false);
        }
        String sName = rawSheetName.trim().toUpperCase();

        // 1. Direct shelf code in sheet name (e.g. "PB-ACE-02", "PB-KUR-A01", "PA-PVC-01")
        Shelf direct = shelfCache.get(sName);
        if (direct != null) {
            return new SheetHeaderResolution(direct, true);
        }

        // 2. Kuriyama sheet name ("KUR-A01", "KURIYAMA A1", "KURIYAMA A-01", "PB-KUR-A01")
        java.util.regex.Matcher mKur = java.util.regex.Pattern.compile("(?:PB-)?(?:KUR|KURIYAMA)-?([AB])-?0*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mKur.find()) {
            String side = mKur.group(1).toUpperCase();
            int num = Integer.parseInt(mKur.group(2));
            return new SheetHeaderResolution(getOrCreateKuriyamaShelf(side, num, session, shelfCache), true);
        }

        // 3. Conexiones Hidráulicas sheet name ("PB-CHID-A01", "CHID-A1", "CONEXIONES A1", "HIDRAULICA A1")
        java.util.regex.Matcher mChid = java.util.regex.Pattern.compile("(?:PB-)?(?:CHID|CON|HIDRAULIC[AO]S?)-?([ABW])-?0*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mChid.find()) {
            String col = mChid.group(1).toUpperCase();
            int num = Integer.parseInt(mChid.group(2));
            return new SheetHeaderResolution(getOrCreateChidShelf(col, num, session, shelfCache), true);
        }

        // 4. Explicit Acero pattern in sheet name ("ACEROS 5", "PB-ACE-5", "ACE-05", "PB3-05")
        java.util.regex.Matcher mAce = java.util.regex.Pattern.compile("(?:ACEROS?|PB-ACE-|ACE-|PB-?3-?)\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mAce.find()) {
            try {
                int num = Integer.parseInt(mAce.group(1));
                return new SheetHeaderResolution(getOrCreateAceroShelf(num, session, shelfCache), true);
            } catch (Exception ignored) {}
        }

        // 5. Explicit YPC pattern in sheet name ("YPC 5", "PB-YPC-05")
        java.util.regex.Matcher mYpc = java.util.regex.Pattern.compile("(?:PB-)?YPC-?\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mYpc.find()) {
            try {
                int num = Integer.parseInt(mYpc.group(1));
                return new SheetHeaderResolution(getOrCreateYpcShelf(num, session, shelfCache), true);
            } catch (Exception ignored) {}
        }

        // 6. Cybermatics, Dixon, Universal
        java.util.regex.Matcher mCyb = java.util.regex.Pattern.compile("(?:PB-)?CYB(?:ERMATICS)?-?\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mCyb.find()) {
            int num = Integer.parseInt(mCyb.group(1));
            String code = String.format("PB-CYB-%02d", num);
            return new SheetHeaderResolution(getOrCreateShelf(code, "Cybermatics", "Cybermatics " + num, "Planta Baja", null, null, null, null, session, shelfCache), true);
        }
        java.util.regex.Matcher mDix = java.util.regex.Pattern.compile("(?:PB-)?DIX(?:ON)?-?\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mDix.find()) {
            int num = Integer.parseInt(mDix.group(1));
            String code = String.format("PB-DIX-%02d", num);
            return new SheetHeaderResolution(getOrCreateShelf(code, "Dixon", "Dixon " + num, "Planta Baja", null, null, null, null, session, shelfCache), true);
        }
        java.util.regex.Matcher mUni = java.util.regex.Pattern.compile("(?:PB-)?UNI(?:VERSAL)?-?\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mUni.find()) {
            int num = Integer.parseInt(mUni.group(1));
            String code = String.format("PB-UNI-%02d", num);
            return new SheetHeaderResolution(getOrCreateShelf(code, "Universal", "Universal " + num, "Planta Baja", null, null, null, null, session, shelfCache), true);
        }

        // 7. Planta Alta: PVC, Reserva Acero, Sellos
        java.util.regex.Matcher mPvc = java.util.regex.Pattern.compile("(?:PA-)?PVC-?\\s*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mPvc.find()) {
            int num = Integer.parseInt(mPvc.group(1));
            return new SheetHeaderResolution(getOrCreatePvcShelf(num, session, shelfCache), true);
        }
        java.util.regex.Matcher mRes = java.util.regex.Pattern.compile("(?:PA-)?RES(?:ERVA)?-?(?:A-?)?0*(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mRes.find()) {
            int num = Integer.parseInt(mRes.group(1));
            String code = String.format("PA-RES-%02d", num);
            return new SheetHeaderResolution(getOrCreateShelf(code, "Reserva Acero", "Reserva Acero " + num, "Planta Alta", null, null, null, null, session, shelfCache), true);
        }

        // 8. Numbered sheet ("1", "2", ..., "19", "ANAQUEL 3", "ESTANTE 4")
        java.util.regex.Matcher mNum = java.util.regex.Pattern.compile("^(?:(?:ANAQUEL|ESTANTE)\\s*)?0*(\\d{1,2})$", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(sName);
        if (mNum.find()) {
            try {
                int num = Integer.parseInt(mNum.group(1));
                String defCode = userSelectedDefaultShelf != null ? userSelectedDefaultShelf.getCode().toUpperCase() : "";
                if (defCode.startsWith("PB-YPC-")) {
                    return new SheetHeaderResolution(getOrCreateYpcShelf(num, session, shelfCache), true);
                } else if (defCode.startsWith("PB-CHID-") || defCode.startsWith("PB-CON-")) {
                    return new SheetHeaderResolution(getOrCreateChidShelf("A", num, session, shelfCache), true);
                } else if (defCode.startsWith("PB-KUR-")) {
                    char side = defCode.contains("-B") ? 'B' : 'A';
                    return new SheetHeaderResolution(getOrCreateKuriyamaShelf(String.valueOf(side), num, session, shelfCache), true);
                } else if (defCode.startsWith("PA-PVC-")) {
                    return new SheetHeaderResolution(getOrCreatePvcShelf(num, session, shelfCache), true);
                } else if (num >= 1 && num <= 19) {
                    return new SheetHeaderResolution(getOrCreateAceroShelf(num, session, shelfCache), true);
                }
            } catch (Exception ignored) {}
        }

        return new SheetHeaderResolution(userSelectedDefaultShelf, false);
    }

    private SheetHeaderResolution resolveSheetHeaderShelf(String rawSheetName, Shelf userSelectedDefaultShelf, Map<String, Shelf> shelfCache) {
        return resolveSheetHeaderShelf(rawSheetName, userSelectedDefaultShelf, null, shelfCache);
    }

    public Shelf resolveExplicitShelf(ImportedItem item, Shelf userSelectedDefaultShelf, Map<String, Shelf> shelfCache) {
        return resolveExplicitShelf(item, userSelectedDefaultShelf, null, shelfCache);
    }

    public Shelf resolveExplicitShelf(ImportedItem item, Shelf userSelectedDefaultShelf, InventorySession session, Map<String, Shelf> shelfCache) {
        List<String> candidates = new ArrayList<>();
        if (item.shelfName != null && !item.shelfName.isBlank()) {
            candidates.add(item.shelfName.trim().toUpperCase());
        }
        if (item.locationCode != null && !item.locationCode.isBlank()) {
            candidates.add(item.locationCode.trim().toUpperCase());
        }

        for (String candidateCode : candidates) {
            // Direct exact shelf code (PB-ACE-02, PB-KUR-A01, PA-P1-03, etc.)
            Shelf direct = shelfCache.get(candidateCode);
            if (direct != null) return direct;

            // Pattern: PB3-01, PB3-1, PB3-1A-1, PB-3-01 -> PB-ACE-01..19
            java.util.regex.Matcher mPb3 = java.util.regex.Pattern.compile("(?i)^PB-?3-?0*(\\d+)").matcher(candidateCode);
            if (mPb3.find()) {
                int num = Integer.parseInt(mPb3.group(1));
                return getOrCreateAceroShelf(num, session, shelfCache);
            }

            // Pattern: PB-ACE-01, PB-ACE-1, ACE-01, ACE-1
            java.util.regex.Matcher mAce = java.util.regex.Pattern.compile("(?i)^(?:PB-)?ACE-?0*(\\d+)").matcher(candidateCode);
            if (mAce.find()) {
                int num = Integer.parseInt(mAce.group(1));
                return getOrCreateAceroShelf(num, session, shelfCache);
            }

            // Kuriyama: PB-KUR-A01, KUR-A1, KURIYAMA A-1, PB4-A1...
            java.util.regex.Matcher mKur = java.util.regex.Pattern.compile("(?i)^(?:PB-)?(?:KUR|KURIYAMA)-?([AB])-?0*(\\d+)").matcher(candidateCode);
            if (mKur.find()) {
                String side = mKur.group(1).toUpperCase();
                int num = Integer.parseInt(mKur.group(2));
                return getOrCreateKuriyamaShelf(side, num, session, shelfCache);
            }

            // Conexiones Hidráulicas: PB-CHID-A01, CHID-A1, CON-A1, HIDRAULICA A1
            java.util.regex.Matcher mChid = java.util.regex.Pattern.compile("(?i)^(?:PB-)?(?:CHID|CON|HIDRAULIC[AO]S?)-?([ABW])-?0*(\\d+)").matcher(candidateCode);
            if (mChid.find()) {
                String col = mChid.group(1).toUpperCase();
                int num = Integer.parseInt(mChid.group(2));
                return getOrCreateChidShelf(col, num, session, shelfCache);
            }

            // YPC: PB-YPC-01, YPC-1
            java.util.regex.Matcher mYpc = java.util.regex.Pattern.compile("(?i)^(?:PB-)?YPC-?0*(\\d+)").matcher(candidateCode);
            if (mYpc.find()) {
                int num = Integer.parseInt(mYpc.group(1));
                return getOrCreateYpcShelf(num, session, shelfCache);
            }

            // Cybermatics, Dixon, Universal, Parker Inox
            java.util.regex.Matcher mCyb = java.util.regex.Pattern.compile("(?i)^(?:PB-)?CYB(?:ERMATICS)?-?0*(\\d+)").matcher(candidateCode);
            if (mCyb.find()) {
                int num = Integer.parseInt(mCyb.group(1));
                String code = String.format("PB-CYB-%02d", num);
                return getOrCreateShelf(code, "Cybermatics", "Cybermatics " + num, "Planta Baja", null, null, null, null, session, shelfCache);
            }
            java.util.regex.Matcher mDix = java.util.regex.Pattern.compile("(?i)^(?:PB-)?DIX(?:ON)?-?0*(\\d+)").matcher(candidateCode);
            if (mDix.find()) {
                int num = Integer.parseInt(mDix.group(1));
                String code = String.format("PB-DIX-%02d", num);
                return getOrCreateShelf(code, "Dixon", "Dixon " + num, "Planta Baja", null, null, null, null, session, shelfCache);
            }
            java.util.regex.Matcher mUni = java.util.regex.Pattern.compile("(?i)^(?:PB-)?UNI(?:VERSAL)?-?0*(\\d+)").matcher(candidateCode);
            if (mUni.find()) {
                int num = Integer.parseInt(mUni.group(1));
                String code = String.format("PB-UNI-%02d", num);
                return getOrCreateShelf(code, "Universal", "Universal " + num, "Planta Baja", null, null, null, null, session, shelfCache);
            }
            if (candidateCode.matches("(?i)^(?:PB-)?(?:INOX|PARKER-?INOX).*")) {
                return getOrCreateShelf("PB-INOX-01", "Parker Inox", "Parker Inox", "Planta Baja", null, null, null, null, session, shelfCache);
            }

            // Planta Alta: PVC, Reserva
            java.util.regex.Matcher mPvc = java.util.regex.Pattern.compile("(?i)^(?:PA-)?PVC-?0*(\\d+)").matcher(candidateCode);
            if (mPvc.find()) {
                int num = Integer.parseInt(mPvc.group(1));
                return getOrCreatePvcShelf(num, session, shelfCache);
            }
            java.util.regex.Matcher mRes = java.util.regex.Pattern.compile("(?i)^(?:PA-)?RES(?:ERVA)?-?(?:A-?)?0*(\\d+)").matcher(candidateCode);
            if (mRes.find()) {
                int num = Integer.parseInt(mRes.group(1));
                String code = String.format("PA-RES-%02d", num);
                return getOrCreateShelf(code, "Reserva Acero", "Reserva Acero " + num, "Planta Alta", null, null, null, null, session, shelfCache);
            }

            // Pattern: PB-01, PB-1, PB01 -> PB-ACE-01..19
            java.util.regex.Matcher mPbDirect = java.util.regex.Pattern.compile("(?i)^PB-?0*(\\d+)$").matcher(candidateCode);
            if (mPbDirect.find()) {
                int num = Integer.parseInt(mPbDirect.group(1));
                if (num >= 1 && num <= 19) {
                    return getOrCreateAceroShelf(num, session, shelfCache);
                }
            }

            // Location code pattern: PB3-1A-1, PB4-A1A-1, PB5-2A-1, PB1-A1A-1
            java.util.regex.Matcher mLoc = java.util.regex.Pattern.compile("(?i)^(P[BA])(\\d+)-([A-Z])?0*(\\d+)").matcher(candidateCode);
            if (mLoc.find()) {
                String plant = mLoc.group(1).toUpperCase();
                String aisle = mLoc.group(2);
                String sub = mLoc.group(3) != null ? mLoc.group(3).toUpperCase() : "";
                int num = Integer.parseInt(mLoc.group(4));
                if ("PB".equals(plant)) {
                    if ("3".equals(aisle) && num >= 1 && num <= 19) {
                        return getOrCreateAceroShelf(num, session, shelfCache);
                    } else if ("4".equals(aisle)) { // Kuriyama
                        String side = !sub.isEmpty() ? sub : "A";
                        return getOrCreateKuriyamaShelf(side, num, session, shelfCache);
                    } else if ("5".equals(aisle)) { // YPC
                        return getOrCreateYpcShelf(num, session, shelfCache);
                    } else if ("1".equals(aisle)) { // Conexiones Hidráulicas
                        String side = !sub.isEmpty() ? sub : "A";
                        return getOrCreateChidShelf(side, num, session, shelfCache);
                    }
                } else if ("PA".equals(plant)) {
                    return getOrCreatePvcShelf(num, session, shelfCache);
                }
            }

            // Pure number / Estante / Anaquel: e.g. "1", "2", "19", "1.0", "ESTANTE 2", "ANAQUEL 3"
            java.util.regex.Matcher mNum = java.util.regex.Pattern.compile("^(?:(?:ESTANTE|ANAQUEL|RACK|SHELF)\\s*)?0*(\\d+)(?:\\.0+)?$", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(candidateCode);
            if (mNum.find()) {
                int num = Integer.parseInt(mNum.group(1));
                String refCode = item.resolvedShelf != null ? item.resolvedShelf.getCode().toUpperCase()
                        : (userSelectedDefaultShelf != null ? userSelectedDefaultShelf.getCode().toUpperCase() : "");
                if ("3".equals(item.aisle) || (item.locationCode != null && item.locationCode.toUpperCase().startsWith("PB3"))
                        || refCode.startsWith("PB-ACE") || refCode.startsWith("PB3") || refCode.contains("ACERO")) {
                    return getOrCreateAceroShelf(num, session, shelfCache);
                } else if ("1".equals(item.aisle) || refCode.startsWith("PB-CHID") || refCode.startsWith("PB-CON")) {
                    char side = refCode.contains("-B") ? 'B' : 'A';
                    return getOrCreateChidShelf(String.valueOf(side), num, session, shelfCache);
                } else if ("4".equals(item.aisle) || refCode.startsWith("PB-KUR")) {
                    char side = refCode.contains("-B") ? 'B' : 'A';
                    return getOrCreateKuriyamaShelf(String.valueOf(side), num, session, shelfCache);
                } else if ("5".equals(item.aisle) || refCode.startsWith("PB-YPC")) {
                    return getOrCreateYpcShelf(num, session, shelfCache);
                } else if (refCode.startsWith("PA-PVC")) {
                    return getOrCreatePvcShelf(num, session, shelfCache);
                } else if (num >= 1 && num <= 19) {
                    return getOrCreateAceroShelf(num, session, shelfCache);
                }
            }
        }

        // Explicit numbered/shelf sheet fallback
        if (item.sheetFromExplicitRack && item.resolvedShelf != null) {
            return item.resolvedShelf;
        }

        // Final fallback: if aisle is 3 and we have a numeric hint anywhere
        if ("3".equals(item.aisle) && item.shelfName != null && item.shelfName.matches("^0*(\\d+)(?:\\.0+)?$")) {
            try {
                int num = Integer.parseInt(item.shelfName.replaceAll("\\.0+$", ""));
                return getOrCreateAceroShelf(num, session, shelfCache);
            } catch (Exception ignored) {}
        }

        return null;
    }

    /**
     * Imports already counted Excel (.xlsx / .csv) directly into the session,
     * automatically mapping Nivel (S, A-J) to physical shelf sections and supporting
     * SMART_MERGE (update existing + append new), REPLACE_ALL, and WEEKLY_UPDATE modes.
     */
    @Transactional
    public Map<String, Object> importExcelCounts(Long sessionId, Long targetShelfId, String importMode, MultipartFile file, User user) throws Exception {
        return importExcelCounts(sessionId, targetShelfId, importMode, true, null, file, user);
    }

    @Transactional
    public Map<String, Object> importExcelCounts(Long sessionId, Long targetShelfId, String importMode, boolean filterObsolete, MultipartFile file, User user) throws Exception {
        return importExcelCounts(sessionId, targetShelfId, importMode, filterObsolete, null, file, user);
    }

    @Transactional
    public Map<String, Object> importExcelCounts(Long sessionId, Long targetShelfId, String importMode, boolean filterObsolete, String targetFamily, MultipartFile file, User user) throws Exception {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));

        if (!session.isEditable()) {
            throw new IllegalStateException("El inventario está cerrado. Debe reabrirse para importar conteos.");
        }
        if (session.getStatus() == InventorySession.Status.POR_VALIDAR) {
            session.setStatus(InventorySession.Status.EN_CONTEO);
            sessionRepo.save(session);
        }

        String modeUpper = importMode != null ? importMode.trim().toUpperCase() : "SMART_MERGE";
        String mode = "SMART_MERGE";
        if (modeUpper.contains("REPLACE")) {
            mode = "REPLACE_ALL";
        } else if (modeUpper.contains("WEEKLY") || modeUpper.contains("PIEZA") || modeUpper.contains("LEVANTAMIENTO") || modeUpper.contains("UPDATE_QTY")) {
            mode = "WEEKLY_UPDATE";
        }

        String fileName = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";

        // Preload shelf cache before reading workbook so sheet mapping uses canonical shelves
        Map<String, Shelf> shelfCache = new HashMap<>();
        List<Shelf> allActiveShelves = shelfRepo.findByActiveTrueOrderByCodeAsc();
        for (Shelf s : shelfRepo.findAll()) {
            shelfCache.put(s.getCode().toUpperCase(), s);
        }

        Shelf userSelectedDefaultShelf = null;
        if (targetShelfId != null && targetShelfId > 0) {
            userSelectedDefaultShelf = shelfRepo.findById(targetShelfId).orElse(null);
        }
        Shelf filenameInferredShelf = null;
        if (userSelectedDefaultShelf == null && file.getOriginalFilename() != null) {
            String cleanName = file.getOriginalFilename().toUpperCase();
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("ACEROS?\\s*(\\d+)|PB-ACE-(\\d+)|ACE-(\\d+)", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(cleanName);
            if (m.find()) {
                String numStr = m.group(1) != null ? m.group(1) : (m.group(2) != null ? m.group(2) : m.group(3));
                int num = Integer.parseInt(numStr);
                filenameInferredShelf = shelfCache.get(String.format("PB-ACE-%02d", num));
            }
        }
        Shelf pendingShelf = shelfCache.get("PB-PEN-01");
        if (pendingShelf == null) {
            pendingShelf = shelfCache.get("PA-GEN-01");
        }
        if (pendingShelf == null && !allActiveShelves.isEmpty()) {
            pendingShelf = allActiveShelves.get(0);
        }

        Shelf effectiveDefaultShelf = userSelectedDefaultShelf != null ? userSelectedDefaultShelf : filenameInferredShelf;

        List<ImportedItem> itemsToProcess = new ArrayList<>();

        if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
            try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
                DataFormatter formatter = new DataFormatter();
                FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
                List<Sheet> sheetsToRead = new ArrayList<>();

                boolean hasShelfNumberedSheets = false;
                for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
                    String sn = workbook.getSheetName(s).trim();
                    if (sn.matches("^\\d{1,2}$") || sn.matches("(?i)^(?:ANAQUEL|ESTANTE|PB-\\w+-|PA-\\w+-)\\s*[A-Z0-9-]+$")) {
                        hasShelfNumberedSheets = true;
                        break;
                    }
                }

                if (workbook.getNumberOfSheets() > 1) {
                    for (int s = 0; s < workbook.getNumberOfSheets(); s++) {
                        Sheet sh = workbook.getSheetAt(s);
                        String sName = sh.getSheetName().trim().toUpperCase();
                        if (sName.contains("INSTRUCC") || sName.contains("PORTADA") || sName.contains("LEEME") || sName.contains("README")) {
                            continue;
                        }
                        if (hasShelfNumberedSheets && (sName.startsWith("HOJA") || sName.startsWith("SHEET") || sName.contains("COMPARATIV") || sName.contains("RESUMEN") || sName.contains("DIFERENC"))) {
                            boolean isAuditSummary = false;
                            for (int r = 0; r < Math.min(sh.getLastRowNum() + 1, 3); r++) {
                                Row row = sh.getRow(r);
                                if (row == null) continue;
                                for (int c = 0; c < row.getLastCellNum(); c++) {
                                    Cell cell = row.getCell(c);
                                    if (cell != null) {
                                        String cv = cell.toString().trim().toUpperCase();
                                        if (cv.contains("AJUSTE") || cv.contains("SISTEMA") || cv.contains("TIPO DE ELEMENTO")) {
                                            isAuditSummary = true;
                                            break;
                                        }
                                    }
                                }
                                if (isAuditSummary) break;
                            }
                            if (isAuditSummary) {
                                continue;
                            }
                        }
                        sheetsToRead.add(sh);
                    }
                } else {
                    sheetsToRead.add(workbook.getSheetAt(0));
                }

                for (Sheet sheet : sheetsToRead) {
                    SheetHeaderResolution sheetRes = resolveSheetHeaderShelf(sheet.getSheetName(), effectiveDefaultShelf, session, shelfCache);

                    List<String[]> sheetRows = new ArrayList<>();
                    for (Row row : sheet) {
                        if (row == null) continue;
                        List<String> cells = new ArrayList<>();
                        int maxCols = Math.max(row.getLastCellNum(), 7);
                        boolean hasText = false;
                        for (int c = 0; c < maxCols; c++) {
                            Cell cell = row.getCell(c, Row.MissingCellPolicy.CREATE_NULL_AS_BLANK);
                            String val;
                            if (cell.getCellType() == CellType.NUMERIC) {
                                double numVal = cell.getNumericCellValue();
                                val = (numVal == Math.floor(numVal) && !Double.isInfinite(numVal))
                                        ? String.valueOf((long) numVal) : String.valueOf(numVal);
                            } else if (cell.getCellType() == CellType.FORMULA) {
                                CellType cached = cell.getCachedFormulaResultType();
                                if (cached == CellType.NUMERIC) {
                                    double numVal = cell.getNumericCellValue();
                                    val = (numVal == Math.floor(numVal) && !Double.isInfinite(numVal))
                                            ? String.valueOf((long) numVal) : String.valueOf(numVal);
                                } else if (cached == CellType.STRING) {
                                    val = cell.getRichStringCellValue().getString().trim();
                                } else {
                                    try {
                                        val = formatter.formatCellValue(cell, evaluator).trim();
                                    } catch (Exception ignored) {
                                        val = "";
                                    }
                                }
                            } else {
                                val = formatter.formatCellValue(cell).trim();
                            }
                            cells.add(val);
                            if (!val.isBlank()) hasText = true;
                        }
                        if (hasText) sheetRows.add(cells.toArray(new String[0]));
                    }

                    parseSheetRowsIntoItems(sheetRows, sheetRes.shelf, sheetRes.explicitRackSheet, itemsToProcess);
                }
            }
        } else {
            // CSV / TXT fallback with UTF-8 / Windows-1252 auto-detection
            byte[] fileBytes = file.getBytes();
            java.nio.charset.Charset charset = StandardCharsets.UTF_8;
            try {
                java.nio.charset.CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder();
                decoder.decode(java.nio.ByteBuffer.wrap(fileBytes));
            } catch (Exception e) {
                try {
                    charset = java.nio.charset.Charset.forName("Windows-1252");
                } catch (Exception ignored) {
                    charset = StandardCharsets.ISO_8859_1;
                }
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(new java.io.ByteArrayInputStream(fileBytes), charset))) {
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
                parseSheetRowsIntoItems(csvRows, effectiveDefaultShelf, filenameInferredShelf != null, itemsToProcess);
            }
        }

        if (itemsToProcess.isEmpty()) {
            throw new IllegalArgumentException("El archivo está vacío o no contiene partidas legibles.");
        }

        // Pre-resolve explicit physical shelf targets for every imported item
        Map<ImportedItem, Shelf> explicitShelfMap = new IdentityHashMap<>();
        Set<Long> explicitShelfIds = new LinkedHashSet<>();
        Map<Long, Set<String>> codesNeededPerExplicitShelf = new HashMap<>();
        Map<Long, Integer> explicitRowCountPerShelf = new HashMap<>();
        Map<String, Integer> rowCountPerCodeInFile = new HashMap<>();

        for (ImportedItem item : itemsToProcess) {
            rowCountPerCodeInFile.merge(item.code, 1, Integer::sum);
            Shelf s = resolveExplicitShelf(item, effectiveDefaultShelf, session, shelfCache);
            if (s != null) {
                explicitShelfMap.put(item, s);
                explicitShelfIds.add(s.getId());
                codesNeededPerExplicitShelf.computeIfAbsent(s.getId(), k -> new HashSet<>()).add(item.code);
                if (item.hasExplicitShelfInfo || item.section != null) {
                    explicitRowCountPerShelf.merge(s.getId(), 1, Integer::sum);
                }
            }
        }

        boolean isMultiShelfPhysicalImport = explicitShelfIds.size() >= 2;
        Set<Long> fullPhysicalShelfIds = new LinkedHashSet<>();
        if ("REPLACE_ALL".equals(mode)) {
            if (!explicitShelfIds.isEmpty()) {
                fullPhysicalShelfIds.addAll(explicitShelfIds);
            } else if (effectiveDefaultShelf != null) {
                fullPhysicalShelfIds.add(effectiveDefaultShelf.getId());
            }
        } else if (isMultiShelfPhysicalImport) {
            for (Long sId : explicitShelfIds) {
                if (explicitRowCountPerShelf.getOrDefault(sId, 0) >= 10) {
                    fullPhysicalShelfIds.add(sId);
                }
            }
        }

        // In REPLACE_ALL mode, wipe affected shelves BEFORE indexing pre-existing records
        if ("REPLACE_ALL".equals(mode)) {
            for (Long sId : fullPhysicalShelfIds) {
                countRepo.deleteBySessionIdAndShelfId(session.getId(), sId);
            }
            if (!fullPhysicalShelfIds.isEmpty()) {
                countRepo.flush();
            }
        }

        Map<String, Product> productCache = new HashMap<>();
        for (Product p : productRepo.findAll()) {
            productCache.put(p.getCode().toUpperCase(), p);
        }

        List<CountRecord> sessionRecordsAll = countRepo.findBySessionIdOrderByIdAsc(session.getId());
        Map<String, List<CountRecord>> allPreexistingByCode = new HashMap<>();
        Map<Long, Map<String, List<CountRecord>>> preexistingByShelfAndCode = new HashMap<>();
        Map<String, Deque<CountRecord>> relocatableByCode = new HashMap<>();

        for (CountRecord r : sessionRecordsAll) {
            String cu = r.getCapturedCode().toUpperCase();
            allPreexistingByCode.computeIfAbsent(cu, k -> new ArrayList<>()).add(r);
            if (r.getShelf() != null) {
                Long sId = r.getShelf().getId();
                String sCode = r.getShelf().getCode().toUpperCase();
                preexistingByShelfAndCode
                        .computeIfAbsent(sId, k -> new HashMap<>())
                        .computeIfAbsent(cu, k -> new ArrayList<>())
                        .add(r);

                boolean isLegacyAce = sCode.startsWith("PB-ACE-");
                boolean isPendingBucket = sCode.contains("PEN") || sCode.contains("GEN");
                boolean isStrandedOnSingleDump = isMultiShelfPhysicalImport
                        && (sCode.equals("PB3-01") || sCode.equals("PB-ACE-01") || (effectiveDefaultShelf != null && effectiveDefaultShelf.getId().equals(sId)))
                        && !codesNeededPerExplicitShelf.getOrDefault(sId, Collections.emptySet()).contains(cu);

                if (isLegacyAce || isPendingBucket || isStrandedOnSingleDump) {
                    relocatableByCode.computeIfAbsent(cu, k -> new ArrayDeque<>()).add(r);
                }
            }
        }

        Map<Long, ShelfAssignment> assignmentMap = new HashMap<>();
        for (ShelfAssignment sa : assignmentRepo.findBySessionIdOrderByShelfCodeAsc(session.getId())) {
            assignmentMap.put(sa.getShelf().getId(), sa);
        }

        int importedCount = 0;
        int addedRecords = 0;
        int updatedRecords = 0;
        int withSectionCount = 0;
        int obsoleteFilteredCount = 0;
        double totalPiecesImported = 0.0;
        Set<Long> affectedShelves = new LinkedHashSet<>();
        Set<Long> claimedPreexistingIds = new HashSet<>();

        List<Product> newProductsToSave = new ArrayList<>();
        List<CountRecord> recordsToSave = new ArrayList<>();
        Map<Long, ShelfAssignment> assignmentsToSave = new HashMap<>();

        String familyHint = (targetFamily != null && !targetFamily.isBlank()) ? targetFamily.trim().toLowerCase() : "general";

        for (ImportedItem item : itemsToProcess) {
            String code = item.code;
            double qty = item.quantity != null ? item.quantity : 0.0;
            String normalizedSec = item.section;

            if (isObsoleteOrEliminated(code, item.description)) {
                obsoleteFilteredCount++;
            }

            Shelf explicitShelf = explicitShelfMap.get(item);

            // CASE A: Row has NO explicit shelf/sheet info (e.g. plain Aspel SAE stock export)
            if (explicitShelf == null) {
                List<CountRecord> existingMatches = allPreexistingByCode.getOrDefault(code, Collections.emptyList());
                List<CountRecord> physicalMatches = new ArrayList<>();
                List<CountRecord> pendingMatches = new ArrayList<>();
                for (CountRecord r : existingMatches) {
                    if (r.getId() != null && claimedPreexistingIds.contains(r.getId())) continue;
                    String sc = r.getShelf() != null ? r.getShelf().getCode().toUpperCase() : "";
                    if (sc.contains("PEN") || sc.contains("GEN") || sc.matches("^PB-?3-?\\d+$")) {
                        pendingMatches.add(r);
                    } else {
                        physicalMatches.add(r);
                    }
                }

                // If item ALREADY lives on physical shelf(ves) and user isn't explicitly forcing single-shelf REPLACE_ALL:
                // Update stock quantity IN-PLACE while keeping physical shelf, level (S, A-J), and location intact!
                if (!physicalMatches.isEmpty() && (!"REPLACE_ALL".equals(mode) || userSelectedDefaultShelf == null)) {
                    boolean singleSaeSummaryForCode = rowCountPerCodeInFile.getOrDefault(code, 1) == 1;
                    for (int i = 0; i < physicalMatches.size(); i++) {
                        CountRecord rec = physicalMatches.get(i);
                        if (rec.getVersion() == null) rec.setVersion(0L);
                        if (item.hasExplicitQuantity) {
                            rec.setPreviousQuantity(rec.getQuantity());
                            rec.setQuantity((singleSaeSummaryForCode && i > 0) ? 0.0 : qty);
                        }
                        if (item.description != null && !item.description.isBlank() && rec.getProduct() != null) {
                            rec.getProduct().setDescription(item.description);
                            productCache.put(code, rec.getProduct());
                            newProductsToSave.add(rec.getProduct());
                        }
                        if ((rec.getSection() == null || rec.getSection().isBlank()) && normalizedSec != null) {
                            rec.setSection(normalizedSec);
                        }
                        rec.setUpdatedAt(LocalDateTime.now());
                        rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                        recordsToSave.add(rec);
                        if (rec.getId() != null) claimedPreexistingIds.add(rec.getId());
                        if (rec.getSection() != null && !rec.getSection().isBlank()) withSectionCount++;
                        updatedRecords++;

                        Shelf sh = rec.getShelf();
                        affectedShelves.add(sh.getId());
                        ShelfAssignment sa = assignmentMap.get(sh.getId());
                        if (sa == null) {
                            sa = new ShelfAssignment(session, sh, user);
                            assignmentMap.put(sh.getId(), sa);
                        }
                        if (rec.getSection() != null && !rec.getSection().isBlank()) {
                            sa.setStatus(ShelfAssignment.Status.COMPLETADO);
                            sa.setCompletedAt(LocalDateTime.now());
                        } else if (sa.getStatus() == ShelfAssignment.Status.PENDIENTE) {
                            sa.setStatus(ShelfAssignment.Status.EN_CONTEO);
                        }
                        assignmentsToSave.put(sh.getId(), sa);
                        if (singleSaeSummaryForCode) break; // primary bin holds full quantity; secondary zeroed only if more exist
                    }
                    // If singleSaeSummaryForCode had secondary physical bins, zero them to prevent double stock inflation
                    if (singleSaeSummaryForCode && physicalMatches.size() > 1 && item.hasExplicitQuantity) {
                        for (int i = 1; i < physicalMatches.size(); i++) {
                            CountRecord extra = physicalMatches.get(i);
                            if (extra.getVersion() == null) extra.setVersion(0L);
                            extra.setPreviousQuantity(extra.getQuantity());
                            extra.setQuantity(0.0);
                            extra.setUpdatedAt(LocalDateTime.now());
                            recordsToSave.add(extra);
                            if (extra.getId() != null) claimedPreexistingIds.add(extra.getId());
                        }
                    }

                    importedCount++;
                    if (item.hasExplicitQuantity) totalPiecesImported += qty;
                    continue;
                }

                // Brand new or unlocated SAE SKU:
                // NEVER pollute physical shelves (e.g. Acero 18,015 pcs, Kuriyama, etc.) with random unlocated SAE items!
                // Only place on userSelectedDefaultShelf if user explicitly selected a Pending / General buffer shelf.
                boolean userShelfIsPending = userSelectedDefaultShelf != null &&
                        (userSelectedDefaultShelf.getCode().contains("PEN") || userSelectedDefaultShelf.getCode().contains("GEN") || "Pendiente".equalsIgnoreCase(userSelectedDefaultShelf.getZone()));
                Shelf targetShelf = userShelfIsPending ? userSelectedDefaultShelf : pendingShelf;
                if (targetShelf == null) targetShelf = pendingShelf;
                if (targetShelf == null) continue;

                Product product = productCache.get(code);
                if (product == null) {
                    String desc = (item.description != null && !item.description.isBlank()) ? item.description : parseIndustrialDescription(code);
                    product = new Product(code, desc, "PZA", "GENERAL", targetShelf.getCode(), 0.0);
                    productCache.put(code, product);
                    newProductsToSave.add(product);
                }

                CountRecord rec = null;
                if (!pendingMatches.isEmpty()) {
                    rec = pendingMatches.get(0);
                } else {
                    List<CountRecord> onTarget = preexistingByShelfAndCode
                            .getOrDefault(targetShelf.getId(), Collections.emptyMap())
                            .getOrDefault(code, Collections.emptyList());
                    for (CountRecord cand : onTarget) {
                        if (cand.getId() == null || !claimedPreexistingIds.contains(cand.getId())) {
                            rec = cand;
                            break;
                        }
                    }
                }

                if (rec != null) {
                    if (rec.getVersion() == null) rec.setVersion(0L);
                    rec.setShelf(targetShelf);
                    if (item.hasExplicitQuantity) {
                        rec.setPreviousQuantity(rec.getQuantity());
                        rec.setQuantity(qty);
                    }
                    if (item.description != null && !item.description.isBlank() && rec.getProduct() != null) {
                        rec.getProduct().setDescription(item.description);
                        productCache.put(code, rec.getProduct());
                        newProductsToSave.add(rec.getProduct());
                    }
                    if (normalizedSec != null) rec.setSection(normalizedSec);
                    rec.setNotes(item.locationCode != null && !item.locationCode.isBlank() ? item.locationCode : ("SIN_DEFINIR::" + familyHint));
                    rec.setUpdatedAt(LocalDateTime.now());
                    rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                    recordsToSave.add(rec);
                    if (rec.getId() != null) claimedPreexistingIds.add(rec.getId());
                    updatedRecords++;
                } else {
                    rec = new CountRecord();
                    rec.setSession(session);
                    rec.setShelf(targetShelf);
                    rec.setProduct(product);
                    rec.setCapturedCode(code);
                    rec.setQuantity(item.hasExplicitQuantity ? qty : 0.0);
                    rec.setSection(normalizedSec);
                    rec.setUser(user);
                    rec.setNotes(item.locationCode != null && !item.locationCode.isBlank() ? item.locationCode : ("SIN_DEFINIR::" + familyHint));
                    rec.setCountedAt(LocalDateTime.now());
                    rec.setUpdatedAt(LocalDateTime.now());
                    rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                    recordsToSave.add(rec);
                    addedRecords++;
                }
                if (rec.getSection() != null && !rec.getSection().isBlank()) withSectionCount++;

                ShelfAssignment sa = assignmentMap.get(targetShelf.getId());
                if (sa == null) {
                    sa = new ShelfAssignment(session, targetShelf, user);
                    assignmentMap.put(targetShelf.getId(), sa);
                }
                boolean isPendingBucket = targetShelf.getCode().toUpperCase().contains("PEN") || targetShelf.getCode().toUpperCase().contains("GEN");
                if (!isPendingBucket && normalizedSec != null) {
                    sa.setStatus(ShelfAssignment.Status.COMPLETADO);
                    sa.setCompletedAt(LocalDateTime.now());
                } else if (sa.getStatus() == ShelfAssignment.Status.PENDIENTE) {
                    sa.setStatus(ShelfAssignment.Status.EN_CONTEO);
                }
                assignmentsToSave.put(targetShelf.getId(), sa);
                affectedShelves.add(targetShelf.getId());
                importedCount++;
                if (item.hasExplicitQuantity) totalPiecesImported += qty;
                continue;
            }

            // CASE B: Row has EXPLICIT physical shelf (e.g. Multi-sheet 1..19, ESTANTE column, UBICACION PB3-2A-1)
            Shelf finalShelf = explicitShelf;

            ShelfAssignment sa = assignmentMap.get(finalShelf.getId());
            if (sa == null) {
                sa = new ShelfAssignment(session, finalShelf, user);
                assignmentMap.put(finalShelf.getId(), sa);
            }

            Product product = productCache.get(code);
            if (product == null) {
                String desc = (item.description != null && !item.description.isBlank()) ? item.description : parseIndustrialDescription(code);
                product = new Product(code, desc, "PZA", "GENERAL", finalShelf.getCode(), 0.0);
                productCache.put(code, product);
                newProductsToSave.add(product);
            }

            // Find an UNCLAIMED preexisting record on finalShelf first (exact section match preferred!)
            CountRecord rec = null;
            List<CountRecord> candidatesOnShelf = preexistingByShelfAndCode
                    .getOrDefault(finalShelf.getId(), Collections.emptyMap())
                    .getOrDefault(code, Collections.emptyList());

            if (normalizedSec != null) {
                for (CountRecord cand : candidatesOnShelf) {
                    if (cand.getId() != null && claimedPreexistingIds.contains(cand.getId())) continue;
                    if (normalizedSec.equalsIgnoreCase(cand.getSection())) {
                        rec = cand;
                        break;
                    }
                }
            }
            if (rec == null) {
                for (CountRecord cand : candidatesOnShelf) {
                    if (cand.getId() != null && claimedPreexistingIds.contains(cand.getId())) continue;
                    if (cand.getSection() == null || cand.getSection().isBlank()) {
                        rec = cand;
                        break;
                    }
                }
            }
            if (rec == null) {
                for (CountRecord cand : candidatesOnShelf) {
                    if (cand.getId() != null && claimedPreexistingIds.contains(cand.getId())) continue;
                    rec = cand;
                    break;
                }
            }

            // Otherwise relocate an UNCLAIMED trapped record from PB3-*, PENDIENTE, or stranded Anaquel 1
            if (rec == null) {
                Deque<CountRecord> relocDeque = relocatableByCode.get(code);
                if (relocDeque != null) {
                    while (!relocDeque.isEmpty()) {
                        CountRecord cand = relocDeque.pollFirst();
                        if (cand.getId() == null || !claimedPreexistingIds.contains(cand.getId())) {
                            rec = cand;
                            break;
                        }
                    }
                }
            }

            if (rec != null) {
                if (rec.getVersion() == null) rec.setVersion(0L);
                rec.setShelf(finalShelf);
                rec.setPreviousQuantity(rec.getQuantity());
                rec.setQuantity(item.hasExplicitQuantity ? qty : 0.0);
                if (item.description != null && !item.description.isBlank() && rec.getProduct() != null) {
                    rec.getProduct().setDescription(item.description);
                    productCache.put(code, rec.getProduct());
                    newProductsToSave.add(rec.getProduct());
                }
                rec.setSection(normalizedSec);
                if (item.locationCode != null && !item.locationCode.isBlank()) {
                    rec.setNotes(item.locationCode);
                } else {
                    rec.setNotes(null);
                }
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                recordsToSave.add(rec);
                if (rec.getId() != null) claimedPreexistingIds.add(rec.getId());
                updatedRecords++;
                if (rec.getSection() != null && !rec.getSection().isBlank()) withSectionCount++;
            } else {
                rec = new CountRecord();
                rec.setSession(session);
                rec.setShelf(finalShelf);
                rec.setProduct(product);
                rec.setCapturedCode(code);
                rec.setQuantity(item.hasExplicitQuantity ? qty : 0.0);
                rec.setSection(normalizedSec);
                if (rec.getSection() != null && !rec.getSection().isBlank()) withSectionCount++;
                rec.setUser(user);
                rec.setNotes(item.locationCode != null && !item.locationCode.isBlank() ? item.locationCode : null);
                rec.setCountedAt(LocalDateTime.now());
                rec.setUpdatedAt(LocalDateTime.now());
                rec.setValidationStatus(CountRecord.ValidationStatus.VALIDO);
                recordsToSave.add(rec);
                addedRecords++;
            }

            if (finalShelf.getCode().toUpperCase().contains("PEN")) {
                if (sa.getStatus() == ShelfAssignment.Status.PENDIENTE) {
                    sa.setStatus(ShelfAssignment.Status.EN_CONTEO);
                }
            } else {
                sa.setStatus(ShelfAssignment.Status.COMPLETADO);
                sa.setCompletedAt(LocalDateTime.now());
            }
            assignmentsToSave.put(finalShelf.getId(), sa);

            affectedShelves.add(finalShelf.getId());
            importedCount++;
            if (item.hasExplicitQuantity) {
                totalPiecesImported += qty;
            }
        }

        // Reconcile leftover unclaimed records ONLY on full covered physical shelves
        // (eliminates old trapped records and old duplicate merges when re-importing full rack sheets)
        if (isMultiShelfPhysicalImport) {
            List<CountRecord> staleToDelete = new ArrayList<>();
            for (CountRecord r : sessionRecordsAll) {
                if (r.getId() != null && claimedPreexistingIds.contains(r.getId())) continue;
                if (r.getShelf() == null) continue;
                boolean isCoveredFullShelf = fullPhysicalShelfIds.contains(r.getShelf().getId());
                if (isCoveredFullShelf) {
                    staleToDelete.add(r);
                }
            }
            if (!staleToDelete.isEmpty()) {
                countRepo.deleteAll(staleToDelete);
            }
        }

        // Commit cached batches in bulk
        if (!newProductsToSave.isEmpty()) {
            productRepo.saveAll(newProductsToSave);
        }
        if (!recordsToSave.isEmpty()) {
            countRepo.saveAll(recordsToSave);
        }
        if (!assignmentsToSave.isEmpty()) {
            assignmentRepo.saveAll(assignmentsToSave.values());
        }
        countRepo.flush();

        Double sessionTotalPieces = countRepo.sumQuantityBySessionId(session.getId());
        if (sessionTotalPieces == null) sessionTotalPieces = 0.0;

        List<String> affectedCodes = new ArrayList<>();
        for (Long sId : affectedShelves) {
            shelfRepo.findById(sId).ifPresent(s -> affectedCodes.add(s.getCode()));
        }

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "IMPORTAR_CONTEOS_EXCEL", "CountRecord", null,
                mode, String.valueOf(importedCount),
                String.format("Importación (%s): %d partidas (%d nuevas, %d actualizadas, %d con nivel S/A-J, %.2f pzas, %d obsoletas identificadas) en %d anaqueles desde %s",
                        mode, importedCount, addedRecords, updatedRecords, withSectionCount, totalPiecesImported, obsoleteFilteredCount, affectedShelves.size(), file.getOriginalFilename()));

        Map<String, Object> resp = new HashMap<>();
        resp.put("importedRecords", importedCount);
        resp.put("addedRecords", addedRecords);
        resp.put("updatedRecords", updatedRecords);
        resp.put("withSectionCount", withSectionCount);
        resp.put("totalPieces", totalPiecesImported);
        resp.put("sessionTotalPieces", sessionTotalPieces);
        resp.put("shelvesUpdated", affectedShelves.size());
        resp.put("affectedShelves", affectedCodes);
        resp.put("obsoleteFiltered", obsoleteFilteredCount);
        resp.put("importMode", mode);
        return resp;
    }

    @Transactional
    public Map<String, Object> purgeObsoleteCounts(Long sessionId, User user) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));
        List<CountRecord> all = countRepo.findBySessionIdOrderByUpdatedAtDesc(session.getId());
        List<CountRecord> toDelete = new ArrayList<>();
        for (CountRecord r : all) {
            String desc = r.getProduct() != null ? r.getProduct().getDescription() : null;
            if (isObsoleteOrEliminated(r.getCapturedCode(), desc)) {
                toDelete.add(r);
            }
        }
        if (!toDelete.isEmpty()) {
            countRepo.deleteAll(toDelete);
        }
        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "PURGE_OBSOLETE_COUNTS", "CountRecord", null,
                null, String.valueOf(toDelete.size()),
                String.format("Se depuraron %d partidas obsoletas o marcadas con 'ELIMINAR'", toDelete.size()));
        Map<String, Object> res = new HashMap<>();
        res.put("purgedCount", toDelete.size());
        res.put("remainingCount", all.size() - toDelete.size());
        return res;
    }

    @Transactional
    public Map<String, Object> autoAssignFromMasterCatalog(Long sessionId, String family, User user) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));
        List<CountRecord> all = countRepo.findBySessionIdOrderByUpdatedAtDesc(session.getId());
        Map<String, Shelf> shelfCache = new HashMap<>();
        for (Shelf s : shelfRepo.findAll()) {
            shelfCache.put(s.getCode().toUpperCase(), s);
        }

        int modifiedCount = 0;
        List<CountRecord> toSave = new ArrayList<>();
        for (CountRecord r : all) {
            String code = r.getCapturedCode();
            AceroMasterCatalogService.AceroLocationItem item = aceroCatalog.findByCode(code);
            if (item != null) {
                boolean dirty = false;
                Shelf target = shelfCache.get(item.shelfCode);
                if (target != null && !target.equals(r.getShelf())) {
                    r.setShelf(target);
                    dirty = true;
                }
                if (item.level != null && (r.getSection() == null || r.getSection().isBlank() || !r.getSection().equalsIgnoreCase(item.level))) {
                    r.setSection(item.level);
                    dirty = true;
                }
                if (item.locationCode != null && (r.getNotes() == null || r.getNotes().isBlank() || !r.getNotes().startsWith("PB3-"))) {
                    r.setNotes(item.locationCode);
                    dirty = true;
                }
                if (dirty) {
                    r.setUpdatedAt(LocalDateTime.now());
                    toSave.add(r);
                    modifiedCount++;
                }
            }
        }
        if (!toSave.isEmpty()) {
            countRepo.saveAll(toSave);
        }
        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "AUTO_ASSIGN_MASTER_CATALOG", "CountRecord", null,
                family, String.valueOf(modifiedCount),
                String.format("Se auto-asignaron %d ubicaciones físicas desde catálogo maestro para %s", modifiedCount, family));
        Map<String, Object> res = new HashMap<>();
        res.put("modifiedCount", modifiedCount);
        return res;
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
            String[] cols = {"CLAVE", "PLANTA", "PASILLO", "ESTANTE", "NIVEL", "POSICIÓN", "UBICACIÓN", "EXISTENCIAS FÍSICAS", "DESCRIPCIÓN"};
            int[] widths = {24 * 256, 12 * 256, 12 * 256, 14 * 256, 12 * 256, 12 * 256, 18 * 256, 20 * 256, 36 * 256};
            for (int c = 0; c < cols.length; c++) {
                Cell cell = header.createCell(c);
                cell.setCellValue(cols[c]);
                cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(c, widths[c]);
            }

            // Example rows matching reality (aceros-re conteo)
            Object[][] samples = {
                {"CG401/2", "PB", 3, 1, "A", 1, "PB3-1A-1", 63.0, "CODO 45 GALV C-40 1/2"},
                {"RBG1/2X1/8", "PB", 3, 2, "A", 1, "PB3-2A-1", 57.0, "REDUCCION BUSHING GALV 1/2 X 1/8"},
                {"TMG1/4", "PB", 3, 3, "A", 1, "PB3-3A-1", 125.0, "TEE MACHO GALV 1/4"},
                {"25KL4P00030X", "PB", 3, 19, "A", 1, "PB3-19A-1", 5.0, "MANOMETRO INDUSTRIAL INOX"}
            };
            for (int r = 0; r < samples.length; r++) {
                Row row = sheet.createRow(r + 1);
                row.createCell(0).setCellValue((String) samples[r][0]);
                row.createCell(1).setCellValue((String) samples[r][1]);
                row.createCell(2).setCellValue(String.valueOf(samples[r][2]));
                row.createCell(3).setCellValue(String.valueOf(samples[r][3]));
                Cell cLvl = row.createCell(4);
                cLvl.setCellValue((String) samples[r][4]);
                cLvl.setCellStyle(levelStyle);
                row.createCell(5).setCellValue(String.valueOf(samples[r][5]));
                row.createCell(6).setCellValue((String) samples[r][6]);
                row.createCell(7).setCellValue(((Double) samples[r][7]));
                row.createCell(8).setCellValue((String) samples[r][8]);
            }

            // Excel Dropdown Validation for PLANTA column (PB, PA) on rows 2..500
            DataValidationHelper dvHelper = sheet.getDataValidationHelper();
            DataValidationConstraint dvPlanta = dvHelper.createExplicitListConstraint(new String[]{"PB", "PA"});
            CellRangeAddressList plantaRange = new CellRangeAddressList(1, 500, 1, 1);
            sheet.addValidationData(dvHelper.createValidation(dvPlanta, plantaRange));

            // Excel Dropdown Validation for NIVEL column (S, A-J) on rows 2..500
            DataValidationConstraint dvConstraint = dvHelper.createExplicitListConstraint(new String[]{"S", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J"});
            CellRangeAddressList addressList = new CellRangeAddressList(1, 500, 4, 4);
            DataValidation validation = dvHelper.createValidation(dvConstraint, addressList);
            validation.setShowErrorBox(true);
            validation.createErrorBox("Nivel no válido", "Solo se permiten niveles S (Superior) y A a J.");
            sheet.addValidationData(validation);

            // Instructions Sheet
            Sheet info = wb.createSheet("Instrucciones");
            info.setColumnWidth(0, 105 * 256);
            String[] tips = {
                "PLANTILLA OFICIAL INTERFLU INVENTORY - COMPATIBLE CON ASPEL SAE Y RE-CONTEO",
                "",
                "1. Columna CLAVE: Clave o código del producto/refacción (idéntico al SAE).",
                "2. Columna PLANTA: Planta física: PB (Planta Baja) o PA (Planta Alta).",
                "3. Columna PASILLO: Número o código de pasillo (ej. 3 para pasillo Acero).",
                "4. Columna ESTANTE: Número de anaquel o estante (ej. 1, 2, ..., 19). ¡En Interflu, ESTANTE es exactamente lo mismo que ANAQUEL!",
                "5. Columna NIVEL: Nivel del anaquel (S para Nivel Superior, o letras A a la J).",
                "6. Columna POSICIÓN: Número de casilla o gaveta (ej. 1, 2, 3...).",
                "7. Columna UBICACIÓN: Conjunto de Planta, Pasillo, Estante, Nivel y Posición (ej. PB3-1A-1, PB3-2A-1).",
                "8. Columna EXISTENCIAS FÍSICAS: Cantidad o número de piezas contadas físicamente.",
                "9. Columna DESCRIPCIÓN (Opcional): Nombre o detalle del material.",
                "",
                "NOTAS DEL SISTEMA INTELIGENTE DE IMPORTACIÓN:",
                "- El importador reconoce automáticamente la columna ESTANTE para acomodar cada código en su anaquel correspondiente (ej. Estante 1 va a PB-ACE-01, Estante 2 a PB-ACE-02, etc.).",
                "- También reconoce libros multi-hoja donde cada hoja lleva el número del estante ('1', '2', ..., '19').",
                "- Si el archivo contiene códigos sin ubicación definida, se conservan todas sus columnas y se resaltan en amarillo para asignación rápida."
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

        Double totalPieces = countRepo.sumQuantityBySessionId(sessionId);
        double pieces = totalPieces != null ? totalPieces : 0.0;
        long deletedCount = countRepo.countBySessionId(sessionId);

        // Fast atomic bulk delete and reset (instantaneous in SQLite)
        countRepo.deleteBySessionId(sessionId);
        assignmentRepo.resetAllBySessionId(sessionId);

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

    @Transactional(readOnly = true)
    public Map<String, Object> getStockAlerts(Long sessionId) {
        InventorySession session = null;
        if (sessionId != null && sessionId > 0) {
            session = sessionRepo.findById(sessionId).orElse(null);
        }
        if (session == null) {
            session = sessionRepo.findAll().stream()
                    .filter(s -> s.getStatus() != InventorySession.Status.CERRADO_EXITO && s.getStatus() != InventorySession.Status.CERRADO_NO_EXITO)
                    .findFirst().orElse(null);
        }
        if (session == null) {
            List<InventorySession> all = sessionRepo.findAll();
            if (!all.isEmpty()) session = all.get(0);
        }

        if (session == null) {
            return Map.of("totalAlerts", 0, "criticalCount", 0, "reorderCount", 0, "overstockCount", 0, "optimalCount", 0, "items", List.of());
        }

        List<CountRecord> allCounts = countRepo.findBySessionIdOrderByUpdatedAtDesc(session.getId());
        Map<String, List<CountRecord>> byCode = new LinkedHashMap<>();
        for (CountRecord cr : allCounts) {
            if (cr.getCapturedCode() == null || cr.getCapturedCode().isBlank()) continue;
            byCode.computeIfAbsent(cr.getCapturedCode().trim().toUpperCase(), k -> new ArrayList<>()).add(cr);
        }

        List<Map<String, Object>> alertItems = new ArrayList<>();
        int criticalCount = 0;
        int reorderCount = 0;
        int overstockCount = 0;
        int optimalCount = 0;

        for (Map.Entry<String, List<CountRecord>> entry : byCode.entrySet()) {
            String code = entry.getKey();
            List<CountRecord> records = entry.getValue();

            double totalQty = 0.0;
            String desc = null;
            Set<String> shelves = new LinkedHashSet<>();
            Set<String> locations = new LinkedHashSet<>();
            String mainZone = "General";
            String mainPlant = "Planta Baja";
            Long firstShelfId = null;

            for (CountRecord r : records) {
                totalQty += (r.getQuantity() != null ? r.getQuantity() : 0.0);
                if (desc == null && r.getProduct() != null && r.getProduct().getDescription() != null && !r.getProduct().getDescription().isBlank()) {
                    desc = r.getProduct().getDescription();
                }
                if (r.getShelf() != null) {
                    shelves.add(r.getShelf().getCode());
                    if (firstShelfId == null) firstShelfId = r.getShelf().getId();
                    if (r.getShelf().getZone() != null) mainZone = r.getShelf().getZone();
                    if (r.getShelf().getPlant() != null) mainPlant = r.getShelf().getPlant();
                }
                String loc = r.getNotes() != null && !r.getNotes().isBlank() ? r.getNotes() :
                        (r.getShelf() != null ? r.getShelf().getCode() + (r.getSection() != null ? " · " + r.getSection() : "") : "");
                if (!loc.isBlank()) locations.add(loc);
            }

            if (desc == null) desc = parseIndustrialDescription(code);

            Product prod = null;
            for (CountRecord r : records) {
                if (r.getProduct() != null) {
                    prod = r.getProduct();
                    break;
                }
            }
            if (prod == null) {
                prod = productRepo.findByCode(code).orElse(null);
            }

            long monthlyDemandAvg = Math.max(12, Math.round((totalQty > 0 ? totalQty : 25) * 1.25));
            boolean isCustom = false;
            long minimoSeguridad;
            long puntoReorden;
            long maximoObjetivo;

            if (prod != null && prod.getMinStock() != null) {
                minimoSeguridad = Math.round(prod.getMinStock());
                isCustom = true;
            } else {
                minimoSeguridad = Math.max(5, Math.round(monthlyDemandAvg * 0.5));
            }

            if (prod != null && prod.getReorderPoint() != null) {
                puntoReorden = Math.round(prod.getReorderPoint());
                isCustom = true;
            } else {
                puntoReorden = Math.max(10, Math.round(monthlyDemandAvg * 0.833));
            }

            if (prod != null && prod.getMaxStock() != null) {
                maximoObjetivo = Math.round(prod.getMaxStock());
                isCustom = true;
            } else {
                maximoObjetivo = Math.max(25, Math.round(monthlyDemandAvg * 1.833));
            }

            long packageSize = monthlyDemandAvg > 50 ? 10 : 5;

            String status;
            String statusLabel;
            String severity;
            long cuantoPedir = 0;

            if (totalQty <= minimoSeguridad) {
                status = "CRITICO";
                statusLabel = "Stock Mínimo / Crítico";
                severity = "danger";
                criticalCount++;
                cuantoPedir = Math.max(packageSize, (long) Math.ceil((double) (maximoObjetivo - totalQty) / packageSize) * packageSize);
            } else if (totalQty <= puntoReorden) {
                status = "POR_REORDENAR";
                statusLabel = "Punto de Reorden";
                severity = "warning";
                reorderCount++;
                cuantoPedir = Math.max(packageSize, (long) Math.ceil((double) (maximoObjetivo - totalQty) / packageSize) * packageSize);
            } else if (totalQty > maximoObjetivo) {
                status = "SOBRESTOCK";
                statusLabel = "Sobrestock / Excedente";
                severity = "info";
                overstockCount++;
            } else {
                status = "OPTIMO";
                statusLabel = "Stock Óptimo";
                severity = "success";
                optimalCount++;
            }

            Map<String, Object> itemMap = new HashMap<>();
            itemMap.put("code", code);
            itemMap.put("description", desc);
            itemMap.put("stockActual", totalQty);
            itemMap.put("minimoSeguridad", minimoSeguridad);
            itemMap.put("puntoReorden", puntoReorden);
            itemMap.put("maximoObjetivo", maximoObjetivo);
            itemMap.put("cuantoPedir", cuantoPedir);
            itemMap.put("isCustomThresholds", isCustom);
            itemMap.put("customMinStock", prod != null ? prod.getMinStock() : null);
            itemMap.put("customReorderPoint", prod != null ? prod.getReorderPoint() : null);
            itemMap.put("customMaxStock", prod != null ? prod.getMaxStock() : null);
            itemMap.put("status", status);
            itemMap.put("statusLabel", statusLabel);
            itemMap.put("severity", severity);
            itemMap.put("zone", mainZone);
            itemMap.put("plant", mainPlant);
            itemMap.put("shelfCode", String.join(", ", shelves));
            itemMap.put("shelfId", firstShelfId);
            itemMap.put("locationCode", String.join(", ", locations));
            itemMap.put("unit", "PZA");
            itemMap.put("recordCount", records.size());

            alertItems.add(itemMap);
        }

        alertItems.sort((a, b) -> {
            int rankA = getStatusRank((String) a.get("status"));
            int rankB = getStatusRank((String) b.get("status"));
            if (rankA != rankB) return Integer.compare(rankA, rankB);
            return ((String) a.get("code")).compareTo((String) b.get("code"));
        });

        Map<String, Object> resp = new HashMap<>();
        resp.put("sessionId", session.getId());
        resp.put("sessionFolio", session.getFolio());
        resp.put("totalAlerts", criticalCount + reorderCount + overstockCount);
        resp.put("totalProducts", alertItems.size());
        resp.put("criticalCount", criticalCount);
        resp.put("reorderCount", reorderCount);
        resp.put("overstockCount", overstockCount);
        resp.put("optimalCount", optimalCount);
        resp.put("items", alertItems);
        return resp;
    }

    private int getStatusRank(String status) {
        if ("CRITICO".equals(status)) return 1;
        if ("POR_REORDENAR".equals(status)) return 2;
        if ("SOBRESTOCK".equals(status)) return 3;
        return 4;
    }

    @Transactional
    public Map<String, Object> updateStockThresholds(String code, Double minStock, Double reorderPoint, Double maxStock, User user) {
        if (code == null || code.trim().isEmpty()) {
            throw new IllegalArgumentException("El código de producto es obligatorio.");
        }
        String cleanCode = code.trim().toUpperCase();
        Product prod = productRepo.findByCode(cleanCode).orElse(null);
        if (prod == null) {
            String desc = parseIndustrialDescription(cleanCode);
            prod = new Product(cleanCode, desc, "PZA", "GENERAL", "PB-PEN-01", 0.0);
        }
        prod.setMinStock(minStock != null && minStock >= 0 ? minStock : null);
        prod.setReorderPoint(reorderPoint != null && reorderPoint >= 0 ? reorderPoint : null);
        prod.setMaxStock(maxStock != null && maxStock >= 0 ? maxStock : null);
        prod.setUpdatedAt(LocalDateTime.now());
        prod = productRepo.save(prod);

        auditService.log(null, null, user.getUsername(), user.getFullName(),
                "ACTUALIZAR_UMBRALES_STOCK", "Product", prod.getId(),
                null, String.format("Min: %s, Reorden: %s, Max: %s", minStock, reorderPoint, maxStock),
                String.format("Umbrales de stock actualizados manualmente para refacción %s", cleanCode));

        Map<String, Object> res = new HashMap<>();
        res.put("code", prod.getCode());
        res.put("minStock", prod.getMinStock());
        res.put("reorderPoint", prod.getReorderPoint());
        res.put("maxStock", prod.getMaxStock());
        res.put("isCustomThresholds", prod.getMinStock() != null || prod.getReorderPoint() != null || prod.getMaxStock() != null);
        return res;
    }

    public byte[] generatePurchaseOrderXlsx(Long sessionId) throws Exception {
        Map<String, Object> alertsData = getStockAlerts(sessionId);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> allItems = (List<Map<String, Object>>) alertsData.getOrDefault("items", Collections.emptyList());

        // Prioritize items that need ordering (cuantoPedir > 0 or CRITICO or POR_REORDENAR)
        List<Map<String, Object>> poItems = allItems.stream()
                .filter(i -> {
                    Number pedir = (Number) i.get("cuantoPedir");
                    String status = (String) i.get("status");
                    return (pedir != null && pedir.doubleValue() > 0) || "CRITICO".equals(status) || "POR_REORDENAR".equals(status);
                })
                .toList();

        if (poItems.isEmpty()) {
            poItems = allItems;
        }

        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Orden_De_Compra");
            sheet.setDisplayGridlines(true);

            CellStyle titleStyle = wb.createCellStyle();
            Font titleFont = wb.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 16);
            titleFont.setColor(IndexedColors.DARK_BLUE.getIndex());
            titleStyle.setFont(titleFont);

            CellStyle subStyle = wb.createCellStyle();
            Font subFont = wb.createFont();
            subFont.setItalic(true);
            subFont.setFontHeightInPoints((short) 10);
            subFont.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
            subStyle.setFont(subFont);

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
            headerStyle.setBorderBottom(BorderStyle.MEDIUM);
            headerStyle.setBorderTop(BorderStyle.THIN);
            headerStyle.setBorderLeft(BorderStyle.THIN);
            headerStyle.setBorderRight(BorderStyle.THIN);

            CellStyle criticalHeaderStyle = wb.createCellStyle();
            criticalHeaderStyle.cloneStyleFrom(headerStyle);
            criticalHeaderStyle.setFillForegroundColor(IndexedColors.RED.getIndex());

            CellStyle normalCell = wb.createCellStyle();
            normalCell.setBorderBottom(BorderStyle.THIN);
            normalCell.setBorderTop(BorderStyle.THIN);
            normalCell.setBorderLeft(BorderStyle.THIN);
            normalCell.setBorderRight(BorderStyle.THIN);

            CellStyle centerCell = wb.createCellStyle();
            centerCell.cloneStyleFrom(normalCell);
            centerCell.setAlignment(HorizontalAlignment.CENTER);

            CellStyle rightCell = wb.createCellStyle();
            rightCell.cloneStyleFrom(normalCell);
            rightCell.setAlignment(HorizontalAlignment.RIGHT);

            CellStyle qtyBoldCell = wb.createCellStyle();
            qtyBoldCell.cloneStyleFrom(rightCell);
            Font boldFont = wb.createFont();
            boldFont.setBold(true);
            qtyBoldCell.setFont(boldFont);

            CellStyle criticalBadgeCell = wb.createCellStyle();
            criticalBadgeCell.cloneStyleFrom(centerCell);
            Font critFont = wb.createFont();
            critFont.setBold(true);
            critFont.setColor(IndexedColors.DARK_RED.getIndex());
            criticalBadgeCell.setFont(critFont);
            criticalBadgeCell.setFillForegroundColor(IndexedColors.ROSE.getIndex());
            criticalBadgeCell.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            CellStyle warningBadgeCell = wb.createCellStyle();
            warningBadgeCell.cloneStyleFrom(centerCell);
            Font warnFont = wb.createFont();
            warnFont.setBold(true);
            warnFont.setColor(IndexedColors.ORANGE.getIndex());
            warningBadgeCell.setFont(warnFont);
            warningBadgeCell.setFillForegroundColor(IndexedColors.LIGHT_YELLOW.getIndex());
            warningBadgeCell.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            Row r0 = sheet.createRow(0);
            Cell c0 = r0.createCell(0);
            c0.setCellValue("INTERFLU CONTROL DE SURTIDO - ORDEN DE COMPRA SUGERIDA");
            c0.setCellStyle(titleStyle);

            Row r1 = sheet.createRow(1);
            Cell c1 = r1.createCell(0);
            String folio = (String) alertsData.getOrDefault("sessionFolio", "GENERAL");
            c1.setCellValue(String.format("Folio de Inventario: %s | Fecha Emisión: %s | Total Partidas: %d",
                    folio, LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")), poItems.size()));
            c1.setCellStyle(subStyle);

            String[] headers = {
                "PARTIDA",
                "CLAVE SAE",
                "DESCRIPCIÓN DEL MATERIAL",
                "CANTIDAD A PEDIR",
                "UNIDAD",
                "EXISTENCIA ACTUAL",
                "MÍNIMO SEGURIDAD",
                "PTO. REORDEN",
                "MÁXIMO OBJETIVO",
                "PRIORIDAD / ESTADO",
                "ANAQUEL / DESTINO",
                "FAMILIA / ZONA",
                "TIPO UMBRAL"
            };

            Row headerRow = sheet.createRow(3);
            headerRow.setHeightInPoints(24);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(i == 3 ? criticalHeaderStyle : headerStyle);
            }

            int rowIdx = 4;
            double totalPedir = 0.0;
            for (int i = 0; i < poItems.size(); i++) {
                Map<String, Object> item = poItems.get(i);
                Row row = sheet.createRow(rowIdx++);

                Cell cPartida = row.createCell(0);
                cPartida.setCellValue(i + 1);
                cPartida.setCellStyle(centerCell);

                Cell cClave = row.createCell(1);
                cClave.setCellValue(String.valueOf(item.getOrDefault("code", "")));
                cClave.setCellStyle(centerCell);

                Cell cDesc = row.createCell(2);
                cDesc.setCellValue(String.valueOf(item.getOrDefault("description", "")));
                cDesc.setCellStyle(normalCell);

                Cell cPedir = row.createCell(3);
                Number pedir = (Number) item.getOrDefault("cuantoPedir", 0);
                double pedirVal = pedir != null ? pedir.doubleValue() : 0.0;
                totalPedir += pedirVal;
                cPedir.setCellValue(pedirVal);
                cPedir.setCellStyle(qtyBoldCell);

                Cell cUnidad = row.createCell(4);
                cUnidad.setCellValue(String.valueOf(item.getOrDefault("unit", "PZA")));
                cUnidad.setCellStyle(centerCell);

                Cell cStock = row.createCell(5);
                Number stock = (Number) item.getOrDefault("stockActual", 0);
                cStock.setCellValue(stock != null ? stock.doubleValue() : 0.0);
                cStock.setCellStyle(rightCell);

                Cell cMin = row.createCell(6);
                Number min = (Number) item.getOrDefault("minimoSeguridad", 0);
                cMin.setCellValue(min != null ? min.doubleValue() : 0.0);
                cMin.setCellStyle(rightCell);

                Cell cReorder = row.createCell(7);
                Number reo = (Number) item.getOrDefault("puntoReorden", 0);
                cReorder.setCellValue(reo != null ? reo.doubleValue() : 0.0);
                cReorder.setCellStyle(rightCell);

                Cell cMax = row.createCell(8);
                Number max = (Number) item.getOrDefault("maximoObjetivo", 0);
                cMax.setCellValue(max != null ? max.doubleValue() : 0.0);
                cMax.setCellStyle(rightCell);

                Cell cStatus = row.createCell(9);
                String status = String.valueOf(item.getOrDefault("status", ""));
                String statusLabel = String.valueOf(item.getOrDefault("statusLabel", status));
                cStatus.setCellValue(statusLabel);
                if ("CRITICO".equals(status)) {
                    cStatus.setCellStyle(criticalBadgeCell);
                } else if ("POR_REORDENAR".equals(status)) {
                    cStatus.setCellStyle(warningBadgeCell);
                } else {
                    cStatus.setCellStyle(centerCell);
                }

                Cell cShelf = row.createCell(10);
                cShelf.setCellValue(String.valueOf(item.getOrDefault("shelfCode", "")));
                cShelf.setCellStyle(centerCell);

                Cell cZone = row.createCell(11);
                cZone.setCellValue(String.valueOf(item.getOrDefault("zone", "")));
                cZone.setCellStyle(normalCell);

                Cell cCustom = row.createCell(12);
                Boolean custom = (Boolean) item.getOrDefault("isCustomThresholds", false);
                cCustom.setCellValue(Boolean.TRUE.equals(custom) ? "Manual / Modificado" : "Fórmula Automática");
                cCustom.setCellStyle(centerCell);
            }

            Row totalRow = sheet.createRow(rowIdx);
            Cell totLabel = totalRow.createCell(2);
            totLabel.setCellValue("TOTAL PIEZAS SUGERIDAS A COMPRAR:");
            CellStyle totLabelStyle = wb.createCellStyle();
            Font totFont = wb.createFont();
            totFont.setBold(true);
            totLabelStyle.setFont(totFont);
            totLabelStyle.setAlignment(HorizontalAlignment.RIGHT);
            totLabel.setCellStyle(totLabelStyle);

            Cell totVal = totalRow.createCell(3);
            totVal.setCellValue(totalPedir);
            totVal.setCellStyle(qtyBoldCell);

            sheet.setColumnWidth(0, 10 * 256);
            sheet.setColumnWidth(1, 20 * 256);
            sheet.setColumnWidth(2, 45 * 256);
            sheet.setColumnWidth(3, 18 * 256);
            sheet.setColumnWidth(4, 10 * 256);
            sheet.setColumnWidth(5, 18 * 256);
            sheet.setColumnWidth(6, 18 * 256);
            sheet.setColumnWidth(7, 16 * 256);
            sheet.setColumnWidth(8, 18 * 256);
            sheet.setColumnWidth(9, 24 * 256);
            sheet.setColumnWidth(10, 20 * 256);
            sheet.setColumnWidth(11, 20 * 256);
            sheet.setColumnWidth(12, 20 * 256);

            wb.write(out);
            return out.toByteArray();
        }
    }
}

