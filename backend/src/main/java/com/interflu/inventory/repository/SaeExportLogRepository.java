package com.interflu.inventory.repository;

import com.interflu.inventory.model.SaeExportLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SaeExportLogRepository extends JpaRepository<SaeExportLog, Long> {
    List<SaeExportLog> findAllByOrderByExportedAtDesc();
    List<SaeExportLog> findBySessionIdOrderByExportedAtDesc(Long sessionId);
}
