package com.interflu.inventory.service;

import com.interflu.inventory.dto.SessionDto;
import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class InventorySessionService {

    private final InventorySessionRepository sessionRepo;
    private final ShelfRepository shelfRepo;
    private final ShelfAssignmentRepository assignmentRepo;
    private final CountRecordRepository countRepo;
    private final UserRepository userRepo;
    private final AuditService auditService;

    public InventorySessionService(InventorySessionRepository sessionRepo,
                                  ShelfRepository shelfRepo,
                                  ShelfAssignmentRepository assignmentRepo,
                                  CountRecordRepository countRepo,
                                  UserRepository userRepo,
                                  AuditService auditService) {
        this.sessionRepo = sessionRepo;
        this.shelfRepo = shelfRepo;
        this.assignmentRepo = assignmentRepo;
        this.countRepo = countRepo;
        this.userRepo = userRepo;
        this.auditService = auditService;
    }

    @Transactional
    public InventorySession createSession(SessionDto.CreateSessionRequest req, User user) {
        long count = sessionRepo.count() + 1;
        String year = String.valueOf(LocalDateTime.now().getYear());
        String folio = String.format("INV-%s-%03d", year, count);

        InventorySession session = new InventorySession();
        session.setFolio(folio);
        session.setTitle(req.getTitle() != null && !req.getTitle().isBlank() ? req.getTitle().trim() : "Inventario Físico General " + folio);
        session.setWarehouseCode(req.getWarehouseCode() != null ? req.getWarehouseCode() : "1");
        session.setWarehouseName(req.getWarehouseName() != null ? req.getWarehouseName() : "Almacén Principal");
        session.setStatus(InventorySession.Status.EN_CONTEO);
        session.setNotes(req.getNotes());
        session.setCreatedBy(user);
        session.setCreatedAt(LocalDateTime.now());

        session = sessionRepo.save(session);

        // Assign shelves if provided, otherwise assign all active shelves
        List<Shelf> shelvesToAssign;
        if (req.getShelfIds() != null && !req.getShelfIds().isEmpty()) {
            shelvesToAssign = shelfRepo.findAllById(req.getShelfIds());
        } else {
            shelvesToAssign = shelfRepo.findByActiveTrueOrderByCodeAsc();
        }

        for (Shelf shelf : shelvesToAssign) {
            ShelfAssignment sa = new ShelfAssignment(session, shelf, null);
            assignmentRepo.save(sa);
        }

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "CREAR_INVENTARIO", "InventorySession", session.getId(),
                null, session.getStatus().name(),
                "Creación de sesión con " + shelvesToAssign.size() + " anaqueles asignados.");

        return session;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAllSessions() {
        List<InventorySession> sessions = sessionRepo.findAllByOrderByCreatedAtDesc();
        List<Map<String, Object>> result = new ArrayList<>();

        for (InventorySession s : sessions) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", s.getId());
            map.put("folio", s.getFolio());
            map.put("title", s.getTitle());
            map.put("warehouseCode", s.getWarehouseCode());
            map.put("warehouseName", s.getWarehouseName());
            map.put("status", s.getStatus().name());
            map.put("isEditable", s.isEditable());
            map.put("notes", s.getNotes());
            map.put("createdAt", s.getCreatedAt());
            map.put("createdByName", s.getCreatedBy() != null ? s.getCreatedBy().getFullName() : null);
            map.put("closedAt", s.getClosedAt());
            map.put("closedByName", s.getClosedBy() != null ? s.getClosedBy().getFullName() : null);
            map.put("closeNotes", s.getCloseNotes());
            map.put("reopenedAt", s.getReopenedAt());
            map.put("reopenedByName", s.getReopenedBy() != null ? s.getReopenedBy().getFullName() : null);
            map.put("reopenReason", s.getReopenReason());

            long totalRecords = countRepo.countBySessionId(s.getId());
            Double totalPieces = countRepo.sumQuantityBySessionId(s.getId());
            long distinctCodes = countRepo.countDistinctCodesBySessionId(s.getId());

            List<ShelfAssignment> assignments = assignmentRepo.findBySessionIdOrderByShelfCodeAsc(s.getId());
            long totalShelves = assignments.size();
            long completedShelves = assignments.stream().filter(a -> a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();

            long pbTotal = assignments.stream().filter(a -> "Planta Baja".equalsIgnoreCase(a.getShelf().getPlant())).count();
            long pbCompleted = assignments.stream().filter(a -> "Planta Baja".equalsIgnoreCase(a.getShelf().getPlant()) && a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();
            long paTotal = assignments.stream().filter(a -> "Planta Alta".equalsIgnoreCase(a.getShelf().getPlant())).count();
            long paCompleted = assignments.stream().filter(a -> "Planta Alta".equalsIgnoreCase(a.getShelf().getPlant()) && a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();

            map.put("totalRecords", totalRecords);
            map.put("totalPieces", totalPieces != null ? totalPieces : 0.0);
            map.put("distinctCodes", distinctCodes);
            map.put("totalShelves", totalShelves);
            map.put("completedShelves", completedShelves);
            map.put("progressPercent", totalShelves > 0 ? Math.round(((double) completedShelves / totalShelves) * 100) : 0);
            map.put("pbTotal", pbTotal);
            map.put("pbCompleted", pbCompleted);
            map.put("pbPercent", pbTotal > 0 ? Math.round(((double) pbCompleted / pbTotal) * 100) : 0);
            map.put("paTotal", paTotal);
            map.put("paCompleted", paCompleted);
            map.put("paPercent", paTotal > 0 ? Math.round(((double) paCompleted / paTotal) * 100) : 0);

            result.add(map);
        }
        return result;
    }

    @Transactional(readOnly = true)
    public Optional<InventorySession> getById(Long id) {
        return sessionRepo.findById(id);
    }

    @Transactional
    public InventorySession closeSession(Long sessionId, SessionDto.CloseSessionRequest req, User user) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada."));

        InventorySession.Status oldStatus = session.getStatus();
        InventorySession.Status newStatus = req.isSuccess()
                ? InventorySession.Status.CERRADO_EXITO
                : InventorySession.Status.CERRADO_NO_EXITO;

        session.setStatus(newStatus);
        session.setClosedBy(user);
        session.setClosedAt(LocalDateTime.now());
        session.setCloseNotes(req.getNotes());

        session = sessionRepo.save(session);

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "CERRAR_INVENTARIO", "InventorySession", session.getId(),
                oldStatus.name(), newStatus.name(),
                "Cierre con resultado: " + newStatus.name() + ". Notas: " + req.getNotes());

        return session;
    }

    @Transactional
    public InventorySession reopenSession(Long sessionId, SessionDto.ReopenSessionRequest req, User user) {
        if (req.getReason() == null || req.getReason().trim().length() < 5) {
            throw new IllegalArgumentException("Debe ingresar un motivo justificado para reabrir el inventario.");
        }

        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada."));

        InventorySession.Status oldStatus = session.getStatus();
        session.setStatus(InventorySession.Status.REABIERTO);
        session.setReopenedBy(user);
        session.setReopenedAt(LocalDateTime.now());
        session.setReopenReason(req.getReason().trim());

        session = sessionRepo.save(session);

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "REABRIR_INVENTARIO", "InventorySession", session.getId(),
                oldStatus.name(), session.getStatus().name(),
                "Reapertura autorizada. Motivo: " + req.getReason().trim());

        return session;
    }

    @Transactional
    public InventorySession updateStatus(Long sessionId, String statusStr, String notes, User user) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada."));

        InventorySession.Status oldStatus = session.getStatus();
        InventorySession.Status newStatus = InventorySession.Status.valueOf(statusStr);

        session.setStatus(newStatus);
        if (newStatus == InventorySession.Status.CERRADO_EXITO || newStatus == InventorySession.Status.CERRADO_NO_EXITO) {
            session.setClosedBy(user);
            session.setClosedAt(LocalDateTime.now());
            if (notes != null && !notes.isBlank()) {
                session.setCloseNotes(notes);
            }
        } else if (newStatus == InventorySession.Status.REABIERTO || newStatus == InventorySession.Status.EN_CONTEO) {
            session.setReopenedBy(user);
            session.setReopenedAt(LocalDateTime.now());
            if (notes != null && !notes.isBlank()) {
                session.setReopenReason(notes);
            }
        }

        session = sessionRepo.save(session);

        auditService.log(session.getId(), session.getFolio(), user.getUsername(), user.getFullName(),
                "CAMBIO_ESTADO_" + newStatus.name(), "InventorySession", session.getId(),
                oldStatus.name(), newStatus.name(),
                "Cambio de estado: " + newStatus.name() + (notes != null && !notes.isBlank() ? " (" + notes + ")" : ""));

        return session;
    }

    @Transactional
    public void deleteSession(Long id, User user) {
        InventorySession session = sessionRepo.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada con ID: " + id));

        String folio = session.getFolio();
        // Delete all counts in this session
        List<CountRecord> counts = countRepo.findBySessionIdOrderByUpdatedAtDesc(id);
        countRepo.deleteAll(counts);

        // Delete all shelf assignments
        List<ShelfAssignment> assignments = assignmentRepo.findBySessionIdOrderByShelfCodeAsc(id);
        assignmentRepo.deleteAll(assignments);

        // Delete session
        sessionRepo.delete(session);

        auditService.log(id, folio, user.getUsername(), user.getFullName(),
                "ELIMINAR_INVENTARIO", "InventorySession", id,
                session.getStatus().name(), "ELIMINADO",
                "Inventario " + folio + " eliminado permanentemente por " + user.getFullName());
    }

    @Transactional
    public void assignShelfToUser(Long sessionId, Long shelfId, Long userId, User adminUser) {
        ShelfAssignment sa = assignmentRepo.findBySessionIdAndShelfId(sessionId, shelfId)
                .orElseThrow(() -> new IllegalArgumentException("Asignación de anaquel no encontrada."));

        User worker = null;
        if (userId != null) {
            worker = userRepo.findById(userId)
                    .orElseThrow(() -> new IllegalArgumentException("Usuario trabajador no encontrado."));
        }

        sa.setAssignedUser(worker);
        assignmentRepo.save(sa);

        auditService.log(sessionId, sa.getSession().getFolio(), adminUser.getUsername(), adminUser.getFullName(),
                "ASIGNAR_ANAQUEL", "ShelfAssignment", sa.getId(),
                null, worker != null ? worker.getUsername() : "Sin asignar",
                "Asignación de anaquel " + sa.getShelf().getCode() + " a " + (worker != null ? worker.getFullName() : "nadie"));
    }

    @Transactional
    public void updateShelfStatus(Long sessionId, Long shelfId, ShelfAssignment.Status status, User user) {
        ShelfAssignment sa = assignmentRepo.findBySessionIdAndShelfId(sessionId, shelfId)
                .orElseThrow(() -> new IllegalArgumentException("Asignación de anaquel no encontrada."));

        ShelfAssignment.Status old = sa.getStatus();
        sa.setStatus(status);
        if (status == ShelfAssignment.Status.COMPLETADO) {
            sa.setCompletedAt(LocalDateTime.now());
        }
        assignmentRepo.save(sa);

        auditService.log(sessionId, sa.getSession().getFolio(), user.getUsername(), user.getFullName(),
                "CAMBIAR_ESTADO_ANAQUEL", "ShelfAssignment", sa.getId(),
                old.name(), status.name(),
                "Anaquel " + sa.getShelf().getCode() + " marcado como " + status.name());
    }

    @Transactional
    public void resetShelf(Long sessionId, Long shelfId, boolean clearRecords, User user) {
        ShelfAssignment sa = assignmentRepo.findBySessionIdAndShelfId(sessionId, shelfId)
                .orElseThrow(() -> new IllegalArgumentException("Asignación de anaquel no encontrada."));

        ShelfAssignment.Status oldStatus = sa.getStatus();
        sa.setStatus(ShelfAssignment.Status.PENDIENTE);
        sa.setCompletedAt(null);
        assignmentRepo.save(sa);

        if (clearRecords) {
            List<CountRecord> records = countRepo.findBySessionIdAndShelfId(sessionId, shelfId);
            for (CountRecord r : records) {
                countRepo.delete(r);
            }
        }

        auditService.log(sessionId, sa.getSession().getFolio(), user.getUsername(), user.getFullName(),
                "RESTABLECER_ANAQUEL", "ShelfAssignment", sa.getId(),
                oldStatus.name(), ShelfAssignment.Status.PENDIENTE.name(),
                "Anaquel " + sa.getShelf().getCode() + " restablecido a Sin Iniciar" +
                        (clearRecords ? " (con borrado de partidas)" : ""));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getShelfAssignments(Long sessionId, User currentUser) {
        List<ShelfAssignment> assignments = assignmentRepo.findBySessionIdOrderByShelfCodeAsc(sessionId);

        // Fetch counts and sums for all shelves in 1 single query instead of 342 separate queries
        List<Object[]> statsRows = countRepo.getShelfStatsBySessionId(sessionId);
        Map<Long, Long> countMap = new HashMap<>();
        Map<Long, Double> sumMap = new HashMap<>();
        for (Object[] row : statsRows) {
            Long sId = (Long) row[0];
            Long cnt = ((Number) row[1]).longValue();
            Double sum = ((Number) row[2]).doubleValue();
            countMap.put(sId, cnt);
            sumMap.put(sId, sum);
        }

        List<Map<String, Object>> list = new ArrayList<>(assignments.size());
        for (ShelfAssignment a : assignments) {
            Map<String, Object> map = new HashMap<>();
            map.put("assignmentId", a.getId());
            map.put("shelfId", a.getShelf().getId());
            map.put("shelfCode", a.getShelf().getCode());
            map.put("shelfZone", a.getShelf().getZone());
            map.put("shelfDescription", a.getShelf().getDescription());
            map.put("plant", a.getShelf().getPlant());
            map.put("posX", a.getShelf().getPosX());
            map.put("posY", a.getShelf().getPosY());
            map.put("width", a.getShelf().getWidth());
            map.put("height", a.getShelf().getHeight());
            map.put("status", a.getStatus().name());
            map.put("assignedUserId", a.getAssignedUser() != null ? a.getAssignedUser().getId() : null);
            map.put("assignedUserName", a.getAssignedUser() != null ? a.getAssignedUser().getFullName() : "Por Asignar");

            Long sId = a.getShelf().getId();
            long recordCount = countMap.getOrDefault(sId, 0L);
            Double totalPieces = sumMap.getOrDefault(sId, 0.0);

            map.put("recordCount", recordCount);
            map.put("totalPieces", totalPieces);
            list.add(map);
        }
        return list;
    }

    @Transactional(readOnly = true)
    public SaeExportService.ExportResult generateDashboardStatsExcel(Long sessionId, User currentUser) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada con ID: " + sessionId));

        List<ShelfAssignment> assignments = assignmentRepo.findBySessionIdOrderByShelfCodeAsc(sessionId);

        long totalShelves = assignments.size();
        long completedShelves = assignments.stream().filter(a -> a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();
        long inProgressShelves = assignments.stream().filter(a -> a.getStatus() == ShelfAssignment.Status.EN_CONTEO).count();
        long pendingShelves = totalShelves - completedShelves - inProgressShelves;

        long pbTotal = assignments.stream().filter(a -> "Planta Baja".equalsIgnoreCase(a.getShelf().getPlant())).count();
        long pbCompleted = assignments.stream().filter(a -> "Planta Baja".equalsIgnoreCase(a.getShelf().getPlant()) && a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();
        long pbInProgress = assignments.stream().filter(a -> "Planta Baja".equalsIgnoreCase(a.getShelf().getPlant()) && a.getStatus() == ShelfAssignment.Status.EN_CONTEO).count();
        long pbPending = pbTotal - pbCompleted - pbInProgress;

        long paTotal = assignments.stream().filter(a -> "Planta Alta".equalsIgnoreCase(a.getShelf().getPlant())).count();
        long paCompleted = assignments.stream().filter(a -> "Planta Alta".equalsIgnoreCase(a.getShelf().getPlant()) && a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();
        long paInProgress = assignments.stream().filter(a -> "Planta Alta".equalsIgnoreCase(a.getShelf().getPlant()) && a.getStatus() == ShelfAssignment.Status.EN_CONTEO).count();
        long paPending = paTotal - paCompleted - paInProgress;

        Double totalPieces = countRepo.sumQuantityBySessionId(sessionId);
        if (totalPieces == null) totalPieces = 0.0;
        long totalRecords = countRepo.countBySessionId(sessionId);
        long distinctCodes = countRepo.countDistinctCodesBySessionId(sessionId);

        int progressPercent = totalShelves > 0 ? (int) Math.round(((double) completedShelves / totalShelves) * 100) : 0;
        int pbPercent = pbTotal > 0 ? (int) Math.round(((double) pbCompleted / pbTotal) * 100) : 0;
        int paPercent = paTotal > 0 ? (int) Math.round(((double) paCompleted / paTotal) * 100) : 0;

        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmm"));
        String displayDate = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss"));
        String fileName = String.format("Estadisticas_Inventario_%s_%s.xlsx", session.getFolio(), timestamp);

        try (XSSFWorkbook wb = new XSSFWorkbook()) {
            // Corporate Color Palette
            XSSFColor colorNavy = new XSSFColor(new java.awt.Color(10, 36, 114), null);      // #0A2472
            XSSFColor colorBlue = new XSSFColor(new java.awt.Color(29, 78, 216), null);      // #1D4ED8
            XSSFColor colorCyan = new XSSFColor(new java.awt.Color(2, 132, 199), null);      // #0284C7
            XSSFColor colorGreen = new XSSFColor(new java.awt.Color(5, 150, 105), null);     // #059669
            XSSFColor colorGreenBg = new XSSFColor(new java.awt.Color(236, 253, 245), null); // #ECFDF5
            XSSFColor colorAmber = new XSSFColor(new java.awt.Color(217, 119, 6), null);     // #D97706
            XSSFColor colorAmberBg = new XSSFColor(new java.awt.Color(255, 251, 235), null); // #FFFBEB
            XSSFColor colorZebra = new XSSFColor(new java.awt.Color(248, 250, 252), null);   // #F8FAFC
            XSSFColor colorBorder = new XSSFColor(new java.awt.Color(203, 213, 225), null);  // #CBD5E1
            XSSFColor colorSubtle = new XSSFColor(new java.awt.Color(241, 245, 249), null);  // #F1F5F9

            // Fonts
            XSSFFont fontTitle = wb.createFont();
            fontTitle.setFontName("Calibri");
            fontTitle.setFontHeightInPoints((short) 13);
            fontTitle.setBold(true);
            fontTitle.setColor(new XSSFColor(new java.awt.Color(255, 255, 255), null));

            XSSFFont fontSubtitle = wb.createFont();
            fontSubtitle.setFontName("Calibri");
            fontSubtitle.setFontHeightInPoints((short) 11);
            fontSubtitle.setBold(true);
            fontSubtitle.setColor(new XSSFColor(new java.awt.Color(255, 255, 255), null));

            XSSFFont fontSection = wb.createFont();
            fontSection.setFontName("Calibri");
            fontSection.setFontHeightInPoints((short) 11);
            fontSection.setBold(true);
            fontSection.setColor(new XSSFColor(new java.awt.Color(10, 36, 114), null));

            XSSFFont fontHeader = wb.createFont();
            fontHeader.setFontName("Calibri");
            fontHeader.setFontHeightInPoints((short) 10.5);
            fontHeader.setBold(true);
            fontHeader.setColor(new XSSFColor(new java.awt.Color(255, 255, 255), null));

            XSSFFont fontBold = wb.createFont();
            fontBold.setFontName("Calibri");
            fontBold.setFontHeightInPoints((short) 10.5);
            fontBold.setBold(true);
            fontBold.setColor(new XSSFColor(new java.awt.Color(15, 23, 42), null));

            XSSFFont fontRegular = wb.createFont();
            fontRegular.setFontName("Calibri");
            fontRegular.setFontHeightInPoints((short) 10);
            fontRegular.setColor(new XSSFColor(new java.awt.Color(15, 23, 42), null));

            XSSFFont fontGreenBold = wb.createFont();
            fontGreenBold.setFontName("Calibri");
            fontGreenBold.setFontHeightInPoints((short) 10);
            fontGreenBold.setBold(true);
            fontGreenBold.setColor(colorGreen);

            XSSFFont fontAmberBold = wb.createFont();
            fontAmberBold.setFontName("Calibri");
            fontAmberBold.setFontHeightInPoints((short) 10);
            fontAmberBold.setBold(true);
            fontAmberBold.setColor(colorAmber);

            DataFormat df = wb.createDataFormat();

            // Cell Styles
            XSSFCellStyle styleBannerNavy = createBannerStyle(wb, fontTitle, colorNavy);
            XSSFCellStyle styleBannerBlue = createBannerStyle(wb, fontSubtitle, colorBlue);
            XSSFCellStyle styleBannerMeta = createBannerStyle(wb, fontRegular, colorSubtle);
            styleBannerMeta.setAlignment(HorizontalAlignment.CENTER);

            XSSFCellStyle styleSection = wb.createCellStyle();
            styleSection.setFont(fontSection);
            styleSection.setFillForegroundColor(colorSubtle);
            styleSection.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            styleSection.setAlignment(HorizontalAlignment.LEFT);
            styleSection.setVerticalAlignment(VerticalAlignment.CENTER);
            setBorders(styleSection, colorBorder);

            XSSFCellStyle styleHeaderNavy = createHeaderStyle(wb, fontHeader, colorNavy, colorBorder);
            XSSFCellStyle styleHeaderBlue = createHeaderStyle(wb, fontHeader, colorBlue, colorBorder);

            XSSFCellStyle cellLeft = createDataStyle(wb, fontRegular, HorizontalAlignment.LEFT, colorBorder);
            XSSFCellStyle cellLeftBold = createDataStyle(wb, fontBold, HorizontalAlignment.LEFT, colorBorder);
            XSSFCellStyle cellCenter = createDataStyle(wb, fontRegular, HorizontalAlignment.CENTER, colorBorder);
            XSSFCellStyle cellCenterBold = createDataStyle(wb, fontBold, HorizontalAlignment.CENTER, colorBorder);
            XSSFCellStyle cellRight = createDataStyle(wb, fontRegular, HorizontalAlignment.RIGHT, colorBorder);
            XSSFCellStyle cellRightBold = createDataStyle(wb, fontBold, HorizontalAlignment.RIGHT, colorBorder);

            XSSFCellStyle cellLeftZebra = createDataStyle(wb, fontRegular, HorizontalAlignment.LEFT, colorBorder);
            cellLeftZebra.setFillForegroundColor(colorZebra);
            cellLeftZebra.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle cellCenterZebra = createDataStyle(wb, fontRegular, HorizontalAlignment.CENTER, colorBorder);
            cellCenterZebra.setFillForegroundColor(colorZebra);
            cellCenterZebra.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle cellNumber = createDataStyle(wb, fontBold, HorizontalAlignment.RIGHT, colorBorder);
            cellNumber.setDataFormat(df.getFormat("#,##0.00"));

            XSSFCellStyle cellNumberZebra = createDataStyle(wb, fontBold, HorizontalAlignment.RIGHT, colorBorder);
            cellNumberZebra.setDataFormat(df.getFormat("#,##0.00"));
            cellNumberZebra.setFillForegroundColor(colorZebra);
            cellNumberZebra.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle cellInt = createDataStyle(wb, fontBold, HorizontalAlignment.RIGHT, colorBorder);
            cellInt.setDataFormat(df.getFormat("#,##0"));

            XSSFCellStyle cellIntZebra = createDataStyle(wb, fontBold, HorizontalAlignment.RIGHT, colorBorder);
            cellIntZebra.setDataFormat(df.getFormat("#,##0"));
            cellIntZebra.setFillForegroundColor(colorZebra);
            cellIntZebra.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle cellPercent = createDataStyle(wb, fontBold, HorizontalAlignment.CENTER, colorBorder);
            cellPercent.setDataFormat(df.getFormat("0.0%"));

            XSSFCellStyle statusOk = createDataStyle(wb, fontGreenBold, HorizontalAlignment.CENTER, colorBorder);
            statusOk.setFillForegroundColor(colorGreenBg);
            statusOk.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle statusProg = createDataStyle(wb, fontAmberBold, HorizontalAlignment.CENTER, colorBorder);
            statusProg.setFillForegroundColor(colorAmberBg);
            statusProg.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            XSSFCellStyle statusPend = createDataStyle(wb, fontRegular, HorizontalAlignment.CENTER, colorBorder);
            statusPend.setFillForegroundColor(colorSubtle);
            statusPend.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // ==========================================
            // SHEET 1: Resumen Ejecutivo
            // ==========================================
            XSSFSheet sheet1 = wb.createSheet("Resumen Ejecutivo");
            sheet1.setDisplayGridlines(true);

            // Header Banner
            Row r0 = sheet1.createRow(0);
            r0.setHeightInPoints(28);
            for (int c = 0; c <= 4; c++) r0.createCell(c).setCellStyle(styleBannerNavy);
            r0.getCell(0).setCellValue("INTERFLU · INTERNACIONAL DE FLUIDOS S.A. DE C.V.");
            sheet1.addMergedRegion(new CellRangeAddress(0, 0, 0, 4));

            Row r1 = sheet1.createRow(1);
            r1.setHeightInPoints(24);
            for (int c = 0; c <= 4; c++) r1.createCell(c).setCellStyle(styleBannerBlue);
            r1.getCell(0).setCellValue("CONTROL FÍSICO DE INVENTARIOS · REPORTE EJECUTIVO DE AVANCE Y ESTADÍSTICAS");
            sheet1.addMergedRegion(new CellRangeAddress(1, 1, 0, 4));

            Row r2 = sheet1.createRow(2);
            r2.setHeightInPoints(20);
            for (int c = 0; c <= 4; c++) r2.createCell(c).setCellStyle(styleBannerMeta);
            r2.getCell(0).setCellValue(String.format("Folio: %s   |   Emisión: %s   |   Generado por: %s",
                    session.getFolio(), displayDate, currentUser != null ? currentUser.getFullName() : "Sistema"));
            sheet1.addMergedRegion(new CellRangeAddress(2, 2, 0, 4));

            // Section 1: Session Details
            Row r4 = sheet1.createRow(4);
            r4.setHeightInPoints(22);
            for (int c = 0; c <= 4; c++) r4.createCell(c).setCellStyle(styleSection);
            r4.getCell(0).setCellValue("1. DATOS GENERALES DEL INVENTARIO");
            sheet1.addMergedRegion(new CellRangeAddress(4, 4, 0, 4));

            String[][] sessionData = {
                    {"Folio Oficial", session.getFolio(), "Estado de Sesión", session.getStatus().name()},
                    {"Nombre del Inventario", session.getTitle(), "Almacén Aspel SAE", session.getWarehouseCode() + " - " + session.getWarehouseName()},
                    {"Fecha de Creación", session.getCreatedAt() != null ? session.getCreatedAt().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")) : "-", "Responsable Inicial", session.getCreatedBy() != null ? session.getCreatedBy().getFullName() : "-"},
                    {"Notas / Instrucciones", session.getNotes() != null && !session.getNotes().isBlank() ? session.getNotes() : "Sin observaciones registradas.", "", ""}
            };

            int currRow = 5;
            for (String[] rowData : sessionData) {
                Row row = sheet1.createRow(currRow++);
                row.setHeightInPoints(20);
                Cell c0 = row.createCell(0); c0.setCellValue(rowData[0]); c0.setCellStyle(cellLeftBold);
                Cell c1 = row.createCell(1); c1.setCellValue(rowData[1]); c1.setCellStyle(cellLeft);

                if (!rowData[2].isEmpty()) {
                    Cell c2 = row.createCell(2); c2.setCellValue(rowData[2]); c2.setCellStyle(cellLeftBold);
                    Cell c3 = row.createCell(3); c3.setCellValue(rowData[3]); c3.setCellStyle(cellLeft);
                    Cell c4 = row.createCell(4); c4.setCellValue(""); c4.setCellStyle(cellLeft);
                } else {
                    Cell c2 = row.createCell(2); c2.setCellValue(""); c2.setCellStyle(cellLeft);
                    Cell c3 = row.createCell(3); c3.setCellValue(""); c3.setCellStyle(cellLeft);
                    Cell c4 = row.createCell(4); c4.setCellValue(""); c4.setCellStyle(cellLeft);
                    sheet1.addMergedRegion(new CellRangeAddress(currRow - 1, currRow - 1, 1, 4));
                }
            }

            // Section 2: KPIs
            currRow++;
            Row rKpiTitle = sheet1.createRow(currRow++);
            rKpiTitle.setHeightInPoints(22);
            for (int c = 0; c <= 4; c++) rKpiTitle.createCell(c).setCellStyle(styleSection);
            rKpiTitle.getCell(0).setCellValue("2. INDICADORES CLAVE DE DESEMPEÑO (KPIS)");
            sheet1.addMergedRegion(new CellRangeAddress(currRow - 1, currRow - 1, 0, 4));

            Row rKpiHdr = sheet1.createRow(currRow++);
            rKpiHdr.setHeightInPoints(24);
            String[] kpiHeaders = {"INDICADOR / MÉTRICA", "VALOR REGISTRADO", "TOTAL OBJETIVO", "% AVANCE", "ESTADO FÍSICO"};
            for (int c = 0; c < kpiHeaders.length; c++) {
                Cell cell = rKpiHdr.createCell(c);
                cell.setCellValue(kpiHeaders[c]);
                cell.setCellStyle(styleHeaderNavy);
            }

            Object[][] kpiData = {
                    {"Avance Físico Global (Almacén Central)", completedShelves, totalShelves, ((double) completedShelves / (totalShelves > 0 ? totalShelves : 1)), progressPercent == 100 ? "COMPLETADO" : (progressPercent > 0 ? "EN PROCESO" : "PENDIENTE")},
                    {"Planta Baja (Conexiones, Acero, Kuriyama, etc.)", pbCompleted, pbTotal, ((double) pbCompleted / (pbTotal > 0 ? pbTotal : 1)), pbPercent == 100 ? "COMPLETADO" : (pbPercent > 0 ? "EN PROCESO" : "PENDIENTE")},
                    {"Planta Alta (Sellos, O-Rings, Pasillos 1 a 5)", paCompleted, paTotal, ((double) paCompleted / (paTotal > 0 ? paTotal : 1)), paPercent == 100 ? "COMPLETADO" : (paPercent > 0 ? "EN PROCESO" : "PENDIENTE")},
                    {"Total de Piezas Físicas Contadas", totalPieces, totalPieces, 1.0, "PIEZAS"},
                    {"Renglones / Partidas Capturadas en Cédula", (double) totalRecords, (double) totalRecords, 1.0, "CAPTURA"},
                    {"Códigos de Material Únicos Contabilizados", (double) distinctCodes, (double) distinctCodes, 1.0, "CATÁLOGO"},
                    {"Anaqueles Pendientes por Iniciar Conteo", pendingShelves, totalShelves, ((double) pendingShelves / (totalShelves > 0 ? totalShelves : 1)), pendingShelves == 0 ? "COMPLETADO" : "PENDIENTE"}
            };

            for (Object[] rowData : kpiData) {
                Row row = sheet1.createRow(currRow++);
                row.setHeightInPoints(20);
                boolean zebra = (currRow % 2 == 0);

                Cell c0 = row.createCell(0); c0.setCellValue((String) rowData[0]); c0.setCellStyle(zebra ? cellLeftZebra : cellLeft);

                Cell c1 = row.createCell(1);
                if (rowData[1] instanceof Double) {
                    c1.setCellValue((Double) rowData[1]);
                    c1.setCellStyle(zebra ? cellNumberZebra : cellNumber);
                } else {
                    c1.setCellValue((Long) rowData[1]);
                    c1.setCellStyle(zebra ? cellIntZebra : cellInt);
                }

                Cell c2 = row.createCell(2);
                if (rowData[2] instanceof Double) {
                    c2.setCellValue((Double) rowData[2]);
                    c2.setCellStyle(zebra ? cellNumberZebra : cellNumber);
                } else {
                    c2.setCellValue((Long) rowData[2]);
                    c2.setCellStyle(zebra ? cellIntZebra : cellInt);
                }

                Cell c3 = row.createCell(3);
                c3.setCellValue((Double) rowData[3]);
                c3.setCellStyle(cellPercent);

                Cell c4 = row.createCell(4);
                String st = (String) rowData[4];
                c4.setCellValue(st);
                if ("COMPLETADO".equals(st)) c4.setCellStyle(statusOk);
                else if ("EN PROCESO".equals(st)) c4.setCellStyle(statusProg);
                else c4.setCellStyle(statusPend);
            }

            // Section 3: Comparative by Plant
            currRow++;
            Row rCompTitle = sheet1.createRow(currRow++);
            rCompTitle.setHeightInPoints(22);
            for (int c = 0; c <= 4; c++) rCompTitle.createCell(c).setCellStyle(styleSection);
            rCompTitle.getCell(0).setCellValue("3. RESUMEN COMPARATIVO POR PLANTA");
            sheet1.addMergedRegion(new CellRangeAddress(currRow - 1, currRow - 1, 0, 4));

            Row rCompHdr = sheet1.createRow(currRow++);
            rCompHdr.setHeightInPoints(24);
            String[] compHeaders = {"NIVEL / PLANTA", "TOTAL ANAQUELES", "COMPLETADOS", "PENDIENTES", "% AVANCE"};
            for (int c = 0; c < compHeaders.length; c++) {
                Cell cell = rCompHdr.createCell(c);
                cell.setCellValue(compHeaders[c]);
                cell.setCellStyle(styleHeaderBlue);
            }

            Object[][] compData = {
                    {"Planta Baja", pbTotal, pbCompleted, pbPending, ((double) pbCompleted / (pbTotal > 0 ? pbTotal : 1))},
                    {"Planta Alta", paTotal, paCompleted, paPending, ((double) paCompleted / (paTotal > 0 ? paTotal : 1))},
                    {"Total Consolidado Nave", totalShelves, completedShelves, pendingShelves, ((double) completedShelves / (totalShelves > 0 ? totalShelves : 1))}
            };

            for (Object[] rowData : compData) {
                Row row = sheet1.createRow(currRow++);
                row.setHeightInPoints(20);
                boolean isTotal = rowData[0].toString().startsWith("Total");

                Cell c0 = row.createCell(0); c0.setCellValue((String) rowData[0]); c0.setCellStyle(isTotal ? cellLeftBold : cellLeft);
                Cell c1 = row.createCell(1); c1.setCellValue((Long) rowData[1]); c1.setCellStyle(isTotal ? cellInt : cellInt);
                Cell c2 = row.createCell(2); c2.setCellValue((Long) rowData[2]); c2.setCellStyle(isTotal ? cellInt : cellInt);
                Cell c3 = row.createCell(3); c3.setCellValue((Long) rowData[3]); c3.setCellStyle(isTotal ? cellInt : cellInt);
                Cell c4 = row.createCell(4); c4.setCellValue((Double) rowData[4]); c4.setCellStyle(cellPercent);
            }

            for (int c = 0; c <= 4; c++) sheet1.autoSizeColumn(c);
            sheet1.setColumnWidth(0, Math.max(sheet1.getColumnWidth(0), 12000));
            sheet1.setColumnWidth(1, Math.max(sheet1.getColumnWidth(1), 5500));
            sheet1.setColumnWidth(2, Math.max(sheet1.getColumnWidth(2), 5500));
            sheet1.setColumnWidth(3, Math.max(sheet1.getColumnWidth(3), 4000));
            sheet1.setColumnWidth(4, Math.max(sheet1.getColumnWidth(4), 5000));

            // ==========================================
            // SHEET 2: Detalle de los 170 Anaqueles
            // ==========================================
            XSSFSheet sheet2 = wb.createSheet("Detalle 170 Anaqueles");
            sheet2.setDisplayGridlines(true);

            Row rShHdr = sheet2.createRow(0);
            rShHdr.setHeightInPoints(26);
            String[] shelfHeaders = {"NIVEL / PLANTA", "CÓDIGO ANAQUEL", "ZONA / FAMILIA", "DESCRIPCIÓN", "ESTADO FÍSICO", "PIEZAS CONTADAS", "PARTIDAS", "RESPONSABLE ASIGNADO"};
            for (int c = 0; c < shelfHeaders.length; c++) {
                Cell cell = rShHdr.createCell(c);
                cell.setCellValue(shelfHeaders[c]);
                cell.setCellStyle(styleHeaderNavy);
            }

            int rowIdx2 = 1;
            for (ShelfAssignment a : assignments) {
                Row row = sheet2.createRow(rowIdx2++);
                row.setHeightInPoints(20);
                boolean zebra = (rowIdx2 % 2 == 0);

                Shelf sh = a.getShelf();
                long recordCount = countRepo.countBySessionIdAndShelfId(sessionId, sh.getId());
                Double shelfPieces = countRepo.sumQuantityBySessionAndShelf(sessionId, sh.getId());
                if (shelfPieces == null) shelfPieces = 0.0;

                Cell c0 = row.createCell(0); c0.setCellValue(sh.getPlant()); c0.setCellStyle(zebra ? cellCenterZebra : cellCenter);
                Cell c1 = row.createCell(1); c1.setCellValue(sh.getCode()); c1.setCellStyle(zebra ? cellCenterZebra : cellCenterBold);
                Cell c2 = row.createCell(2); c2.setCellValue(sh.getZone()); c2.setCellStyle(zebra ? cellLeftZebra : cellLeft);
                Cell c3 = row.createCell(3); c3.setCellValue(sh.getDescription() != null ? sh.getDescription() : ""); c3.setCellStyle(zebra ? cellLeftZebra : cellLeft);

                Cell c4 = row.createCell(4);
                c4.setCellValue(a.getStatus().name());
                if (a.getStatus() == ShelfAssignment.Status.COMPLETADO) c4.setCellStyle(statusOk);
                else if (a.getStatus() == ShelfAssignment.Status.EN_CONTEO) c4.setCellStyle(statusProg);
                else c4.setCellStyle(statusPend);

                Cell c5 = row.createCell(5); c5.setCellValue(shelfPieces); c5.setCellStyle(zebra ? cellNumberZebra : cellNumber);
                Cell c6 = row.createCell(6); c6.setCellValue(recordCount); c6.setCellStyle(zebra ? cellIntZebra : cellInt);

                Cell c7 = row.createCell(7);
                c7.setCellValue(a.getAssignedUser() != null ? a.getAssignedUser().getFullName() : "Por Asignar");
                c7.setCellStyle(zebra ? cellLeftZebra : cellLeft);
            }

            sheet2.setAutoFilter(new CellRangeAddress(0, assignments.size(), 0, 7));
            for (int c = 0; c < shelfHeaders.length; c++) {
                sheet2.autoSizeColumn(c);
                sheet2.setColumnWidth(c, Math.max(sheet2.getColumnWidth(c), 4500));
            }

            // ==========================================
            // SHEET 3: Avance por Zonas del Almacén
            // ==========================================
            XSSFSheet sheet3 = wb.createSheet("Avance por Zonas");
            sheet3.setDisplayGridlines(true);

            Row rZoneHdr = sheet3.createRow(0);
            rZoneHdr.setHeightInPoints(26);
            String[] zoneHeaders = {"PLANTA", "ZONA / FAMILIA", "TOTAL ANAQUELES", "COMPLETADOS", "PENDIENTES", "% AVANCE", "PIEZAS TOTALES"};
            for (int c = 0; c < zoneHeaders.length; c++) {
                Cell cell = rZoneHdr.createCell(c);
                cell.setCellValue(zoneHeaders[c]);
                cell.setCellStyle(styleHeaderBlue);
            }

            // Aggregate by Plant + Zone
            Map<String, List<ShelfAssignment>> byZone = new LinkedHashMap<>();
            for (ShelfAssignment a : assignments) {
                String key = a.getShelf().getPlant() + "|||" + a.getShelf().getZone();
                byZone.computeIfAbsent(key, k -> new ArrayList<>()).add(a);
            }

            int rowIdx3 = 1;
            for (Map.Entry<String, List<ShelfAssignment>> entry : byZone.entrySet()) {
                String[] parts = entry.getKey().split("\\|\\|\\|");
                String plant = parts[0];
                String zone = parts[1];
                List<ShelfAssignment> zoneAssignments = entry.getValue();

                long zTotal = zoneAssignments.size();
                long zCompleted = zoneAssignments.stream().filter(a -> a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();
                long zPending = zTotal - zCompleted;
                double zPercent = zTotal > 0 ? ((double) zCompleted / zTotal) : 0.0;

                double zPieces = 0.0;
                for (ShelfAssignment a : zoneAssignments) {
                    Double p = countRepo.sumQuantityBySessionAndShelf(sessionId, a.getShelf().getId());
                    if (p != null) zPieces += p;
                }

                Row row = sheet3.createRow(rowIdx3++);
                row.setHeightInPoints(20);
                boolean zebra = (rowIdx3 % 2 == 0);

                Cell c0 = row.createCell(0); c0.setCellValue(plant); c0.setCellStyle(zebra ? cellCenterZebra : cellCenter);
                Cell c1 = row.createCell(1); c1.setCellValue(zone); c1.setCellStyle(zebra ? cellLeftZebra : cellLeftBold);
                Cell c2 = row.createCell(2); c2.setCellValue(zTotal); c2.setCellStyle(zebra ? cellIntZebra : cellInt);
                Cell c3 = row.createCell(3); c3.setCellValue(zCompleted); c3.setCellStyle(zebra ? cellIntZebra : cellInt);
                Cell c4 = row.createCell(4); c4.setCellValue(zPending); c4.setCellStyle(zebra ? cellIntZebra : cellInt);
                Cell c5 = row.createCell(5); c5.setCellValue(zPercent); c5.setCellStyle(cellPercent);
                Cell c6 = row.createCell(6); c6.setCellValue(zPieces); c6.setCellStyle(zebra ? cellNumberZebra : cellNumber);
            }

            sheet3.setAutoFilter(new CellRangeAddress(0, byZone.size(), 0, 6));
            for (int c = 0; c < zoneHeaders.length; c++) {
                sheet3.autoSizeColumn(c);
                sheet3.setColumnWidth(c, Math.max(sheet3.getColumnWidth(c), 4500));
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);

            auditService.log(session.getId(), session.getFolio(),
                    currentUser != null ? currentUser.getUsername() : "sistema",
                    currentUser != null ? currentUser.getFullName() : "Sistema",
                    "EXPORTAR_ESTADISTICAS_EXCEL", "Dashboard", session.getId(),
                    null, null,
                    "Descarga de reporte ejecutivo de estadísticas y avance de 170 anaqueles en formato Excel (.xlsx).");

            return new SaeExportService.ExportResult(fileName, bos.toByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", null);

        } catch (Exception e) {
            throw new RuntimeException("Error al generar reporte de estadísticas en Excel: " + e.getMessage(), e);
        }
    }

    private XSSFCellStyle createBannerStyle(XSSFWorkbook wb, XSSFFont font, XSSFColor bgColor) {
        XSSFCellStyle style = wb.createCellStyle();
        style.setFont(font);
        style.setFillForegroundColor(bgColor);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        return style;
    }

    private XSSFCellStyle createHeaderStyle(XSSFWorkbook wb, XSSFFont font, XSSFColor bgColor, XSSFColor borderColor) {
        XSSFCellStyle style = wb.createCellStyle();
        style.setFont(font);
        style.setFillForegroundColor(bgColor);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorders(style, borderColor);
        return style;
    }

    private XSSFCellStyle createDataStyle(XSSFWorkbook wb, XSSFFont font, HorizontalAlignment align, XSSFColor borderColor) {
        XSSFCellStyle style = wb.createCellStyle();
        style.setFont(font);
        style.setAlignment(align);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        setBorders(style, borderColor);
        return style;
    }

    private void setBorders(XSSFCellStyle style, XSSFColor borderColor) {
        style.setBorderBottom(BorderStyle.THIN);
        style.setBottomBorderColor(borderColor);
        style.setBorderTop(BorderStyle.THIN);
        style.setTopBorderColor(borderColor);
        style.setBorderLeft(BorderStyle.THIN);
        style.setLeftBorderColor(borderColor);
        style.setBorderRight(BorderStyle.THIN);
        style.setRightBorderColor(borderColor);
    }
}
