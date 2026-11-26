package com.interflu.inventory.service;

import com.interflu.inventory.model.AuditLog;
import com.interflu.inventory.repository.AuditLogRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional
    public void log(Long sessionId, String sessionFolio, String username, String userFullName,
                    String action, String entityName, Long entityId,
                    String oldValue, String newValue, String details) {
        try {
            AuditLog log = new AuditLog(sessionId, sessionFolio, username, userFullName,
                    action, entityName, entityId, oldValue, newValue, details);
            auditLogRepository.save(log);
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(AuditService.class).warn("AuditLog save skipped due to transient db state: {}", e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getRecentLogs(int limit) {
        return auditLogRepository.findAllByOrderByTimestampDesc(PageRequest.of(0, limit));
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getLogsBySession(Long sessionId, int limit) {
        return auditLogRepository.findBySessionIdOrderByTimestampDesc(sessionId, PageRequest.of(0, limit));
    }
}
