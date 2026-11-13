package com.interflu.inventory.repository;

import com.interflu.inventory.model.CountRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface CountRecordRepository extends JpaRepository<CountRecord, Long> {

    List<CountRecord> findBySessionIdOrderByUpdatedAtDesc(Long sessionId);

    List<CountRecord> findBySessionIdAndShelfIdOrderByUpdatedAtDesc(Long sessionId, Long shelfId);

    List<CountRecord> findBySessionIdAndShelfIdOrderByIdAsc(Long sessionId, Long shelfId);

    List<CountRecord> findBySessionIdAndShelfId(Long sessionId, Long shelfId);

    Optional<CountRecord> findBySessionIdAndShelfIdAndCapturedCodeIgnoreCase(Long sessionId, Long shelfId, String capturedCode);

    List<CountRecord> findBySessionIdAndCapturedCodeIgnoreCase(Long sessionId, String capturedCode);

    long countBySessionId(Long sessionId);

    long countBySessionIdAndShelfId(Long sessionId, Long shelfId);

    @Query("SELECT COALESCE(SUM(c.quantity), 0) FROM CountRecord c WHERE c.session.id = :sessionId")
    Double sumQuantityBySessionId(@Param("sessionId") Long sessionId);

    @Query("SELECT COALESCE(SUM(c.quantity), 0) FROM CountRecord c WHERE c.session.id = :sessionId AND c.shelf.id = :shelfId")
    Double sumQuantityBySessionAndShelf(@Param("sessionId") Long sessionId, @Param("shelfId") Long shelfId);

    @Query("SELECT COUNT(DISTINCT c.capturedCode) FROM CountRecord c WHERE c.session.id = :sessionId")
    long countDistinctCodesBySessionId(@Param("sessionId") Long sessionId);
}
