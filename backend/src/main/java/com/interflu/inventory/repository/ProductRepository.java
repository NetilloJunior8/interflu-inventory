package com.interflu.inventory.repository;

import com.interflu.inventory.model.Product;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    @Query("SELECT p FROM Product p WHERE UPPER(TRIM(p.code)) = UPPER(TRIM(:code)) ORDER BY p.id ASC")
    List<Product> findAllByCodeIgnoreCase(@Param("code") String code);

    default Optional<Product> findByCodeIgnoreCase(String code) {
        List<Product> list = findAllByCodeIgnoreCase(code);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    default Optional<Product> findByCode(String code) {
        return findByCodeIgnoreCase(code);
    }

    @Query("""
        SELECT p FROM Product p
        WHERE p.active = true AND (
            UPPER(p.code) LIKE UPPER(CONCAT(:term, '%'))
            OR UPPER(p.code) LIKE UPPER(CONCAT('%', :term, '%'))
            OR UPPER(p.description) LIKE UPPER(CONCAT('%', :term, '%'))
        )
        ORDER BY
            CASE WHEN UPPER(p.code) = UPPER(:term) THEN 0
                 WHEN UPPER(p.code) LIKE UPPER(CONCAT(:term, '%')) THEN 1
                 ELSE 2 END,
            p.code ASC
    """)
    List<Product> searchFast(@Param("term") String term, Pageable pageable);

    @Query("SELECT COUNT(p) FROM Product p WHERE p.active = true")
    long countActive();
}
