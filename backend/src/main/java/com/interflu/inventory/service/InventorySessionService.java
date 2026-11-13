package com.interflu.inventory.service;

import com.interflu.inventory.dto.SessionDto;
import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

        List<Map<String, Object>> list = new ArrayList<>();
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

            long recordCount = countRepo.countBySessionIdAndShelfId(sessionId, a.getShelf().getId());
            Double totalPieces = countRepo.sumQuantityBySessionAndShelf(sessionId, a.getShelf().getId());

            map.put("recordCount", recordCount);
            map.put("totalPieces", totalPieces != null ? totalPieces : 0.0);
            list.add(map);
        }
        return list;
    }
}
