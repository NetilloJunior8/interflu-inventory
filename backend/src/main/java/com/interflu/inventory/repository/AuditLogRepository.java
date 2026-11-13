package com.interflu.inventory.repository;

import com.interflu.inventory.model.AuditLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findAllByOrderByTimestampDesc(Pageable pageable);
    List<AuditLog> findBySessionIdOrderByTimestampDesc(Long sessionId, Pageable pageable);
}
