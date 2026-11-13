package com.interflu.inventory.service;

import com.interflu.inventory.dto.ValidationDto;
import com.interflu.inventory.model.*;
import com.interflu.inventory.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class ValidationService {

    private final InventorySessionRepository sessionRepo;
    private final CountRecordRepository countRepo;
    private final ShelfAssignmentRepository assignmentRepo;

    public ValidationService(InventorySessionRepository sessionRepo,
                             CountRecordRepository countRepo,
                             ShelfAssignmentRepository assignmentRepo) {
        this.sessionRepo = sessionRepo;
        this.countRepo = countRepo;
        this.assignmentRepo = assignmentRepo;
    }

    @Transactional(readOnly = true)
    public ValidationDto.ValidationSummary validateSession(Long sessionId) {
        InventorySession session = sessionRepo.findById(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada."));

        List<CountRecord> records = countRepo.findBySessionIdOrderByUpdatedAtDesc(sessionId);
        List<ShelfAssignment> assignments = assignmentRepo.findBySessionIdOrderByShelfCodeAsc(sessionId);

        long pendingShelves = assignments.stream().filter(a -> a.getStatus() != ShelfAssignment.Status.COMPLETADO).count();
        long completedShelves = assignments.stream().filter(a -> a.getStatus() == ShelfAssignment.Status.COMPLETADO).count();

        // Group by capturedCode
        Map<String, List<CountRecord>> byCode = new LinkedHashMap<>();
        double totalPieces = 0.0;
        for (CountRecord r : records) {
            totalPieces += r.getQuantity();
            byCode.computeIfAbsent(r.getCapturedCode().toUpperCase(), k -> new ArrayList<>()).add(r);
        }

        List<ValidationDto.DiscrepancyItem> items = new ArrayList<>();
        long inexistentCount = 0;
        long multiShelfCount = 0;
        long discrepanciesCount = 0;

        for (Map.Entry<String, List<CountRecord>> entry : byCode.entrySet()) {
            String code = entry.getKey();
            List<CountRecord> codeRecords = entry.getValue();

            Product product = codeRecords.stream()
                    .map(CountRecord::getProduct)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(null);

            double sumCounted = codeRecords.stream().mapToDouble(CountRecord::getQuantity).sum();
            List<String> shelves = codeRecords.stream()
                    .map(r -> r.getShelf().getCode() + " (" + r.getQuantity() + ")")
                    .toList();

            ValidationDto.DiscrepancyItem item = new ValidationDto.DiscrepancyItem();
            item.setCode(code);
            item.setCountedTotal(sumCounted);
            item.setShelfOccurrences(codeRecords.size());
            item.setShelvesList(shelves);

            if (codeRecords.size() > 1) {
                multiShelfCount++;
            }

            if (product != null) {
                item.setExistsInCatalog(true);
                item.setDescription(product.getDescription());
                item.setUnit(product.getUnit());
                item.setStockSaE(product.getStockSaE());
                double diff = sumCounted - product.getStockSaE();
                item.setDifference(diff);

                if (Math.abs(diff) > 0.001) {
                    discrepanciesCount++;
                    item.setIssueType(diff > 0 ? "SOBRANTE" : "FALTANTE");
                } else if (codeRecords.size() > 1) {
                    item.setIssueType("MULTI_ANAQUEL_OK");
                } else {
                    item.setIssueType("OK");
                }
            } else {
                inexistentCount++;
                discrepanciesCount++;
                item.setExistsInCatalog(false);
                item.setDescription("CÓDIGO NO EXISTE EN CATÁLOGO SAE");
                item.setUnit("PZA");
                item.setStockSaE(0.0);
                item.setDifference(sumCounted);
                item.setIssueType("CODIGO_INEXISTENTE");
            }

            items.add(item);
        }

        // Sort issues first (CODIGO_INEXISTENTE, FALTANTE, SOBRANTE, then OK)
        items.sort((a, b) -> {
            int scoreA = issueScore(a.getIssueType());
            int scoreB = issueScore(b.getIssueType());
            if (scoreA != scoreB) return Integer.compare(scoreA, scoreB);
            return a.getCode().compareTo(b.getCode());
        });

        ValidationDto.ValidationSummary summary = new ValidationDto.ValidationSummary();
        summary.setSessionId(session.getId());
        summary.setFolio(session.getFolio());
        summary.setStatus(session.getStatus().name());
        summary.setTotalRecords(records.size());
        summary.setUniqueProducts(byCode.size());
        summary.setTotalPieces(totalPieces);
        summary.setPendingShelves(pendingShelves);
        summary.setCompletedShelves(completedShelves);
        summary.setInexistentCodesCount(inexistentCount);
        summary.setDuplicatesCount(multiShelfCount);
        summary.setDiscrepanciesCount(discrepanciesCount);
        summary.setItems(items);

        return summary;
    }

    private int issueScore(String issueType) {
        return switch (issueType) {
            case "CODIGO_INEXISTENTE" -> 0;
            case "FALTANTE" -> 1;
            case "SOBRANTE" -> 2;
            case "MULTI_ANAQUEL_OK" -> 3;
            default -> 4;
        };
    }
}
