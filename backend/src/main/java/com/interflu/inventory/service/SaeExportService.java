package com.interflu.inventory.service;

import com.interflu.inventory.model.CountRecord;
import com.interflu.inventory.model.InventorySession;
import com.interflu.inventory.model.SaeExportLog;
import com.interflu.inventory.model.Shelf;
import com.interflu.inventory.model.User;
import com.interflu.inventory.repository.CountRecordRepository;
import com.interflu.inventory.repository.InventorySessionRepository;
import com.interflu.inventory.repository.SaeExportLogRepository;
import com.interflu.inventory.repository.ShelfRepository;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class SaeExportService {

    private final ValidationService validationService;
    private final InventorySessionRepository sessionRepo;
    private final SaeExportLogRepository exportLogRepo;
    private final ShelfRepository shelfRepo;
    private final CountRecordRepository countRepo;
    private final AuditService auditService;

    public SaeExportService(ValidationService validationService,
                            InventorySessionRepository sessionRepo,
                            SaeExportLogRepository exportLogRepo,
                            ShelfRepository shelfRepo,
                            CountRecordRepository countRepo,
                            AuditService auditService) {
        this.validationService = validationService;
        this.sessionRepo = sessionRepo;
        this.exportLogRepo = exportLogRepo;
        this.shelfRepo = shelfRepo;
        this.countRepo = countRepo;
        this.auditService = auditService;
    }

    public static class ExportResult {
        private final String fileName;
        private final byte[] content;
        private final String contentType;
        private final SaeExportLog log;

        public ExportResult(String fileName, byte[] content, String contentType, SaeExportLog log) {
            this.fileName = fileName;
            this.content = content;
            this.contentType = contentType;
            this.log = log;
        }

        public String getFileName() { return fileName; }
        public byte[] getContent() { return content; }
        public String getContentType() { return contentType; }
        public SaeExportLog getLog() { return log; }
    }

    @Transactional
    public ExportResult generateExport(Long sessionId, String format, String layoutType, User user) {
        return generateExport(sessionId, null, format, layoutType, user);
    }

    @Transactional
    public ExportResult generateExport(Long sessionId, Long shelfId, String format, String layoutType, User user) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada."));

        String requestedFormat = format != null ? format.trim().toUpperCase() : "EXCEL";
        boolean isExcel = "EXCEL".equals(requestedFormat) || "XLSX".equals(requestedFormat);
        boolean isTxt = "TXT".equals(requestedFormat);

        String cleanFormat = isExcel ? "EXCEL" : (isTxt ? "TXT" : "CSV");
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmm"));

        Shelf targetShelf = null;
        if (shelfId != null && shelfId > 0) {
            targetShelf = shelfRepo.findById(shelfId).orElse(null);
        }

        List<CountRecord> recordsToProcess;
        if (targetShelf != null) {
            recordsToProcess = countRepo.findBySessionIdAndShelfIdOrderByIdAsc(sessionId, targetShelf.getId());
        } else {
            recordsToProcess = countRepo.findBySessionIdOrderByUpdatedAtDesc(sessionId);
        }

        Map<String, Double> codeToPieces = new LinkedHashMap<>();
        for (CountRecord r : recordsToProcess) {
            String c = r.getCapturedCode().trim().toUpperCase();
            codeToPieces.put(c, codeToPieces.getOrDefault(c, 0.0) + r.getQuantity());
        }

        String fileName;
        byte[] contentBytes;
        String contentType;

        if (isExcel) {
            String base = targetShelf != null
                    ? "EXISTENCIA_FISICA_" + targetShelf.getCode() + "_" + timestamp
                    : "EXISTENCIA_FISICA_CONSOLIDADO_" + session.getFolio() + "_" + timestamp;
            fileName = base + ".xlsx";
            contentBytes = generateStyledExcelWorkbook(session, targetShelf, codeToPieces, recordsToProcess);
            contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        } else {
            String delimiter = isTxt ? "\t" : ",";
            String base = targetShelf != null
                    ? "SAE_" + targetShelf.getCode() + "_" + timestamp
                    : "SAE_CONSOLIDADO_GLOBAL_" + session.getFolio() + "_" + timestamp;
            fileName = base + "." + cleanFormat.toLowerCase();

            StringBuilder sb = new StringBuilder();
            boolean isExistenciaFisicaLayout = "EXISTENCIA_FISICA".equalsIgnoreCase(layoutType);

            if (isExistenciaFisicaLayout) {
                if (isTxt) {
                    sb.append("ESTATUS\tTIPO DE ELEMENTO\tCLAVE\tCLAVE ESQ\tEXISTENCIA FÍSICA\r\n");
                } else {
                    sb.append("ESTATUS,TIPO DE ELEMENTO,CLAVE,CLAVE ESQ,EXISTENCIA FÍSICA\r\n");
                }
                for (Map.Entry<String, Double> entry : codeToPieces.entrySet()) {
                    sb.append("A").append(delimiter)
                      .append("P").append(delimiter)
                      .append(escapeField(entry.getKey(), delimiter)).append(delimiter)
                      .append("1").append(delimiter)
                      .append(formatNumber(entry.getValue()))
                      .append("\r\n");
                }
            } else {
                if (isTxt) {
                    sb.append("CVE_ART\tALMACEN\tCANTIDAD\r\n");
                } else {
                    sb.append("CVE_ART,ALMACEN,CANTIDAD\r\n");
                }
                String wh = session.getWarehouseCode() != null ? session.getWarehouseCode() : "1";
                for (Map.Entry<String, Double> entry : codeToPieces.entrySet()) {
                    sb.append(escapeField(entry.getKey(), delimiter)).append(delimiter)
                      .append(wh).append(delimiter)
                      .append(formatNumber(entry.getValue()))
                      .append("\r\n");
                }
            }

            byte[] bom = "CSV".equals(cleanFormat) ? new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF} : new byte[0];
            byte[] textBytes = sb.toString().getBytes(StandardCharsets.UTF_8);
            contentBytes = new byte[bom.length + textBytes.length];
            System.arraycopy(bom, 0, contentBytes, 0, bom.length);
            System.arraycopy(textBytes, 0, contentBytes, bom.length, textBytes.length);

            contentType = isTxt ? "text/plain; charset=UTF-8" : "text/csv; charset=UTF-8";
        }

        SaeExportLog log = new SaeExportLog();
        log.setSession(session);
        log.setFormat(cleanFormat);
        log.setFileName(fileName);
        log.setTotalRows(codeToPieces.size());
        log.setImportStatus(SaeExportLog.ImportStatus.GENERADO);
        log.setExportedBy(user);
        log.setExportedAt(LocalDateTime.now());
        log = exportLogRepo.save(log);

        String scopeDesc = targetShelf != null ? "Anaquel " + targetShelf.getCode() : "Consolidado Global (" + session.getFolio() + ")";
        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "EXPORTAR_SAE_" + cleanFormat, "SaeExportLog", log.getId(),
                null, fileName,
                "Generado archivo " + cleanFormat + " (" + scopeDesc + ") con " + codeToPieces.size() + " partidas en formato Existencia Física.");

        return new ExportResult(fileName, contentBytes, contentType, log);
    }

    /**
     * Generates a professionally styled Excel workbook with:
     * - Sheet 1: "Existencia Física" formatted with colored headers (Dark Blue, Yellow, Accent Cyan/Blue)
     * - Sheet 2: "Auditoría Detallada" showing breakdown by shelf and timestamp
     */
    private byte[] generateStyledExcelWorkbook(InventorySession session, Shelf targetShelf,
                                               Map<String, Double> codeToPieces,
                                               List<CountRecord> recordsToProcess) {
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            // Colors
            XSSFColor colorNavy = new XSSFColor(new java.awt.Color(10, 36, 114), null);      // #0A2472
            XSSFColor colorYellow = new XSSFColor(new java.awt.Color(255, 230, 0), null);    // #FFE600
            XSSFColor colorAccent = new XSSFColor(new java.awt.Color(2, 132, 199), null);    // #0284C7
            XSSFColor colorBorder = new XSSFColor(new java.awt.Color(203, 213, 225), null);  // #CBD5E1
            XSSFColor colorZebra = new XSSFColor(new java.awt.Color(248, 250, 252), null);   // #F8FAFC

            // Fonts
            XSSFFont fontWhiteBold = wb.createFont();
            fontWhiteBold.setFontName("Calibri");
            fontWhiteBold.setFontHeightInPoints((short) 11);
            fontWhiteBold.setBold(true);
            fontWhiteBold.setColor(new XSSFColor(new java.awt.Color(255, 255, 255), null));

            XSSFFont fontDarkBold = wb.createFont();
            fontDarkBold.setFontName("Calibri");
            fontDarkBold.setFontHeightInPoints((short) 11);
            fontDarkBold.setBold(true);
            fontDarkBold.setColor(new XSSFColor(new java.awt.Color(15, 23, 42), null));

            XSSFFont fontRegular = wb.createFont();
            fontRegular.setFontName("Calibri");
            fontRegular.setFontHeightInPoints((short) 10.5);

            DataFormat df = wb.createDataFormat();

            // Header Styles
            XSSFCellStyle headerNavy = createHeaderStyle(wb, fontWhiteBold, colorNavy, colorBorder);
            XSSFCellStyle headerYellow = createHeaderStyle(wb, fontDarkBold, colorYellow, colorBorder);
            XSSFCellStyle headerAccent = createHeaderStyle(wb, fontWhiteBold, colorAccent, colorBorder);

            // Data Styles
            XSSFCellStyle cellCenter = createDataStyle(wb, fontRegular, HorizontalAlignment.CENTER, colorBorder);
            XSSFCellStyle cellLeft = createDataStyle(wb, fontRegular, HorizontalAlignment.LEFT, colorBorder);
            XSSFCellStyle cellQty = createDataStyle(wb, fontDarkBold, HorizontalAlignment.RIGHT, colorBorder);
            cellQty.setDataFormat(df.getFormat("#,##0.00"));

            XSSFCellStyle cellCenterZebra = createDataStyle(wb, fontRegular, HorizontalAlignment.CENTER, colorBorder);
            cellCenterZebra.setFillForegroundColor(colorZebra);
            cellCenterZebra.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle cellLeftZebra = createDataStyle(wb, fontRegular, HorizontalAlignment.LEFT, colorBorder);
            cellLeftZebra.setFillForegroundColor(colorZebra);
            cellLeftZebra.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle cellQtyZebra = createDataStyle(wb, fontDarkBold, HorizontalAlignment.RIGHT, colorBorder);
            cellQtyZebra.setDataFormat(df.getFormat("#,##0.00"));
            cellQtyZebra.setFillForegroundColor(colorZebra);
            cellQtyZebra.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // ==========================================
            // SHEET 1: Existencia Física (Direct SAE Import)
            // ==========================================
            XSSFSheet sheet1 = wb.createSheet("Existencia Física");
            sheet1.setDisplayGridlines(true);

            // Row 0: Headers
            Row headerRow1 = sheet1.createRow(0);
            headerRow1.setHeightInPoints(26);

            String[] titles1 = {"ESTATUS", "TIPO DE ELEMENTO", "CLAVE", "CLAVE ESQ", "EXISTENCIA FÍSICA"};
            for (int col = 0; col < titles1.length; col++) {
                Cell cell = headerRow1.createCell(col);
                cell.setCellValue(titles1[col]);
                if (col == 0 || col == 1) {
                    cell.setCellStyle(headerNavy);
                } else if (col == 2 || col == 3) {
                    cell.setCellStyle(headerYellow);
                } else {
                    cell.setCellStyle(headerAccent);
                }
            }

            int rowIdx1 = 1;
            for (Map.Entry<String, Double> entry : codeToPieces.entrySet()) {
                Row row = sheet1.createRow(rowIdx1);
                row.setHeightInPoints(20);
                boolean zebra = (rowIdx1 % 2 == 0);

                // Col 0: ESTATUS
                Cell c0 = row.createCell(0);
                c0.setCellValue("A");
                c0.setCellStyle(zebra ? cellCenterZebra : cellCenter);

                // Col 1: TIPO DE ELEMENTO
                Cell c1 = row.createCell(1);
                c1.setCellValue("P");
                c1.setCellStyle(zebra ? cellCenterZebra : cellCenter);

                // Col 2: CLAVE
                Cell c2 = row.createCell(2);
                c2.setCellValue(entry.getKey());
                c2.setCellStyle(zebra ? cellLeftZebra : cellLeft);

                // Col 3: CLAVE ESQ
                Cell c3 = row.createCell(3);
                c3.setCellValue(1);
                c3.setCellStyle(zebra ? cellCenterZebra : cellCenter);

                // Col 4: EXISTENCIA FÍSICA
                Cell c4 = row.createCell(4);
                c4.setCellValue(entry.getValue());
                c4.setCellStyle(zebra ? cellQtyZebra : cellQty);

                rowIdx1++;
            }

            for (int col = 0; col < titles1.length; col++) {
                sheet1.autoSizeColumn(col);
                sheet1.setColumnWidth(col, Math.max(sheet1.getColumnWidth(col) + 1600, 4200));
            }

            // ==========================================
            // SHEET 2: Auditoría y Detalle por Anaquel
            // ==========================================
            XSSFSheet sheet2 = wb.createSheet("Detalle por Anaquel");
            sheet2.setDisplayGridlines(true);

            Row headerRow2 = sheet2.createRow(0);
            headerRow2.setHeightInPoints(26);

            String[] titles2 = {
                "FOLIO INVENTARIO", "ANAQUEL", "ZONA", "PLANTA",
                "CLAVE ARTÍCULO", "EXISTENCIA FÍSICA", "REGISTRADO POR", "FECHA CONTEO"
            };

            for (int col = 0; col < titles2.length; col++) {
                Cell cell = headerRow2.createCell(col);
                cell.setCellValue(titles2[col]);
                cell.setCellStyle(headerNavy);
            }

            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
            int rowIdx2 = 1;
            for (CountRecord r : recordsToProcess) {
                Row row = sheet2.createRow(rowIdx2);
                row.setHeightInPoints(20);
                boolean zebra = (rowIdx2 % 2 == 0);

                Cell c0 = row.createCell(0);
                c0.setCellValue(session.getFolio());
                c0.setCellStyle(zebra ? cellCenterZebra : cellCenter);

                Cell c1 = row.createCell(1);
                c1.setCellValue(r.getShelf() != null ? r.getShelf().getCode() : "-");
                c1.setCellStyle(zebra ? cellCenterZebra : cellCenter);

                Cell c2 = row.createCell(2);
                c2.setCellValue(r.getShelf() != null ? r.getShelf().getZone() : "-");
                c2.setCellStyle(zebra ? cellLeftZebra : cellLeft);

                Cell c3 = row.createCell(3);
                c3.setCellValue(r.getShelf() != null ? r.getShelf().getPlant() : "-");
                c3.setCellStyle(zebra ? cellCenterZebra : cellCenter);

                Cell c4 = row.createCell(4);
                c4.setCellValue(r.getCapturedCode());
                c4.setCellStyle(zebra ? cellLeftZebra : cellLeft);

                Cell c5 = row.createCell(5);
                c5.setCellValue(r.getQuantity());
                c5.setCellStyle(zebra ? cellQtyZebra : cellQty);

                Cell c6 = row.createCell(6);
                c6.setCellValue(r.getUser() != null ? r.getUser().getFullName() : "Operador");
                c6.setCellStyle(zebra ? cellLeftZebra : cellLeft);

                Cell c7 = row.createCell(7);
                c7.setCellValue(r.getCountedAt() != null ? r.getCountedAt().format(dtf) : "-");
                c7.setCellStyle(zebra ? cellCenterZebra : cellCenter);

                rowIdx2++;
            }

            for (int col = 0; col < titles2.length; col++) {
                sheet2.autoSizeColumn(col);
                sheet2.setColumnWidth(col, Math.max(sheet2.getColumnWidth(col) + 1400, 3800));
            }

            wb.write(bos);
            return bos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Error al generar libro Excel oficial: " + e.getMessage(), e);
        }
    }

    private XSSFCellStyle createHeaderStyle(XSSFWorkbook wb, XSSFFont font, XSSFColor bgColor, XSSFColor borderColor) {
        XSSFCellStyle style = wb.createCellStyle();
        style.setFont(font);
        style.setFillForegroundColor(bgColor);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBottomBorderColor(borderColor);
        style.setBorderTop(BorderStyle.THIN);
        style.setTopBorderColor(borderColor);
        style.setBorderLeft(BorderStyle.THIN);
        style.setLeftBorderColor(borderColor);
        style.setBorderRight(BorderStyle.THIN);
        style.setRightBorderColor(borderColor);
        return style;
    }

    private XSSFCellStyle createDataStyle(XSSFWorkbook wb, XSSFFont font, HorizontalAlignment align, XSSFColor borderColor) {
        XSSFCellStyle style = wb.createCellStyle();
        style.setFont(font);
        style.setAlignment(align);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBottomBorderColor(borderColor);
        style.setBorderTop(BorderStyle.THIN);
        style.setTopBorderColor(borderColor);
        style.setBorderLeft(BorderStyle.THIN);
        style.setLeftBorderColor(borderColor);
        style.setBorderRight(BorderStyle.THIN);
        style.setRightBorderColor(borderColor);
        return style;
    }

    @Transactional
    public SaeExportLog updateImportStatus(Long exportId, SaeExportLog.ImportStatus status, String notes, User user) {
        SaeExportLog log = exportLogRepo.findById(exportId)
                .orElseThrow(() -> new IllegalArgumentException("Registro de exportación no encontrado."));

        SaeExportLog.ImportStatus old = log.getImportStatus();
        log.setImportStatus(status);
        log.setReconciliationNotes(notes);
        log.setReconciledAt(LocalDateTime.now());
        log = exportLogRepo.save(log);

        auditService.log(log.getSession().getId(), log.getSession().getFolio(),
                user.getUsername(), user.getFullName(),
                "CONCILIACION_SAE", "SaeExportLog", log.getId(),
                old.name(), status.name(),
                "Resultado importación SAE para " + log.getFileName() + ": " + status.name() + ". Notas: " + notes);

        return log;
    }

    @Transactional(readOnly = true)
    public List<SaeExportLog> getExportHistory(Long sessionId) {
        if (sessionId != null) {
            return exportLogRepo.findBySessionIdOrderByExportedAtDesc(sessionId);
        }
        return exportLogRepo.findAllByOrderByExportedAtDesc();
    }

    private String escapeField(String val, String delimiter) {
        if (val == null) return "";
        if (",".equals(delimiter) && (val.contains(",") || val.contains("\"") || val.contains("\n"))) {
            return "\"" + val.replace("\"", "\"\"") + "\"";
        }
        return val;
    }

    private String formatNumber(double num) {
        if (num == Math.floor(num) && !Double.isInfinite(num)) {
            return String.format(java.util.Locale.US, "%.0f", num);
        }
        return String.format(java.util.Locale.US, "%.2f", num);
    }
}
